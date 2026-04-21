//* src/services/auth.service.js

import mongoose from "mongoose";

import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import Directory from "../models/directory.model.js";

import AppError from "../errors/AppError.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";
import envConfig from "../constants/env.js";

import {
	ONE_MINUTE_MS,
	tenMinutesFromNow,
	oneHourFromNow,
} from "../utils/date.js";
import verifyGoogleIdToken from "../lib/googleAuth.js";

import {
	generateOTP,
	isValidOTP,
	sendOTP,
	isOTPExpired,
	isOTPCooldownActive,
} from "./otp.service.js";

const { CONFLICT, NOT_FOUND, BAD_REQUEST, UNAUTHORIZED, TOO_MANY_REQUESTS } =
	httpStatus;

const {
	USER_ALREADY_EXISTS,
	USER_NOT_FOUND,
	INVALID_OTP,
	OTP_EXPIRED,
	OTP_COOLDOWN,
	INVALID_CREDENTIALS,
	USER_NOT_VERIFIED,
	PROVIDER_MISMATCH,
	GOOGLE_EMAIL_NOT_VERIFIED,
} = appErrorCode;

const { MAX_ALLOWED_DEVICES } = envConfig;

/**
 * Resolves user registration including unverified user re-registration edge-cases.
 * Generates OTP and updates auto-deletion limits before dispatching the email.
 *
 * @param {string} name - The user's full name
 * @param {string} email - The user's email address
 * @param {string} password - The user's unhashed password
 * @throws {AppError} If the user already exists and is fully verified
 */
const createUser = async (name, email, password) => {
	const user = await User.findOne({ email });

	if (user && user.isVerified) {
		throw new AppError("User already exists", CONFLICT, USER_ALREADY_EXISTS);
	}

	const { plainOTP, hashedOTP } = generateOTP();

	// Unverified user re-registering — update OTP fields and extend TTL
	if (user) {
		user.name = name;
		user.password = password;
		user.otp = hashedOTP;
		user.otpExpiresAt = tenMinutesFromNow();
		user.verificationExpiresAt = oneHourFromNow();
		await user.save();
	} else {
		await User.create({
			name,
			email,
			password,
			otp: hashedOTP,
			otpExpiresAt: tenMinutesFromNow(),
			verificationExpiresAt: oneHourFromNow(),
		});
	}

	await sendOTP(name, email, plainOTP);
};

/**
 * Verifies a 6-digit OTP to finalize account registration.
 * Executes within a MongoDB transaction to sequentially mark the user
 * as verified and generate their default root directory.
 *
 * @param {string} email - The user's email address
 * @param {string} otp - The raw 6-digit OTP string
 * @returns {Promise<Object>} The verified user document
 * @throws {AppError} If the user is missing, or the OTP is invalid/expired
 */
const verifyOTP = async (email, otp) => {
	const user = await User.findOne({ email, isVerified: false }).select(
		"+otp +otpExpiresAt",
	);

	if (!user) {
		throw new AppError("User not found", NOT_FOUND, USER_NOT_FOUND);
	}

	if (isOTPExpired(user.otpExpiresAt)) {
		throw new AppError("OTP has expired", BAD_REQUEST, OTP_EXPIRED);
	}

	if (!isValidOTP(otp, user.otp)) {
		throw new AppError("Invalid OTP", BAD_REQUEST, INVALID_OTP);
	}

	const session = await mongoose.startSession();
	const rootDirId = new mongoose.Types.ObjectId();

	// Run in a transaction: if the directory fails to create, the user's
	// verification state rolls back automatically, preventing orphaned states.
	try {
		await session.withTransaction(async () => {
			await Directory.create(
				[
					{
						_id: rootDirId,
						name: `root-${email}`,
						userId: user._id,
						parentDirId: null,
					},
				],
				{ session },
			);

			user.isVerified = true;
			user.rootDirId = rootDirId;
			user.otp = undefined;
			user.otpExpiresAt = undefined;
			user.verificationExpiresAt = undefined;

			await user.save({ session });
		});
	} finally {
		await session.endSession();
	}
};

/**
 * Resends a fresh verification OTP while enforcing a strict 60-second cooldown
 * to prevent email spamming on the external mailing service.
 *
 * @param {string} email - The unverified user's email address
 * @throws {AppError} If cooldown is active, user is missing, or user is already verified
 */
const resendOTP = async (email) => {
	const user = await User.findOne({ email }).select("+otpExpiresAt");

	if (!user) {
		throw new AppError("User not found", NOT_FOUND, USER_NOT_FOUND);
	}

	if (user.isVerified) {
		throw new AppError("User already exists", CONFLICT, USER_ALREADY_EXISTS);
	}

	if (isOTPCooldownActive(user.otpExpiresAt, ONE_MINUTE_MS)) {
		throw new AppError(
			"Please wait before requesting a new OTP",
			TOO_MANY_REQUESTS,
			OTP_COOLDOWN,
		);
	}

	const { plainOTP, hashedOTP } = generateOTP();

	user.otp = hashedOTP;
	user.otpExpiresAt = tenMinutesFromNow();
	await user.save();

	await sendOTP(user.name, email, plainOTP);
};

/**
 * Unlocks an account by verifying passwords and creating a secure session.
 * Tracks active devices to enforce concurrency limits.
 *
 * @param {string} email - The user's email
 * @param {string} password - The raw password attempt
 * @param {Object} deviceInfo - Rich parsed metrics about the requester's device
 * @returns {Promise<Object>} The generated session document
 * @throws {AppError} If credentials fail or the user is unverified
 */
const loginUser = async (email, password, deviceInfo) => {
	const user = await User.findOne({ email }).select("+password");

	if (!user) {
		throw new AppError(
			"Invalid credentials",
			UNAUTHORIZED,
			INVALID_CREDENTIALS,
		);
	}

	// OAuth-provisioned users have no password — reject before bcrypt tries
	// to compare against an undefined hash (would throw a raw bcrypt error).
	if (user.provider !== "email") {
		throw new AppError(
			`Please sign in with ${user.provider}`,
			BAD_REQUEST,
			PROVIDER_MISMATCH,
		);
	}

	if (!user.isVerified) {
		throw new AppError(
			"Please verify your email first",
			BAD_REQUEST,
			USER_NOT_VERIFIED,
		);
	}

	const isPasswordValid = await user.comparePassword(password);

	if (!isPasswordValid) {
		throw new AppError(
			"Invalid credentials",
			UNAUTHORIZED,
			INVALID_CREDENTIALS,
		);
	}

	const activeSessionCount = await Session.countDocuments({
		userId: user._id,
	});

	// Maintain the MAX_ALLOWED_DEVICES limit by silently ejecting their oldest browser session.
	if (activeSessionCount >= MAX_ALLOWED_DEVICES) {
		await Session.findOneAndDelete(
			{ userId: user._id },
			{ sort: { createdAt: 1 } },
		);
	}

	const session = await Session.create({
		userId: user._id,
		deviceInfo,
	});

	return session;
};

/**
 * Signs a user in via a Google ID token. If the user exists, issues a new
 * session (evicting the oldest when MAX_ALLOWED_DEVICES is reached).
 * If not atomically provisions a new user + root directory, then creates the session.
 *
 * @param {string} idToken - The Google ID token supplied by the client
 * @param {Object} deviceInfo - Parsed device metadata for the session
 * @returns {Promise<{ session: Object, isNewUser: boolean }>}
 * 	- The new session
 * 	- A flag indicating whether this call created the account
 * @throws {AppError} If the ID token is invalid or malformed
 */
const loginOrCreateGoogleUser = async (idToken, deviceInfo) => {
	const payload = await verifyGoogleIdToken(idToken);
	const { name, email, picture, email_verified: emailVerified } = payload;

	// Check if email is verified by Google
	if (!emailVerified) {
		throw new AppError(
			"Google has not verified this email address",
			BAD_REQUEST,
			GOOGLE_EMAIL_NOT_VERIFIED,
		);
	}

	const existingUser = await User.findOne({ email }).lean();

	if (existingUser) {
		// Block email-match hijack: a password-based account for the same
		// email must not be accessible via Google without an explicit link.
		if (existingUser.provider !== "google") {
			throw new AppError(
				`This email is registered with ${existingUser.provider}. Please sign in using that method.`,
				CONFLICT,
				PROVIDER_MISMATCH,
			);
		}

		// Refresh denormalized Google profile fields only when they've actually changed
		if (existingUser.name !== name || existingUser.profilePicture !== picture) {
			await User.updateOne(
				{ _id: existingUser._id },
				{ name, profilePicture: picture },
			);
		}

		const activeSessionCount = await Session.countDocuments({
			userId: existingUser._id,
		});

		// Maintain the MAX_ALLOWED_DEVICES limit by evicting the oldest session.
		if (activeSessionCount >= MAX_ALLOWED_DEVICES) {
			await Session.findOneAndDelete(
				{ userId: existingUser._id },
				{ sort: { createdAt: 1 } },
			);
		}

		const session = await Session.create({
			userId: existingUser._id,
			deviceInfo,
		});

		return { session, isNewUser: false };
	}

	const mongooseSession = await mongoose.startSession();
	const rootDirId = new mongoose.Types.ObjectId();
	const userId = new mongoose.Types.ObjectId();

	try {
		await mongooseSession.withTransaction(async () => {
			await User.create(
				[
					{
						_id: userId,
						name,
						email,
						profilePicture: picture,
						provider: "google",
						rootDirId,
						isVerified: true,
					},
				],
				{ session: mongooseSession },
			);

			await Directory.create(
				[
					{
						_id: rootDirId,
						name: `root-${email}`,
						userId,
						parentDirId: null,
					},
				],
				{ session: mongooseSession },
			);
		});
	} finally {
		await mongooseSession.endSession();
	}

	const session = await Session.create({ userId, deviceInfo });

	return { session, isNewUser: true };
};

/**
 * Destroys a single specific session to log a user out of their current device.
 *
 * @param {string} sessionId - The specific session to delete
 * @returns {Promise<void>}
 */
const logoutUser = async (sessionId) => {
	if (sessionId) {
		await Session.deleteOne({ _id: sessionId });
	}
};

/**
 * Destroys all active sessions for a user, forcing a global logout across all devices.
 *
 * @param {string} userId - The unique identifier of the user
 * @returns {Promise<void>}
 */
const logoutAllUser = async (userId) => {
	if (userId) {
		await Session.deleteMany({ userId });
	}
};

export {
	createUser,
	verifyOTP,
	resendOTP,
	loginUser,
	loginOrCreateGoogleUser,
	logoutUser,
	logoutAllUser,
};

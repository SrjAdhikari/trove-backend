//* src/services/auth.service.js

import mongoose from "mongoose";

import User from "../models/user.model.js";
import Directory from "../models/directory.model.js";

import AppError from "../errors/AppError.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

import {
	ONE_MINUTE_MS,
	tenMinutesFromNow,
	oneHourFromNow,
} from "../utils/date.js";
import {
	generateOTP,
	isValidOTP,
	sendOTP,
	isOTPExpired,
	isOTPCooldownActive,
} from "./otp.service.js";

const { CONFLICT, NOT_FOUND, BAD_REQUEST, TOO_MANY_REQUESTS } = httpStatus;

const {
	USER_ALREADY_EXISTS,
	USER_NOT_FOUND,
	INVALID_OTP,
	OTP_EXPIRED,
	OTP_COOLDOWN,
} = appErrorCode;

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

export { createUser, verifyOTP, resendOTP };

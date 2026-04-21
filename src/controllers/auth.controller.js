//* src/controllers/auth.controller.js

import AppError from "../errors/AppError.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

import {
	createUser,
	verifyOTP,
	resendOTP,
	loginUser,
	loginOrCreateGoogleUser,
	loginOrCreateGithubUser,
	logoutUser,
	logoutAllUser,
} from "../services/auth.service.js";

import { setAuthCookie, clearAuthCookie } from "../utils/cookies.js";
import buildDeviceInfo from "../utils/deviceInfo.js";

const { BAD_REQUEST, CREATED, OK } = httpStatus;
const {
	ALL_FIELDS_REQUIRED,
	EMAIL_REQUIRED,
	INVALID_ID_TOKEN,
	INVALID_GITHUB_CODE,
} = appErrorCode;

const registerHandler = async (req, res) => {
	const { name, email, password } = req.body;
	if (!name || !email || !password) {
		throw new AppError(
			"All fields are required",
			BAD_REQUEST,
			ALL_FIELDS_REQUIRED,
		);
	}

	await createUser(name, email, password);

	res.status(CREATED).json({
		success: true,
		message: "Verification code sent to your email address",
	});
};

const verifyOTPHandler = async (req, res) => {
	const { email, otp } = req.body;

	if (!email || !otp) {
		throw new AppError(
			"All fields are required",
			BAD_REQUEST,
			ALL_FIELDS_REQUIRED,
		);
	}

	await verifyOTP(email, otp);

	res.status(CREATED).json({
		success: true,
		message: "User registered successfully",
	});
};

const resendOTPHandler = async (req, res) => {
	const { email } = req.body;

	if (!email) {
		throw new AppError("Email is required", BAD_REQUEST, EMAIL_REQUIRED);
	}

	await resendOTP(email);

	res.status(OK).json({
		success: true,
		message: "Verification code resent to your email address",
	});
};

const loginHandler = async (req, res) => {
	const { email, password } = req.body;
	if (!email || !password) {
		throw new AppError(
			"All fields are required",
			BAD_REQUEST,
			ALL_FIELDS_REQUIRED,
		);
	}

	const deviceInfo = buildDeviceInfo(req);
	const session = await loginUser(email, password, deviceInfo);

	setAuthCookie(res, session._id);

	res.status(OK).json({
		success: true,
		message: "User logged in successfully",
	});
};

const logoutHandler = async (req, res) => {
	const sessionId = req.signedCookies.token;

	await logoutUser(sessionId);
	clearAuthCookie(res);

	res.status(OK).json({ success: true, message: "Logged out successfully" });
};

const logoutAllHandler = async (req, res) => {
	const userId = req.user._id;

	await logoutAllUser(userId);
	clearAuthCookie(res);

	res
		.status(OK)
		.json({ success: true, message: "Logged out of all devices successfully" });
};

const googleOAuthHandler = async (req, res) => {
	const { idToken } = req.body ?? {};

	if (!idToken) {
		throw new AppError("ID token is required", BAD_REQUEST, INVALID_ID_TOKEN);
	}

	const deviceInfo = buildDeviceInfo(req);
	const { session, isNewUser } = await loginOrCreateGoogleUser(
		idToken,
		deviceInfo,
	);

	setAuthCookie(res, session._id);

	res.status(isNewUser ? CREATED : OK).json({
		success: true,
		message: isNewUser
			? "User created and logged in successfully"
			: "User logged in successfully",
	});
};

const githubOAuthHandler = async (req, res) => {
	const { code } = req.body ?? {};
	if (!code) {
		throw new AppError("Code is required", BAD_REQUEST, INVALID_GITHUB_CODE);
	}

	const deviceInfo = buildDeviceInfo(req);
	const { session, isNewUser } = await loginOrCreateGithubUser(
		code,
		deviceInfo,
	);

	setAuthCookie(res, session._id);

	res.status(isNewUser ? CREATED : OK).json({
		success: true,
		message: isNewUser
			? "User created and logged in successfully"
			: "User logged in successfully",
	});
};

const getCurrentUserHandler = async (req, res) => {
	res.status(OK).json({
		success: true,
		message: "User fetched successfully",
		data: req.user,
	});
};

export {
	registerHandler,
	verifyOTPHandler,
	resendOTPHandler,
	loginHandler,
	logoutHandler,
	logoutAllHandler,
	googleOAuthHandler,
	githubOAuthHandler,
	getCurrentUserHandler,
};

//* src/controllers/auth.controller.js

import httpStatus from "../constants/httpStatus.js";

import {
	createUser,
	verifyOTP,
	resendOTP,
	forgotPassword,
	resetPassword,
	changePassword,
	loginUser,
	loginOrCreateGoogleUser,
	loginOrCreateGithubUser,
	logoutUser,
	logoutAllUser,
} from "../services/auth.service.js";

import { formatUser } from "../services/user.service.js";

import { setAuthCookie, clearAuthCookie } from "../utils/cookies.js";
import buildDeviceInfo from "../utils/deviceInfo.js";

const { CREATED, OK } = httpStatus;

const registerHandler = async (req, res) => {
	const { name, email, password } = req.body;

	await createUser(name, email, password);

	res.status(CREATED).json({
		success: true,
		message: "Verification code sent to your email address",
	});
};

const verifyOTPHandler = async (req, res) => {
	const { email, otp } = req.body;

	await verifyOTP(email, otp);

	res.status(CREATED).json({
		success: true,
		message: "User registered successfully",
	});
};

const resendOTPHandler = async (req, res) => {
	const { email } = req.body;

	await resendOTP(email);

	res.status(OK).json({
		success: true,
		message: "Verification code resent to your email address",
	});
};

const forgotPasswordHandler = async (req, res) => {
	const { email } = req.body;

	await forgotPassword(email);

	res.status(OK).json({
		success: true,
		message: "Password reset code sent to your email",
	});
};

const resetPasswordHandler = async (req, res) => {
	const { email, otp, newPassword } = req.body;

	await resetPassword(email, otp, newPassword);

	res.status(OK).json({
		success: true,
		message: "Password reset successfully",
	});
};

const loginHandler = async (req, res) => {
	const { email, password } = req.body;

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
	const { idToken } = req.body;

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
	const { code } = req.body;

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
	const user = req.user.toObject?.() ?? req.user;

	res.status(OK).json({
		success: true,
		message: "User fetched successfully",
		data: await formatUser(user),
	});
};

const changePasswordHandler = async (req, res) => {
	const { currentPassword, newPassword } = req.body;
	const userId = req.user._id;
	const sessionId = req.sessionId;

	await changePassword(userId, currentPassword, newPassword, sessionId);

	res.status(OK).json({
		success: true,
		message: "Password changed successfully",
	});
};

export {
	registerHandler,
	verifyOTPHandler,
	resendOTPHandler,
	forgotPasswordHandler,
	resetPasswordHandler,
	loginHandler,
	logoutHandler,
	logoutAllHandler,
	googleOAuthHandler,
	githubOAuthHandler,
	getCurrentUserHandler,
	changePasswordHandler,
};

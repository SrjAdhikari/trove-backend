//* src/controllers/auth.controller.js

import { UAParser } from "ua-parser-js";
import AppError from "../errors/AppError.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

import {
	createUser,
	verifyOTP,
	resendOTP,
	loginUser,
	logoutUser,
	logoutAllUser,
} from "../services/auth.service.js";
import { setAuthCookie, clearAuthCookie } from "../utils/cookies.js";

const { BAD_REQUEST, CREATED, OK } = httpStatus;
const { ALL_FIELDS_REQUIRED, EMAIL_REQUIRED } = appErrorCode;

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

	// Extract raw headers for device info
	const userAgent = req.headers["user-agent"] || "";
	const ipAddress =
		req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "Unknown";

	// Parse User-Agent string
	const parser = new UAParser(userAgent);
	const parsedUA = parser.getResult();

	// Structure device metadata for the Mongo Session Model
	const deviceInfo = {
		userAgent,
		ipAddress,
		deviceType: parsedUA.device.type || "desktop",
		browser:
			`${parsedUA.browser.name || "Unknown"} ${parsedUA.browser.version || ""}`.trim(),
		deviceOS:
			`${parsedUA.os.name || "Unknown"} ${parsedUA.os.version || ""}`.trim(),
	};

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

	res.status(OK).json({ success: true, message: "Logged out of all devices successfully" });
};

export {
	registerHandler,
	verifyOTPHandler,
	resendOTPHandler,
	loginHandler,
	logoutHandler,
	logoutAllHandler,
};

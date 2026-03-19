//* src/controllers/auth.controller.js

import AppError from "../errors/AppError.js";
import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";
import { createUser, verifyOTP, resendOTP } from "../services/auth.service.js";

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

const loginHandler = async (req, res) => {};

const logoutHandler = async (req, res) => {};

export {
	registerHandler,
	verifyOTPHandler,
	resendOTPHandler,
	loginHandler,
	logoutHandler,
};

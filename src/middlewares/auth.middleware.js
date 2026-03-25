//* src/middlewares/auth.middleware.js

import Session from "../models/session.model.js";
import AppError from "../errors/AppError.js";
import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";
import { clearAuthCookie } from "../utils/cookies.js";

const { UNAUTHORIZED } = httpStatus;
const { UNAUTHORIZED_ACCESS } = appErrorCode;

/**
 * Global authentication middleware to protect secured routes.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next routing function
 * @throws {AppError} If the session token is missing, naturally expired, or the user was deleted
 */
const authenticate = async (req, res, next) => {
	const sessionId = req.signedCookies.token;

	if (!sessionId) {
		throw new AppError(
			"Unauthorized access",
			UNAUTHORIZED,
			UNAUTHORIZED_ACCESS,
		);
	}

	// Fetch session and populate the associated user in one round-trip
	const session = await Session.findById(sessionId)
		.populate("userId", "-password -otp -otpExpiresAt")
		.lean();

	// Session expired via TTL or user was deleted
	if (!session || !session.userId) {
		clearAuthCookie(res);
		throw new AppError(
			"Invalid or expired session",
			UNAUTHORIZED,
			UNAUTHORIZED_ACCESS,
		);
	}

	// Attach the populated User document and Session ID to the request object
	req.user = session.userId;
	req.sessionId = session._id;

	next();
};

export default authenticate;

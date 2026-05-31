//* src/services/user.service.js

import User from "../models/user.model.js";

import AppError from "../errors/AppError.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

const { NOT_FOUND } = httpStatus;
const { USER_NOT_FOUND } = appErrorCode;

/**
 * Updates the authenticated user's display name and returns the user in the
 * same projection as `GET /api/auth/me` (sensitive fields excluded).
 *
 * @param {string} userId - The authenticated user's id.
 * @param {string} name - The validated, trimmed new name.
 * @returns {Promise<Object>} The updated lean user, minus password/otp/otpExpiresAt.
 * @throws {AppError} `USER_NOT_FOUND` if the user no longer exists (rare TOCTOU race).
 */
const updateProfile = async (userId, name) => {
	const user = await User.findByIdAndUpdate(
		userId,
		{ name },
		{ new: true, runValidators: true },
	)
		.select("-password -otp -otpExpiresAt")
		.lean();

	if (!user) {
		throw new AppError("User not found", NOT_FOUND, USER_NOT_FOUND);
	}

	return user;
};

export { updateProfile };

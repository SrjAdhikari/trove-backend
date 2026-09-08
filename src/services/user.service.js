//* src/services/user.service.js

import { randomBytes } from "node:crypto";
import { rm, mkdir, open } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import User from "../models/user.model.js";
import AppError from "../errors/AppError.js";

import createByteCounter from "../utils/byteCounter.js";
import {
	createImageTypeValidator,
	detectImageType,
	MIN_HEADER_BYTES,
} from "../utils/mimeType.js";
import {
	PROFILE_PICTURES_ROOT,
	PROFILE_PICTURE_TOKEN_PATTERN,
	buildProfilePicturePath,
	buildProfilePictureUrl,
	parseProfilePictureToken,
} from "../utils/storagePath.js";

import envConfig from "../constants/env.js";
import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

const { NOT_FOUND, BAD_REQUEST, INTERNAL_SERVER_ERROR } = httpStatus;
const {
	USER_NOT_FOUND,
	INVALID_IMAGE_TYPE,
	IMAGE_TOO_LARGE,
	INTERNAL_ERROR,
	PROFILE_PICTURE_NOT_FOUND,
} = appErrorCode;

const { MAX_PROFILE_PICTURE_SIZE } = envConfig;

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

/**
 * Uploads or replaces the authenticated user's profile picture.
 * Streams the raw body to disk under a random capability token, validating
 * image type (magic bytes) and size mid-stream. On success, points
 * `profilePicture` at the new public URL and deletes the user's previous
 * file if it was one we issued.
 *
 * @param {string} userId - Authenticated user's id.
 * @param {import("node:stream").Readable} fileStream - Raw request body.
 * @returns {Promise<Object>} Updated lean user, minus password/otp/otpExpiresAt.
 * @throws {AppError} INVALID_IMAGE_TYPE | IMAGE_TOO_LARGE | USER_NOT_FOUND | INTERNAL_ERROR.
 */
const uploadProfilePicture = async (userId, fileStream) => {
	const user = await User.findById(userId).select("profilePicture").lean();
	if (!user) {
		throw new AppError("User not found", NOT_FOUND, USER_NOT_FOUND);
	}

	const token = randomBytes(16).toString("hex");
	const filePath = buildProfilePicturePath(token);

	const typeValidator = createImageTypeValidator();
	const counter = createByteCounter(MAX_PROFILE_PICTURE_SIZE);

	await mkdir(PROFILE_PICTURES_ROOT, { recursive: true });

	try {
		await pipeline(
			fileStream,
			typeValidator.stream,
			counter.stream,
			createWriteStream(filePath),
		);
	} catch {
		await rm(filePath, { force: true });

		if (typeValidator.state.rejected) {
			throw new AppError(
				"Unsupported image type. Use JPEG, PNG, or WEBP.",
				BAD_REQUEST,
				INVALID_IMAGE_TYPE,
			);
		}
		if (counter.state.tripped) {
			throw new AppError(
				"Profile picture exceeds the size limit",
				BAD_REQUEST,
				IMAGE_TOO_LARGE,
			);
		}
		throw new AppError(
			"Failed to upload profile picture",
			INTERNAL_SERVER_ERROR,
			INTERNAL_ERROR,
		);
	}

	const updatedUser = await User.findByIdAndUpdate(
		userId,
		{ profilePicture: buildProfilePictureUrl(token) },
		{ new: true, runValidators: true },
	)
		.select("-password -otp -otpExpiresAt")
		.lean();

	// Rare TOCTOU: user vanished mid-upload. Roll back the orphaned file.
	if (!updatedUser) {
		await rm(filePath, { force: true });
		throw new AppError("User not found", NOT_FOUND, USER_NOT_FOUND);
	}

	// Clean up the old file if we issued it.
	const oldToken = parseProfilePictureToken(user.profilePicture);
	if (oldToken && oldToken !== token) {
		await rm(buildProfilePicturePath(oldToken), { force: true });
	}

	return updatedUser;
};

/**
 * Resolves a profile picture for serving: validates the token shape,
 * confirms the file exists, and sniffs its MIME from the header.
 *
 * @param {string} token - Capability token from the URL.
 * @returns {Promise<{ filePath: string, mime: string }>}
 * @throws {AppError} PROFILE_PICTURE_NOT_FOUND for bad tokens or missing files.
 */
const getProfilePicture = async (token) => {
	if (!PROFILE_PICTURE_TOKEN_PATTERN.test(token)) {
		throw new AppError(
			"Profile picture not found",
			NOT_FOUND,
			PROFILE_PICTURE_NOT_FOUND,
		);
	}

	const filePath = buildProfilePicturePath(token);

	// Validate the file exists before trying to sniff its MIME.
	let fileHandle;
	try {
		fileHandle = await open(filePath, "r");
	} catch (err) {
		if (err.code === "ENOENT") {
			throw new AppError(
				"Profile picture not found",
				NOT_FOUND,
				PROFILE_PICTURE_NOT_FOUND,
			);
		}

		// unexpected fs error → global handler logs + masks as 500
		throw err;
	}

	// Sniff MIME type from the header, defaulting to application/octet-stream.
	let mime = "application/octet-stream";
	try {
		const { buffer } = await fileHandle.read(
			Buffer.alloc(MIN_HEADER_BYTES),
			0,
			MIN_HEADER_BYTES,
			0,
		);
		const detected = detectImageType(buffer);
		if (detected) mime = detected.mime;
	} finally {
		await fileHandle.close();
	}

	return { filePath, mime };
};

export { updateProfile, uploadProfilePicture, getProfilePicture };

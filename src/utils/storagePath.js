//* src/utils/storagePath.js

import path from "node:path";
import AppError from "../errors/AppError.js";

import envConfig from "../constants/env.js";
import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

const { API_URL } = envConfig;
const { INVALID_INPUT } = appErrorCode;
const { BAD_REQUEST } = httpStatus;

/** Absolute path to the on-disk storage root and profile-pictures subdirectory */
const STORAGE_ROOT = path.resolve(import.meta.dirname, "../../storage");
const PROFILE_PICTURES_ROOT = path.resolve(
	import.meta.dirname,
	"../../storage/profile-pictures",
);

const PROFILE_PICTURE_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

const buildFilePath = (file) => {
	const filePath = path.join(STORAGE_ROOT, `${file._id}${file.extension}`);

	// Guard at the one place every disk path is built so no caller can skip it.
	// `+ sep` (not a bare prefix) stops a sibling like `storage-evil` slipping by.
	if (!filePath.startsWith(STORAGE_ROOT + path.sep)) {
		throw new AppError("Invalid file path", BAD_REQUEST, INVALID_INPUT);
	}

	return filePath;
};

const buildProfilePicturePath = (token) =>
	path.join(PROFILE_PICTURES_ROOT, token);

const buildProfilePictureUrl = (token) =>
	`${API_URL}/api/users/profile-picture/${token}`;

/** Extracts a profile picture token from a URL.
 * Returns null if the URL is invalid or doesn't match the expected pattern.
 */
const parseProfilePictureToken = (url) => {
	if (typeof url !== "string") return null;
	const match = url.match(/\/api\/users\/profile-picture\/([a-f0-9]{32})$/);
	return match ? match[1] : null;
};

export {
	STORAGE_ROOT,
	PROFILE_PICTURES_ROOT,
	PROFILE_PICTURE_TOKEN_PATTERN,
	buildFilePath,
	buildProfilePicturePath,
	buildProfilePictureUrl,
	parseProfilePictureToken,
};

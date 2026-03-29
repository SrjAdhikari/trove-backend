//* src/services/directory.service.js

import Directory from "../models/directory.model.js";
import File from "../models/file.model.js";
import AppError from "../errors/AppError.js";
import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

const { NOT_FOUND } = httpStatus;
const { DIRECTORY_NOT_FOUND } = appErrorCode;

/**
 * Retrieves a directory and all of its immediate child files and folders.
 *
 * @param {string} directoryId - The ID of the directory to fetch
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @returns {Promise<Object>} Clean JSON payload containing directory metadata, files, and child dirs
 * @throws {AppError} If the directory does not exist or the user does not own it
 */
const getDirectory = async (directoryId, userId) => {
	const directory = await Directory.findOne({
		_id: directoryId,
		userId,
	}).lean();

	if (!directory) {
		throw new AppError("Directory not found", NOT_FOUND, DIRECTORY_NOT_FOUND);
	}

	// Fetching files and child directories concurrently
	const [files, childDirectories] = await Promise.all([
		File.find({ parentDirId: directory._id, userId }).lean(),
		Directory.find({ parentDirId: directory._id, userId }).lean(),
	]);

	// Structuring the final response securely
	return {
		...directory,
		files: files.map((file) => ({ ...file, id: file._id })),
		childDirectories: childDirectories.map((dir) => ({ ...dir, id: dir._id })),
	};
};

export { getDirectory };

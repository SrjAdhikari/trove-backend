//* src/services/file.service.js

import path from "node:path";
import { rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";
import AppError from "../errors/AppError.js";

const { NOT_FOUND, INTERNAL_SERVER_ERROR } = httpStatus;
const { FILE_NOT_FOUND, DIRECTORY_NOT_FOUND, FILE_UPLOAD_FAILED } =
	appErrorCode;
const STORAGE_ROOT = path.resolve(import.meta.dirname, "../../storage");

/**
 * Retrieves a file document and its physical storage path.
 *
 * @param {string} fileId - The ID of the file to fetch
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @returns {Promise<{file: Object, filePath: string}>} The file document and its absolute disk path
 * @throws {AppError} If the file does not exist or the user does not own it
 */
const getFile = async (fileId, userId) => {
	const file = await File.findOne({
		_id: fileId,
		userId,
	}).lean();

	if (!file) {
		throw new AppError("File not found", NOT_FOUND, FILE_NOT_FOUND);
	}

	// Construct the physical storage path using the file's ObjectId as the filename
	const filePath = path.join(STORAGE_ROOT, `${file._id}${file.extension}`);

	return { file, filePath };
};

/**
 * Uploads a file into a specified parent directory.
 *
 * @param {string} parentDirId - The ID of the target parent directory
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @param {string} fileName - The original filename provided by the user
 * @param {import("node:stream").Readable} fileStream - The readable stream of file data
 * @returns {Promise<Object>} The newly created file document
 * @throws {AppError} If the parent directory is not found or file write fails
 */
const uploadFile = async (parentDirId, userId, fileName, fileStream) => {
	const parentDir = await Directory.findOne({
		_id: parentDirId,
		userId,
	}).lean();

	if (!parentDir) {
		throw new AppError(
			"Parent directory not found",
			NOT_FOUND,
			DIRECTORY_NOT_FOUND,
		);
	}

	const extension = path.extname(fileName);

	const file = await File.create({
		name: fileName,
		extension,
		parentDirId: parentDir._id,
		userId,
	});

	const filePath = path.join(STORAGE_ROOT, `${file._id}${extension}`);

	// Stream file data to disk; pipeline handles backpressure and error propagation
	try {
		await pipeline(fileStream, createWriteStream(filePath));
	} catch (error) {
		// Roll back: remove the orphaned DB record and any partial file on disk
		await Promise.all([
			File.deleteOne({ _id: file._id }),
			rm(filePath, { force: true }),
		]);
		throw new AppError(
			"Failed to upload file",
			INTERNAL_SERVER_ERROR,
			FILE_UPLOAD_FAILED,
		);
	}

	return file;
};

/**
 * Rename a file owned by the authenticated user.
 *
 * @param {string} fileId - The ID of the file to rename
 * @param {string} newFileName - The new name for the file
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @returns {Promise<Object>} The updated file document
 * @throws {AppError} If the file does not exist or the user does not own it
 */
const updateFile = async (fileId, newFileName, userId) => {
	const updatedFile = await File.findOneAndUpdate(
		{ _id: fileId, userId },
		{ name: newFileName },
		{ new: true, runValidators: true },
	).lean();

	if (!updatedFile) {
		throw new AppError("File not found", NOT_FOUND, FILE_NOT_FOUND);
	}

	return updatedFile;
};

/**
 * Deletes a file's DB record and its physical storage.
 *
 * @param {string} fileId - The ID of the file to delete
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @returns {Promise<Object>} The deleted file document
 * @throws {AppError} If the file does not exist or the user does not own it
 */
const deleteFile = async (fileId, userId) => {
	const file = await File.findOne({
		_id: fileId,
		userId,
	}).lean();

	if (!file) {
		throw new AppError("File not found", NOT_FOUND, FILE_NOT_FOUND);
	}

	const filePath = path.join(STORAGE_ROOT, `${file._id}${file.extension}`);

	// Delete DB record and physical file in parallel
	await Promise.all([
		File.deleteOne({ _id: fileId, userId }),
		rm(filePath, { force: true }),
	]);

	return file;
};

export { getFile, uploadFile, updateFile, deleteFile };

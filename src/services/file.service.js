//* src/services/file.service.js

import mongoose from "mongoose";
import path from "node:path";
import { rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";

import { updateAncestorDirectoryStats } from "./directory.service.js";

import createByteCounter from "../utils/byteCounter.js";
import { buildFilePath } from "../utils/storagePath.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";
import AppError from "../errors/AppError.js";

const { NOT_FOUND, BAD_REQUEST, INTERNAL_SERVER_ERROR } = httpStatus;
const {
	FILE_NOT_FOUND,
	DIRECTORY_NOT_FOUND,
	FILE_UPLOAD_FAILED,
	FILE_TOO_LARGE,
	STORAGE_LIMIT_EXCEEDED,
} = appErrorCode;

const MAX_FILE_UPLOAD_SIZE = 100 * 1000 * 1000;

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
	const filePath = buildFilePath(file);

	return { file, filePath };
};

/**
 * Uploads a file into a specified parent directory.
 *
 * @param {string} parentDirId - The ID of the target parent directory
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @param {string} fileName - The original filename provided by the user
 * @param {import("node:stream").Readable} fileStream - The readable stream of file data
 * @param {number} totalStorageLimit - The user's quota in bytes (from req.user)
 * @returns {Promise<Object>} The newly created file document
 * @throws {AppError} If the parent directory is not found, the quota is exceeded, or the file write fails
 */
const uploadFile = async (
	parentDirId,
	userId,
	fileName,
	fileStream,
	totalStorageLimit,
) => {
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
	const fileId = new mongoose.Types.ObjectId();
	const filePath = buildFilePath({ _id: fileId, extension });

	// Count bytes mid-stream so we can both persist the size and enforce the cap
	const counter = createByteCounter(MAX_FILE_UPLOAD_SIZE);

	// Stream to disk OUTSIDE the transaction — a non-retryable side effect.
	try {
		await pipeline(fileStream, counter.stream, createWriteStream(filePath));
	} catch (error) {
		await rm(filePath, { force: true });

		if (counter.state.tripped) {
			throw new AppError(
				"File exceeds upload size cap",
				BAD_REQUEST,
				FILE_TOO_LARGE,
			);
		}

		throw new AppError(
			"Failed to upload file",
			INTERNAL_SERVER_ERROR,
			FILE_UPLOAD_FAILED,
		);
	}

	const bytes = counter.state.bytes;
	const mongooseSession = await mongoose.startSession();
	let file;

	try {
		await mongooseSession.withTransaction(async () => {
			// Check inside the transaction: the $inc below makes concurrent
			// uploads conflict and retry, so they can't both pass the quota.
			const rootDir = await Directory.findOne(
				{ userId, parentDirId: null },
				"size",
				{ session: mongooseSession },
			);
			const usedBytes = rootDir?.size ?? 0;
			if (usedBytes + bytes > totalStorageLimit) {
				throw new AppError(
					"Storage limit exceeded",
					BAD_REQUEST,
					STORAGE_LIMIT_EXCEEDED,
				);
			}

			const created = await File.create(
				[
					{
						_id: fileId,
						name: fileName,
						extension,
						size: bytes,
						parentDirId: parentDir._id,
						userId,
					},
				],
				{ session: mongooseSession },
			);
			file = created[0];

			await updateAncestorDirectoryStats(
				parentDir._id,
				{ bytes, files: 1 },
				mongooseSession,
			);
		});
	} catch (error) {
		await rm(filePath, { force: true });
		if (error instanceof AppError) throw error;
		throw new AppError(
			"Failed to upload file",
			INTERNAL_SERVER_ERROR,
			FILE_UPLOAD_FAILED,
		);
	} finally {
		await mongooseSession.endSession();
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
	const file = await File.findOne({ _id: fileId, userId }).lean();

	if (!file) {
		throw new AppError("File not found", NOT_FOUND, FILE_NOT_FOUND);
	}

	const filePath = buildFilePath(file);

	const mongooseSession = await mongoose.startSession();
	try {
		await mongooseSession.withTransaction(async () => {
			await File.deleteOne(
				{ _id: fileId, userId },
				{ session: mongooseSession },
			);
			await updateAncestorDirectoryStats(
				file.parentDirId,
				{ bytes: -file.size, files: -1 },
				mongooseSession,
			);
		});
	} finally {
		await mongooseSession.endSession();
	}

	// Physical file removed outside the transaction — non-retryable side effect.
	await rm(filePath, { force: true });

	return file;
};

export { getFile, uploadFile, updateFile, deleteFile };

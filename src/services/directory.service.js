//* src/services/directory.service.js

import path from "node:path";
import { rm } from "node:fs/promises";
import mongoose from "mongoose";
import Directory from "../models/directory.model.js";
import File from "../models/file.model.js";
import AppError from "../errors/AppError.js";
import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

const { NOT_FOUND, BAD_REQUEST } = httpStatus;
const { DIRECTORY_NOT_FOUND, DIRECTORY_DELETE_FAILED, FILE_DELETE_FAILED } =
	appErrorCode;
const STORAGE_ROOT = path.resolve(import.meta.dirname, "../../storage");

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

/**
 * Creates a new directory inside a specified parent directory.
 *
 * @param {string} parentDirId - The ID of the parent directory
 * @param {string} dirname - The name of the new directory
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @returns {Promise<Object>} The newly created directory document
 * @throws {AppError} If the parent directory does not exist or the user does not own it
 */
const createDirectory = async (parentDirId, dirname, userId) => {
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

	const directory = await Directory.create({
		name: dirname,
		parentDirId,
		userId,
	});

	return directory;
};

/**
 * Renames a directory owned by the authenticated user.
 *
 * @param {string} directoryId - The ID of the directory to rename
 * @param {string} newDirName - The new name for the directory
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @returns {Promise<Object>} The updated directory document
 * @throws {AppError} If the directory does not exist or the user does not own it
 */
const updateDirectory = async (directoryId, newDirName, userId) => {
	const directory = await Directory.findOneAndUpdate(
		{ _id: directoryId, userId },
		{ name: newDirName },
		{ new: true, runValidators: true },
	).lean();

	if (!directory) {
		throw new AppError("Directory not found", NOT_FOUND, DIRECTORY_NOT_FOUND);
	}

	return directory;
};

/**
 * Deletes a directory and all of its contents (files and child directories).
 *
 * @param {string} directoryId - The ID of the directory to delete
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @returns {Promise<Object>} The deleted directory document
 * @throws {AppError} If the directory does not exist or the user does not own it
 */
const deleteDirectory = async (directoryId, userId) => {
	// Step 1: Find the directory and nested subdirectories recursively
	const rootDir = await getAllNestedDirectories(userId, directoryId);

	if (!rootDir) {
		throw new AppError("Directory not found", NOT_FOUND, DIRECTORY_NOT_FOUND);
	}

	// Prevent deletion of root directory
	if (!rootDir.parentDirId) {
		throw new AppError(
			"Cannot delete root directory",
			BAD_REQUEST,
			DIRECTORY_DELETE_FAILED,
		);
	}

	// Step 2: Collect all directory IDs including nested ones
	const allDirIds = [
		rootDir._id,
		...rootDir.subDirectories.map((dir) => dir._id),
	];

	// Step 3: Fetch all files within these directories belonging to the user
	const allFiles = await File.find({
		parentDirId: { $in: allDirIds },
		userId,
	}).lean();

	// Step 4:  Validate all file paths before any deletion
	const filePaths = allFiles.map((file) => {
		const filePath = path.join(STORAGE_ROOT, `${file._id}${file.extension}`);

		// Guard against path traversal attacks
		if (!filePath.startsWith(STORAGE_ROOT)) {
			throw new AppError("Invalid file path", BAD_REQUEST, FILE_DELETE_FAILED);
		}

		return filePath;
	});

	// Step 5: Delete all files and directories from the DB atomically
	const session = await mongoose.startSession();

	try {
		await session.withTransaction(async () => {
			await File.deleteMany(
				{ parentDirId: { $in: allDirIds }, userId },
				{ session },
			);

			await Directory.deleteMany(
				{ _id: { $in: allDirIds }, userId },
				{ session },
			);
		});
	} finally {
		session.endSession();
	}

	// Step 6: Delete all physical files after successful DB transaction
	await Promise.allSettled(filePaths.map((filePath) => rm(filePath)));

	return rootDir;
};

/**
 * Recursively fetches a directory and all of its subdirectories.
 *
 * @param {string} userId - The ID of the authenticated user
 * @param {string} directoryId - The ID of the directory to start from
 * @returns {Promise<Object>} The directory with all nested subdirectories
 */
const getAllNestedDirectories = async (userId, directoryId) => {
	// Aggregate pipeline requires raw ObjectIds (not strings)
	const directoryObjectId = new mongoose.Types.ObjectId(directoryId);
	const userObjectId = new mongoose.Types.ObjectId(userId);

	const result = await Directory.aggregate([
		// Step 1: Find the single directory we want to delete
		{
			$match: {
				_id: directoryObjectId,
				userId: userObjectId,
			},
		},

		/**
		 * Step 2: Recursively collect all nested subdirectories
		 * In plain English:
		 *  Find all directories whose parentDirId equals my _id,
		 *  then find all directories whose parentDirId equals THEIR _id,
		 *  and keep going until no more children are found.
		 */
		{
			$graphLookup: {
				from: "directories",
				startWith: "$_id",
				connectFromField: "_id",
				connectToField: "parentDirId",
				as: "subDirectories",
				maxDepth: 20,
				restrictSearchWithMatch: {
					userId: userObjectId,
				},
			},
		},
	]);

	// result is an array with at most one element (from $match)
	return result[0];
};

export { getDirectory, createDirectory, updateDirectory, deleteDirectory };

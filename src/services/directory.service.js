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
const {
	DIRECTORY_NOT_FOUND,
	DIRECTORY_RENAME_FAILED,
	DIRECTORY_DELETE_FAILED,
	FILE_DELETE_FAILED,
} = appErrorCode;
const STORAGE_ROOT = path.resolve(import.meta.dirname, "../../storage");

/**
 * Retrieves a directory with its immediate files and child folders, recursive
 * `fileCount` + `totalSize` for the directory itself and each child folder,
 * and the ordered ancestor chain from root to immediate parent.
 *
 * @param {string} directoryId - The ID of the directory to fetch
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @returns {Promise<Object>} Directory metadata, ancestors, files, and child directories with stats
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

	// Find files and immediate child folders directly inside directory.
	// Get the recursive stats (file count + total size) for directory.
	// Get the ordered ancestor chain (root → immediate parent).
	const [files, childDirs, directoryStats, ancestors] = await Promise.all([
		File.find({ parentDirId: directory._id, userId }).lean(),
		Directory.find({ parentDirId: directory._id, userId }).lean(),
		getNestedSubtreeStats(directory._id, userId),
		getAncestors(directory._id, userId),
	]);

	// Get the recursive stats (file count + total size) for each child folder.
	const childDirectories = await Promise.all(
		childDirs.map(async (dir) => {
			const stats = await getNestedSubtreeStats(dir._id, userId);
			return {
				...dir,
				id: dir._id,
				fileCount: stats.fileCount,
				totalSize: stats.totalSize,
			};
		}),
	);

	return {
		...directory,
		fileCount: directoryStats.fileCount,
		totalSize: directoryStats.totalSize,
		ancestors,
		files: files.map((file) => ({ ...file, id: file._id })),
		childDirectories,
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
	const directory = await Directory.findOne({
		_id: directoryId,
		userId,
	}).lean();

	if (!directory) {
		throw new AppError("Directory not found", NOT_FOUND, DIRECTORY_NOT_FOUND);
	}

	// Prevent renaming of root directory
	if (!directory.parentDirId) {
		throw new AppError(
			"Cannot rename root directory",
			BAD_REQUEST,
			DIRECTORY_RENAME_FAILED,
		);
	}

	const updatedDirectory = await Directory.findOneAndUpdate(
		{ _id: directoryId, userId },
		{ name: newDirName },
		{ new: true, runValidators: true },
	).lean();

	return updatedDirectory;
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
	const rootDir = await getAllNestedDirectories(directoryId, userId);

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
 * @param {string} directoryId - The ID of the directory to start from
 * @param {string} userId - The ID of the authenticated user
 * @returns {Promise<Object>} The directory with all nested subdirectories
 */
const getAllNestedDirectories = async (directoryId, userId) => {
	// Convert IDs to Mongoose ObjectIds for reliable matching
	const directoryObjectId = new mongoose.Types.ObjectId(directoryId);
	const userObjectId = new mongoose.Types.ObjectId(userId);

	const result = await Directory.aggregate([
		// Step 1: Find the single directory we want to start from
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

/**
 * Computes the total number of files and their cumulative size
 * within a directory and all of its subdirectories.
 *
 * @param {string} directoryId - The ID of the directory to start from
 * @param {string} userId - The ID of the authenticated user
 * @returns {Promise<{fileCount: number, totalSize: number}>}
 */
const getNestedSubtreeStats = async (directoryId, userId) => {
	const root = await getAllNestedDirectories(directoryId, userId);
	if (!root) return { fileCount: 0, totalSize: 0 };

	// Collect all directory IDs including nested ones
	const allDirIds = [root._id, ...root.subDirectories.map((dir) => dir._id)];

	// Fetch all files within these directories belonging to the user
	const allFiles = await File.find({
		parentDirId: { $in: allDirIds },
		userId,
	}).lean();

	const fileCount = allFiles.length;
	const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);

	return { fileCount, totalSize };
};

/**
 * Returns the ordered ancestor list from root to immediate parent.
 * Returns [] when the directory is the root.
 *
 * @param {string} directoryId - The ID of the directory to start from
 * @param {string} userId - The ID of the authenticated user
 * @returns {Promise<Array<{_id: import("mongoose").Types.ObjectId, name: string}>>}
 */
const getAncestors = async (directoryId, userId) => {
	// Convert IDs to Mongoose ObjectIds for reliable matching
	const directoryObjectId = new mongoose.Types.ObjectId(directoryId);
	const userObjectId = new mongoose.Types.ObjectId(userId);

	const result = await Directory.aggregate([
		// Step 1: Find the single directory we want to start from
		{ $match: { _id: directoryObjectId, userId: userObjectId } },

		// Step 2: Starts at this directory's parentDirId, then looks up each ancestor
		// by matching its _id, climbing until parentDirId is null or maxDepth.
		// `depthField` orders the chain: 0 = immediate parent, highest depth = root.
		{
			$graphLookup: {
				from: "directories",
				startWith: "$parentDirId",
				connectFromField: "parentDirId",
				connectToField: "_id",
				as: "ancestors",
				maxDepth: 20,
				depthField: "depth",
				restrictSearchWithMatch: { userId: userObjectId },
			},
		},
	]);

	if (!result[0]) return [];

	// Sort descending by depth so root comes first, immediate parent last
	return result[0].ancestors
		.sort((a, b) => b.depth - a.depth)
		.map((ancestor) => ({ _id: ancestor._id, name: ancestor.name }));
};

export { getDirectory, createDirectory, updateDirectory, deleteDirectory };

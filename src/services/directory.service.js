//* src/services/directory.service.js

import { rm } from "node:fs/promises";
import mongoose from "mongoose";
import Directory from "../models/directory.model.js";
import File from "../models/file.model.js";
import AppError from "../errors/AppError.js";
import { buildFilePath } from "../utils/storagePath.js";
import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";
import { generateBreadCrumb, generatePath } from "../utils/path.js";

const { NOT_FOUND, BAD_REQUEST } = httpStatus;
const {
	DIRECTORY_NOT_FOUND,
	DIRECTORY_RENAME_FAILED,
	DIRECTORY_DELETE_FAILED,
} = appErrorCode;

/**
 * Retrieves a directory with its immediate files and child folders, recursive
 * `fileCount`, `folderCount` + `totalSize` for the directory itself and each
 * child folder, a self-inclusive breadcrumb (root → current), and a display
 * path string.
 *
 * @param {string} directoryId - The ID of the directory to fetch
 * @param {string} userId - The ID of the authenticated user to verify ownership
 * @returns {Promise<Object>} Directory metadata, breadcrumb, path, files, and child directories with stats
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

	const [files, childDirs, ancestors] = await Promise.all([
		File.find({ parentDirId: directory._id, userId }).lean(),
		Directory.find({ parentDirId: directory._id, userId }).lean(),
		resolveDirectoryNames(directory.ancestorIds, userId),
	]);

	const breadcrumb = generateBreadCrumb(ancestors, directory);
	const path = generatePath(breadcrumb);

	// Expose the stored subtree size as `totalSize`; drop the raw `size` and the
	// internal `ancestorIds` from the response (top-level and each child).
	const childDirectories = childDirs.map(({ size, ancestorIds, ...dir }) => ({
		...dir,
		id: dir._id,
		totalSize: size,
	}));

	const { size, ancestorIds, ...directoryView } = directory;
	return {
		...directoryView,
		totalSize: size,
		breadcrumb,
		path,
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

	let directory;
	const session = await mongoose.startSession();
	try {
		await session.withTransaction(async () => {
			const created = await Directory.create(
				[
					{
						name: dirname,
						parentDirId,
						userId,
						ancestorIds: [...parentDir.ancestorIds, parentDir._id],
					},
				],
				{ session },
			);

			// The new folder adds one folder to every ancestor's subtree. Its own
			// folderCount stays 0, so the walk starts at the parent, not at it.
			await updateAncestorDirectoryStats(parentDirId, { folders: 1 }, session);

			directory = created[0];
		});
	} finally {
		session.endSession();
	}

	// ancestorIds is internal denormalization — drop it so the create and read
	// (getDirectory) contracts stay symmetric.
	const { ancestorIds, ...directoryView } = directory.toObject();
	return directoryView;
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

	// Step 4: Build all physical file paths. buildFilePath throws on any path
	// that escapes STORAGE_ROOT, so a malicious entry aborts the whole delete
	// here — before Step 5 touches the DB.
	const filePaths = allFiles.map((file) => buildFilePath(file));

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

			// Subtract the deleted subtree's totals from every ancestor above it.
			await updateAncestorDirectoryStats(
				rootDir.parentDirId,
				{
					bytes: -rootDir.size,
					files: -rootDir.fileCount,
					folders: -allDirIds.length,
				},
				session,
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
 * Walks parentDirId from startDirId up to the root and applies a
 * size/fileCount/folderCount delta to that directory and every ancestor,
 * atomically via $inc. Pass the active transaction `session` so the walk +
 * update join the caller's transaction.
 *
 * @param {import("mongoose").Types.ObjectId|string} startDirId
 * @param {{ bytes?: number, files?: number, folders?: number }} delta
 * @param {import("mongoose").ClientSession} [session]
 */
const updateAncestorDirectoryStats = async (
	startDirId,
	{ bytes = 0, files = 0, folders = 0 },
	session,
) => {
	const ancestorDirIds = [];
	let currentDirId = startDirId;

	while (currentDirId) {
		// Project to parentDirId only because we only need _id and parentDirId for the walk
		const currentDir = await Directory.findById(currentDirId, "parentDirId", {
			session,
		});
		if (!currentDir) break;
		ancestorDirIds.push(currentDir._id);
		currentDirId = currentDir.parentDirId;
	}

	if (ancestorDirIds.length === 0) return;

	await Directory.updateMany(
		{ _id: { $in: ancestorDirIds } },
		{ $inc: { size: bytes, fileCount: files, folderCount: folders } },
		{ session },
	);
};

/**
 * Resolves an ordered list of directory IDs into [{ _id, name }], preserving
 * the input order. Ownership-scoped. Returns [] for an empty chain.
 *
 * @param {Array<import("mongoose").Types.ObjectId|string>} dirIds
 * @param {string} userId
 * @returns {Promise<Array<{_id: import("mongoose").Types.ObjectId|string, name: string}>>}
 */
const resolveDirectoryNames = async (dirIds, userId) => {
	if (!dirIds?.length) return [];

	const dirs = await Directory.find(
		{ _id: { $in: dirIds }, userId },
		"name",
	).lean();

	const nameById = new Map(dirs.map((dir) => [dir._id.toString(), dir.name]));

	return dirIds.map((id) => ({ _id: id, name: nameById.get(id.toString()) }));
};

export {
	getDirectory,
	createDirectory,
	updateDirectory,
	deleteDirectory,
	updateAncestorDirectoryStats,
	resolveDirectoryNames,
};

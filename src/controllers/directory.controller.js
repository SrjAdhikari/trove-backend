//* src/controllers/directory.controller.js

import {
	getDirectory,
	createDirectory,
	updateDirectory,
	deleteDirectory,
} from "../services/directory.service.js";
import AppError from "../errors/AppError.js";
import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

const { OK, CREATED, BAD_REQUEST } = httpStatus;
const { INVALID_INPUT } = appErrorCode;

const getDirectoryHandler = async (req, res) => {
	const user = req.user;

	// If no ID is explicitly requested, default to the user's permanent Root Directory
	const directoryId = req.params.id || user.rootDirId.toString();

	const directoryData = await getDirectory(directoryId, user._id);

	return res.status(OK).json({
		success: true,
		message: "Directory fetched successfully",
		data: directoryData,
	});
};

const createDirectoryHandler = async (req, res) => {
	const user = req.user;
	const dirname = req.body?.name || "New Folder";

	// If no ID is explicitly requested, default to the user's permanent Root Directory
	const parentDirId = req.params.parentDirId || user.rootDirId.toString();

	const newDirectory = await createDirectory(parentDirId, dirname, user._id);

	return res.status(CREATED).json({
		success: true,
		message: "Directory created successfully",
		data: newDirectory,
	});
};

const updateDirectoryHandler = async (req, res) => {
	const user = req.user;
	const directoryId = req.params.id;
	const newDirName = req.body?.newDirName;

	if (!newDirName || typeof newDirName !== "string") {
		throw new AppError(
			"Valid directory name is required",
			BAD_REQUEST,
			INVALID_INPUT,
		);
	}

	const updatedDirectory = await updateDirectory(
		directoryId,
		newDirName,
		user._id,
	);

	return res.status(OK).json({
		success: true,
		message: "Directory renamed successfully",
		data: updatedDirectory,
	});
};

const deleteDirectoryHandler = async (req, res) => {
	const user = req.user;
	const directoryId = req.params.id;

	const deletedDirectory = await deleteDirectory(directoryId, user._id);

	return res.status(OK).json({
		success: true,
		message: "Directory deleted successfully",
		data: deletedDirectory,
	});
};

export {
	getDirectoryHandler,
	createDirectoryHandler,
	updateDirectoryHandler,
	deleteDirectoryHandler,
};

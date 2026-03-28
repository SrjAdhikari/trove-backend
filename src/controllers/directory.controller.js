//* src/controllers/directory.controller.js

import { getDirectory } from "../services/directory.service.js";
import httpStatus from "../constants/httpStatus.js";

const { OK } = httpStatus;

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

const createDirectoryHandler = async (req, res) => {};

const updateDirectoryHandler = async (req, res) => {};

const deleteDirectoryHandler = async (req, res) => {};

export {
	getDirectoryHandler,
	createDirectoryHandler,
	updateDirectoryHandler,
	deleteDirectoryHandler,
};

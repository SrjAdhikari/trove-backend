//* src/controllers/file.controller.js

import {
	getFile,
	uploadFile,
	updateFile,
	deleteFile,
} from "../services/file.service.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";
import AppError from "../errors/AppError.js";

const { OK, CREATED, BAD_REQUEST } = httpStatus;
const { INVALID_INPUT } = appErrorCode;

const getFileHandler = async (req, res) => {
	const user = req.user;
	const fileId = req.params.id;

	const { file, filePath } = await getFile(fileId, user._id);

	if (req.query.action === "download") {
		return res.download(filePath, file.name);
	}

	return res.sendFile(filePath);
};

const uploadFileHandler = async (req, res) => {
	const user = req.user;

	// If no ID is explicitly requested, default to the user's permanent Root Directory
	const parentDirId = req.params.parentDirId || user.rootDirId.toString();
	const fileName = req.headers.filename || "untitled";

	const file = await uploadFile(parentDirId, user._id, fileName, req);

	return res.status(CREATED).json({
		success: true,
		message: "File uploaded successfully",
		data: file,
	});
};

const updateFileHandler = async (req, res) => {
	const user = req.user;
	const fileId = req.params.id;
	const newFileName = req.body?.newFileName;

	if (!newFileName || typeof newFileName !== "string") {
		throw new AppError(
			"Valid file name is required",
			BAD_REQUEST,
			INVALID_INPUT,
		);
	}

	const updatedFile = await updateFile(fileId, newFileName, user._id);

	return res.status(OK).json({
		success: true,
		message: "File renamed successfully",
		data: updatedFile,
	});
};

const deleteFileHandler = async (req, res) => {
	const user = req.user;
	const fileId = req.params.id;

	const deletedFile = await deleteFile(fileId, user._id);

	return res.status(OK).json({
		success: true,
		message: "File deleted successfully",
		data: deletedFile,
	});
};

export {
	getFileHandler,
	uploadFileHandler,
	updateFileHandler,
	deleteFileHandler,
};

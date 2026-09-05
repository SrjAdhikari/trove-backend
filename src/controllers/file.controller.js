//* src/controllers/file.controller.js

import {
	getFile,
	initiateUpload,
	confirmUpload,
	updateFile,
	deleteFile,
} from "../services/file.service.js";

import httpStatus from "../constants/httpStatus.js";

const { OK, CREATED } = httpStatus;

const getFileHandler = async (req, res) => {
	const user = req.user;
	const fileId = req.params.id;

	const { file, filePath } = await getFile(fileId, user._id);

	if (req.query.action === "download") {
		return res.download(filePath, file.name);
	}

	return res.sendFile(filePath);
};

const initiateUploadHandler = async (req, res) => {
	const user = req.user;

	// Body validated and name sanitized by initiateUploadSchema (validateBody).
	const { name, size } = req.body ?? {};

	// If no ID is explicitly requested, default to the user's permanent Root Directory
	const parentDirId = req.params.parentDirId || user.rootDirId.toString();

	const result = await initiateUpload(
		parentDirId,
		user._id,
		name,
		size,
		user.storageLimit,
	);

	return res.status(CREATED).json({
		success: true,
		message: "Upload initiated successfully",
		data: result,
	});
};

const confirmUploadHandler = async (req, res) => {
	const user = req.user;
	const fileId = req.params.id;

	const file = await confirmUpload(fileId, user._id);

	return res.status(OK).json({
		success: true,
		message: "File uploaded successfully",
		data: file,
	});
};

const updateFileHandler = async (req, res) => {
	const user = req.user;
	const fileId = req.params.id;

	// Name is sanitized and validated by renameFileSchema (validateBody).
	const newFileName = req.body.newFileName;
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
	initiateUploadHandler,
	confirmUploadHandler,
	updateFileHandler,
	deleteFileHandler,
};

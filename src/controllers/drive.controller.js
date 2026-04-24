//* src/controllers/drive.controller.js

import { importFromDrive } from "../services/drive.service.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";
import AppError from "../errors/AppError.js";

const { OK, BAD_REQUEST } = httpStatus;
const { INVALID_DRIVE_TOKEN, INVALID_INPUT } = appErrorCode;

const MAX_ITEMS_PER_REQUEST = 50;
const MAX_ACCESS_TOKEN_LENGTH = 4096;

const importDriveHandler = async (req, res) => {
	const { accessToken, items, parentDirId } = req.body ?? {};

	if (typeof accessToken !== "string" || !accessToken.trim()) {
		throw new AppError(
			"accessToken is required",
			BAD_REQUEST,
			INVALID_DRIVE_TOKEN,
		);
	}

	if (accessToken.length > MAX_ACCESS_TOKEN_LENGTH) {
		throw new AppError(
			"accessToken is malformed",
			BAD_REQUEST,
			INVALID_DRIVE_TOKEN,
		);
	}

	if (
		!Array.isArray(items) ||
		items.length === 0 ||
		items.length > MAX_ITEMS_PER_REQUEST
	) {
		throw new AppError(
			`items must be a non-empty array of at most ${MAX_ITEMS_PER_REQUEST}`,
			BAD_REQUEST,
			INVALID_INPUT,
		);
	}

	for (const item of items) {
		if (
			!item ||
			typeof item.id !== "string" ||
			!item.id ||
			typeof item.mimeType !== "string" ||
			!item.mimeType
		) {
			throw new AppError(
				"each item requires string id and mimeType",
				BAD_REQUEST,
				INVALID_INPUT,
			);
		}
	}

	if (parentDirId !== undefined && typeof parentDirId !== "string") {
		throw new AppError(
			"parentDirId must be a string when provided",
			BAD_REQUEST,
			INVALID_INPUT,
		);
	}

	const user = req.user;
	const targetParentDirId = parentDirId || user.rootDirId.toString();

	const result = await importFromDrive(
		user._id,
		accessToken,
		items,
		targetParentDirId,
	);

	return res.status(OK).json({
		success: true,
		message: "Import completed",
		data: result,
	});
};

export { importDriveHandler };

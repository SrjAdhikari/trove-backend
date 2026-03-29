//* src/middlewares/validateId.middleware.js

import { isValidObjectId } from "mongoose";
import AppError from "../errors/AppError.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

const { BAD_REQUEST } = httpStatus;
const { INVALID_ID } = appErrorCode;

/**
 * Validates if a given ID is a valid MongoDB ObjectId.
 *
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next middleware function.
 * @param {string} id - The ID to validate.
 * @throws {AppError} - If the ID is not a valid ObjectId.
 */
const validateId = (req, res, next, id) => {
	if (!isValidObjectId(id)) {
		throw new AppError(`Invalid ID format: ${id}`, BAD_REQUEST, INVALID_ID);
	}

	next();
};

export default validateId;

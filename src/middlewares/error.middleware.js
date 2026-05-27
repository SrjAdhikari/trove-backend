//* src/middlewares/error.middleware.js

import AppError from "../errors/AppError.js";
import envConfig from "../constants/env.js";
import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

const { NODE_ENV } = envConfig;
const { BAD_REQUEST, UNPROCESSABLE_ENTITY, CONFLICT, INTERNAL_SERVER_ERROR } =
	httpStatus;
const { INVALID_ID, VALIDATION_ERROR, DUPLICATE_FIELD, INTERNAL_ERROR } =
	appErrorCode;

/**
 * Converts a known Mongoose/MongoDB error into a structured AppError.
 * Returns null when the error isn't one we explicitly recognize.
 *
 * @param {Error} err - The thrown or rejected error.
 * @returns {AppError|null}
 */
const knownAppError = (err) => {
	// 1. Mongoose invalid ObjectId / cast error
	if (err.name === "CastError") {
		return new AppError(
			`Invalid ${err.path}: ${err.value}`,
			BAD_REQUEST,
			INVALID_ID,
		);
	}

	// 2. Mongoose schema validation error
	if (err.name === "ValidationError") {
		const message = Object.values(err.errors)
			.map((e) => e.message)
			.join(", ");
		return new AppError(message, UNPROCESSABLE_ENTITY, VALIDATION_ERROR);
	}

	// 3. MongoDB duplicate-key error
	if (err.code === 11000) {
		const field = Object.keys(err.keyValue)[0];
		return new AppError(`${field} already exists`, CONFLICT, DUPLICATE_FIELD);
	}

	// 4. MongoDB document-validation failure
	if (err.code === 121) {
		return new AppError(err.message, BAD_REQUEST, VALIDATION_ERROR);
	}

	return null;
};

/**
 * Global error handling middleware for Express 5.
 *
 * Converts known errors into structured AppError responses.
 * Must be registered after all routes and other middleware in the Express app.
 *
 * @param {Error} err - The thrown or rejected error.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next function.
 */
const globalErrorHandler = (err, req, res, next) => {
	// 1. Resolve the incoming error into a structured AppError
	let error = knownAppError(err);

	if (!error) {
		if (err instanceof AppError) {
			error = err;
		} else {
			console.error(`[GLOBAL ERROR HANDLER] UNEXPECTED ERROR:`, err);
			error = new AppError(
				"Something went wrong",
				INTERNAL_SERVER_ERROR,
				INTERNAL_ERROR,
			);
			error.isOperational = false;
		}
	}

	// 2. Derive the HTTP status
	const statusCode = error.statusCode || INTERNAL_SERVER_ERROR;

	// 3. Build the response — mask internal details for non-operational errors
	const response = {
		status: statusCode >= 400 && statusCode < 500 ? "fail" : "error",
		error: {
			code: error.code,
			message: error.isOperational ? error.message : "Something went wrong",
		},
	};

	// 4. Expose the stack trace only outside production
	if (NODE_ENV === "development") {
		response.stack = err.stack;
	}

	return res.status(statusCode).json(response);
};

export default globalErrorHandler;

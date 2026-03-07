//* src/middlewares/error.middleware.js

import AppError from "../errors/AppError.js";
import envConfig from "../constants/env.js";
import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

const { NODE_ENV } = envConfig;
const {
	BAD_REQUEST,
	UNPROCESSABLE_ENTITY,
	UNAUTHORIZED,
	CONFLICT,
	INTERNAL_SERVER_ERROR,
} = httpStatus;
const {
	INVALID_ID,
	VALIDATION_ERROR,
	INVALID_TOKEN,
	TOKEN_EXPIRED,
	DUPLICATE_FIELD,
	INTERNAL_ERROR,
} = appErrorCode;

/**
 * Maps known error names to structured AppError instances.
 * @type {Object.<string, function(Error): AppError>}
 */
const errorsByName = {
	CastError: (err) =>
		new AppError(`Invalid ${err.path}: ${err.value}`, BAD_REQUEST, INVALID_ID),

	ValidationError: (err) => {
		const message = Object.values(err.errors)
			.map((e) => e.message)
			.join(", ");
		return new AppError(message, UNPROCESSABLE_ENTITY, VALIDATION_ERROR);
	},

	JsonWebTokenError: () =>
		new AppError("Invalid authentication token", UNAUTHORIZED, INVALID_TOKEN),

	TokenExpiredError: () =>
		new AppError(
			"Your session has expired. Please log in again.",
			UNAUTHORIZED,
			TOKEN_EXPIRED,
		),
};

/**
 * Maps known MongoDB error codes to structured AppError instances.
 * @type {Object.<number, function(Error): AppError>}
 */
const errorsByCode = {
	11000: (err) => {
		const field = Object.keys(err.keyValue)[0];
		return new AppError(`${field} already exists`, CONFLICT, DUPLICATE_FIELD);
	},
	121: (err) => new AppError(err.message, BAD_REQUEST, VALIDATION_ERROR),
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
	let error;

	const handler = errorsByName[err.name] || errorsByCode[err.code];

	if (handler) {
		error = handler(err);
	} else if (err instanceof AppError) {
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

	const statusCode = error.statusCode || INTERNAL_SERVER_ERROR;
	const status =
		error.statusCode >= 400 && error.statusCode < 500 ? "fail" : "error";

	const response = {
		status,
		error: {
			code: error.code,
			message: error.isOperational ? error.message : "Something went wrong",
		},
	};

	if (NODE_ENV === "development") {
		response.stack = err.stack;
	}

	res.status(statusCode).json(response);
};

export default globalErrorHandler;

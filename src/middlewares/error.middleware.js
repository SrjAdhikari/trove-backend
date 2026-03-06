//* src/middlewares/error.middleware.js

import AppError from "../errors/AppError.js";
import envConfig from "../constants/env.js";

const { NODE_ENV } = envConfig;

const errorsByName = {
	CastError: (err) =>
		new AppError(`Invalid ${err.path}: ${err.value}`, 400, "INVALID_ID"),

	ValidationError: (err) => {
		const message = Object.values(err.errors)
			.map((e) => e.message)
			.join(", ");
		return new AppError(message, 422, "VALIDATION_ERROR");
	},

	JsonWebTokenError: () =>
		new AppError("Invalid authentication token", 401, "INVALID_TOKEN"),

	TokenExpiredError: () =>
		new AppError(
			"Your session has expired. Please log in again.",
			401,
			"TOKEN_EXPIRED",
		),
};

const errorsByCode = {
	11000: (err) => {
		const field = Object.keys(err.keyValue)[0];
		return new AppError(`${field} already exists`, 409, "DUPLICATE_FIELD");
	},
	121: (err) => new AppError(err.message, 400, "VALIDATION_ERROR"),
};

const globalErrorHandler = (err, req, res, next) => {
	let error;

	const handler = errorsByName[err.name] || errorsByCode[err.code];

	if (handler) {
		error = handler(err);
	} else if (err instanceof AppError) {
		error = err;
	} else {
		console.error(`[GLOBAL ERROR HANDLER] UNEXPECTED ERROR:`, err);
		error = new AppError("Something went wrong", 500, "INTERNAL_ERROR");
		error.isOperational = false;
	}

	const statusCode = error.statusCode || 500;
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

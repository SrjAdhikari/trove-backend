//* src/middlewares/validate.middleware.js

import AppError from "../errors/AppError.js";

import httpStatus from "../constants/httpStatus.js";
import appErrorCode from "../constants/appErrorCode.js";

const { BAD_REQUEST } = httpStatus;
const { VALIDATION_ERROR } = appErrorCode;

/**
 * Builds a middleware that validates `req.body` against a Zod schema.
 *
 * On success the parsed (and normalized) data replaces `req.body` so trimming,
 * lowercasing, and type coercion flow downstream. On failure it throws an
 * AppError that the global error handler converts to a 400 response.
 *
 * @param {import("zod").ZodType} schema - Zod schema to validate the body with.
 * @returns {import("express").RequestHandler}
 */
const validateRequestBody = (schema) => (req, res, next) => {
	const result = schema.safeParse(req.body ?? {});

	if (!result.success) {
		const message = result.error.issues
			.map((issue) => issue.message)
			.join("; ");

		throw new AppError(message, BAD_REQUEST, VALIDATION_ERROR);
	}

	req.body = result.data;
	next();
};

export default validateRequestBody;

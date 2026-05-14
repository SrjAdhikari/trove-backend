//* src/controllers/admin/user.controller.js

import httpStatus from "../../constants/httpStatus.js";
import { listUsers, getUserById } from "../../services/admin/user.service.js";

const { OK } = httpStatus;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Helper function to clamp a number into the range [min, max].
 * Express delivers req.query as strings, or undefined when the key is absent. 
 * This can lead to unexpected behavior if not handled properly.
 *
 * @param {string} raw - Raw string value to parse.
 * @param {number} fallback - Fallback value if parsing fails or value is less than min.
 * @param {object} range - Object with min and max values.
 * @returns {number} - Clamped integer value.
 */
const clampInt = (raw, fallback, { min, max }) => {
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed) || parsed < min) return fallback;
	if (max !== undefined && parsed > max) return max;
	return parsed;
};

const listUsersHandler = async (req, res) => {
	const {
		page: pageRaw,
		limit: limitRaw,
		q,
		role,
		status,
		includeDeleted,
	} = req.query;

	const page = clampInt(pageRaw, DEFAULT_PAGE, { min: 1 });
	const limit = clampInt(limitRaw, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });

	const result = await listUsers({
		page,
		limit,
		q: typeof q === "string" ? q.trim() : undefined,
		role: typeof role === "string" ? role : undefined,
		status: typeof status === "string" ? status : undefined,
		includeDeleted: includeDeleted === "true",
	});

	res.status(OK).json({
		success: true,
		message: "Users fetched successfully",
		data: result,
	});
};

const getUserByIdHandler = async (req, res) => {
	const { id } = req.params;

	const data = await getUserById(id);

	res.status(OK).json({
		success: true,
		message: "User fetched successfully",
		data,
	});
};

export { listUsersHandler, getUserByIdHandler };

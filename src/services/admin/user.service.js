//* src/services/admin/user.service.js

import mongoose from "mongoose";

import User from "../../models/user.model.js";
import File from "../../models/file.model.js";
import Directory from "../../models/directory.model.js";
import Session from "../../models/session.model.js";

import AppError from "../../errors/AppError.js";
import httpStatus from "../../constants/httpStatus.js";
import appErrorCode from "../../constants/appErrorCode.js";
import { ROLES } from "../../constants/roles.js";
import { USER_STATUS, getUserStatus } from "../../utils/userStatus.js";

const { BAD_REQUEST, NOT_FOUND } = httpStatus;
const { INVALID_INPUT, USER_NOT_FOUND } = appErrorCode;

// Convert the constant objects into plain arrays.
const ALLOWED_ROLES = Object.values(ROLES);
const ALLOWED_STATUSES = Object.values(USER_STATUS);

// Escape regex metacharacters so user-supplied search terms cannot inject regex syntax.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build the Mongo filter that implements the admin user-list semantics from RBAC.
 * Status maps to timestamp predicates; `includeDeleted` only matters when no
 * explicit `status` filter is supplied.
 */
const buildListFilter = ({ q, role, status, includeDeleted }) => {
	const filter = {};

	if (q) {
		const regex = new RegExp(escapeRegex(q), "i");
		filter.$or = [{ email: regex }, { name: regex }];
	}

	if (role) filter.role = role;

	if (status === USER_STATUS.ACTIVE) {
		filter.suspendedAt = null;
		filter.deletedAt = null;
	} else if (status === USER_STATUS.SUSPENDED) {
		filter.suspendedAt = { $ne: null };
		filter.deletedAt = null;
	} else if (status === USER_STATUS.DELETED) {
		filter.deletedAt = { $ne: null };
	} else if (!includeDeleted) {
		filter.deletedAt = null;
	}

	return filter;
};

/**
 * Paginated user list for the admin console.
 *
 * @param {object} options
 * @param {number} options.page - Current page number.
 * @param {number} options.limit - Number of users per page.
 * @param {string} [options.q] - Case-insensitive email/name search.
 * @param {string} [options.role] - Restrict by role.
 * @param {string} [options.status] - One of `active | suspended | deleted`.
 * @param {boolean} [options.includeDeleted] - Include soft-deleted users when no status filter is set.
 */
const listUsers = async ({ page, limit, q, role, status, includeDeleted }) => {
	if (role && !ALLOWED_ROLES.includes(role)) {
		throw new AppError(
			`Invalid role filter. Allowed: ${ALLOWED_ROLES.join(", ")}`,
			BAD_REQUEST,
			INVALID_INPUT,
		);
	}

	if (status && !ALLOWED_STATUSES.includes(status)) {
		throw new AppError(
			`Invalid status filter. Allowed: ${ALLOWED_STATUSES.join(", ")}`,
			BAD_REQUEST,
			INVALID_INPUT,
		);
	}

	const filter = buildListFilter({ q, role, status, includeDeleted });

	const [items, total] = await Promise.all([
		User.find(filter)
			.sort({ createdAt: -1 })
			.skip((page - 1) * limit)
			.limit(limit)
			.lean(),
		User.countDocuments(filter),
	]);

	const itemsWithStatus = items.map((user) => ({
		...user,
		status: getUserStatus(user),
	}));

	return {
		items: itemsWithStatus,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / limit)),
		},
	};
};

/**
 * Detailed admin view of a single user, including derived storage, file,
 * directory, and session metrics. Soft-deleted users are returned so admins
 * can inspect them; the consumer can branch on the `status` field.
 *
 * @param {string} id - User _id (ObjectId string).
 */
const getUserById = async (id) => {
	const user = await User.findById(id).lean();
	if (!user) {
		throw new AppError("User not found", NOT_FOUND, USER_NOT_FOUND);
	}

	const userObjectId = new mongoose.Types.ObjectId(id);
	const now = new Date();

	const [storageAgg, directoryCount, activeSessionCount, lastSession] =
		await Promise.all([
			File.aggregate([
				{ $match: { userId: userObjectId } },
				{
					$group: {
						_id: null,
						fileCount: { $sum: 1 },
						storageBytes: { $sum: "$size" },
					},
				},
			]),
			Directory.countDocuments({ userId: userObjectId }),
			Session.countDocuments({
				userId: userObjectId,
				expiresAt: { $gt: now },
			}),
			Session.findOne({ userId: userObjectId })
				.sort({ createdAt: -1 })
				.select("createdAt")
				.lean(),
		]);

	// Handle cases where there are no files or directories, or no storage data.
	const { fileCount = 0, storageBytes = 0 } = storageAgg[0] ?? {};

	return {
		...user,
		status: getUserStatus(user),
		stats: {
			storageBytes,
			fileCount,
			directoryCount,
			activeSessionCount,
			lastLoginAt: lastSession?.createdAt ?? null,
		},
	};
};

export { listUsers, getUserById };

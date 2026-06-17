import mongoose from "mongoose";

import User from "../src/models/user.model.js";
import Session from "../src/models/session.model.js";
import File from "../src/models/file.model.js";
import Directory from "../src/models/directory.model.js";

import { ROLES } from "../src/constants/roles.js";

let counter = 0;
const nextId = () => ++counter;

/**
 * Creates a User with sensible defaults. Pass any field as an override.
 * Email-provider users get a password by default; OAuth users don't (the
 * schema marks password required only when provider === "email").
 */
export const createTestUser = async (overrides = {}) => {
	const id = nextId();
	const provider = overrides.provider ?? "email";

	const doc = {
		name: overrides.name ?? `Test User ${id}`,
		// Email mixes counter + timestamp + ObjectId hex so two simultaneous
		// creates never collide on the unique index. Date.now() can repeat
		// across two creates in the same millisecond; the ObjectId is
		// guaranteed monotonic + unique within the process.
		email:
			overrides.email ??
			`test-${id}-${Date.now()}-${new mongoose.Types.ObjectId().toString()}@example.com`,
		provider,
		isVerified: overrides.isVerified ?? true,
		role: overrides.role ?? ROLES.USER,
		suspendedAt: overrides.suspendedAt ?? null,
		suspendedBy: overrides.suspendedBy ?? null,
		deletedAt: overrides.deletedAt ?? null,
		profilePicture: overrides.profilePicture ?? null,
		rootDirId: overrides.rootDirId ?? new mongoose.Types.ObjectId(),
	};

	// Only set `password` for email-provider users — Mongoose treats an
	// explicit `password: undefined` as "modified", which fires the pre-save
	// hash hook on an undefined value and crashes bcrypt.
	if (provider === "email") {
		doc.password = overrides.password ?? "TestPass123";
	}

	// Only set when overridden so the schema default (1 GB) otherwise applies.
	if (overrides.storageLimit !== undefined) {
		doc.storageLimit = overrides.storageLimit;
	}

	return User.create(doc);
};

export const createTestSession = async (userId) =>
	Session.create({ userId, deviceInfo: {} });

export const createTestDirectory = async (userId, overrides = {}) => {
	const parentDirId = overrides.parentDirId ?? null;

	let ancestorIds = overrides.ancestorIds;
	if (ancestorIds === undefined) {
		if (parentDirId) {
			const parent = await Directory.findById(
				parentDirId,
				"ancestorIds",
			).lean();
			ancestorIds = parent ? [...parent.ancestorIds, parent._id] : [];
		} else {
			ancestorIds = [];
		}
	}

	return Directory.create({
		name: overrides.name ?? `dir-${nextId()}`,
		userId,
		parentDirId,
		ancestorIds,
		size: overrides.size ?? 0,
		fileCount: overrides.fileCount ?? 0,
	});
};

export const createTestFile = async (userId, parentDirId, overrides = {}) =>
	File.create({
		name: overrides.name ?? `file-${nextId()}.txt`,
		extension: overrides.extension ?? ".txt",
		size: overrides.size ?? 100,
		parentDirId,
		userId,
	});

//* scripts/seed-superadmin.js

/**
 * Promote a verified user to `superadmin` (one-shot bootstrap).
 *
 * Usage:
 *   npm run seed:superadmin -- --email=admin@example.com
 *
 * Idempotent. Also backfills missing lifecycle fields on legacy users.
 */

import mongoose from "mongoose";

import connectToMongoDB from "../src/database/mongoDB.js";
import User from "../src/models/user.model.js";
import { ROLES } from "../src/constants/roles.js";

const EMAIL_PREFIX = "--email=";
const emailArg = process.argv.find((arg) => arg.startsWith(EMAIL_PREFIX));
const email = emailArg?.slice(EMAIL_PREFIX.length).trim().toLowerCase();

if (!email) {
	console.error("Usage: npm run seed:superadmin -- --email=user@example.com");
	process.exit(1);
}

await connectToMongoDB();

try {
	// Backfill new lifecycle fields on legacy users.
	// $exists: false matches only docs missing the field, so re-runs are safe no-ops.
	await User.updateMany(
		{ role: { $exists: false } },
		{ $set: { role: ROLES.USER } },
	);
	await User.updateMany(
		{ suspendedAt: { $exists: false } },
		{ $set: { suspendedAt: null } },
	);
	await User.updateMany(
		{ deletedAt: { $exists: false } },
		{ $set: { deletedAt: null } },
	);

	// Promote only if the user exists AND is verified.
	// updateOne is a silent no-op when no doc matches or role is already superadmin.
	const result = await User.updateOne(
		{ email, isVerified: true },
		{ $set: { role: ROLES.SUPERADMIN } },
	);

	if (result.matchedCount === 0) {
		console.error(`❌ No verified user found with email ${email}`);
		process.exitCode = 1;
	} else {
		console.log(`✅ Promoted ${email} to superadmin`);
	}
} finally {
	await mongoose.disconnect();
}
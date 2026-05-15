import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * Boots a single-node in-memory MongoDB replica set for the entire test run.
 * A replica set (not a standalone) is required because production code uses
 * `session.withTransaction()` for multi-collection writes; transactions only
 * work against a replica set per `docs/architecture/transaction-patterns.md`.
 *
 * The URI is shared with worker processes via Vitest's `provide`/`inject` API.
 */
export default async ({ provide }) => {
	const replSet = await MongoMemoryReplSet.create({
		replSet: { count: 1, storageEngine: "wiredTiger" },
	});

	provide("mongoUri", replSet.getUri());

	return async () => {
		await replSet.stop();
	};
};

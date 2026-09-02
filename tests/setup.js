import mongoose from "mongoose";
import { beforeAll, beforeEach, inject } from "vitest";

// Skips building unique and TTL indexes, so neither is enforced in tests —
// E11000 mapping is covered directly, never by a real index violation.
mongoose.set("autoIndex", false);

// Test files run in parallel forks, each with its own VITEST_WORKER_ID, so each
// takes its own database on the shared replica set. The drop below is
// database-wide and would otherwise wipe a concurrent file's data mid-test.
beforeAll(async () => {
	if (mongoose.connection.readyState === 0) {
		const uri = inject("mongoUri");
		await mongoose.connect(uri, {
			dbName: `test_w${process.env.VITEST_WORKER_ID ?? process.pid}`,
		});
	}
});

// `drop()` rather than `deleteMany({})` so the collection is unambiguously gone
// rather than emptied.
beforeEach(async () => {
	for (const collection of Object.values(mongoose.connection.collections)) {
		try {
			await collection.drop();
		} catch (err) {
			// 26 = NamespaceNotFound (collection already missing) — harmless.
			if (err.code !== 26) throw err;
		}
	}
});

// No afterAll disconnect — globalSetup teardown stops the in-memory replica set
// when the suite finishes; mongoose unwinds naturally with the process exit.

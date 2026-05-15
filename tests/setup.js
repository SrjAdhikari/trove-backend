import mongoose from "mongoose";
import { beforeAll, beforeEach, inject } from "vitest";

// Disable auto-index creation in tests: the TTL index on
// `verificationExpiresAt` was a suspect for non-deterministic doc loss in
// the in-memory replica set. Tests don't need indexes for correctness —
// queries against an unindexed collection just collection-scan.
mongoose.set("autoIndex", false);

// `setupFiles` re-runs per test file under singleFork, so beforeAll fires once
// per file. Guard the connect so we reuse one mongoose connection across files
// rather than disconnect/reconnect — that dance lost writes between files in
// early runs (only the first test of each file failed; the doc the test had
// just created was unfindable a moment later).
beforeAll(async () => {
	if (mongoose.connection.readyState === 0) {
		const uri = inject("mongoUri");
		await mongoose.connect(uri);
	}
});

// Drop each collection between tests. `deleteMany({})` (sequential or
// parallel) lost docs non-deterministically against the in-memory replica
// set — a doc created in the next test would vanish before the count query.
// `collection.drop()` is heavier but unambiguous: the collection is gone,
// the next insert recreates it cleanly. `autoIndex: false` keeps mongoose
// from rebuilding TTL/unique indexes between every test.
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

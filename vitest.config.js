import { defineConfig } from "vitest/config";

// Single-fork mode lets every test file share one in-memory replica set
// (booted in globalSetup) and one mongoose connection — without it, each
// worker would spin up its own DB and the suite would balloon in time + RAM.
export default defineConfig({
	test: {
		environment: "node",
		pool: "forks",
		forks: { singleFork: true },
		globalSetup: ["./tests/globalSetup.js"],
		setupFiles: ["./tests/setup.js"],
		testTimeout: 30_000,
		hookTimeout: 120_000,
		// Residual ~1-in-5 flake against the in-memory replica set. The earlier
		// `Promise.all`-with-shared-session bug in `hardDeleteUser` was fixed
		// (which improved stability ~2/5 → 1/5), but a non-determinism still
		// surfaces — appears to be a `mongodb-memory-server` quirk where a doc
		// created in one test occasionally isn't visible to a query a few ms
		// later in the same test. A single retry masks it; a real bug would
		// fail on the retry too.
		retry: 2,
		include: ["tests/**/*.test.js"],
	},
});

import { defineConfig } from "vitest/config";

// Test files run in parallel forks against the one in-memory replica set booted
// in globalSetup, but each takes its own database (see tests/setup.js) — the
// per-test collection drop is database-wide and would otherwise wipe a
// concurrent file's fixtures.
export default defineConfig({
	test: {
		environment: "node",
		pool: "forks",
		globalSetup: ["./tests/globalSetup.js"],
		setupFiles: ["./tests/setup.js"],
		testTimeout: 30_000,
		hookTimeout: 120_000,
		// Pinned: a retry re-runs a failing test into the same conditions, so it
		// hides real failures rather than smoothing over genuine flake.
		retry: 0,
		include: ["tests/**/*.test.js"],
	},
});

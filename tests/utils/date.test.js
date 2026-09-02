import { describe, it, expect } from "vitest";

import {
	FIVE_MINUTES_SECONDS,
	ONE_HOUR_SECONDS,
	FIFTEEN_MINUTES_MS,
	ONE_HOUR_MS,
} from "../../src/utils/date.js";

describe("duration constants", () => {
	it("expresses the presign TTLs in seconds", () => {
		expect(FIVE_MINUTES_SECONDS).toBe(300);
		expect(ONE_HOUR_SECONDS).toBe(3600);
	});

	it("keeps the reservation window longer than the presign TTL", () => {
		// Invariant 1: the document tracking a minted upload must outlive the URL
		// that can still write to it.
		expect(FIFTEEN_MINUTES_MS).toBeGreaterThan(FIVE_MINUTES_SECONDS * 1000);
		expect(ONE_HOUR_MS).toBeGreaterThan(FIFTEEN_MINUTES_MS);
	});
});

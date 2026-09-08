import { describe, it, expect } from "vitest";

import { importDriveSchema } from "../../src/validators/drive.validator.js";

const valid = {
	accessToken: "ya29.a0AeXRPp-token",
	items: [{ id: "1AbcDriveId", mimeType: "application/pdf" }],
};

describe("importDriveSchema", () => {
	it("accepts a valid import payload", () => {
		expect(importDriveSchema.safeParse(valid).success).toBe(true);
	});

	it("trims the access token", () => {
		const result = importDriveSchema.safeParse({
			...valid,
			accessToken: "  ya29.token  ",
		});
		expect(result.data.accessToken).toBe("ya29.token");
	});

	it("rejects a missing access token", () => {
		const { accessToken, ...rest } = valid;
		expect(importDriveSchema.safeParse(rest).success).toBe(false);
	});

	it("rejects a non-string access token (operator-injection shape)", () => {
		expect(
			importDriveSchema.safeParse({ ...valid, accessToken: { $ne: "" } })
				.success,
		).toBe(false);
	});

	it("rejects a whitespace-only access token", () => {
		expect(
			importDriveSchema.safeParse({ ...valid, accessToken: "   " }).success,
		).toBe(false);
	});

	it("rejects an access token longer than 4096 characters", () => {
		expect(
			importDriveSchema.safeParse({ ...valid, accessToken: "a".repeat(4097) })
				.success,
		).toBe(false);
	});

	it("rejects an empty items array", () => {
		expect(importDriveSchema.safeParse({ ...valid, items: [] }).success).toBe(
			false,
		);
	});

	it("rejects more than 50 items", () => {
		const items = Array.from({ length: 51 }, (_, i) => ({
			id: `id-${i}`,
			mimeType: "application/pdf",
		}));
		expect(importDriveSchema.safeParse({ ...valid, items }).success).toBe(false);
	});

	it("rejects an item missing its mimeType", () => {
		expect(
			importDriveSchema.safeParse({ ...valid, items: [{ id: "x" }] }).success,
		).toBe(false);
	});

	it("rejects an item with a non-string id", () => {
		expect(
			importDriveSchema.safeParse({
				...valid,
				items: [{ id: { $ne: "" }, mimeType: "application/pdf" }],
			}).success,
		).toBe(false);
	});

	it("strips unknown keys from items, keeping only id and mimeType", () => {
		const result = importDriveSchema.safeParse({
			...valid,
			items: [
				{ id: "x", mimeType: "application/pdf", name: "evil", size: 99 },
			],
		});
		expect(result.success).toBe(true);
		expect(result.data.items[0]).toEqual({ id: "x", mimeType: "application/pdf" });
	});

	it("allows omitting parentDirId", () => {
		expect(importDriveSchema.safeParse(valid).success).toBe(true);
	});

	it("rejects a parentDirId that is not a valid ObjectId", () => {
		// Reaches Directory.findOne directly, so the shape is checked at the
		// boundary rather than left to surface as a Mongoose CastError.
		for (const parentDirId of [
			"65abc",
			"not-an-objectid",
			"68b0f2c1a4d3e5f60718293",
			"68b0f2c1a4d3e5f60718293az",
			"ZZZZZZZZZZZZZZZZZZZZZZZZ",
			"",
			"   ",
		]) {
			expect(
				importDriveSchema.safeParse({ ...valid, parentDirId }).success,
			).toBe(false);
		}
	});

	it("accepts a well-formed parentDirId", () => {
		const result = importDriveSchema.safeParse({
			...valid,
			parentDirId: "  68b0f2c1a4d3e5f60718293a  ",
		});

		expect(result.success).toBe(true);
		expect(result.data.parentDirId).toBe("68b0f2c1a4d3e5f60718293a");
	});

	it("rejects a non-string parentDirId", () => {
		expect(
			importDriveSchema.safeParse({ ...valid, parentDirId: 123 }).success,
		).toBe(false);
	});
});

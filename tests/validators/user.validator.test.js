import { describe, it, expect } from "vitest";

import { updateProfileSchema } from "../../src/validators/user.validator.js";

describe("updateProfileSchema", () => {
	const valid = { name: "Jane Doe" };

	it("accepts a valid name", () => {
		expect(updateProfileSchema.safeParse(valid).success).toBe(true);
	});

	it("trims surrounding whitespace from name", () => {
		const result = updateProfileSchema.safeParse({ name: "  Jane Doe  " });
		expect(result.data.name).toBe("Jane Doe");
	});

	it("rejects a name shorter than 3 characters", () => {
		expect(updateProfileSchema.safeParse({ name: "Jo" }).success).toBe(false);
	});

	it("rejects a name longer than 50 characters", () => {
		expect(
			updateProfileSchema.safeParse({ name: "a".repeat(51) }).success,
		).toBe(false);
	});

	it("rejects an empty name", () => {
		expect(updateProfileSchema.safeParse({ name: "" }).success).toBe(false);
	});

	it("rejects a whitespace-only name", () => {
		expect(updateProfileSchema.safeParse({ name: "   " }).success).toBe(false);
	});

	it("rejects a missing name", () => {
		expect(updateProfileSchema.safeParse({}).success).toBe(false);
	});

	it("rejects a non-string name (object injection)", () => {
		expect(updateProfileSchema.safeParse({ name: { $ne: "" } }).success).toBe(
			false,
		);
	});

	it("strips unknown keys (no mass-assignment)", () => {
		const result = updateProfileSchema.safeParse({
			name: "Jane Doe",
			role: "superadmin",
		});
		expect(result.data).toEqual({ name: "Jane Doe" });
	});

	it("strips embedded HTML from name, keeping the visible text", () => {
		const result = updateProfileSchema.safeParse({
			name: "Alice<script>alert(1)</script>",
		});
		expect(result.success).toBe(true);
		expect(result.data.name).toBe("Alice");
	});

	it("rejects a name that is entirely HTML (sanitizes to empty)", () => {
		expect(
			updateProfileSchema.safeParse({ name: "<script>alert(1)</script>" })
				.success,
		).toBe(false);
	});
});

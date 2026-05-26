import { describe, it, expect } from "vitest";

import { createTestUser } from "../factories.js";

describe("user.model — name length bounds", () => {
	it("accepts a name shorter than 3 characters (e.g. an OAuth display name)", async () => {
		const user = await createTestUser({ name: "Jo" });
		expect(user.name).toBe("Jo");
	});

	it("accepts a name up to 100 characters", async () => {
		const name = "a".repeat(100);
		const user = await createTestUser({ name });
		expect(user.name).toBe(name);
	});

	it("rejects a name longer than 100 characters", async () => {
		await expect(createTestUser({ name: "a".repeat(101) })).rejects.toThrow();
	});
});

import { describe, it, expect } from "vitest";

import { loginUser } from "../../src/services/auth.service.js";

import { createTestUser } from "../factories.js";

const DEVICE = { userAgent: "vitest", ipAddress: "127.0.0.1" };
const PASSWORD = "TestPass123";

describe("auth.service.loginUser — issue #29 lifecycle gate", () => {
	it("logs in an active verified user", async () => {
		const user = await createTestUser({
			email: "active@example.com",
			password: PASSWORD,
		});

		const session = await loginUser("active@example.com", PASSWORD, DEVICE);

		expect(session.userId.toString()).toBe(user._id.toString());
	});

	it("rejects a soft-deleted user before checking the password", async () => {
		await createTestUser({
			email: "deleted@example.com",
			password: PASSWORD,
			deletedAt: new Date(),
		});

		await expect(
			loginUser("deleted@example.com", PASSWORD, DEVICE),
		).rejects.toMatchObject({ statusCode: 401, code: "UNAUTHORIZED_ACCESS" });
	});

	it("rejects a suspended user before checking the password", async () => {
		await createTestUser({
			email: "suspended@example.com",
			password: PASSWORD,
			suspendedAt: new Date(),
		});

		await expect(
			loginUser("suspended@example.com", PASSWORD, DEVICE),
		).rejects.toMatchObject({ statusCode: 403, code: "ACCOUNT_SUSPENDED" });
	});

	it("checks deletedAt before suspendedAt when both are set", async () => {
		await createTestUser({
			email: "both@example.com",
			password: PASSWORD,
			deletedAt: new Date(),
			suspendedAt: new Date(),
		});

		await expect(
			loginUser("both@example.com", PASSWORD, DEVICE),
		).rejects.toMatchObject({ code: "UNAUTHORIZED_ACCESS" });
	});

	it("returns the lockout error even when the password is wrong (no credential confirmation leak)", async () => {
		await createTestUser({
			email: "wrongpw@example.com",
			password: PASSWORD,
			suspendedAt: new Date(),
		});

		await expect(
			loginUser("wrongpw@example.com", "WrongPassword999", DEVICE),
		).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
	});
});

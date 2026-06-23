import { describe, it, expect } from "vitest";

import { loginUser, changePassword } from "../../src/services/auth.service.js";
import User from "../../src/models/user.model.js";
import Session from "../../src/models/session.model.js";

import { createTestUser, createTestSession } from "../factories.js";

const DEVICE = { userAgent: "vitest", ipAddress: "127.0.0.1" };
const PASSWORD = "TestPass123";

const CURRENT = "CurrentPass123";
const NEW = "BrandNewPass456";

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

describe("auth.service.changePassword", () => {
	it("changes the password and revokes other sessions, keeping the current one", async () => {
		const user = await createTestUser({ password: CURRENT });
		const current = await createTestSession(user._id);
		const other = await createTestSession(user._id);

		await changePassword(user._id, CURRENT, NEW, current._id);

		const reloaded = await User.findById(user._id).select("+password");
		expect(await reloaded.comparePassword(NEW)).toBe(true);
		expect(await reloaded.comparePassword(CURRENT)).toBe(false);

		expect(await Session.findById(current._id)).not.toBeNull();
		expect(await Session.findById(other._id)).toBeNull();
	});

	it("rejects an incorrect current password with INVALID_CREDENTIALS", async () => {
		const user = await createTestUser({ password: CURRENT });
		const current = await createTestSession(user._id);

		await expect(
			changePassword(user._id, "WrongPass999", NEW, current._id),
		).rejects.toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS" });
	});

	it("rejects OAuth-only accounts with PROVIDER_MISMATCH", async () => {
		const user = await createTestUser({ provider: "google" });
		const current = await createTestSession(user._id);

		await expect(
			changePassword(user._id, CURRENT, NEW, current._id),
		).rejects.toMatchObject({ statusCode: 400, code: "PROVIDER_MISMATCH" });
	});

	it("rejects reusing the current password with PASSWORD_REUSE", async () => {
		const user = await createTestUser({ password: CURRENT });
		const current = await createTestSession(user._id);

		await expect(
			changePassword(user._id, CURRENT, CURRENT, current._id),
		).rejects.toMatchObject({ statusCode: 400, code: "PASSWORD_REUSE" });
	});
});

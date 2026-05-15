import { describe, it, expect } from "vitest";

import { loginOrCreateOAuthUser } from "../../src/services/oauth.service.js";

import { createTestUser } from "../factories.js";

const DEVICE = { userAgent: "vitest", ipAddress: "127.0.0.1" };

describe("oauth.service.loginOrCreateOAuthUser — issue #29 lifecycle gate", () => {
	it("rejects a soft-deleted existing OAuth user", async () => {
		await createTestUser({
			email: "googly-deleted@example.com",
			provider: "google",
			deletedAt: new Date(),
		});

		await expect(
			loginOrCreateOAuthUser(
				"google",
				{
					name: "Googly",
					email: "googly-deleted@example.com",
					picture: null,
				},
				DEVICE,
			),
		).rejects.toMatchObject({ statusCode: 401, code: "UNAUTHORIZED_ACCESS" });
	});

	it("rejects a suspended existing OAuth user", async () => {
		await createTestUser({
			email: "githubby-suspended@example.com",
			provider: "github",
			suspendedAt: new Date(),
		});

		await expect(
			loginOrCreateOAuthUser(
				"github",
				{
					name: "Githubby",
					email: "githubby-suspended@example.com",
					picture: null,
				},
				DEVICE,
			),
		).rejects.toMatchObject({ statusCode: 403, code: "ACCOUNT_SUSPENDED" });
	});

	it("creates a brand-new OAuth user without triggering lifecycle guards", async () => {
		const result = await loginOrCreateOAuthUser(
			"google",
			{
				name: "Brand New",
				email: "brand-new@example.com",
				picture: null,
			},
			DEVICE,
		);

		expect(result.isNewUser).toBe(true);
		expect(result.session).toBeDefined();
	});
});

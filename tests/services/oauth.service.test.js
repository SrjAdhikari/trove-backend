import { describe, it, expect } from "vitest";

import { loginOrCreateOAuthUser } from "../../src/services/oauth.service.js";

import User from "../../src/models/user.model.js";

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

describe("oauth.service.loginOrCreateOAuthUser — issue #38 name truncation", () => {
	it("truncates an over-long display name to 100 chars when creating a user", async () => {
		const email = "long-name-new@example.com";

		const result = await loginOrCreateOAuthUser(
			"google",
			{ name: "x".repeat(150), email, picture: null },
			DEVICE,
		);

		expect(result.isNewUser).toBe(true);

		const user = await User.findOne({ email }).lean();
		expect(user.name).toHaveLength(100);
	});

});

describe("oauth.service.loginOrCreateOAuthUser — login does not clobber app-managed profile", () => {
	it("leaves an existing user's name and profilePicture untouched on login", async () => {
		const email = "stable-profile@example.com";
		await createTestUser({
			email,
			provider: "google",
			name: "App Edited Name",
			profilePicture: "https://api.local/api/users/profile-picture/" + "a".repeat(32),
		});

		const result = await loginOrCreateOAuthUser(
			"google",
			{ name: "Provider Name", email, picture: "https://provider/new.jpg" },
			DEVICE,
		);

		expect(result.isNewUser).toBe(false);

		const user = await User.findOne({ email }).lean();
		expect(user.name).toBe("App Edited Name");
		expect(user.profilePicture).toBe(
			"https://api.local/api/users/profile-picture/" + "a".repeat(32),
		);
	});
});

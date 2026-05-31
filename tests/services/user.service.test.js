import { describe, it, expect } from "vitest";
import mongoose from "mongoose";

import { updateProfile } from "../../src/services/user.service.js";
import User from "../../src/models/user.model.js";

import { createTestUser } from "../factories.js";

describe("user.service.updateProfile", () => {
	it("updates the user's name and persists it", async () => {
		const user = await createTestUser({ name: "Old Name" });

		const result = await updateProfile(user._id, "New Name");

		expect(result.name).toBe("New Name");

		const persisted = await User.findById(user._id).lean();
		expect(persisted.name).toBe("New Name");
	});

	it("returns the user without password, otp, or otpExpiresAt", async () => {
		const user = await createTestUser();

		const result = await updateProfile(user._id, "Visible Name");

		expect(result.password).toBeUndefined();
		expect(result.otp).toBeUndefined();
		expect(result.otpExpiresAt).toBeUndefined();
	});

	it("returns the me-shape fields (id, email, provider, role, timestamps)", async () => {
		const user = await createTestUser();

		const result = await updateProfile(user._id, "Shape Check");

		expect(result._id.toString()).toBe(user._id.toString());
		expect(result.email).toBe(user.email);
		expect(result.provider).toBe("email");
		expect(result.role).toBe("user");
		expect(result.createdAt).toBeDefined();
		expect(result.updatedAt).toBeDefined();
	});

	it("allows an OAuth user to update their name (provider-agnostic)", async () => {
		const user = await createTestUser({ provider: "google" });

		const result = await updateProfile(user._id, "Google Person");

		expect(result.name).toBe("Google Person");
	});

	it("throws USER_NOT_FOUND when the user does not exist", async () => {
		const ghostId = new mongoose.Types.ObjectId();

		await expect(updateProfile(ghostId, "Nobody")).rejects.toMatchObject({
			statusCode: 404,
			code: "USER_NOT_FOUND",
		});
	});
});

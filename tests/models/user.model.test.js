import { describe, it, expect } from "vitest";

import { createTestUser } from "../factories.js";
import User from "../../src/models/user.model.js";

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

describe("user.model — profilePictureKey", () => {
	const KEY = (id) => `profile-pictures/${id}/${"a".repeat(32)}`;

	it("defaults to null", async () => {
		const user = await createTestUser();
		expect(user.profilePictureKey).toBeNull();
	});

	it("stores an R2 object key", async () => {
		const user = await createTestUser();
		user.profilePictureKey = KEY(user._id);
		await user.save();

		const reloaded = await User.findById(user._id).lean();
		expect(reloaded.profilePictureKey).toBe(KEY(user._id));
	});

	it("rejects a key outside the profile-pictures prefix", async () => {
		const user = await createTestUser();
		user.profilePictureKey = `files/${"a".repeat(24)}-${"b".repeat(32)}.pdf`;
		await expect(user.save()).rejects.toThrow();
	});

	it("rejects a traversal segment in place of the owner id", async () => {
		const user = await createTestUser();
		user.profilePictureKey = `profile-pictures/../../${"a".repeat(32)}`;
		await expect(user.save()).rejects.toThrow();
	});

	it("still accepts an external OAuth profile picture URL in profilePicture", async () => {
		const user = await createTestUser();
		user.profilePicture = "https://lh3.googleusercontent.com/a/abc123";
		await user.save();

		const reloaded = await User.findById(user._id).lean();
		expect(reloaded.profilePicture).toBe(
			"https://lh3.googleusercontent.com/a/abc123",
		);
		expect(reloaded.profilePictureKey).toBeNull();
	});
});

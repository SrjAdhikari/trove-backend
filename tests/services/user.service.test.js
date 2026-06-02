import { afterEach, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { Readable } from "node:stream";
import { rm, writeFile, mkdir, stat } from "node:fs/promises";

import {
	updateProfile,
	uploadProfilePicture,
	getProfilePicture,
} from "../../src/services/user.service.js";
import User from "../../src/models/user.model.js";
import {
	PROFILE_PICTURES_ROOT,
	buildProfilePicturePath,
	buildProfilePictureUrl,
	parseProfilePictureToken,
} from "../../src/utils/storagePath.js";

import { createTestUser } from "../factories.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const fileExists = async (p) => stat(p).then(() => true).catch(() => false);

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

describe("user.service.uploadProfilePicture", () => {
	const created = [];
	afterEach(async () => {
		await Promise.allSettled(created.map((p) => rm(p, { force: true })));
		created.length = 0;
	});

	it("writes the file and sets an absolute profile-picture URL", async () => {
		const user = await createTestUser();

		const result = await uploadProfilePicture(user._id, Readable.from(PNG));
		const token = parseProfilePictureToken(result.profilePicture);
		created.push(buildProfilePicturePath(token));

		expect(result.profilePicture).toMatch(/\/api\/users\/profile-picture\/[a-f0-9]{32}$/);
		expect(result.password).toBeUndefined();
		expect(await fileExists(buildProfilePicturePath(token))).toBe(true);

		const persisted = await User.findById(user._id).lean();
		expect(persisted.profilePicture).toBe(result.profilePicture);
	});

	it("rejects an unsupported type and leaves profilePicture unchanged", async () => {
		const user = await createTestUser({ profilePicture: null });

		await expect(
			uploadProfilePicture(user._id, Readable.from(SVG)),
		).rejects.toMatchObject({ statusCode: 400, code: "INVALID_IMAGE_TYPE" });

		const persisted = await User.findById(user._id).lean();
		expect(persisted.profilePicture).toBeNull();
	});

	it("rejects a file larger than the 2 MB cap", async () => {
		const user = await createTestUser();
		const tooBig = Buffer.concat([PNG, Buffer.alloc(2 * 1000 * 1000)]);

		await expect(
			uploadProfilePicture(user._id, Readable.from(tooBig)),
		).rejects.toMatchObject({ statusCode: 400, code: "IMAGE_TOO_LARGE" });
	});

	it("deletes the previous file when replacing one of our pictures", async () => {
		const oldToken = "b".repeat(32);
		const oldPath = buildProfilePicturePath(oldToken);
		await mkdir(PROFILE_PICTURES_ROOT, { recursive: true });
		await writeFile(oldPath, PNG);
		created.push(oldPath);

		const user = await createTestUser({
			profilePicture: buildProfilePictureUrl(oldToken),
		});

		const result = await uploadProfilePicture(user._id, Readable.from(PNG));
		const newPath = buildProfilePicturePath(parseProfilePictureToken(result.profilePicture));
		created.push(newPath);

		expect(await fileExists(oldPath)).toBe(false);
		expect(await fileExists(newPath)).toBe(true);
	});

	it("leaves disk untouched when the previous picture is a remote URL", async () => {
		const user = await createTestUser({
			profilePicture: "https://lh3.googleusercontent.com/abc",
		});

		const result = await uploadProfilePicture(user._id, Readable.from(PNG));
		created.push(buildProfilePicturePath(parseProfilePictureToken(result.profilePicture)));

		expect(result.profilePicture).toMatch(/\/api\/users\/profile-picture\/[a-f0-9]{32}$/);
	});
});

describe("user.service.getProfilePicture", () => {
	const created = [];
	afterEach(async () => {
		await Promise.allSettled(created.map((p) => rm(p, { force: true })));
		created.length = 0;
	});

	it("returns the path and sniffed mime for an existing token", async () => {
		const token = "c".repeat(32);
		const filePath = buildProfilePicturePath(token);
		await mkdir(PROFILE_PICTURES_ROOT, { recursive: true });
		await writeFile(filePath, PNG);
		created.push(filePath);

		const result = await getProfilePicture(token);
		expect(result.filePath).toBe(filePath);
		expect(result.mime).toBe("image/png");
	});

	it("throws PROFILE_PICTURE_NOT_FOUND for a missing file", async () => {
		await expect(getProfilePicture("d".repeat(32))).rejects.toMatchObject({
			statusCode: 404,
			code: "PROFILE_PICTURE_NOT_FOUND",
		});
	});

	it("throws PROFILE_PICTURE_NOT_FOUND for a malformed token (no traversal)", async () => {
		await expect(getProfilePicture("../../etc/passwd")).rejects.toMatchObject({
			statusCode: 404,
			code: "PROFILE_PICTURE_NOT_FOUND",
		});
	});
});

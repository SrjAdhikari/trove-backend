import { describe, it, expect } from "vitest";

import {
	buildFilePath,
	buildProfilePicturePath,
	buildProfilePictureUrl,
	parseProfilePictureToken,
	PROFILE_PICTURE_TOKEN_PATTERN,
	STORAGE_ROOT,
} from "../../src/utils/storagePath.js";
import AppError from "../../src/errors/AppError.js";

const TOKEN = "a".repeat(32); // 32 hex chars
const OBJECT_ID = "507f1f77bcf86cd799439011"; // 24 hex chars

describe("storagePath profile-picture helpers", () => {
	it("builds an absolute on-disk path that ends with the token", () => {
		const p = buildProfilePicturePath(TOKEN);
		expect(p.endsWith(TOKEN)).toBe(true);
		expect(p).toContain("profile-pictures");
	});

	it("builds a serving URL ending in the canonical path + token", () => {
		expect(buildProfilePictureUrl(TOKEN)).toMatch(
			new RegExp(`/api/users/profile-picture/${TOKEN}$`),
		);
	});

	it("parses the token out of one of our URLs", () => {
		const url = buildProfilePictureUrl(TOKEN);
		expect(parseProfilePictureToken(url)).toBe(TOKEN);
	});

	it("returns null for a remote/non-matching URL or non-string", () => {
		expect(parseProfilePictureToken("https://lh3.googleusercontent.com/x")).toBeNull();
		expect(parseProfilePictureToken(null)).toBeNull();
	});

	it("token pattern matches 32 hex chars only", () => {
		expect(PROFILE_PICTURE_TOKEN_PATTERN.test(TOKEN)).toBe(true);
		expect(PROFILE_PICTURE_TOKEN_PATTERN.test("xyz")).toBe(false);
		expect(PROFILE_PICTURE_TOKEN_PATTERN.test("A".repeat(32))).toBe(false); // uppercase not allowed
	});
});

describe("storagePath buildFilePath", () => {
	it("builds an absolute path under STORAGE_ROOT for a normal file", () => {
		const p = buildFilePath({ _id: OBJECT_ID, extension: ".txt" });
		expect(p.startsWith(STORAGE_ROOT)).toBe(true);
		expect(p.endsWith(`${OBJECT_ID}.txt`)).toBe(true);
	});

	it("returns a path under STORAGE_ROOT for a file with no extension (does not throw)", () => {
		const p = buildFilePath({ _id: OBJECT_ID, extension: "" });
		expect(p.startsWith(STORAGE_ROOT)).toBe(true);
		expect(p.endsWith(OBJECT_ID)).toBe(true);
	});

	it("throws when the extension would escape STORAGE_ROOT (path traversal)", () => {
		const file = { _id: OBJECT_ID, extension: "/../../../../etc/passwd" };

		expect(() => buildFilePath(file)).toThrow(AppError);
		try {
			buildFilePath(file);
		} catch (err) {
			expect(err.statusCode).toBe(400);
			expect(err.code).toBe("INVALID_INPUT");
		}
	});

	it("throws on a sibling-prefix path that shares the root's name (e.g. storage-evil)", () => {
		const file = { _id: OBJECT_ID, extension: "/../../storage-evil/passwd" };

		expect(() => buildFilePath(file)).toThrow(AppError);
	});
});

import { describe, it, expect } from "vitest";

import {
	buildProfilePicturePath,
	buildProfilePictureUrl,
	parseProfilePictureToken,
	PROFILE_PICTURE_TOKEN_PATTERN,
} from "../../src/utils/storagePath.js";

const TOKEN = "a".repeat(32); // 32 hex chars

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

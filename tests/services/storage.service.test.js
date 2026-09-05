import { describe, it, expect } from "vitest";

import { getStorageUsage } from "../../src/services/storage.service.js";

import {
	createTestUser,
	createTestDirectory,
	createTestFile,
} from "../factories.js";

describe("getStorageUsage", () => {
	it("returns zero usage and the default quota for a user with no files", async () => {
		const user = await createTestUser();

		const usage = await getStorageUsage(user._id, user.storageLimit);

		expect(usage).toEqual({
			used: 0,
			total: user.storageLimit,
			breakdown: [],
		});
	});

	it("reports `used` from the root directory size with a category breakdown sorted desc", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id, {
			size: 1600,
			fileCount: 4,
		});
		await createTestFile(user._id, root._id, { extension: ".pdf", size: 1000 });
		await createTestFile(user._id, root._id, { extension: ".jpg", size: 400 });
		await createTestFile(user._id, root._id, { extension: ".png", size: 100 });
		await createTestFile(user._id, root._id, { extension: ".bin", size: 100 });

		const usage = await getStorageUsage(user._id, user.storageLimit);

		expect(usage.used).toBe(1600);
		expect(usage.total).toBe(user.storageLimit);
		expect(usage.breakdown).toEqual([
			{ category: "Documents", size: 1000, icon: "file-text" },
			{ category: "Images", size: 500, icon: "image" },
			{ category: "Other", size: 100, icon: "file" },
		]);
	});

	it("leaves pending uploads out of the breakdown", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id, {
			size: 1500,
			fileCount: 2,
		});
		await createTestFile(user._id, root._id, {
			extension: ".pdf",
			size: 1000,
		});

		// Its bytes are already inside root.size because the quota is reserved up
		// front, but it is not a file the user has, so it must not appear as one.
		await createTestFile(user._id, root._id, {
			extension: ".jpg",
			size: 500,
			status: "pending",
		});

		const usage = await getStorageUsage(user._id, user.storageLimit);

		expect(usage.used).toBe(1500);
		expect(usage.breakdown).toEqual([
			{ category: "Documents", size: 1000, icon: "file-text" },
		]);
	});

	it("counts only the requesting user's files and root (cross-user isolation)", async () => {
		const me = await createTestUser();
		const other = await createTestUser();
		const myRoot = await createTestDirectory(me._id, {
			size: 300,
			fileCount: 1,
		});
		const otherRoot = await createTestDirectory(other._id, {
			size: 9999,
			fileCount: 1,
		});
		await createTestFile(me._id, myRoot._id, { extension: ".pdf", size: 300 });
		await createTestFile(other._id, otherRoot._id, {
			extension: ".pdf",
			size: 9999,
		});

		const usage = await getStorageUsage(me._id, me.storageLimit);

		expect(usage.used).toBe(300);
		expect(usage.breakdown).toEqual([
			{ category: "Documents", size: 300, icon: "file-text" },
		]);
	});

	it("surfaces a category for a 0-byte file (size 0, boundary)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id, { size: 0, fileCount: 1 });
		await createTestFile(user._id, root._id, { extension: ".txt", size: 0 });

		const usage = await getStorageUsage(user._id, user.storageLimit);

		expect(usage.breakdown).toEqual([
			{ category: "Documents", size: 0, icon: "file-text" },
		]);
	});

	it("reports a custom per-user quota", async () => {
		const user = await createTestUser({ storageLimit: 5000 });

		const usage = await getStorageUsage(user._id, user.storageLimit);

		expect(usage.total).toBe(5000);
	});
});

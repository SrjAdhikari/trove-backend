import { afterEach, describe, it, expect } from "vitest";
import { rm, writeFile, mkdir, stat } from "node:fs/promises";

import { getFile, deleteFile } from "../../src/services/file.service.js";
import File from "../../src/models/file.model.js";
import { STORAGE_ROOT, buildFilePath } from "../../src/utils/storagePath.js";

import {
	createTestUser,
	createTestDirectory,
	createTestFile,
} from "../factories.js";

const fileExists = (p) =>
	stat(p)
		.then(() => true)
		.catch(() => false);

// Track on-disk files we create so a failed assertion can't leak test bytes
// into the real storage/ directory between runs.
const createdPaths = new Set();

const putOnDisk = async (file) => {
	await mkdir(STORAGE_ROOT, { recursive: true });
	const diskPath = buildFilePath(file);
	await writeFile(diskPath, "owner bytes");
	createdPaths.add(diskPath);
	return diskPath;
};

afterEach(async () => {
	await Promise.allSettled([...createdPaths].map((p) => rm(p, { force: true })));
	createdPaths.clear();
});

describe("file.service ownership isolation", () => {
	it("deleteFile by a non-owner throws FILE_NOT_FOUND and leaves the owner's file intact", async () => {
		const owner = await createTestUser();
		const attacker = await createTestUser();
		const dir = await createTestDirectory(owner._id);
		const file = await createTestFile(owner._id, dir._id);
		const diskPath = await putOnDisk(file);

		await expect(deleteFile(file._id, attacker._id)).rejects.toMatchObject({
			code: "FILE_NOT_FOUND",
			statusCode: 404,
		});

		// The cross-user attempt must touch neither the DB row nor the disk bytes.
		expect(await File.exists({ _id: file._id })).not.toBeNull();
		expect(await fileExists(diskPath)).toBe(true);
	});

	it("getFile by a non-owner throws FILE_NOT_FOUND", async () => {
		const owner = await createTestUser();
		const attacker = await createTestUser();
		const dir = await createTestDirectory(owner._id);
		const file = await createTestFile(owner._id, dir._id);

		await expect(getFile(file._id, attacker._id)).rejects.toMatchObject({
			code: "FILE_NOT_FOUND",
			statusCode: 404,
		});
	});

	// Positive control: proves the isolation tests above fail for the right
	// reason (ownership), not because delete is silently a no-op.
	it("deleteFile by the owner removes both the DB row and the on-disk file", async () => {
		const owner = await createTestUser();
		const dir = await createTestDirectory(owner._id);
		const file = await createTestFile(owner._id, dir._id);
		const diskPath = await putOnDisk(file);

		await deleteFile(file._id, owner._id);

		expect(await File.exists({ _id: file._id })).toBeNull();
		expect(await fileExists(diskPath)).toBe(false);
	});
});

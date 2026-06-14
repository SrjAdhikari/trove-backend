import { afterEach, describe, it, expect } from "vitest";
import { rm, writeFile, mkdir, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import mongoose from "mongoose";

import { getFile, deleteFile, uploadFile } from "../../src/services/file.service.js";
import File from "../../src/models/file.model.js";
import Directory from "../../src/models/directory.model.js";
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

const dirStats = async (id) => {
	const d = await Directory.findById(id);
	return { size: d.size, fileCount: d.fileCount };
};

const upload = async (parentId, userId, name, body, storageLimit) => {
	const file = await uploadFile(
		parentId,
		userId,
		name,
		Readable.from(Buffer.from(body)),
		storageLimit,
	);
	createdPaths.add(buildFilePath(file));
	return file;
};

describe("uploadFile maintains folder sizes", () => {
	it("increments the target folder and all ancestors by the streamed bytes", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const sub = await createTestDirectory(user._id, { parentDirId: root._id });

		const file = await upload(sub._id, user._id, "note.txt", "hello world"); // 11 bytes

		expect(file.size).toBe(11);
		expect(await dirStats(sub._id)).toEqual({ size: 11, fileCount: 1 });
		expect(await dirStats(root._id)).toEqual({ size: 11, fileCount: 1 });
	});

	it("counts an empty file (0 bytes) toward fileCount but not size (boundary)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);

		const file = await upload(root._id, user._id, "empty.txt", "");

		expect(file.size).toBe(0);
		expect(await dirStats(root._id)).toEqual({ size: 0, fileCount: 1 });
	});

	it("accumulates across multiple uploads into the same folder", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);

		await upload(root._id, user._id, "a.txt", "aaa"); // 3
		await upload(root._id, user._id, "b.txt", "bbbb"); // 4

		expect(await dirStats(root._id)).toEqual({ size: 7, fileCount: 2 });
	});

	it("updates every ancestor in a deep tree (worst case depth)", async () => {
		const user = await createTestUser();
		let parentDirId = null;
		const dirs = [];
		for (let i = 0; i < 4; i++) {
			const d = await createTestDirectory(user._id, { parentDirId });
			dirs.push(d);
			parentDirId = d._id;
		}

		await upload(dirs[3]._id, user._id, "deep.txt", "12345"); // 5 bytes

		for (const d of dirs) {
			expect(await dirStats(d._id)).toEqual({ size: 5, fileCount: 1 });
		}
	});

	it("throws DIRECTORY_NOT_FOUND for a missing parent and writes nothing (error path)", async () => {
		const user = await createTestUser();
		const ghost = new mongoose.Types.ObjectId();

		await expect(
			uploadFile(ghost, user._id, "x.txt", Readable.from(Buffer.from("x"))),
		).rejects.toMatchObject({ code: "DIRECTORY_NOT_FOUND", statusCode: 404 });

		expect(await File.countDocuments({})).toBe(0);
	});

	it("rejects a parent owned by another user, leaving it untouched (security)", async () => {
		const owner = await createTestUser();
		const attacker = await createTestUser();
		const dir = await createTestDirectory(owner._id);

		await expect(
			uploadFile(dir._id, attacker._id, "x.txt", Readable.from(Buffer.from("x"))),
		).rejects.toMatchObject({ code: "DIRECTORY_NOT_FOUND" });

		expect(await dirStats(dir._id)).toEqual({ size: 0, fileCount: 0 });
		expect(await File.countDocuments({})).toBe(0);
	});

	it("rolls back fully when the stream errors (no doc, no size change, worst case)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const sub = await createTestDirectory(user._id, { parentDirId: root._id });

		const boom = new Readable({
			read() {
				this.destroy(new Error("stream boom"));
			},
		});

		await expect(uploadFile(sub._id, user._id, "x.txt", boom)).rejects.toMatchObject({
			code: "FILE_UPLOAD_FAILED",
		});

		expect(await File.countDocuments({})).toBe(0);
		expect(await dirStats(sub._id)).toEqual({ size: 0, fileCount: 0 });
		expect(await dirStats(root._id)).toEqual({ size: 0, fileCount: 0 });
	});
});

describe("uploadFile enforces per-user storage quota", () => {
	it("rejects an upload that would exceed the user's remaining quota", async () => {
		const user = await createTestUser({ storageLimit: 5 });
		const root = await createTestDirectory(user._id); // parentDirId: null → root

		await expect(
			uploadFile(
				root._id,
				user._id,
				"big.txt",
				Readable.from(Buffer.from("123456")), // 6 bytes
				user.storageLimit,
			),
		).rejects.toMatchObject({ code: "STORAGE_LIMIT_EXCEEDED", statusCode: 400 });

		expect(await File.countDocuments({})).toBe(0);
		expect(await dirStats(root._id)).toEqual({ size: 0, fileCount: 0 });
	});

	it("allows an upload that exactly fills the quota (boundary)", async () => {
		const user = await createTestUser({ storageLimit: 6 });
		const root = await createTestDirectory(user._id);

		const file = await upload(root._id, user._id, "fit.txt", "123456", user.storageLimit); // 6 bytes

		expect(file.size).toBe(6);
		expect(await dirStats(root._id)).toEqual({ size: 6, fileCount: 1 });
	});

	it("checks against live usage from prior uploads, not just the new file", async () => {
		const user = await createTestUser({ storageLimit: 10 });
		const root = await createTestDirectory(user._id);

		await upload(root._id, user._id, "a.txt", "12345", user.storageLimit); // 5 bytes → used 5

		await expect(
			uploadFile(
				root._id,
				user._id,
				"b.txt",
				Readable.from(Buffer.from("123456")), // +6 → 11 > 10
				user.storageLimit,
			),
		).rejects.toMatchObject({ code: "STORAGE_LIMIT_EXCEEDED" });

		expect(await File.countDocuments({})).toBe(1);
		expect(await dirStats(root._id)).toEqual({ size: 5, fileCount: 1 });
	});

	it("rejects a new upload when the quota is already full", async () => {
		const user = await createTestUser({ storageLimit: 5 });
		const root = await createTestDirectory(user._id, { size: 5, fileCount: 1 });

		await expect(
			uploadFile(
				root._id,
				user._id,
				"x.txt",
				Readable.from(Buffer.from("x")), // 1 byte
				user.storageLimit,
			),
		).rejects.toMatchObject({ code: "STORAGE_LIMIT_EXCEEDED" });

		expect(await dirStats(root._id)).toEqual({ size: 5, fileCount: 1 });
	});

	it("allows a 0-byte upload even at exactly full quota (boundary)", async () => {
		const user = await createTestUser({ storageLimit: 5 });
		const root = await createTestDirectory(user._id, { size: 5, fileCount: 1 });

		const file = await upload(root._id, user._id, "empty.txt", "", user.storageLimit); // 0 bytes

		expect(file.size).toBe(0);
		expect(await dirStats(root._id)).toEqual({ size: 5, fileCount: 2 });
	});
});

describe("deleteFile maintains folder sizes", () => {
	it("decrements the folder and ancestors back to zero on the last file", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const sub = await createTestDirectory(user._id, { parentDirId: root._id });
		const file = await upload(sub._id, user._id, "note.txt", "hello world"); // 11

		await deleteFile(file._id, user._id);

		expect(await dirStats(sub._id)).toEqual({ size: 0, fileCount: 0 });
		expect(await dirStats(root._id)).toEqual({ size: 0, fileCount: 0 });
	});

	it("removes only the deleted file's contribution (isolation)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const f1 = await upload(root._id, user._id, "a.txt", "aaa"); // 3
		await upload(root._id, user._id, "b.txt", "bbbb"); // 4

		await deleteFile(f1._id, user._id);

		expect(await dirStats(root._id)).toEqual({ size: 4, fileCount: 1 });
	});

	it("decrements every ancestor for a nested file (depth)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const sub = await createTestDirectory(user._id, { parentDirId: root._id });
		const file = await upload(sub._id, user._id, "n.txt", "12345"); // 5

		await deleteFile(file._id, user._id);

		expect(await dirStats(sub._id)).toEqual({ size: 0, fileCount: 0 });
		expect(await dirStats(root._id)).toEqual({ size: 0, fileCount: 0 });
	});

	it("leaves sizes unchanged when a non-owner attempts delete (security)", async () => {
		const owner = await createTestUser();
		const attacker = await createTestUser();
		const root = await createTestDirectory(owner._id);
		const file = await upload(root._id, owner._id, "a.txt", "aaa"); // 3

		await expect(deleteFile(file._id, attacker._id)).rejects.toMatchObject({
			code: "FILE_NOT_FOUND",
		});

		expect(await dirStats(root._id)).toEqual({ size: 3, fileCount: 1 });
	});
});

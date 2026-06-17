import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { Readable } from "node:stream";
import { rm } from "node:fs/promises";

import {
	adjustAncestorStats,
	createDirectory,
	deleteDirectory,
	getDirectory,
	resolveDirectoryNames,
} from "../../src/services/directory.service.js";
import { uploadFile } from "../../src/services/file.service.js";
import { buildFilePath } from "../../src/utils/storagePath.js";
import Directory from "../../src/models/directory.model.js";
import { createTestUser, createTestDirectory } from "../factories.js";

const statsOf = async (id) => {
	const d = await Directory.findById(id);
	return { size: d.size, fileCount: d.fileCount };
};

const uploadInto = async (parentId, userId, name, body) => {
	const file = await uploadFile(parentId, userId, name, Readable.from(Buffer.from(body)));
	return file;
};

describe("adjustAncestorStats", () => {
	it("increments the start folder and every ancestor up to root", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const a = await createTestDirectory(user._id, { parentDirId: root._id });
		const b = await createTestDirectory(user._id, { parentDirId: a._id });

		await adjustAncestorStats(b._id, { bytes: 100, files: 1 });

		for (const id of [root._id, a._id, b._id]) {
			expect(await statsOf(id)).toEqual({ size: 100, fileCount: 1 });
		}
	});

	it("increments only the root when starting at the root (boundary)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		await adjustAncestorStats(root._id, { bytes: 7, files: 1 });
		expect(await statsOf(root._id)).toEqual({ size: 7, fileCount: 1 });
	});

	it("does not touch a sibling subtree (isolation)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const a = await createTestDirectory(user._id, { parentDirId: root._id });
		const sibling = await createTestDirectory(user._id, { parentDirId: root._id });

		await adjustAncestorStats(a._id, { bytes: 50, files: 1 });

		expect(await statsOf(sibling._id)).toEqual({ size: 0, fileCount: 0 });
		expect(await statsOf(root._id)).toEqual({ size: 50, fileCount: 1 });
	});

	it("applies negative deltas (decrement)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		await adjustAncestorStats(root._id, { bytes: 100, files: 2 });
		await adjustAncestorStats(root._id, { bytes: -40, files: -1 });
		expect(await statsOf(root._id)).toEqual({ size: 60, fileCount: 1 });
	});

	it("updates every level of a deep chain (worst case depth)", async () => {
		const user = await createTestUser();
		let parentDirId = null;
		const dirs = [];
		for (let i = 0; i < 6; i++) {
			const d = await createTestDirectory(user._id, { parentDirId });
			dirs.push(d);
			parentDirId = d._id;
		}

		await adjustAncestorStats(dirs[5]._id, { bytes: 10, files: 1 });

		for (const d of dirs) {
			expect(await statsOf(d._id)).toEqual({ size: 10, fileCount: 1 });
		}
	});

	it("is a no-op when the start directory does not exist (nullish)", async () => {
		const ghostId = new mongoose.Types.ObjectId();
		await expect(
			adjustAncestorStats(ghostId, { bytes: 100, files: 1 }),
		).resolves.toBeUndefined();
	});

	it("allows underflow at the Mongoose layer (guard lives in Atlas $jsonSchema)", async () => {
		// $inc bypasses Mongoose validators, so a buggy over-decrement is NOT
		// rejected here. In prod the Atlas `minimum: 0` rejects it. This test
		// pins the known behavior so a future change is conscious.
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		await adjustAncestorStats(root._id, { bytes: 50, files: 1 });
		await adjustAncestorStats(root._id, { bytes: -200, files: -5 });
		expect(await statsOf(root._id)).toEqual({ size: -150, fileCount: -4 });
	});
});

describe("deleteDirectory maintains ancestor sizes", () => {
	it("decrements the parent chain by the deleted subtree's totals", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const a = await createTestDirectory(user._id, { parentDirId: root._id });
		const file = await uploadInto(a._id, user._id, "f.txt", "12345"); // 5

		expect(await statsOf(root._id)).toEqual({ size: 5, fileCount: 1 });

		await deleteDirectory(a._id, user._id);

		expect(await statsOf(root._id)).toEqual({ size: 0, fileCount: 0 });
		await rm(buildFilePath(file), { force: true });
	});

	it("decrements by the FULL nested subtree, not just direct children (worst case)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const a = await createTestDirectory(user._id, { parentDirId: root._id });
		const b = await createTestDirectory(user._id, { parentDirId: a._id });
		const file = await uploadInto(b._id, user._id, "deep.txt", "1234567890"); // 10

		expect(await statsOf(root._id)).toEqual({ size: 10, fileCount: 1 });

		await deleteDirectory(a._id, user._id);

		expect(await statsOf(root._id)).toEqual({ size: 0, fileCount: 0 });
		await rm(buildFilePath(file), { force: true });
	});

	it("leaves a sibling subtree's contribution intact (isolation)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const a = await createTestDirectory(user._id, { parentDirId: root._id });
		const sibling = await createTestDirectory(user._id, { parentDirId: root._id });
		const fa = await uploadInto(a._id, user._id, "a.txt", "aaa"); // 3
		const fs = await uploadInto(sibling._id, user._id, "s.txt", "ss"); // 2

		expect(await statsOf(root._id)).toEqual({ size: 5, fileCount: 2 });

		await deleteDirectory(a._id, user._id);

		expect(await statsOf(root._id)).toEqual({ size: 2, fileCount: 1 });
		await rm(buildFilePath(fa), { force: true });
		await rm(buildFilePath(fs), { force: true });
	});

	it("does not change ancestors when deleting an empty folder (boundary)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const empty = await createTestDirectory(user._id, { parentDirId: root._id });

		await deleteDirectory(empty._id, user._id);

		expect(await statsOf(root._id)).toEqual({ size: 0, fileCount: 0 });
	});
});

describe("getDirectory reads stored sizes", () => {
	it("returns stored totalSize/fileCount for the folder and each child", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const child = await createTestDirectory(user._id, { parentDirId: root._id });
		const file = await uploadInto(child._id, user._id, "f.txt", "123"); // 3
		await rm(buildFilePath(file), { force: true });

		const data = await getDirectory(root._id, user._id);

		expect(data.totalSize).toBe(3);
		expect(data.fileCount).toBe(1);
		const childView = data.childDirectories.find(
			(d) => String(d.id) === String(child._id),
		);
		expect(childView.totalSize).toBe(3);
		expect(childView.fileCount).toBe(1);

		// Contract: expose totalSize/fileCount only — not the raw stored `size`.
		expect(data.size).toBeUndefined();
		expect(childView.size).toBeUndefined();
	});

	it("reports zeros and an empty child list for an empty folder (boundary)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);

		const data = await getDirectory(root._id, user._id);

		expect(data.totalSize).toBe(0);
		expect(data.fileCount).toBe(0);
		expect(data.childDirectories).toEqual([]);
	});

	it("returns each child's own stored totals (multiple children)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const c1 = await createTestDirectory(user._id, { parentDirId: root._id });
		const c2 = await createTestDirectory(user._id, { parentDirId: root._id });
		const f1 = await uploadInto(c1._id, user._id, "a.txt", "aaaa"); // 4
		const f2 = await uploadInto(c2._id, user._id, "b.txt", "bb"); // 2
		await rm(buildFilePath(f1), { force: true });
		await rm(buildFilePath(f2), { force: true });

		const data = await getDirectory(root._id, user._id);

		const byId = Object.fromEntries(
			data.childDirectories.map((d) => [String(d.id), d.totalSize]),
		);
		expect(byId[String(c1._id)]).toBe(4);
		expect(byId[String(c2._id)]).toBe(2);
		expect(data.totalSize).toBe(6); // root subtree total
	});
});

describe("createDirectory seeds ancestorIds", () => {
	it("stores a child's ancestorIds as [rootId]", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);

		const child = await createDirectory(root._id, "Documents", user._id);

		const stored = await Directory.findById(child._id).lean();
		expect(stored.ancestorIds.map(String)).toEqual([String(root._id)]);
	});

	it("stores a grandchild's ancestorIds as [rootId, childId]", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const child = await createDirectory(root._id, "Documents", user._id);

		const grandchild = await createDirectory(child._id, "Reports", user._id);

		const stored = await Directory.findById(grandchild._id).lean();
		expect(stored.ancestorIds.map(String)).toEqual([
			String(root._id),
			String(child._id),
		]);
	});

	it("does not expose ancestorIds in the create response", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);

		const child = await createDirectory(root._id, "Documents", user._id);

		expect(child.ancestorIds).toBeUndefined();
	});
});

describe("createTestDirectory factory seeds ancestorIds", () => {
	it("gives a root directory an empty ancestorIds", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		expect(root.ancestorIds.map(String)).toEqual([]);
	});

	it("gives a nested directory its ancestor id chain", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id);
		const child = await createTestDirectory(user._id, { parentDirId: root._id });
		const grandchild = await createTestDirectory(user._id, {
			parentDirId: child._id,
		});

		expect(grandchild.ancestorIds.map(String)).toEqual([
			String(root._id),
			String(child._id),
		]);
	});
});

describe("resolveDirectoryNames", () => {
	it("returns an empty array for an empty chain", async () => {
		const user = await createTestUser();
		expect(await resolveDirectoryNames([], user._id)).toEqual([]);
	});

	it("resolves ids to {_id, name} in input order", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id, { name: "My Files" });
		const docs = await createTestDirectory(user._id, {
			name: "Documents",
			parentDirId: root._id,
		});

		const result = await resolveDirectoryNames([root._id, docs._id], user._id);

		expect(result.map((r) => r.name)).toEqual(["My Files", "Documents"]);
		expect(result.map((r) => String(r._id))).toEqual([
			String(root._id),
			String(docs._id),
		]);
	});

	it("preserves input order regardless of $in return order", async () => {
		const user = await createTestUser();
		const a = await createTestDirectory(user._id, { name: "Alpha" });
		const b = await createTestDirectory(user._id, { name: "Bravo" });

		const result = await resolveDirectoryNames([b._id, a._id], user._id);

		expect(result.map((r) => r.name)).toEqual(["Bravo", "Alpha"]);
	});

	it("does not resolve a directory owned by another user (ownership scoping)", async () => {
		const owner = await createTestUser();
		const other = await createTestUser();
		const dir = await createTestDirectory(owner._id, { name: "Secret" });

		const result = await resolveDirectoryNames([dir._id], other._id);

		expect(String(result[0]._id)).toBe(String(dir._id));
		expect(result[0].name).toBeUndefined();
	});
});

describe("getDirectory breadcrumb + path", () => {
	it("returns a self-inclusive breadcrumb (root → current) and a path string", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id, { name: "My Files" });
		const docs = await createTestDirectory(user._id, {
			name: "Documents",
			parentDirId: root._id,
		});
		const reports = await createTestDirectory(user._id, {
			name: "Reports",
			parentDirId: docs._id,
		});

		const data = await getDirectory(reports._id, user._id);

		expect(data.breadcrumb.map((c) => c.name)).toEqual([
			"My Files",
			"Documents",
			"Reports",
		]);
		expect(data.breadcrumb.map((c) => String(c._id))).toEqual([
			String(root._id),
			String(docs._id),
			String(reports._id),
		]);
		expect(data.path).toBe("/My Files/Documents/Reports");
	});

	it("returns just the folder itself for the root directory", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id, { name: "My Files" });

		const data = await getDirectory(root._id, user._id);

		expect(data.breadcrumb.map((c) => c.name)).toEqual(["My Files"]);
		expect(data.path).toBe("/My Files");
	});

	it("does not expose ancestors or raw ancestorIds (top-level or children)", async () => {
		const user = await createTestUser();
		const root = await createTestDirectory(user._id, { name: "My Files" });
		const child = await createTestDirectory(user._id, {
			name: "Documents",
			parentDirId: root._id,
		});

		const data = await getDirectory(root._id, user._id);

		expect(data.ancestors).toBeUndefined();
		expect(data.ancestorIds).toBeUndefined();
		const childView = data.childDirectories.find(
			(d) => String(d.id) === String(child._id),
		);
		expect(childView.ancestorIds).toBeUndefined();
	});
});

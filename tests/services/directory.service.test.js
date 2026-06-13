import { describe, it, expect } from "vitest";
import mongoose from "mongoose";

import { adjustAncestorStats } from "../../src/services/directory.service.js";
import Directory from "../../src/models/directory.model.js";
import { createTestUser, createTestDirectory } from "../factories.js";

const statsOf = async (id) => {
	const d = await Directory.findById(id);
	return { size: d.size, fileCount: d.fileCount };
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

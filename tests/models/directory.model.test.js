import { describe, it, expect } from "vitest";
import mongoose from "mongoose";

import Directory from "../../src/models/directory.model.js";
import { createTestUser, createTestDirectory } from "../factories.js";

const { ValidationError } = mongoose.Error;

describe("Directory model — size/fileCount", () => {
	it("defaults size and fileCount to 0 on a new directory", async () => {
		const user = await createTestUser();
		const dir = await createTestDirectory(user._id);
		expect(dir.size).toBe(0);
		expect(dir.fileCount).toBe(0);
	});

	it("persists explicit size and fileCount values", async () => {
		const user = await createTestUser();
		const dir = await createTestDirectory(user._id);
		dir.size = 2048;
		dir.fileCount = 5;
		await dir.save();

		const fresh = await Directory.findById(dir._id);
		expect(fresh.size).toBe(2048);
		expect(fresh.fileCount).toBe(5);
	});

	it("allows negative size/fileCount at the Mongoose layer (underflow guard is Atlas-only)", async () => {
		// These fields deliberately have NO Mongoose `min`: `$inc` bypasses
		// Mongoose validators, so the real underflow guard lives in the Atlas
		// `$jsonSchema` (`minimum: 0`). This pins that the Mongoose layer does
		// not reject negatives, so a future `min` addition is a conscious change.
		const user = await createTestUser();
		const dir = await createTestDirectory(user._id);
		dir.size = -50;
		dir.fileCount = -3;
		await dir.save();

		const fresh = await Directory.findById(dir._id);
		expect(fresh.size).toBe(-50);
		expect(fresh.fileCount).toBe(-3);
	});

	it("coerces a numeric string into a Number", async () => {
		const user = await createTestUser();
		const dir = await createTestDirectory(user._id);
		dir.size = "4096";
		await dir.save();

		const fresh = await Directory.findById(dir._id);
		expect(fresh.size).toBe(4096);
	});

	it("defaults folderCount to 0 on a new directory", async () => {
		const user = await createTestUser();
		const dir = await createTestDirectory(user._id);
		expect(dir.folderCount).toBe(0);
	});
});

describe("Directory model — name validation", () => {
	it("requires a name", async () => {
		const userId = new mongoose.Types.ObjectId();
		await expect(Directory.create({ userId })).rejects.toThrow(ValidationError);
	});

	it("rejects a name shorter than the 3-char minimum (boundary)", async () => {
		const userId = new mongoose.Types.ObjectId();
		await expect(
			Directory.create({ name: "ab", userId }),
		).rejects.toThrow(ValidationError);
	});

	it("accepts a name of exactly 3 chars (lower boundary)", async () => {
		const userId = new mongoose.Types.ObjectId();
		const dir = await Directory.create({ name: "abc", userId });
		expect(dir.name).toBe("abc");
	});

	it("rejects a name longer than the 50-char maximum (boundary)", async () => {
		const userId = new mongoose.Types.ObjectId();
		await expect(
			Directory.create({ name: "a".repeat(51), userId }),
		).rejects.toThrow(ValidationError);
	});

	it("accepts a name of exactly 50 chars (upper boundary)", async () => {
		const userId = new mongoose.Types.ObjectId();
		const name = "a".repeat(50);
		const dir = await Directory.create({ name, userId });
		expect(dir.name).toBe(name);
	});

	it("trims surrounding whitespace from the name", async () => {
		const userId = new mongoose.Types.ObjectId();
		const dir = await Directory.create({ name: "  documents  ", userId });
		expect(dir.name).toBe("documents");
	});

	it("rejects a name that collapses below the minimum after trimming (whitespace worst case)", async () => {
		const userId = new mongoose.Types.ObjectId();
		await expect(
			Directory.create({ name: "  ab  ", userId }),
		).rejects.toThrow(ValidationError);
	});
});

describe("Directory model — parentDirId", () => {
	it("defaults parentDirId to null (root directory)", async () => {
		const userId = new mongoose.Types.ObjectId();
		const dir = await Directory.create({ name: "root-dir", userId });
		expect(dir.parentDirId).toBeNull();
	});

	it("accepts a valid ObjectId parent", async () => {
		const userId = new mongoose.Types.ObjectId();
		const parentDirId = new mongoose.Types.ObjectId();
		const dir = await Directory.create({ name: "child", userId, parentDirId });
		expect(String(dir.parentDirId)).toBe(String(parentDirId));
	});

	it("rejects a non-ObjectId parentDirId (cast failure)", async () => {
		const userId = new mongoose.Types.ObjectId();
		await expect(
			Directory.create({ name: "child", userId, parentDirId: "not-an-id" }),
		).rejects.toThrow(ValidationError);
	});
});

describe("Directory model — userId", () => {
	it("requires a userId", async () => {
		await expect(Directory.create({ name: "ownerless" })).rejects.toThrow(
			ValidationError,
		);
	});

	it("rejects a non-ObjectId userId (cast failure)", async () => {
		await expect(
			Directory.create({ name: "bad-owner", userId: "not-an-id" }),
		).rejects.toThrow(ValidationError);
	});
});

describe("Directory model — strict schema", () => {
	it("rejects unknown fields (strict: throw blocks mass-assignment)", async () => {
		const userId = new mongoose.Types.ObjectId();
		await expect(
			Directory.create({ name: "valid-name", userId, isAdmin: true }),
		).rejects.toThrow();
	});
});

describe("Directory model — timestamps", () => {
	it("sets createdAt and updatedAt on creation", async () => {
		const user = await createTestUser();
		const dir = await createTestDirectory(user._id);
		expect(dir.createdAt).toBeInstanceOf(Date);
		expect(dir.updatedAt).toBeInstanceOf(Date);
	});
});

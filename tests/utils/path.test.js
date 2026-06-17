import { describe, it, expect } from "vitest";
import mongoose from "mongoose";

import { generateBreadCrumb, generatePath } from "../../src/utils/path.js";

const crumb = (name) => ({ _id: new mongoose.Types.ObjectId(), name });

describe("generateBreadCrumb", () => {
	it("returns just the current folder when there are no ancestors", () => {
		const current = crumb("My Files");
		const trail = generateBreadCrumb([], current);
		expect(trail.map((c) => c.name)).toEqual(["My Files"]);
		expect(String(trail[0]._id)).toBe(String(current._id));
	});

	it("appends the current folder to the ancestors (root → current)", () => {
		const root = crumb("My Files");
		const docs = crumb("Documents");
		const current = crumb("Reports");

		const trail = generateBreadCrumb([root, docs], current);

		expect(trail.map((c) => c.name)).toEqual([
			"My Files",
			"Documents",
			"Reports",
		]);
	});

	it("projects each crumb to {_id, name} only (drops extra fields)", () => {
		const current = { _id: new mongoose.Types.ObjectId(), name: "Reports", size: 99 };
		const trail = generateBreadCrumb([], current);
		expect(Object.keys(trail[0])).toEqual(["_id", "name"]);
	});
});

describe("generatePath", () => {
	it("joins crumb names with a leading slash", () => {
		const breadcrumb = [{ name: "My Files" }, { name: "Documents" }, { name: "Reports" }];
		expect(generatePath(breadcrumb)).toBe("/My Files/Documents/Reports");
	});

	it("handles a single crumb (root)", () => {
		expect(generatePath([{ name: "My Files" }])).toBe("/My Files");
	});

	it("returns '/' for an empty breadcrumb", () => {
		expect(generatePath([])).toBe("/");
	});
});

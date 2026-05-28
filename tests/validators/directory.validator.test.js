import { describe, it, expect } from "vitest";

import {
	createDirectorySchema,
	renameDirectorySchema,
} from "../../src/validators/directory.validator.js";

describe("createDirectorySchema", () => {
	it("accepts a valid folder name", () => {
		const result = createDirectorySchema.safeParse({ name: "Reports" });
		expect(result.success).toBe(true);
		expect(result.data.name).toBe("Reports");
	});

	it("defaults to 'New Folder' when name is missing", () => {
		const result = createDirectorySchema.safeParse({});
		expect(result.success).toBe(true);
		expect(result.data.name).toBe("New Folder");
	});

	it("defaults to 'New Folder' when name is not a string", () => {
		for (const name of [null, 42, { $ne: "" }, ["x"]]) {
			const result = createDirectorySchema.safeParse({ name });
			expect(result.success).toBe(true);
			expect(result.data.name).toBe("New Folder");
		}
	});

	it("strips control characters and path dividers, then trims", () => {
		const result = createDirectorySchema.safeParse({
			name: "  a/b\\c\td\n  ",
		});
		expect(result.data.name).toBe("abcd");
	});

	it("falls back to 'New Folder' when the name is empty after sanitizing", () => {
		const result = createDirectorySchema.safeParse({ name: "///" });
		expect(result.data.name).toBe("New Folder");
	});

	it("caps the name at 255 characters", () => {
		const result = createDirectorySchema.safeParse({ name: "a".repeat(300) });
		expect(result.data.name).toHaveLength(255);
	});
});

describe("renameDirectorySchema", () => {
	it("accepts a valid new directory name", () => {
		const result = renameDirectorySchema.safeParse({ newDirName: "Archive" });
		expect(result.success).toBe(true);
		expect(result.data.newDirName).toBe("Archive");
	});

	it("rejects a missing newDirName", () => {
		expect(renameDirectorySchema.safeParse({}).success).toBe(false);
	});

	it("rejects a non-string newDirName (operator-injection shape)", () => {
		expect(
			renameDirectorySchema.safeParse({ newDirName: { $ne: "" } }).success,
		).toBe(false);
	});

	it("rejects a name that is empty after sanitizing", () => {
		expect(
			renameDirectorySchema.safeParse({ newDirName: "  //  " }).success,
		).toBe(false);
	});

	it("strips control characters and path dividers, then trims", () => {
		const result = renameDirectorySchema.safeParse({
			newDirName: " a/b\\c\t ",
		});
		expect(result.data.newDirName).toBe("abc");
	});

	it("caps the name at 255 characters", () => {
		const result = renameDirectorySchema.safeParse({
			newDirName: "a".repeat(300),
		});
		expect(result.data.newDirName).toHaveLength(255);
	});
});

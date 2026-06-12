import { describe, it, expect } from "vitest";

import {
	renameFileSchema,
	sanitizeFileName,
} from "../../src/validators/file.validator.js";

describe("renameFileSchema", () => {
	it("accepts a valid new file name", () => {
		const result = renameFileSchema.safeParse({ newFileName: "report.pdf" });
		expect(result.success).toBe(true);
		expect(result.data.newFileName).toBe("report.pdf");
	});

	it("rejects a missing newFileName", () => {
		expect(renameFileSchema.safeParse({}).success).toBe(false);
	});

	it("rejects a non-string newFileName (operator-injection shape)", () => {
		expect(
			renameFileSchema.safeParse({ newFileName: { $ne: "" } }).success,
		).toBe(false);
	});

	it("rejects a name that is empty after sanitizing", () => {
		expect(renameFileSchema.safeParse({ newFileName: "   " }).success).toBe(
			false,
		);
	});

	it("strips control characters, then trims", () => {
		const result = renameFileSchema.safeParse({
			newFileName: "  re\tport\n.pdf  ",
		});
		expect(result.data.newFileName).toBe("report.pdf");
	});

	it("reduces a traversal path to its base name", () => {
		const result = renameFileSchema.safeParse({
			newFileName: "../../secret.txt",
		});
		expect(result.data.newFileName).toBe("secret.txt");
	});

	it("caps the name at 255 characters", () => {
		const result = renameFileSchema.safeParse({
			newFileName: "a".repeat(300),
		});
		expect(result.data.newFileName).toHaveLength(255);
	});

	it("strips embedded HTML from the file name", () => {
		const result = renameFileSchema.safeParse({
			newFileName: "report<script>alert(1)</script>.pdf",
		});
		expect(result.data.newFileName).toBe("report.pdf");
	});
});

// Exported so the file upload controller can reuse the same normalization for
// the filename header (which never passes through validateBody).
describe("sanitizeFileName", () => {
	it("returns an ordinary file name unchanged", () => {
		expect(sanitizeFileName("report.pdf")).toBe("report.pdf");
	});

	it("strips embedded HTML (the upload-path XSS gap)", () => {
		expect(sanitizeFileName("report<script>alert(1)</script>.pdf")).toBe(
			"report.pdf",
		);
	});

	it("reduces a traversal path to its base name", () => {
		expect(sanitizeFileName("../../secret.txt")).toBe("secret.txt");
	});

	it("strips control characters and backslashes, then trims", () => {
		expect(sanitizeFileName("  re\tport\n.pdf  ")).toBe("report.pdf");
	});

	it("caps the name at 255 characters", () => {
		expect(sanitizeFileName("a".repeat(300))).toHaveLength(255);
	});

	it("returns an empty string when the input reduces to nothing", () => {
		expect(sanitizeFileName("<script>alert(1)</script>")).toBe("");
		expect(sanitizeFileName("   ")).toBe("");
	});

	it("returns an empty string for non-string input (operator-injection shape)", () => {
		expect(sanitizeFileName({ $ne: "" })).toBe("");
		expect(sanitizeFileName(null)).toBe("");
		expect(sanitizeFileName(undefined)).toBe("");
	});

	// Known limitation pinned for awareness — DOMPurify parses a bare "<" as
	// markup, so it eats/encodes legitimate filenames containing "<". Tracked
	// in issue #60; update these once that fix lands.
	it("mangles a bare '<' (known DOMPurify limitation, see #60)", () => {
		expect(sanitizeFileName("a<b.txt")).toBe("a"); // extension lost
		expect(sanitizeFileName("5<10.log")).toBe("5&lt;10.log");
	});
});

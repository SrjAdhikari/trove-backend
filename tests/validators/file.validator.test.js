import { describe, it, expect } from "vitest";

import { renameFileSchema } from "../../src/validators/file.validator.js";

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

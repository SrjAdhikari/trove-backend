import { Readable } from "node:stream";

import mongoose from "mongoose";
import { afterEach, describe, it, expect, vi } from "vitest";

import {
	importFromDrive,
	sanitizeDirName,
	sanitizeFileName,
} from "../../src/services/drive.service.js";

import {
	getDriveFileMetadata,
	downloadDriveFile,
} from "../../src/lib/googleDrive.js";

vi.mock("../../src/lib/googleDrive.js", async (importOriginal) => ({
	...(await importOriginal()),
	getDriveFileMetadata: vi.fn(),
	downloadDriveFile: vi.fn(),
}));

afterEach(() => {
	vi.clearAllMocks();
});

describe("drive sanitizeDirName", () => {
	it("returns an ordinary folder name unchanged", () => {
		expect(sanitizeDirName("Reports")).toBe("Reports");
	});

	it("strips embedded HTML from an imported folder name", () => {
		expect(sanitizeDirName("Reports<script>alert(1)</script>")).toBe("Reports");
	});

	it("strips control characters and path dividers, then trims", () => {
		expect(sanitizeDirName("  a/b\\c\td\n  ")).toBe("abcd");
	});

	it("defaults to 'Imported folder' when empty", () => {
		expect(sanitizeDirName("///")).toBe("Imported folder");
	});

	it("defaults to 'Imported folder' when HTML reduces it to nothing", () => {
		expect(sanitizeDirName("<script>alert(1)</script>")).toBe("Imported folder");
	});

	it("pads a too-short name up to the 3-char minimum", () => {
		expect(sanitizeDirName("ab")).toHaveLength(3);
	});

	it("caps the name at 50 characters", () => {
		expect(sanitizeDirName("a".repeat(80))).toHaveLength(50);
	});
});

describe("drive sanitizeFileName", () => {
	it("returns an ordinary file name unchanged", () => {
		expect(sanitizeFileName("report.pdf")).toBe("report.pdf");
	});

	it("strips embedded HTML from an imported file name", () => {
		expect(sanitizeFileName("report<script>alert(1)</script>.pdf")).toBe(
			"report.pdf",
		);
	});

	it("reduces a traversal path to its base name", () => {
		expect(sanitizeFileName("../../secret.txt")).toBe("secret.txt");
	});

	it("defaults to 'untitled' when empty", () => {
		expect(sanitizeFileName("")).toBe("untitled");
	});

	it("defaults to 'untitled' when HTML reduces it to nothing", () => {
		expect(sanitizeFileName("<script>alert(1)</script>")).toBe("untitled");
	});

	it("appends the fallback extension when missing", () => {
		expect(sanitizeFileName("My Doc", ".pdf")).toBe("My Doc.pdf");
	});

	it("does not double-append an existing extension", () => {
		expect(sanitizeFileName("My Doc.pdf", ".pdf")).toBe("My Doc.pdf");
	});

	it("pads a too-short name up to the 3-char minimum", () => {
		expect(sanitizeFileName("a")).toHaveLength(3);
	});

	it("caps the name at 255 characters", () => {
		expect(sanitizeFileName("a".repeat(300))).toHaveLength(255);
	});

	// Known limitation pinned for awareness — DOMPurify parses a bare "<" as
	// markup, so it eats/encodes legitimate names containing "<". Tracked in
	// issue #60; update these once that fix lands.
	it("mangles a bare '<' (known DOMPurify limitation, see #60)", () => {
		expect(sanitizeFileName("a<b.txt")).toBe("a__"); // extension lost, padded to min 3
		expect(sanitizeFileName("5<10.log")).toBe("5&lt;10.log");
	});
});

describe("drive importFromDrive", () => {
	it("destroys the Drive source stream when the upload rejects before reading it", async () => {
		// Never pushes EOF — a real Drive socket still has bytes in flight, so
		// nothing but an explicit destroy can close it.
		const source = new Readable({ read() {} });
		source.push(Buffer.from("partial drive payload"));
		// Cancelling the web stream destroys this one *with* a reason, so without a
		// listener the rejection surfaces as an unhandled error and kills the worker.
		source.on("error", () => {});

		getDriveFileMetadata.mockResolvedValue({
			id: "drive-readme",
			name: "README",
			mimeType: "text/plain",
			trashed: false,
		});
		downloadDriveFile.mockResolvedValue({ body: Readable.toWeb(source) });

		const result = await importFromDrive(
			new mongoose.Types.ObjectId().toString(),
			"drive-access-token",
			[{ id: "drive-readme", mimeType: "text/plain" }],
			new mongoose.Types.ObjectId().toString(),
		);

		// Extensionless name — uploadFileFromServer rejects before it consumes a byte.
		expect(result.imported).toEqual([]);
		expect(result.failed).toEqual([
			{ driveId: "drive-readme", name: "README", reason: "INVALID_INPUT" },
		]);

		await vi.waitFor(() => expect(source.destroyed).toBe(true));
	});
});

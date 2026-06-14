import { describe, it, expect } from "vitest";

import {
	categorizeExtension,
	CATEGORY_ICONS,
} from "../../src/utils/fileCategories.js";

describe("categorizeExtension", () => {
	it("maps known extensions to their category", () => {
		expect(categorizeExtension(".pdf")).toBe("Documents");
		expect(categorizeExtension(".jpg")).toBe("Images");
		expect(categorizeExtension(".mp4")).toBe("Videos");
		expect(categorizeExtension(".mp3")).toBe("Audio");
		expect(categorizeExtension(".zip")).toBe("Archives");
	});

	it("is case-insensitive and tolerates a missing leading dot", () => {
		expect(categorizeExtension(".JPG")).toBe("Images");
		expect(categorizeExtension("PNG")).toBe("Images");
	});

	it("falls back to Other for unknown, empty, or missing extensions", () => {
		expect(categorizeExtension(".xyz")).toBe("Other");
		expect(categorizeExtension("")).toBe("Other");
		expect(categorizeExtension(undefined)).toBe("Other");
	});

	it("exposes a Lucide icon for every category", () => {
		expect(CATEGORY_ICONS).toMatchObject({
			Documents: "file-text",
			Images: "image",
			Videos: "video",
			Audio: "music",
			Archives: "archive",
			Other: "file",
		});
	});
});

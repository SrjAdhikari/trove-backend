//* src/validators/file.validator.js

import path from "node:path";
import { z } from "zod";

import sanitizeInput from "../utils/sanitizeInput.js";

const MAX_NAME_LENGTH = 255;

// Strip any HTML, then reduce to a base name (defuses traversal),
// strip control characters and backslashes, trim and bound length.
const sanitizeFileName = (value) =>
	path
		.basename(sanitizeInput(value))
		.replace(/[\r\n\t\\]/g, "")
		.trim()
		.slice(0, MAX_NAME_LENGTH);

const renameFileSchema = z.object({
	newFileName: z
		.string("Valid file name is required")
		.transform(sanitizeFileName)
		.refine((value) => value.length > 0, "Valid file name is required"),
});

export { renameFileSchema, sanitizeFileName };

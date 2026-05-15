//* src/utils/storagePath.js

import path from "node:path";

/**
 * Absolute path to the on-disk storage root where every file's bytes are persisted.
 */
const STORAGE_ROOT = path.resolve(import.meta.dirname, "../../storage");

/**
 * Builds the absolute on-disk path for a File document.
 *
 * @param {{ _id: import("mongoose").Types.ObjectId | string, extension: string }} file
 * @returns {string} Absolute path to the file's bytes on disk.
 */
const buildFilePath = (file) =>
	path.join(STORAGE_ROOT, `${file._id}${file.extension}`);

export { STORAGE_ROOT, buildFilePath };

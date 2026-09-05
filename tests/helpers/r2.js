import { deleteObject } from "../../src/lib/r2.js";
import File from "../../src/models/file.model.js";

/** Deletes the R2 object of every file document still in the database. */
export const cleanupTestObjects = async () => {
	const files = await File.find().select("objectKey").lean();

	await Promise.allSettled(
		files.map(async (file) => {
			// try/catch, not `.catch()` — `assertKey` throws synchronously.
			try {
				await deleteObject(file.objectKey);
			} catch {}
		}),
	);
};

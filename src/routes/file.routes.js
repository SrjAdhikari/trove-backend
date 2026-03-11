//* src/routes/file.routes.js

/**
 * File Routes
 * @module routes/file
 */

import { Router } from "express";
import {
	deleteFile,
	getFileById,
	updateFile,
	uploadFile,
} from "../controllers/file.controller.js";

const fileRouter = Router();

/**
 * Get a file by id
 * @route GET /api/files/{:id}
 */
fileRouter.get("/:id", getFileById);

/**
 * Upload a new file
 * @route POST /api/files/{:parentDirId}
 */
fileRouter.post("{/:parentDirId}", uploadFile);

/**
 * Update (Rename) a file
 * @route PATCH /api/files/{:id}
 */
fileRouter.patch("/:id", updateFile);

/**
 * Delete a file
 * @route DELETE /api/files/{:id}
 */
fileRouter.delete("/:id", deleteFile);

export default fileRouter;

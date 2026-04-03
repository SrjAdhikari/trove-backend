//* src/routes/file.routes.js

/**
 * File Routes
 * @module routes/file
 */

import { Router } from "express";
import {
	getFileHandler,
	uploadFileHandler,
	updateFileHandler,
	deleteFileHandler,
} from "../controllers/file.controller.js";

import authenticate from "../middlewares/auth.middleware.js";
import validateId from "../middlewares/validateId.middleware.js";

const fileRouter = Router();

// All file routes require authentication
fileRouter.use(authenticate);

// Validate ID parameters
["id", "parentDirId"].forEach((param) => {
	fileRouter.param(param, validateId);
});

/**
 * Get a file by id
 * @route GET /api/files/{:id}
 */
fileRouter.get("/:id", getFileHandler);

/**
 * Upload a new file
 * @route POST /api/files/{:parentDirId}
 */
fileRouter.post("{/:parentDirId}", uploadFileHandler);

/**
 * Update (Rename) a file
 * @route PATCH /api/files/{:id}
 */
fileRouter.patch("/:id", updateFileHandler);

/**
 * Delete a file
 * @route DELETE /api/files/{:id}
 */
fileRouter.delete("/:id", deleteFileHandler);

export default fileRouter;

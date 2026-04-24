//* src/routes/drive.routes.js

/**
 * Drive Routes
 * @module routes/drive
 */

import { Router } from "express";
import { importDriveHandler } from "../controllers/drive.controller.js";
import authenticate from "../middlewares/auth.middleware.js";

const driveRouter = Router();

// All drive routes require authentication
driveRouter.use(authenticate);

/**
 * Import picked files/folders from Google Drive
 * @route POST /api/drive/import
 */
driveRouter.post("/import", importDriveHandler);

export default driveRouter;

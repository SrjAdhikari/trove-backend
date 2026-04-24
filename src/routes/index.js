//* src/routes/index.js

/**
 * Root router for all application endpoints
 * @module routes
 */

import { Router } from "express";
import authRouter from "./auth.routes.js";
import directoryRouter from "./directory.routes.js";
import fileRouter from "./file.routes.js";
import driveRouter from "./drive.routes.js";

const router = Router();

/**
 * Authentication routes
 * @route /api/auth
 */
router.use("/auth", authRouter);

/**
 * Directory routes
 * @route /api/directories
 */
router.use("/directories", directoryRouter);

/**
 * File routes
 * @route /api/files
 */
router.use("/files", fileRouter);

/**
 * Drive routes
 * @route /api/drive
 */
router.use("/drive", driveRouter);

export default router;

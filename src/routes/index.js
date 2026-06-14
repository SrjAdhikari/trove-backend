//* src/routes/index.js

/**
 * Root router for all application endpoints
 * @module routes
 */

import { Router } from "express";
import authRouter from "./auth.routes.js";
import userRouter from "./user.routes.js";
import directoryRouter from "./directory.routes.js";
import fileRouter from "./file.routes.js";
import driveRouter from "./drive.routes.js";
import storageRouter from "./storage.routes.js";
import adminRouter from "./admin/index.js";

const router = Router();

/**
 * Authentication routes
 * @route /api/auth
 */
router.use("/auth", authRouter);

/**
 * User routes
 * @route /api/users
 */
router.use("/users", userRouter);

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

/**
 * Storage routes
 * @route /api/storage
 */
router.use("/storage", storageRouter);

/**
 * Admin routes
 * @route /api/admin
 */
router.use("/admin", adminRouter);

export default router;

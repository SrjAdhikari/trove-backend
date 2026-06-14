//* src/routes/storage.routes.js

/**
 * Storage Routes
 * @module routes/storage
 */

import { Router } from "express";
import { getStorageUsageHandler } from "../controllers/storage.controller.js";
import authenticate from "../middlewares/auth.middleware.js";
import { readLimiter } from "../middlewares/rateLimit.middleware.js";

const storageRouter = Router();

// All storage routes require authentication
storageRouter.use(authenticate);

/**
 * Get the authenticated user's storage usage
 * @route GET /api/storage/usage
 */
storageRouter.get("/usage", readLimiter, getStorageUsageHandler);

export default storageRouter;

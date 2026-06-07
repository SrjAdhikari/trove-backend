//* src/routes/admin/overview.routes.js

/**
 * Admin system-overview routes
 * @module routes/admin/overview
 */

import { Router } from "express";

import { getOverviewHandler } from "../../controllers/admin/overview.controller.js";
import { readLimiter } from "../../middlewares/rateLimit.middleware.js";

const adminOverviewRouter = Router();

/**
 * Point-in-time system aggregates for the admin dashboard
 * @route GET /api/admin/overview
 */
adminOverviewRouter.get("/", readLimiter, getOverviewHandler);

export default adminOverviewRouter;

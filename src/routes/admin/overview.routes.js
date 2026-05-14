//* src/routes/admin/overview.routes.js

/**
 * Admin system-overview routes
 * @module routes/admin/overview
 */

import { Router } from "express";

import { getOverviewHandler } from "../../controllers/admin/overview.controller.js";

const adminOverviewRouter = Router();

/**
 * Point-in-time system aggregates for the admin dashboard
 * @route GET /api/admin/overview
 */
adminOverviewRouter.get("/", getOverviewHandler);

export default adminOverviewRouter;

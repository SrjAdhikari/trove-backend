//* src/routes/admin/index.js

/**
 * Admin router.
 * Mounts user-related and system-overview admin endpoints behind
 * `authenticate` and `requireRole('admin')`. Suspended and soft-deleted users
 * are rejected by `authenticate` before the role gate fires.
 *
 * Per-route superadmin overrides layer `requireSuperadmin()`
 * on top inside the relevant sub-router.
 *
 * @module routes/admin
 */

import { Router } from "express";

import authenticate from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/authorize.middleware.js";
import { ROLES } from "../../constants/roles.js";

import adminUserRouter from "./user.routes.js";
import adminOverviewRouter from "./overview.routes.js";

const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireRole(ROLES.ADMIN));

adminRouter.use("/users", adminUserRouter);
adminRouter.use("/overview", adminOverviewRouter);

export default adminRouter;

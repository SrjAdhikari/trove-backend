//* src/app.js

import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";

import envConfig from "./constants/env.js";
import httpStatus from "./constants/httpStatus.js";
import appErrorCode from "./constants/appErrorCode.js";

import AppError from "./errors/AppError.js";
import globalErrorHandler from "./middlewares/error.middleware.js";

import routes from "./routes/index.js";

const { APP_ORIGIN, COOKIE_SECRET } = envConfig;
const { OK, NOT_FOUND } = httpStatus;
const { ROUTE_NOT_FOUND } = appErrorCode;

const app = express();
const allowedOrigins = [APP_ORIGIN];

/**
 * Express Config Middlewares
 * - Security Headers (Helmet)
 * - CORS
 * - JSON Body Parser
 * - Cookie Parser
 */
app.use(
	helmet({
		crossOriginResourcePolicy: { policy: "same-site" },
	}),
);

app.use(
	cors({
		origin: allowedOrigins,
		credentials: true,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	}),
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser(COOKIE_SECRET));

/**
 * Health Check Endpoint & Home Route
 * - GET /health
 * - GET /
 */
app.get("/health", (req, res) => {
	res.status(OK).json({
		success: true,
		message: "Healthy 👍",
	});
});

app.get("/", (req, res) => {
	res.status(OK).json({
		success: true,
		message: "Welcome to the Trove API",
	});
});

/**
 * API Routes
 * - All routes will be prefixed with /api
 */
app.use("/api", routes);

/**
 * 404 + Global Error Handler
 * - This will catch all undefined routes and pass an AppError to the global error handler
 */
app.use("/{*splat}", (req, res, next) => {
	next(
		new AppError(
			`Route ${req.method} ${req.originalUrl} not found`,
			NOT_FOUND,
			ROUTE_NOT_FOUND,
		),
	);
});

app.use(globalErrorHandler);

export default app;

//* src/app.js

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import envConfig from "./constants/env.js";
import httpStatus from "./constants/httpStatus.js";
import appErrorCode from "./constants/appErrorCode.js";

import AppError from "./errors/AppError.js";
import globalErrorHandler from "./middlewares/error.middleware.js";

import routes from "./routes/index.js";

const { APP_ORIGIN, NODE_ENV, COOKIE_SECRET } = envConfig;
const { OK, NOT_FOUND } = httpStatus;
const { ROUTE_NOT_FOUND } = appErrorCode;

const app = express();
const allowedOrigins = [APP_ORIGIN];

//* ==============================
//* EXPRESS CORE MIDDLEWARE
//* ==============================
app.use(
	cors({
		origin: allowedOrigins,
		credentials: true,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	}),
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser(COOKIE_SECRET));

//* ==============================
//* REQUEST LOGGER
//* ==============================
app.use((req, res, next) => {
	if (NODE_ENV === "development") {
		console.log(
			`Request Method: ${req.method}`,
			`URL: ${req.url}`,
			`Headers: ${JSON.stringify(req.headers)}`,
			`Body: ${JSON.stringify(req.body)}`,
		);
	}
	next();
});

//* ==============================
//* HEALTH CHECK & HOME ROUTE
//* ==============================
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

//* ==============================
//* API ROUTES
//* ==============================
app.use("/api", routes);

//* ==============================
//* 404 + GLOBAL ERROR HANDLER
//* ==============================
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

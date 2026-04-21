//* src/constants/env.js

import { config } from "dotenv";

// Load variables from `.env` (default path).
// If you keep secrets elsewhere, pass { path: "..." }.
config();

// Function to access env variables
const getEnv = (key) => {
	const value = process.env[key];

	if (value === undefined) {
		throw new Error(`Environment variable ${key} is not defined`);
	}

	return value;
};

const envConfig = Object.freeze({
	PORT: getEnv("PORT"),
	NODE_ENV: getEnv("NODE_ENV"),
	APP_ORIGIN: getEnv("APP_ORIGIN"),
	MONGODB_URI: getEnv("MONGODB_URI"),
	GOOGLE_CLIENT_ID: getEnv("GOOGLE_CLIENT_ID"),
	COOKIE_SECRET: getEnv("COOKIE_SECRET"),
	MAX_ALLOWED_DEVICES: getEnv("MAX_ALLOWED_DEVICES"),
	RESEND_API_KEY: getEnv("RESEND_API_KEY"),
	EMAIL_FROM: getEnv("EMAIL_FROM"),
});

export default envConfig;

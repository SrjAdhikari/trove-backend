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
	NODE_ENV: getEnv("NODE_ENV"),
	PORT: Number(getEnv("PORT")),
	APP_ORIGIN: getEnv("APP_ORIGIN"),
	MONGODB_URI: getEnv("MONGODB_URI"),
});

export default envConfig;

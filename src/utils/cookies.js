//* src/utils/cookies.js

import { SEVEN_DAYS_MS } from "./date.js";
import envConfig from "../constants/env.js";

const { NODE_ENV } = envConfig;
const isProd = NODE_ENV === "production";

const setAuthCookie = (res, sessionId) => {
	res.cookie("token", sessionId, {
		httpOnly: true,
		signed: true,
		sameSite: "lax",
		maxAge: SEVEN_DAYS_MS,
		secure: isProd,
	});
};

const clearAuthCookie = (res) => {
	res.clearCookie("token", {
		httpOnly: true,
		signed: true,
		sameSite: "lax",
		secure: isProd,
	});
};

export { setAuthCookie, clearAuthCookie };

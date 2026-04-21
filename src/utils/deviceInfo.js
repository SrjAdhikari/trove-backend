//* src/utils/deviceInfo.js

import { UAParser } from "ua-parser-js";

/**
 * Build the device metadata payload stored on each Session document.
 *
 * @param {import("express").Request} req - Incoming request whose headers and
 *   socket describe the originating device
 * @returns {{ userAgent: string, ipAddress: string, deviceType: string,
 *   browser: string, deviceOS: string }} Shape expected by the Session model
 */
const buildDeviceInfo = (req) => {
	const userAgent = req.headers["user-agent"] || "";
	const ipAddress =
		req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "Unknown";

	const parser = new UAParser(userAgent);
	const parsedUA = parser.getResult();

	return {
		userAgent,
		ipAddress,
		deviceType: parsedUA.device.type || "desktop",
		browser:
			`${parsedUA.browser.name || "Unknown"} ${parsedUA.browser.version || ""}`.trim(),
		deviceOS:
			`${parsedUA.os.name || "Unknown"} ${parsedUA.os.version || ""}`.trim(),
	};
};

export default buildDeviceInfo;

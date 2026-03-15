//* src/models/session.model.js

import mongoose from "mongoose";
import { sevenDaysFromNow } from "../utils/date.js";

const { Schema, model } = mongoose;
const sessionSchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		deviceInfo: {
			userAgent: String,
			ipAddress: String,
			deviceType: String,
			browser: String,
			location: String,
		},
		createdAt: {
			type: Date,
			required: true,
			default: Date.now,
		},
		expiresAt: {
			type: Date,
			required: true,
			default: sevenDaysFromNow,
		},
	},
	{
		strict: "throw",
	},
);

// Index for automatic session expiration (MongoDB will automatically delete expired sessions)
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = model("Session", sessionSchema);
export default Session;

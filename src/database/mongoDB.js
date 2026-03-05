//* src/database/mongoDB.js

import mongoose from "mongoose";
import envConfig from "../constants/env.js";

const { MONGODB_URI } = envConfig;

// Connect to MongoDB database
const connectToMongoDB = async () => {
	try {
		console.log("🔄️ Connecting to MongoDB...");
		await mongoose.connect(MONGODB_URI);
	} catch (error) {
		console.error(`❌ MongoDB connection failed: ${error.message}`);
		process.exit(1);
	}
};

// Graceful shutdown
const gracefulShutdown = async () => {
	await mongoose.disconnect();
	console.log("👋️ MongoDB connection closed");
	process.exit(0);
};

// Handle SIGINT (Ctrl+C) and SIGTERM (cloud providers stop)
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

export default connectToMongoDB;

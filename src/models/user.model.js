//* src/models/user.model.js

import mongoose from "mongoose";

const { Schema, model } = mongoose;
const userSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
			minlength: 3,
			maxlength: 50,
		},
		email: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
			match: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/,
			unique: true,
		},
		password: {
			type: String,
			required: true,
			minlength: 8,
			select: false,
		},
		rootDirId: {
			type: Schema.Types.ObjectId,
			ref: "Directory",
			required: true,
		},
	},
	{
		strict: "throw",
		timestamps: true,
	},
);

const User = model("User", userSchema);
export default User;

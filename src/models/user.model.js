//* src/models/user.model.js

import mongoose from "mongoose";
import bcrypt from "bcrypt";

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

// Encrypt password before saving to database
userSchema.pre("save", async function (next) {
	if (!this.isModified("password")) {
		return next();
	}

	const salt = await bcrypt.genSalt(10);
	this.password = await bcrypt.hash(this.password, salt);

	next();
});

// Compare incoming user password with hashed password
userSchema.methods.comparePassword = async function (userPassword) {
	return await bcrypt.compare(userPassword, this.password);
};

const User = model("User", userSchema);
export default User;

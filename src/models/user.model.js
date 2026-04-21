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
			required: function () {
				return this.provider === "email";
			},
			minlength: 8,
			select: false,
		},
		rootDirId: {
			type: Schema.Types.ObjectId,
			ref: "Directory",
		},
		profilePicture: {
			type: String,
			default: null,
		},
		provider: {
			type: String,
			enum: ["email", "google", "github"],
			default: "email",
			immutable: true,
		},
		otp: {
			type: String,
			select: false,
		},
		otpExpiresAt: {
			type: Date,
			select: false,
		},
		isVerified: {
			type: Boolean,
			default: false,
		},
		verificationExpiresAt: {
			type: Date,
			select: false,
		},
	},
	{
		strict: "throw",
		timestamps: true,
	},
);

userSchema.index({ verificationExpiresAt: 1 }, { expireAfterSeconds: 0 });

// Encrypt password before saving to database
userSchema.pre("save", async function () {
	if (!this.isModified("password")) return;

	const salt = await bcrypt.genSalt(10);
	this.password = await bcrypt.hash(this.password, salt);
});

// Compare incoming user password with hashed password
userSchema.methods.comparePassword = function (userPassword) {
	return bcrypt.compare(userPassword, this.password);
};

const User = model("User", userSchema);
export default User;

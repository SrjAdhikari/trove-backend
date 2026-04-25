//* src/models/file.model.js

import mongoose from "mongoose";

const { Schema, model } = mongoose;
const fileSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
			minlength: 3,
		},
		extension: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
		},
		size: {
			type: Number,
			required: true,
			min: 0,
		},
		parentDirId: {
			type: Schema.Types.ObjectId,
			ref: "Directory",
			required: true,
		},
		userId: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
	},
	{
		strict: "throw",
		timestamps: true,
	},
);

fileSchema.index({ parentDirId: 1, userId: 1 });

const File = model("File", fileSchema);
export default File;

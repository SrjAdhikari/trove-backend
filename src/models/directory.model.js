//* src/models/directory.model.js

import mongoose from "mongoose";

const { Schema, model } = mongoose;
const directorySchema = new Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
			minlength: 3,
			maxlength: 50,
		},
		parentDirId: {
			type: Schema.Types.ObjectId,
			ref: "Directory",
			default: null,
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

directorySchema.index({ parentDirId: 1, userId: 1 });

const Directory = model("Directory", directorySchema);
export default Directory;

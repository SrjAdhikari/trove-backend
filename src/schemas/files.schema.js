//* src/schemas/files.schema.js

const fileSchema = {
	$jsonSchema: {
		bsonType: "object",
		required: ["_id", "extension", "name", "parentDirId", "userId"],
		properties: {
			_id: {
				bsonType: "objectId",
				description: "_id must be a valid ObjectId",
			},
			extension: {
				bsonType: "string",
				pattern: "^[.][a-zA-Z0-9]+$",
				description:
					"File extension must be a valid string with leading dot (e.g. '.txt', '.png')",
			},
			name: {
				bsonType: "string",
				description: "File name must be a valid string",
			},
			parentDirId: {
				bsonType: "objectId",
				description:
					"File parentDirId must be a valid ObjectId referencing the parent directory",
			},
			userId: {
				bsonType: "objectId",
				description:
					"userId must be a valid ObjectId referencing the owner user",
			},
			createdAt: {
				bsonType: "date",
			},
			updatedAt: {
				bsonType: "date",
			},
			__v: {
				bsonType: "number",
			},
		},
		additionalProperties: false,
	},
};

export default fileSchema;

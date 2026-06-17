//* src/schemas/directories.schema.js

const directorySchema = {
	$jsonSchema: {
		bsonType: "object",
		required: ["_id", "name", "parentDirId", "userId"],
		properties: {
			_id: {
				bsonType: "objectId",
				description: "_id must be a valid ObjectId",
			},
			name: {
				bsonType: "string",
				minLength: 3,
				maxLength: 50,
				description:
					"Directory name must be a string between 3 and 50 characters",
			},
			parentDirId: {
				bsonType: ["objectId", "null"],
				description:
					"parentDirId must be a valid ObjectId or null if this is the root directory",
			},
			ancestorIds: {
				bsonType: "array",
				items: { bsonType: "objectId" },
				description:
					"Ordered ancestor directory IDs from root to immediate parent (empty for the root directory)",
			},
			userId: {
				bsonType: "objectId",
				description:
					"userId must be a valid ObjectId referencing the owner user",
			},
			size: {
				bsonType: "number",
				minimum: 0,
				description: "Total bytes of all files in this directory's subtree",
			},
			fileCount: {
				bsonType: "number",
				minimum: 0,
				description: "Total number of files in this directory's subtree",
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

export default directorySchema;

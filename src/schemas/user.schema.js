//* src/schemas/user.schema.js

const userSchema = {
	$jsonSchema: {
		bsonType: "object",
		required: ["_id", "name", "email", "password", "rootDirId"],
		properties: {
			_id: {
				bsonType: "objectId",
				description: "_id must be a valid ObjectId",
			},
			name: {
				bsonType: "string",
				minLength: 3,
				maxLength: 50,
				description: "User name must be a string between 3 and 50 characters",
			},
			email: {
				bsonType: "string",
				maxLength: 254,
				pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
				description: "Email must be a valid email address",
			},
			password: {
				bsonType: "string",
				minLength: 8,
				description: "Password must be at least 8 characters long",
			},
			rootDirId: {
				bsonType: "objectId",
				description: "rootDirId must be a valid ObjectId",
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

export default userSchema;

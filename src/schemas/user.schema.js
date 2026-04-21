//* src/schemas/user.schema.js

const userSchema = {
	$jsonSchema: {
		bsonType: "object",
		required: ["_id", "name", "email"],
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
			profilePicture: {
				bsonType: "string",
				description: "Profile picture must be a valid URL",
			},
			provider: {
				bsonType: "string",
				enum: ["email", "google", "github"],
				description: "Provider must be one of email, google, or github",
			},
			otp: {
				bsonType: "string",
			},
			otpExpiresAt: {
				bsonType: "date",
			},
			isVerified: {
				bsonType: "bool",
			},
			verificationExpiresAt: {
				bsonType: "date",
			},
			createdAt: {
				bsonType: "date",
			},
			updatedAt: {
				bsonType: "date",
			},
			__v: {
				bsonType: "int",
			},
		},
		additionalProperties: false,
	},
};

export default userSchema;

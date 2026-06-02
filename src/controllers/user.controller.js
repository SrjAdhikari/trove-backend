//* src/controllers/user.controller.js

import httpStatus from "../constants/httpStatus.js";
import {
	updateProfile,
	uploadProfilePicture,
	getProfilePicture,
} from "../services/user.service.js";
import { ONE_YEAR_SECONDS } from "../utils/date.js";

const { OK } = httpStatus;

const updateProfileHandler = async (req, res) => {
	const { name } = req.body;
	const userId = req.user._id;

	const user = await updateProfile(userId, name);

	res.status(OK).json({
		success: true,
		message: "Profile updated successfully",
		data: user,
	});
};

const uploadProfilePictureHandler = async (req, res) => {
	const userId = req.user._id;
	const updatedUser = await uploadProfilePicture(userId, req);

	res.status(OK).json({
		success: true,
		message: "Profile picture updated successfully",
		data: updatedUser,
	});
};

const getProfilePictureHandler = async (req, res, next) => {
	const userPictureId = req.params.id;
	const { filePath, mime } = await getProfilePicture(userPictureId);

	// Set appropriate headers for caching and content type before sending the file.
	res.type(mime);
	res.set("Cache-Control", `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
	res.set("X-Content-Type-Options", "nosniff");

	// On failure, drop the cache header so the error isn't cached, then forward.
	res.sendFile(filePath, (err) => {
		if (!err) return;
		if (!res.headersSent) res.removeHeader("Cache-Control");
		next(err);
	});
};

export {
	updateProfileHandler,
	uploadProfilePictureHandler,
	getProfilePictureHandler,
};

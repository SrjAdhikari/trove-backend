//* src/controllers/user.controller.js

import httpStatus from "../constants/httpStatus.js";
import { updateProfile } from "../services/user.service.js";

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

export { updateProfileHandler };

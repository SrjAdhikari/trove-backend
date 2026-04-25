//* src/utils/byteCounter.js

import { Transform } from "node:stream";

/**
 * Counts bytes passing through a stream and aborts the pipeline
 * when either the per-file cap or the remaining aggregate budget is exceeded.
 *
 * @param {number} perFileCap - Max bytes permitted for this single file.
 * @param {number} [remainingBudget=Infinity] - Optional aggregate-request budget.
 * @returns {{ stream: Transform, state: { bytes: number, tripped: boolean } }} - The stream and the state.
 */
const createByteCounter = (perFileCap, remainingBudget = Infinity) => {
	const state = { bytes: 0, tripped: false };

	const stream = new Transform({
		transform(chunk, _enc, cb) {
			state.bytes += chunk.length;
			if (state.bytes > perFileCap || state.bytes > remainingBudget) {
				state.tripped = true;
				return cb(new Error("byte cap exceeded"));
			}
			cb(null, chunk);
		},
	});

	return { stream, state };
};

export default createByteCounter;

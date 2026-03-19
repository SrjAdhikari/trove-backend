//* src/utils/date.js

export const ONE_MINUTE_MS = 60 * 1000;
export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const tenMinutesFromNow = () => new Date(Date.now() + TEN_MINUTES_MS);

const oneHourFromNow = () => new Date(Date.now() + ONE_HOUR_MS);

const sevenDaysFromNow = () => new Date(Date.now() + SEVEN_DAYS_MS);

export { tenMinutesFromNow, oneHourFromNow, sevenDaysFromNow };

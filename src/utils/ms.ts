type Time = `${`${number}y` | ""}${TimeMonth}`;
type TimeMonth = `${`${number}mo` | ""}${TimeDay}`;
type TimeDay = `${`${number}d` | ""}${TimeHour}`;
type TimeHour = `${`${number}h` | ""}${TimeMinute}`;
type TimeMinute = `${`${number}m` | ""}${TimeSecond}`;
type TimeSecond = `${`${number}s` | ""}${TimeMillisecond}`;
type TimeMillisecond = `${number}ms` | "";
const second = 1000;
const minute = second * 60;
const hour = minute * 60;
const day = hour * 24;
const month = day * 30;
const year = day * 365;
const numRe = String(/ *(-?(?:\d+(?:\.\d+)?|\.\d+)) */).slice(1, -1);
const timeRe = new RegExp(
	`(?:${numRe}y)?(?:${numRe}mo)?(?:${numRe}d)?(?:${numRe}h)?(?:${numRe}m)?(?:${numRe}s)?(?:${numRe}ms)?`
);

export function ms(time: Time): number {
	const [
		_fullMatch,
		years,
		months,
		days,
		hours,
		minutes,
		seconds,
		milliseconds
	] = time.match(timeRe) ?? [];

	const ms =
		Number(years ?? 0) * year +
		Number(months ?? 0) * month +
		Number(days ?? 0) * day +
		Number(hours ?? 0) * hour +
		Number(minutes ?? 0) * minute +
		Number(seconds ?? 0) * second +
		Number(milliseconds ?? 0);
	return isNaN(ms) ? 0 : ms;
}

ms("-1d");

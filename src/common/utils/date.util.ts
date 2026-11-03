/** The fair runs in Bangladesh, so calendar dates are judged in Dhaka time. */
export const FAIR_TIME_ZONE = 'Asia/Dhaka';

/** Today's date in Dhaka as YYYY-MM-DD. */
export function todayInDhaka(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FAIR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** True while a YYYY-MM-DD deadline has not passed (the deadline day itself counts). */
export function isOnOrBeforeDeadline(
  deadline: string,
  now: Date = new Date(),
): boolean {
  return todayInDhaka(now) <= deadline;
}

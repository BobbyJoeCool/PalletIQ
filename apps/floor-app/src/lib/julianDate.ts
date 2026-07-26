/**
 * Returns a batch date string in Julian date format (BD YYDDD).
 * Used in the footer's live clock and on label generation as a date stamp.
 * Example: June 29 2026 → "BD 26180" (year 26, day 180 of 2026).
 *
 * @param date - The date to format (defaults to today)
 * @returns Formatted batch date string like "BD 26180"
 */
export function getBatchDate(date: Date = new Date()): string {
  const year = date.getFullYear() % 100;
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const day = Math.floor(diff / 86_400_000);
  const yy = String(year).padStart(2, '0');
  const ddd = String(day).padStart(3, '0');
  return `BD ${yy}${ddd}`;
}

/**
 * Returns a human-readable date string for the footer's live clock.
 *
 * @param date - The date to format (defaults to today)
 * @returns Formatted string like "June 29"
 */
export function getDisplayDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

/**
 * Returns a human-readable 12-hour time string for the footer's live clock.
 *
 * @param date - The date to format (defaults to now)
 * @returns Formatted string like "2:45 PM"
 */
export function getDisplayTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

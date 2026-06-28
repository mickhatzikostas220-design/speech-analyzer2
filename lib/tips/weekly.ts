// Deterministic "tip of the week": every user sees the same tip during a given
// ISO week, and it rotates once a week through the library.
import { TIPS, type Tip } from './library';

function isoWeekNumber(date: Date): number {
  // ISO-8601 week number — stable, rolls over once per week.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
    );
  return week;
}

export function weeklyTip(now: Date = new Date()): Tip {
  // Mix in the year so it doesn't repeat the exact same order every 18 weeks
  // on a year boundary.
  const index = (isoWeekNumber(now) + now.getUTCFullYear()) % TIPS.length;
  return TIPS[index]!;
}

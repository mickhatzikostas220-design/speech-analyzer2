/**
 * Minimal iCalendar (.ics) reader — no dependencies. Lets a speaker
 * connect any calendar app (Google / Outlook / Apple all publish a
 * secret iCal URL) so their bookings show up under "Upcoming gigs".
 *
 * Best-effort: returns [] on any fetch/parse failure so the hub never
 * breaks on a bad feed.
 */
export interface IcsEvent {
  title: string;
  location?: string;
  startsAt: string; // ISO
}

/** Accept https/http and webcal:// (what calendar apps hand out). */
export function normalizeIcsUrl(input: string): string {
  const trimmed = (input || '').trim();
  return trimmed.replace(/^webcal:\/\//i, 'https://');
}

function unfold(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseIcsDate(value: string): string | null {
  // 20260618 | 20260618T090000 | 20260618T090000Z
  const m = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
  // Times without explicit offset are treated as UTC (close enough for a
  // "what's coming up" list; we only show date + city, not exact tz math).
  const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function parseIcs(raw: string): IcsEvent[] {
  const lines = unfold(raw);
  const events: IcsEvent[] = [];
  let cur: Partial<IcsEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
    } else if (line === 'END:VEVENT') {
      if (cur?.title && cur.startsAt) events.push(cur as IcsEvent);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const name = line.slice(0, idx).split(';')[0].toUpperCase();
      const value = line.slice(idx + 1);
      if (name === 'SUMMARY') cur.title = unescapeText(value);
      else if (name === 'LOCATION') cur.location = unescapeText(value);
      else if (name === 'DTSTART') {
        const iso = parseIcsDate(value);
        if (iso) cur.startsAt = iso;
      }
    }
  }
  return events;
}

export async function fetchIcsEvents(url: string): Promise<IcsEvent[]> {
  const httpUrl = normalizeIcsUrl(url);
  if (!/^https?:\/\//i.test(httpUrl)) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(httpUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/calendar,text/plain,*/*',
      },
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) return [];
    return parseIcs(text);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

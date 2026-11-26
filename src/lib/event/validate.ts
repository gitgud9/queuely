import type { EventInfo, Place, Session } from "./types";

/** Limits keep the AI prompt small (and cheap) and stop junk getting saved. */
export const LIMITS = { places: 40, sessions: 60, faq: 30, short: 120, long: 400 };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(v: unknown, field: string, max: number, required = true): string {
  if (v === undefined || v === null || v === "") {
    if (required) throw new Error(`${field} is required`);
    return "";
  }
  if (typeof v !== "string") throw new Error(`${field} must be text`);
  const s = v.trim();
  if (required && !s) throw new Error(`${field} is required`);
  if (s.length > max) throw new Error(`${field} is too long (max ${max} characters)`);
  return s;
}

function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check event info sent from the Staff Portal. Returns a clean copy (trimmed,
 * empty optional fields dropped, schedule sorted by start time) or an error
 * message a staff member can act on.
 */
export function validateEventInfo(input: unknown): EventInfo | string {
  try {
    const o = (input ?? {}) as Record<string, unknown>;
    const list = (v: unknown, field: string, max: number) => {
      if (!Array.isArray(v)) throw new Error(`${field} must be a list`);
      if (v.length > max) throw new Error(`Too many ${field} (max ${max})`);
      return v as Record<string, unknown>[];
    };

    const timeZone = text(o.timeZone, "Time zone", 60);
    if (!validTimeZone(timeZone)) throw new Error(`Unknown time zone "${timeZone}" (use a name like Asia/Singapore)`);

    const places: Place[] = list(o.places, "places", LIMITS.places).map((p, i) => {
      const n = `Place ${i + 1}`;
      const place: Place = { name: text(p?.name, `${n} name`, LIMITS.short), where: text(p?.where, `${n} location`, LIMITS.long) };
      const notes = text(p?.notes, `${n} notes`, LIMITS.long, false);
      const boothId = text(p?.boothId, `${n} booth`, 40, false);
      if (notes) place.notes = notes;
      if (boothId) place.boothId = boothId;
      return place;
    });

    const schedule: Session[] = list(o.schedule, "sessions", LIMITS.sessions)
      .map((s, i) => {
        const n = `Session ${i + 1}`;
        const start = text(s?.start, `${n} start`, 5);
        const end = text(s?.end, `${n} end`, 5);
        if (!TIME.test(start) || !TIME.test(end)) throw new Error(`${n}: times must be 24-hour HH:MM, like 15:00`);
        if (end <= start) throw new Error(`${n}: the end time must be after the start time`);
        return { start, end, title: text(s?.title, `${n} title`, LIMITS.short), where: text(s?.where, `${n} place`, LIMITS.short) };
      })
      .sort((a, b) => a.start.localeCompare(b.start));

    const faqRaw = o.faq;
    if (!Array.isArray(faqRaw)) throw new Error("FAQ must be a list");
    const faq = faqRaw.map((f, i) => text(f, `FAQ line ${i + 1}`, LIMITS.long, false)).filter(Boolean);
    if (faq.length > LIMITS.faq) throw new Error(`Too many FAQ lines (max ${LIMITS.faq})`);

    return {
      name: text(o.name, "Event name", LIMITS.short),
      date: text(o.date, "Date and hours", LIMITS.short),
      venue: text(o.venue, "Venue", LIMITS.short),
      timeZone,
      places,
      schedule,
      faq,
    };
  } catch (e) {
    return (e as Error).message;
  }
}

import { DEFAULT_EVENT } from "../event/defaults";
import type { EventInfo } from "../event/types";

/**
 * Helpers for the event info the assistant answers from. The info itself is
 * stored in the database and edited by staff in the Staff Portal
 * (see src/lib/event). DEFAULT_EVENT is the sample used until then.
 */
export type { EventInfo, Place, Session } from "../event/types";

/** The sample event (kept under this name for tests and the quick answers' defaults). */
export const EVENT = DEFAULT_EVENT;
export const EVENT_TIME_ZONE = DEFAULT_EVENT.timeZone;

/** "HH:MM" -> minutes since midnight. */
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Current local time at the event as "HH:MM". */
export function eventClock(now: number, timeZone = EVENT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(now);
}

/** Text block for the system prompt. Stable, so it can be prompt-cached. */
export function eventInfoText(event: EventInfo = EVENT): string {
  const places = event.places.map((p) => `- ${p.name}: ${p.where}${p.notes ? ` (${p.notes})` : ""}`).join("\n");
  const faq = event.faq.map((f) => `- ${f}`).join("\n");
  return `Event: ${event.name}\nWhen: ${event.date}\nVenue: ${event.venue}\n\nPlaces:\n${places}\n\nFAQ:\n${faq}`;
}

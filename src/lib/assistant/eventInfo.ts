/**
 * Sample event information the assistant answers from. In a real event this
 * would come from a CMS or a spreadsheet the organisers edit; here it is a
 * small, typed constant so it is easy to read, test and change.
 */

export const EVENT_TIME_ZONE = "Asia/Singapore";

export interface Place {
  name: string;
  where: string;
  boothId?: string; // links to a Queuely booth with a live queue
  notes?: string;
}

export interface Session {
  start: string; // "HH:MM", event local time
  end: string;
  title: string;
  where: string;
}

export const EVENT = {
  name: "Queuely Demo Festival",
  date: "Sample event day, 10:00 to 18:00",
  venue: "Exhibition Hall A and B",
  places: [
    { name: "VR Experience", where: "Hall A, booth A3, next to the main stage", boothId: "vr", notes: "Ages 8 and up. Not suitable if you are prone to motion sickness." },
    { name: "Gaming Arena", where: "Hall A, booths A6 to A8, far end of the hall", boothId: "gaming", notes: "Head-to-head matches on four consoles." },
    { name: "Photo Booth", where: "Hall B entrance, on the left", boothId: "photo", notes: "Free printed souvenir photo." },
    { name: "Main Stage", where: "Hall A, centre" },
    { name: "AI Corner", where: "Hall B, booth B4", notes: "Talk to AI demos, no queue." },
    { name: "Food court", where: "Between Hall A and Hall B" },
    { name: "Toilets", where: "Behind the food court, and at the Hall B exit" },
    { name: "First aid", where: "Info counter at the Hall A entrance" },
    { name: "Info counter and lost and found", where: "Hall A entrance" },
  ] satisfies Place[],
  schedule: [
    { start: "10:00", end: "10:30", title: "Opening ceremony", where: "Main Stage" },
    { start: "11:00", end: "12:00", title: "Gaming tournament: qualifiers", where: "Gaming Arena" },
    { start: "12:30", end: "13:00", title: "Live band performance", where: "Main Stage" },
    { start: "13:30", end: "14:00", title: "How AI helps run big events (talk)", where: "AI Corner" },
    { start: "14:30", end: "15:30", title: "Gaming tournament: finals", where: "Main Stage" },
    { start: "15:00", end: "15:30", title: "VR speed challenge", where: "VR Experience" },
    { start: "16:00", end: "16:30", title: "Lucky draw", where: "Main Stage" },
    { start: "17:30", end: "18:00", title: "Closing and prize giving", where: "Main Stage" },
  ] satisfies Session[],
  faq: [
    "Entry is free. No ticket is needed for the festival itself.",
    "Queues for VR, Gaming and Photo are virtual: scan the booth's QR code or tap Join queue on the home page, then walk around until your phone buzzes.",
    "You can hold one place per booth. Leaving a queue frees your place for someone else.",
    "Strollers and wheelchairs are welcome everywhere. Priority queueing is available at the info counter.",
  ],
};

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
export function eventInfoText(): string {
  const places = EVENT.places.map((p) => `- ${p.name}: ${p.where}${p.notes ? ` (${p.notes})` : ""}`).join("\n");
  const faq = EVENT.faq.map((f) => `- ${f}`).join("\n");
  return `Event: ${EVENT.name}\nWhen: ${EVENT.date}\nVenue: ${EVENT.venue}\n\nPlaces:\n${places}\n\nFAQ:\n${faq}`;
}

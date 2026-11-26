/**
 * Everything event-specific the assistant knows: where things are, the
 * programme and the FAQ. Swap this (in the Staff Portal) and the same app works
 * for any event. Live queue numbers come from the booths, not from here.
 */
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

export interface EventInfo {
  name: string;
  date: string; // free text, e.g. "Sat 6 Dec, 10:00 to 18:00"
  venue: string;
  timeZone: string; // IANA name, e.g. "Asia/Singapore"
  places: Place[];
  schedule: Session[];
  faq: string[];
}

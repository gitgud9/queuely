import type { EventInfo } from "./types";

/** The sample event. Used as the starting copy in the database, and whenever the database has none. */
export const DEFAULT_EVENT: EventInfo = {
  timeZone: "Asia/Singapore",
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
  ],
  schedule: [
    { start: "10:00", end: "10:30", title: "Opening ceremony", where: "Main Stage" },
    { start: "11:00", end: "12:00", title: "Gaming tournament: qualifiers", where: "Gaming Arena" },
    { start: "12:30", end: "13:00", title: "Live band performance", where: "Main Stage" },
    { start: "13:30", end: "14:00", title: "How AI helps run big events (talk)", where: "AI Corner" },
    { start: "14:30", end: "15:30", title: "Gaming tournament: finals", where: "Main Stage" },
    { start: "15:00", end: "15:30", title: "VR speed challenge", where: "VR Experience" },
    { start: "16:00", end: "16:30", title: "Lucky draw", where: "Main Stage" },
    { start: "17:30", end: "18:00", title: "Closing and prize giving", where: "Main Stage" },
  ],
  faq: [
    "Entry is free. No ticket is needed for the festival itself.",
    "Queues for VR, Gaming and Photo are virtual: scan the booth's QR code or tap Join queue on the home page, then walk around until your phone buzzes.",
    "You can hold one place per booth. Leaving a queue frees your place for someone else.",
    "Strollers and wheelchairs are welcome everywhere. Priority queueing is available at the info counter.",
  ],
};

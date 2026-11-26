import type { QueueStore } from "../store/types";
import type { AssistantResult } from "./common";
import { EVENT, toMinutes } from "./eventInfo";
import { getLiveQueues, getSchedule } from "./tools";

/**
 * Built-in answers with no AI at all: simple keyword matching over the same
 * live data the AI tools use. It costs nothing and never hits a rate limit, so
 * the chat keeps working when no AI key is set or the free quota runs out.
 */

const BOOTH_WORDS: Record<string, RegExp> = {
  vr: /\bvr\b|virtual/,
  gaming: /gam(e|ing)|console|arena/,
  photo: /photo|picture|selfie/,
};

const PLACE_WORDS: { re: RegExp; place: string }[] = [
  { re: /toilet|restroom|bathroom|washroom|loo/, place: "Toilets" },
  { re: /food|eat|drink|hungry|lunch/, place: "Food court" },
  { re: /first aid|medical|hurt|injur/, place: "First aid" },
  { re: /lost|info|help desk|counter/, place: "Info counter and lost and found" },
  { re: /stage/, place: "Main Stage" },
  { re: /\bai\b|robot/, place: "AI Corner" },
];

const HELP =
  "I can tell you the live wait at each booth (try \"which queue is shortest?\"), where things are (\"where's the VR booth?\"), and what's on (\"what's on at 3pm?\").";

/** "3pm", "3:30 pm", "15:00" -> "HH:MM", or null. */
export function parseTime(q: string): string | null {
  const m = q.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ?? q.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export async function quickAnswer(question: string, store: QueueStore, now: number): Promise<AssistantResult> {
  const q = question.toLowerCase();
  const booth = Object.keys(BOOTH_WORDS).find((id) => BOOTH_WORDS[id].test(q));
  const reply = (text: string, toolsUsed: string[] = []): AssistantResult => ({ reply: text, toolsUsed, source: "quick" });

  // "Where is ...?"
  if (/\bwhere\b|location|find|how do i get/.test(q)) {
    const place = booth
      ? EVENT.places.find((p) => p.boothId === booth)
      : EVENT.places.find((p) => PLACE_WORDS.some((w) => w.place === p.name && w.re.test(q)));
    if (place) return reply(`${place.name}: ${place.where}.${place.notes ? ` ${place.notes}` : ""}`);
    return reply("I'm not sure where that is. The info counter at the Hall A entrance can help.");
  }

  // "What's on ...?"
  const at = parseTime(q);
  if (at || /what'?s on|schedule|programme|program|happening|event|show|perform/.test(q)) {
    const s = getSchedule(now);
    if (at) {
      const t = toMinutes(at);
      const on = EVENT.schedule.filter((x) => toMinutes(x.start) <= t && t < toMinutes(x.end));
      const next = EVENT.schedule.find((x) => toMinutes(x.start) > t);
      if (on.length) return reply(`At ${at}: ${on.map((x) => `${x.title} (${x.where}, ${x.start} to ${x.end})`).join("; ")}.`, ["get_schedule"]);
      return reply(`Nothing is scheduled at ${at}.${next ? ` Next up is ${next.title} at ${next.start} (${next.where}).` : ""}`, ["get_schedule"]);
    }
    const on = s.sessions.filter((x) => x.status === "on now");
    const next = s.sessions.find((x) => x.status === "upcoming");
    const parts = [`It's ${s.currentEventTime} now.`];
    parts.push(on.length ? `On now: ${on.map((x) => `${x.title} (${x.where})`).join("; ")}.` : "Nothing is on right this minute.");
    if (next) parts.push(`Next: ${next.title} at ${next.start} (${next.where}).`);
    return reply(parts.join(" "), ["get_schedule"]);
  }

  // Queues and waits
  if (booth || /queue|line|wait|short|quick|fast|busy|crowd|long/.test(q)) {
    const { booths } = await getLiveQueues(store, now, booth);
    if (booth) {
      const b = booths[0];
      if (!b.open) return reply(`${b.name} is paused and not taking new joins right now.`, ["get_live_queues"]);
      return reply(
        `${b.name}: ${b.waiting} waiting, wait ${b.estimatedWait.toLowerCase()}. It's at ${b.location}. Join from the home page or scan the booth's QR code.`,
        ["get_live_queues"],
      );
    }
    const open = booths.filter((b) => b.open);
    if (!open.length) return reply("All booths are paused right now. Check back in a few minutes.", ["get_live_queues"]);
    const best = open[0];
    const others = booths.slice(1).map((b) => `${b.name} ${b.open ? b.estimatedWait.toLowerCase() : "paused"}`);
    return reply(
      `${best.name} has the shortest wait: ${best.estimatedWait.toLowerCase()} (${best.waiting} waiting), at ${best.location}.${others.length ? ` Others: ${others.join(", ")}.` : ""}`,
      ["get_live_queues"],
    );
  }

  if (/^(hi|hello|hey|yo)\b/.test(q.trim())) return reply(`Hi! ${HELP}`);
  return reply(`Sorry, I can only answer simple questions right now. ${HELP}`);
}


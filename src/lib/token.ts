import { createHmac, timingSafeEqual } from "node:crypto";
import { storeMode } from "./store";

/**
 * A visitor proves they own a ticket with a token = HMAC(secret, booth:number:joinedAt).
 * Nothing secret is stored in the database, so the whole queue state can be
 * public (and pushed to every screen in real time) without letting anyone
 * cancel someone else's ticket.
 */
function secret() {
  const s = process.env.TICKET_SECRET;
  if (!s && process.env.NODE_ENV === "production" && storeMode() === "supabase") {
    throw new Error("TICKET_SECRET must be set in production");
  }
  return s || "dev-only-secret";
}

/** joinedAt is part of the token so a ticket from before a queue reset can't touch a new ticket with the same number. */
export function ticketToken(boothId: string, number: number, joinedAt: number): string {
  return createHmac("sha256", secret()).update(`${boothId}:${number}:${joinedAt}`).digest("base64url").slice(0, 22);
}

export function verifyTicketToken(boothId: string, number: number, joinedAt: number, token: string): boolean {
  const expected = Buffer.from(ticketToken(boothId, number, joinedAt));
  const given = Buffer.from(String(token));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function checkStaffPin(pin: string | null): boolean {
  const expected = process.env.STAFF_PIN || "1234";
  const a = Buffer.from(expected);
  const b = Buffer.from(pin ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

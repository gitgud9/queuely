import { describe, expect, it } from "vitest";
import { checkStaffPin, ticketToken, verifyTicketToken } from "@/lib/token";

describe("ticket tokens", () => {
  it("verifies the token for the same ticket only", () => {
    const t = ticketToken("vr", 5, 1000);
    expect(verifyTicketToken("vr", 5, 1000, t)).toBe(true);
    expect(verifyTicketToken("vr", 6, 1000, t)).toBe(false);
    expect(verifyTicketToken("gaming", 5, 1000, t)).toBe(false);
    expect(verifyTicketToken("vr", 5, 2000, t)).toBe(false); // same number after a reset
    expect(verifyTicketToken("vr", 5, 1000, "nope")).toBe(false);
  });

  it("checks the staff PIN", () => {
    expect(checkStaffPin("1234")).toBe(true);
    expect(checkStaffPin("0000")).toBe(false);
    expect(checkStaffPin(null)).toBe(false);
  });
});

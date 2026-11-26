import type { Metadata } from "next";
import { DEFAULT_BOOTHS } from "@/lib/booths";
import { StaffPortal } from "./StaffPortal";

export const metadata: Metadata = { title: "Staff Portal · Queuely", robots: { index: false } };

export default function Page() {
  return (
    <StaffPortal booths={DEFAULT_BOOTHS.map(({ id, name }) => ({ id, name }))} demo={!process.env.STAFF_PIN} />
  );
}

import type { BoothConfig } from "./types";

/** Booths created automatically the first time the app starts. */
export const DEFAULT_BOOTHS: BoothConfig[] = [
  {
    id: "vr",
    name: "VR Experience",
    prefix: "VR",
    description: "Step into virtual reality. Two headsets, about 4 minutes each.",
    capacity: 2,
    defaultServiceSec: 240,
  },
  {
    id: "gaming",
    name: "Gaming Arena",
    prefix: "GA",
    description: "Four consoles, head-to-head matches of about 5 minutes.",
    capacity: 4,
    defaultServiceSec: 300,
  },
  {
    id: "photo",
    name: "Photo Booth",
    prefix: "PB",
    description: "Snap a souvenir photo. Quick, about 90 seconds.",
    capacity: 1,
    defaultServiceSec: 90,
  },
];

import type { Metadata } from "next";
import { Chat } from "./Chat";

export const metadata: Metadata = { title: "Ask the assistant · Queuely" };

export default function AssistantPage() {
  return <Chat />;
}

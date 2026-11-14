import type { Metadata } from "next";
import { LiveRoom } from "@/components/live-room";
import { isMock } from "@/lib/mock";

export const metadata: Metadata = { title: "Live Room" };
export const dynamic = "force-dynamic";

export default function LivePage() {
  return <LiveRoom demo={isMock()} />;
}

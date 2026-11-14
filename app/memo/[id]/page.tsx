import type { Metadata } from "next";
import SavedMemo from "@/components/SavedMemo";

export const metadata: Metadata = { title: "Research memo | Proven" };

export default async function MemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SavedMemo key={id} id={id} />;
}

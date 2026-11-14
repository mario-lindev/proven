import { isMock } from "@/lib/mock";
import { Diligence } from "@/components/diligence";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Diligence demo={isMock()} />;
}

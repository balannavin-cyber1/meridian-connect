import { useSymbol } from "@/contexts/SymbolContext";
import { useMvData } from "@/marketview/state";
import { PageTitle } from "@/marketview/ui";
import { SnapshotStrip, IctSection, SignalsSection } from "@/marketview/sections";

export default function Structure() {
  const { symbol } = useSymbol();
  const s = useMvData(symbol);
  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-7 py-6">
      <PageTitle title="Structure & Signals"
        subtitle="ICT zones near spot · today's live signal stream" />
      <SnapshotStrip s={s} />
      <IctSection s={s} />
      <SignalsSection s={s} />
    </div>
  );
}

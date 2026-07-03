import { useSymbol } from "@/contexts/SymbolContext";
import { useMvData } from "@/marketview/state";
import { PageTitle } from "@/marketview/ui";
import { SnapshotStrip, BreadthVolSection } from "@/marketview/sections";

export default function Breadth() {
  const { symbol } = useSymbol();
  const s = useMvData(symbol);
  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-7 py-6">
      <PageTitle title="Breadth & Volatility"
        subtitle="weighted breadth · A/D · India VIX · IV skew" />
      <SnapshotStrip s={s} />
      <BreadthVolSection s={s} />
    </div>
  );
}

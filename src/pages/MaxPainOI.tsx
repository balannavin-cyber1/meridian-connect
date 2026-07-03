import { useSymbol } from "@/contexts/SymbolContext";
import { useMvData } from "@/marketview/state";
import { PageTitle } from "@/marketview/ui";
import { SnapshotStrip, MaxPainSection } from "@/marketview/sections";

export default function MaxPainOI() {
  const { symbol } = useSymbol();
  const s = useMvData(symbol);
  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-7 py-6">
      <PageTitle title="Max Pain & OI"
        subtitle="option writer pain landscape · windowed to ±20 strikes around ATM" />
      <SnapshotStrip s={s} />
      <MaxPainSection s={s} windowStrikes={20} />
    </div>
  );
}

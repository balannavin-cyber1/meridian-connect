import { useSymbol } from "@/contexts/SymbolContext";
import { useMvData } from "@/marketview/state";
import { PageTitle } from "@/marketview/ui";
import {
  SnapshotStrip, KeyParametersSection, PositioningSection, NetDealerGammaSection,
  PinRiskRowSection, PinRiskTimelineSection,
} from "@/marketview/sections";

export default function Positioning() {
  const { symbol } = useSymbol();
  const s = useMvData(symbol);
  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-7 py-6">
      <PageTitle title="Positioning" subtitle="dealer gamma landscape · pin zones · flip levels" />
      <SnapshotStrip s={s} />
      <KeyParametersSection s={s} />
      <PositioningSection s={s} />
      <NetDealerGammaSection s={s} />
      <PinRiskRowSection s={s} />
      <PinRiskTimelineSection s={s} />
    </div>
  );
}

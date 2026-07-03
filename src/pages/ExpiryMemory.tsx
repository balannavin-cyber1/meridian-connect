import { useSymbol } from "@/contexts/SymbolContext";
import { useMvData } from "@/marketview/state";
import { MV, PageTitle, Card, SectionLabel, Unavailable, fmtNum, fmtPct } from "@/marketview/ui";
import { SnapshotStrip } from "@/marketview/sections";
import { useAmbient, useExpiryBaseRates, useExpiryOutcomes } from "@/lib/queries";

function BaseRatesTable({ ambientRegime, lensAlignment }: { ambientRegime: string | null | undefined; lensAlignment: string | null | undefined }) {
  const rates = useExpiryBaseRates(ambientRegime, lensAlignment);
  const rows = (rates.data ?? []) as any[];
  return (
    <Card title="Base Rates"
      subtitle={ambientRegime && lensAlignment ? `${ambientRegime} · ${lensAlignment}` : "no current ambient"}>
      {rows.length === 0 ? <Unavailable label="insufficient historical base rate" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]" style={{ fontFamily: MV.mono }}>
            <thead>
              <tr style={{ color: MV.weak }}>
                <th className="py-1 text-left font-semibold uppercase tracking-[0.08em]">Expiry type</th>
                <th className="py-1 text-right font-semibold uppercase tracking-[0.08em]">Pin %</th>
                <th className="py-1 text-right font-semibold uppercase tracking-[0.08em]">Broke ↑ %</th>
                <th className="py-1 text-right font-semibold uppercase tracking-[0.08em]">Broke ↓ %</th>
                <th className="py-1 text-right font-semibold uppercase tracking-[0.08em]">Dominant</th>
                <th className="py-1 text-right font-semibold uppercase tracking-[0.08em]">n</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t" style={{ borderColor: MV.border }}>
                  <td className="py-1.5 font-semibold" style={{ color: MV.strong }}>{r.expiry_type ?? "—"}</td>
                  <td className="py-1.5 text-right" style={{ color: MV.purple }}>{fmtNum(r.pinned_pct, { maximumFractionDigits: 1 })}%</td>
                  <td className="py-1.5 text-right" style={{ color: MV.green }}>{fmtNum(r.broke_up_pct, { maximumFractionDigits: 1 })}%</td>
                  <td className="py-1.5 text-right" style={{ color: MV.red }}>{fmtNum(r.broke_down_pct, { maximumFractionDigits: 1 })}%</td>
                  <td className="py-1.5 text-right" style={{ color: MV.mid }}>{r.dominant_break ?? "—"}</td>
                  <td className="py-1.5 text-right" style={{ color: MV.weak }}>{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function OutcomesTable({ symbol }: { symbol: "NIFTY" | "SENSEX" }) {
  const outcomes = useExpiryOutcomes(symbol, 20);
  const rows = (outcomes.data ?? []) as any[];
  return (
    <Card title="Recent Expiry Outcomes" subtitle="most recent first">
      {rows.length === 0 ? <Unavailable label="no outcome history" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]" style={{ fontFamily: MV.mono }}>
            <thead>
              <tr style={{ color: MV.weak }}>
                <th className="py-1 text-left font-semibold uppercase tracking-[0.08em]">Date</th>
                <th className="py-1 text-left font-semibold uppercase tracking-[0.08em]">Type</th>
                <th className="py-1 text-right font-semibold uppercase tracking-[0.08em]">Ambient</th>
                <th className="py-1 text-right font-semibold uppercase tracking-[0.08em]">Alignment</th>
                <th className="py-1 text-right font-semibold uppercase tracking-[0.08em]">Outcome</th>
                <th className="py-1 text-right font-semibold uppercase tracking-[0.08em]">Move %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const outcome = String(r.outcome ?? r.result ?? "").toUpperCase();
                const color = outcome.includes("PIN") ? MV.purple
                  : outcome.includes("UP") ? MV.green
                  : outcome.includes("DOWN") ? MV.red : MV.mid;
                const move = r.move_pct ?? r.pct_move ?? null;
                return (
                  <tr key={i} className="border-t" style={{ borderColor: MV.border }}>
                    <td className="py-1.5" style={{ color: MV.strong }}>{r.expiry_date ?? "—"}</td>
                    <td className="py-1.5" style={{ color: MV.mid }}>{r.expiry_type ?? "—"}</td>
                    <td className="py-1.5 text-right" style={{ color: MV.mid }}>{r.ambient_regime ?? "—"}</td>
                    <td className="py-1.5 text-right" style={{ color: MV.mid }}>{r.lens_alignment ?? "—"}</td>
                    <td className="py-1.5 text-right font-semibold" style={{ color }}>{outcome || "—"}</td>
                    <td className="py-1.5 text-right" style={{ color: (move ?? 0) >= 0 ? MV.green : MV.red }}>{move != null ? fmtPct(Number(move)) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function ExpiryMemory() {
  const { symbol } = useSymbol();
  const s = useMvData(symbol);
  const amb = useAmbient(symbol);
  const a: any = amb.data ?? null;
  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-7 py-6">
      <PageTitle title="Expiry Memory"
        subtitle="what typically happens on expiry given current ambient regime and lens alignment" />
      <SnapshotStrip s={s} />
      <SectionLabel>Historical base rates by (ambient_regime × lens_alignment)</SectionLabel>
      <BaseRatesTable ambientRegime={a?.ambient_regime} lensAlignment={a?.lens_alignment} />
      <SectionLabel>Recent expiries</SectionLabel>
      <OutcomesTable symbol={symbol} />
    </div>
  );
}

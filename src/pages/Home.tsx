import { useMemo, useState } from "react";
import { useSymbol } from "@/contexts/SymbolContext";
import { useMvData } from "@/marketview/state";
import {
  MV, Card, Scalar, SectionLabel, PageTitle, Unavailable, fmtNum, fmtSigned, fmtPct,
} from "@/marketview/ui";
import {
  SnapshotStrip, KeyParametersSection, NetDealerGammaSection,
} from "@/marketview/sections";
import { useAmbient, useExpiryBaseRates, useExpiryOutcomes } from "@/lib/queries";
import { NarrativeModal } from "@/components/NarrativeModal";

// ---------- Ambient verdict card ----------
function AmbientVerdict({ symbol }: { symbol: "NIFTY" | "SENSEX" }) {
  const amb = useAmbient(symbol);
  const a: any = amb.data ?? null;
  const regime = a?.ambient_regime ?? null;
  const alignment = a?.lens_alignment ?? null;
  const note = a?.regime_conditional_note ?? null;
  const regimeColor =
    regime === "RISK_ON" ? MV.green :
    regime === "RISK_OFF" ? MV.red :
    regime === "NEUTRAL" || regime === "MIXED" ? MV.amber : MV.mid;
  const alignColor =
    alignment === "ALIGNED" ? MV.green :
    alignment === "MIXED" ? MV.amber :
    alignment === "DIVERGENT" ? MV.red : MV.weak;
  return (
    <Card title="Ambient Verdict" subtitle={a?.for_session_date ? `session ${a.for_session_date}` : undefined}>
      {a ? (
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: MV.weak }}>Regime</div>
            <div className="mt-1 text-[36px] font-bold leading-none" style={{ color: regimeColor, fontFamily: MV.mono }}>
              {regime ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: MV.weak }}>Lens Alignment</div>
            <div className="mt-1">
              <span className="inline-flex items-center rounded px-2 py-1 text-[13px] font-bold"
                style={{ background: alignColor + "22", color: alignColor, fontFamily: MV.mono }}>
                {alignment ?? "—"}
              </span>
            </div>
          </div>
          {note && (
            <p className="max-w-[560px] flex-1 text-[12px] leading-relaxed" style={{ color: MV.mid }}>
              {note}
            </p>
          )}
        </div>
      ) : (
        <Unavailable label="ambient snapshot not published" />
      )}
    </Card>
  );
}

// ---------- Four-lens strip ----------
function FourLensStrip({ symbol }: { symbol: "NIFTY" | "SENSEX" }) {
  const amb = useAmbient(symbol);
  const a: any = amb.data ?? null;
  type Lens = { label: string; value: React.ReactNode; sub?: string; color?: string };
  const toneOf = (v: any): string => {
    const s = String(v ?? "").toUpperCase();
    if (["POSITIVE", "LONG", "ALIGNED", "RISK_ON", "BULLISH", "SUPPORT"].some((k) => s.includes(k))) return MV.green;
    if (["NEGATIVE", "SHORT", "DIVERGENT", "RISK_OFF", "BEARISH", "STRESS"].some((k) => s.includes(k))) return MV.red;
    if (s) return MV.amber;
    return MV.weak;
  };
  const lenses: Lens[] = a ? [
    { label: "Net GEX Regime", value: a.net_gex_regime ?? "—", color: toneOf(a.net_gex_regime) },
    { label: "Price vs Breadth", value: a.price_vs_breadth_div ?? "—", color: toneOf(a.price_vs_breadth_div) },
    { label: "OI Cycle Asymmetry", value: a.cycle_oi_call_put_asym ?? "—", color: toneOf(a.cycle_oi_call_put_asym) },
    { label: "FII 5D Δ Fut L/S", value: a.fii_index_fut_ls_delta_5d != null ? fmtSigned(Number(a.fii_index_fut_ls_delta_5d)) : "—",
      color: (a.fii_index_fut_ls_delta_5d ?? 0) >= 0 ? MV.green : MV.red },
  ] : [];
  return (
    <div>
      <SectionLabel>Four Lens Strip</SectionLabel>
      {a ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {lenses.map((l) => (
            <div key={l.label} className="rounded-lg p-3"
              style={{ background: MV.card, border: `1px solid ${MV.border}` }}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>{l.label}</div>
              <div className="mt-1 text-[15px] font-bold" style={{ color: l.color ?? MV.strong, fontFamily: MV.mono }}>{l.value}</div>
              {l.sub && <div className="mt-0.5 text-[10px]" style={{ color: MV.weak, fontFamily: MV.mono }}>{l.sub}</div>}
            </div>
          ))}
          {a.pro_options_imbalance != null && (
            <div className="rounded-lg p-3 md:col-span-2"
              style={{ background: MV.card, border: `1px solid ${MV.border}` }}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>Pro Options Imbalance</div>
              <div className="mt-1 text-[13px]" style={{ color: MV.mid, fontFamily: MV.mono }}>{String(a.pro_options_imbalance)}</div>
            </div>
          )}
          {a.macro_tilt && (
            <div className="rounded-lg p-3 md:col-span-2"
              style={{ background: MV.card, border: `1px solid ${MV.border}` }}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>Macro Tilt</div>
              <div className="mt-1 text-[13px]" style={{ color: MV.mid, fontFamily: MV.mono }}>{String(a.macro_tilt)}</div>
            </div>
          )}
        </div>
      ) : (
        <Card><Unavailable label="lens data not published" /></Card>
      )}
    </div>
  );
}

// ---------- Expiry memory (base rate) ----------
function ExpiryMemoryStrip({ symbol }: { symbol: "NIFTY" | "SENSEX" }) {
  const amb = useAmbient(symbol);
  const a: any = amb.data ?? null;
  const rates = useExpiryBaseRates(a?.ambient_regime, a?.lens_alignment);
  const rows = (rates.data ?? []) as any[];
  return (
    <Card title="Expiry Memory · Base Rates"
      subtitle={a?.ambient_regime && a?.lens_alignment ? `${a.ambient_regime} · ${a.lens_alignment}` : undefined}>
      {rows.length === 0 ? <Unavailable label="insufficient historical base rate for this regime × alignment" /> : (
        <div className="space-y-3">
          {rows.map((r, i) => {
            const pin = Number(r.pinned_pct ?? 0);
            const up = Number(r.broke_up_pct ?? 0);
            const dn = Number(r.broke_down_pct ?? 0);
            return (
              <div key={i}>
                <div className="mb-1 flex items-baseline justify-between text-[11px]" style={{ fontFamily: MV.mono }}>
                  <span className="font-semibold" style={{ color: MV.strong }}>{r.expiry_type ?? "—"}</span>
                  <span style={{ color: MV.weak }}>n={r.n} · dom {r.dominant_break ?? "—"}</span>
                </div>
                <div className="flex h-6 w-full overflow-hidden rounded">
                  <div className="flex items-center justify-center text-[10px] font-semibold text-white"
                    style={{ width: `${pin}%`, background: MV.purple, fontFamily: MV.mono }}>
                    {pin >= 8 ? `${pin.toFixed(0)}% pin` : ""}
                  </div>
                  <div className="flex items-center justify-center text-[10px] font-semibold text-white"
                    style={{ width: `${up}%`, background: MV.greenLine, fontFamily: MV.mono }}>
                    {up >= 8 ? `${up.toFixed(0)}% ↑` : ""}
                  </div>
                  <div className="flex items-center justify-center text-[10px] font-semibold text-white"
                    style={{ width: `${dn}%`, background: MV.redLine, fontFamily: MV.mono }}>
                    {dn >= 8 ? `${dn.toFixed(0)}% ↓` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function Home() {
  const { symbol } = useSymbol();
  const s = useMvData(symbol);
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const expiryLabel = useMemo(() =>
    s.expiry ? new Date(s.expiry).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—",
    [s.expiry]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-7 py-6">
      <PageTitle
        title="Home — Ambient"
        subtitle="single-glance market temperature and today's positioning shape"
        right={
          <button onClick={() => setNarrativeOpen(true)}
            className="rounded border px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors hover:bg-gray-900 hover:text-white"
            style={{ borderColor: MV.border, color: MV.strong }}>
            Narrative →
          </button>
        }
      />
      <SnapshotStrip s={s} />
      <AmbientVerdict symbol={symbol} />
      <FourLensStrip symbol={symbol} />
      <KeyParametersSection s={s} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NetDealerGammaSection s={s} />
        <ExpiryMemoryStrip symbol={symbol} />
      </div>
      <NarrativeModal
        open={narrativeOpen}
        onClose={() => setNarrativeOpen(false)}
        symbol={symbol}
        expiry={expiryLabel}
        state={{
          regime: s.regime, netDealerGamma: s.netDealerGamma, maxGammaStrike: s.maxGammaStrike,
          maxPainStrike: s.maxPainStrike, pinScore: s.pinRiskScore, vix: s.vix,
        }}
      />
    </div>
  );
}

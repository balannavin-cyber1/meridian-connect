import { useState } from "react";
import { istTime, istDateOf } from "@/lib/board";

type Data = { ts: string; awaiting: boolean; next: string | null; term: any[]; surface: any[] } | null | undefined;

const n = (v: any) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const pct = (v: any, d = 2) => (n(v) == null ? "—" : `${n(v)!.toFixed(d)} %`);
const sgn = (v: any, d = 2) => (n(v) == null ? "—" : `${n(v)! >= 0 ? "+" : "−"}${Math.abs(n(v)!).toFixed(d)}`);
const dmy = (d: string | null | undefined) =>
  d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }) : "—";

const Chip = ({ children, title }: { children: React.ReactNode; title?: string }) => (
  <span title={title} className="inline-block rounded border border-dashed px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]"
    style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}>{children}</span>
);
const Lbl = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>{children}</div>
);
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-lg p-4 ${className}`} style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>{children}</div>
);

export function IVPanel({ data }: { data: Data }) {
  const [leg, setLeg] = useState(1);
  if (data === undefined) return <Card><span className="text-[12px]" style={{ color: "var(--ink-3)" }}>loading chain…</span></Card>;
  if (data === null) return <Card><Chip>pending measurement · no chain</Chip></Card>;

  const front = data.term.find((r) => r.leg === 1);
  const back = data.term.find((r) => r.leg === 2);
  const slope = n(back?.term_slope ?? front?.term_slope);
  const isBack = back?.is_back;
  const structure = isBack == null && slope == null ? null
    : (isBack === true || (isBack == null && (slope ?? 0) > 0)) ? "contango" : "backwardation";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
        <span>chain clock · {dmy(istDateOf(data.ts))} {istTime(data.ts)} IST</span>
        {data.awaiting && <Chip title="the gate excluded this snapshot — it is not from a trading session">market closed · next {dmy(data.next)} · showing last chain, not live</Chip>}
      </div>

      {/* 1) Term structure — two points only, never a curve */}
      <Card>
        <div className="mb-3 flex flex-wrap items-baseline gap-3">
          <span className="text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>Term structure</span>
          <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>front vs back · 2 legs captured</span>
          {structure && (
            <span className="ml-auto text-[13px] font-semibold" style={{ fontFamily: "var(--font-plex-cond)", color: structure === "contango" ? "var(--cool)" : "var(--warm)" }}>
              {structure.toUpperCase()} · slope {sgn(slope)} vol pts
            </span>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {[front, back].map((r, i) => (
            <div key={i} className="rounded p-3" style={{ background: "var(--s2)", border: "1px solid var(--line)" }}>
              {!r ? <Chip>pending measurement · leg {i + 1} absent</Chip> : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Lbl>{r.is_back ? "W2 · back" : "W1 · front"}</Lbl>
                    <span className="text-[12px]" style={{ color: "var(--ink-2)" }}>{dmy(r.expiry_date)} · {r.dte ?? "—"} DTE</span>
                    {r.leg === 1 && r.front_is_0dte && <Chip>expiry day</Chip>}
                  </div>
                  <div className="mt-2 text-[28px] font-semibold leading-none" style={{ fontFamily: "var(--font-plex-cond)", color: "var(--ink-1)" }}>
                    {n(r.atm_iv) == null ? <Chip>expiry — IV skipped</Chip> : pct(r.atm_iv)}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
                    ATM {r.atm_strike?.toLocaleString("en-IN") ?? "—"} · CE {pct(r.ce_iv)} · PE {pct(r.pe_iv)}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                    <div><Lbl>spread vs front</Lbl><div style={{ color: "var(--ink-1)" }}>{sgn(r.spread_vs_front)}</div></div>
                    <div><Lbl>fwd vol from prev</Lbl><div style={{ color: "var(--ink-1)" }}>{r.leg === 2 ? pct(r.fwd_vol_from_prev) : "\u00a0"}</div></div>
                  </div>
                  <div className="mt-2 text-[10px]" style={{ color: "var(--ink-3)" }}>data quality · CE−PE parity gap {sgn(r.parity_gap)} vol pts</div>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* 2) Smile */}
      <Smile rows={data.surface.filter((r) => r.leg === leg)} leg={leg} setLeg={setLeg} legs={[...new Set(data.surface.map((r) => r.leg))].sort()} />
    </div>
  );
}

function Smile({ rows, leg, setLeg, legs }: { rows: any[]; leg: number; setLeg: (l: number) => void; legs: number[] }) {
  const [norm, setNorm] = useState(false);
  const [xHalf, setXHalf] = useState(9);
  const [xCenter, setXCenter] = useState(0);
  const r0 = rows[0];
  const status = r0?.leg_status;
  const W = 720, H = 220, P = 28;
  const yKey = norm ? "iv_over_atm" : "iv";
  // dead strikes: quoted but oi_otm = 0 — degenerate vendor IV, excluded from the curve
  const dead = rows.filter((r) => r.quote_state !== "OTM_ABSENT" && n(r.oi_otm) === 0);
  const quoted = rows.filter((r) => r.quote_state !== "OTM_ABSENT" && n(r.oi_otm) !== 0 && n(r[yKey]) != null && n(r.moneyness_pct) != null);
  const absent = rows.filter((r) => r.quote_state === "OTM_ABSENT");
  const xLo = xCenter - xHalf, xHi = xCenter + xHalf;
  const vis = quoted.filter((r) => { const m = n(r.moneyness_pct)!; return m >= xLo && m <= xHi; });
  const ys = vis.map((r) => n(r[yKey])!);
  const yLo = Math.min(...ys), yHi = Math.max(...ys);
  const x = (v: number) => P + ((v - xLo) / Math.max(1e-9, xHi - xLo)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - yLo) / Math.max(1e-9, yHi - yLo)) * (H - 2 * P);
  const path = vis.map((r, i) => `${i ? "L" : "M"}${x(n(r.moneyness_pct)!).toFixed(1)},${y(n(r[yKey])!).toFixed(1)}`).join(" ");
  const atm = rows.find((r) => r.strike === r.leg_atm_strike);
  const atmY = norm ? 1 : n(r0?.leg_atm_iv);
  const k98 = rows.find((r) => r.strike === r0?.leg_k98);
  const inWin = (m: number | null | undefined) => m != null && m >= xLo && m <= xHi;
  const zoomX = (k: number) => setXHalf((h) => Math.min(150, Math.max(1, h * k)));
  const panX = (dir: number) => setXCenter((c) => c + dir * xHalf * 0.5);
  const fitAll = () => {
    const ms = quoted.map((r) => n(r.moneyness_pct)!);
    if (!ms.length) return;
    setXCenter(0);
    setXHalf(Math.min(150, Math.max(2, Math.max(Math.abs(Math.min(...ms)), Math.abs(Math.max(...ms))) * 1.08)));
  };
  const xm = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} %`;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>IV smile</span>
        <div className="flex gap-1">
          {(legs.length ? legs : [1, 2]).map((l) => (
            <button key={l} onClick={() => setLeg(l)} className="rounded border px-2 py-0.5 text-[11px]"
              style={{ borderColor: leg === l ? "var(--ink-1)" : "var(--line-2)", color: leg === l ? "var(--ink-1)" : "var(--ink-3)" }}>
              {l === 1 ? "W1 front" : "W2 back"}
            </button>
          ))}
        </div>
        <button onClick={() => setNorm(!norm)} className="rounded border px-2 py-0.5 text-[11px]"
          style={{ borderColor: norm ? "var(--ink-1)" : "var(--line-2)", color: norm ? "var(--ink-1)" : "var(--ink-3)" }}>
          {norm ? "IV ÷ ATM" : "IV %"}
        </button>
        <div className="flex gap-1" title="x-window: moneyness range">
          <button onClick={() => panX(-1)} className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}>◀</button>
          <button onClick={() => zoomX(1 / 1.6)} className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}>+</button>
          <button onClick={() => zoomX(1.6)} className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}>−</button>
          <button onClick={() => panX(1)} className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}>▶</button>
          <button onClick={fitAll} className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: xHalf >= 149.9 ? "var(--ink-1)" : "var(--line-2)", color: "var(--ink-2)" }}>full</button>
        </div>
        <div className="ml-auto flex flex-wrap gap-4 text-[12px]">
          <span><span style={{ color: "var(--ink-3)" }}>ATM </span>{r0?.leg_atm_strike?.toLocaleString("en-IN") ?? "—"} · {pct(r0?.leg_atm_iv)}</span>
          <span><span style={{ color: "var(--ink-3)" }}>skew 98 </span>{sgn(r0?.leg_skew_98)} vol pts <span style={{ color: "var(--ink-3)" }}>@ {r0?.leg_k98?.toLocaleString("en-IN") ?? "—"}</span></span>
        </div>
      </div>
      {status === "SKIPPED_EXPIRY" ? <Chip>expiry — IV skipped</Chip>
        : !rows.length ? <Chip>pending measurement · no surface for this leg</Chip>
        : quoted.length < 2 ? <Chip>pending measurement · too few quoted strikes</Chip>
        : vis.length < 2 ? <Chip>pending measurement · too few quoted strikes in this window — widen or pan</Chip> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ maxHeight: 260 }}>
          {0 >= xLo && 0 <= xHi && <line x1={x(0)} x2={x(0)} y1={P / 2} y2={H - P} stroke="var(--axis)" strokeDasharray="2,3" />}
          <path d={path} fill="none" stroke="var(--ink-1)" strokeOpacity={0.85} strokeWidth={1.5} />
          {vis.map((r) => <circle key={r.strike} cx={x(n(r.moneyness_pct)!)} cy={y(n(r[yKey])!)} r={1.6} fill={r.side_used === "CE" ? "var(--call)" : "var(--put)"}><title>{`${r.strike} · ${r.side_used} · ${norm ? n(r.iv_over_atm)?.toFixed(3) : pct(r.iv)}`}</title></circle>)}
          {absent.map((r) => inWin(n(r.moneyness_pct)) && (
            <g key={`a${r.strike}`}><line x1={x(n(r.moneyness_pct)!)} x2={x(n(r.moneyness_pct)!)} y1={H - P + 2} y2={H - P + 8} stroke="var(--ink-3)" /><title>{`${r.strike} · OTM absent`}</title></g>
          ))}
          {k98 && inWin(n(k98.moneyness_pct)) && <line x1={x(n(k98.moneyness_pct)!)} x2={x(n(k98.moneyness_pct)!)} y1={P / 2} y2={H - P} stroke="var(--rule)" strokeOpacity={0.5} strokeDasharray="1,3" />}
          {atm && inWin(n(atm.moneyness_pct) ?? 0) && atmY != null && <circle cx={x(n(atm.moneyness_pct) ?? 0)} cy={y(atmY)} r={4} fill="none" stroke="var(--sel)" strokeWidth={1.5} />}
          {0 >= xLo && 0 <= xHi && <text x={x(0) + 4} y={P / 2 + 8} fontSize="9" fill="var(--ink-3)">ATM</text>}
          {k98 && inWin(n(k98.moneyness_pct)) && <text x={x(n(k98.moneyness_pct)!) + 4} y={P / 2 + 8} fontSize="9" fill="var(--ink-3)">K98</text>}
          <text x={P} y={H - 6} fontSize="9" fill="var(--ink-3)">{xm(xLo)}</text>
          <text x={W - P} y={H - 6} fontSize="9" fill="var(--ink-3)" textAnchor="end">{xm(xHi)} moneyness</text>
          <text x={4} y={y(yHi) + 3} fontSize="9" fill="var(--ink-3)">{norm ? yHi.toFixed(2) : yHi.toFixed(1)}</text>
          <text x={4} y={y(yLo) + 3} fontSize="9" fill="var(--ink-3)">{norm ? yLo.toFixed(2) : yLo.toFixed(1)}</text>
        </svg>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-[10px]" style={{ color: "var(--ink-3)" }}>
        <span>● PE side (grey) · ● CE side (light)</span><span>◯ ATM</span><span>┆ K98 (server skew strike)</span>
        <span>▏ OTM absent · {absent.length} strike{absent.length === 1 ? "" : "s"}</span>
        <span>zero-OI (quoted) excluded · {dead.length} strike{dead.length === 1 ? "" : "s"}</span>
        <span>skew from view · not recomputed</span>
      </div>
    </Card>
  );
}

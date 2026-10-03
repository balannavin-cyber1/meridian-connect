// Gamma river (Phase 1c): settled daily net γ — min–max band per session, settled point, price on its own scale.
import { useEffect, useMemo, useRef, useState } from "react";
import type { RiverDay } from "@/lib/board";

const num = (v: number, d = 0) => v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const lak = (v: number) => (Math.abs(v) >= 1e5 ? `${v < 0 ? "−" : v > 0 ? "+" : ""}${num(Math.abs(v) / 1e5, 1)}L` : `${v < 0 ? "−" : "+"}${num(Math.abs(v))}`);
const dShort = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

export function GammaRiver({ days }: { days: RiverDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // fixed 30-session window (data source holds exactly 30)
  const view = useMemo(() => days.slice(-30), [days]);
  const H = 170, padL = 52, padR = 52, padT = 10, padB = 22;
  if (!days.length) return null;

  const gLo = Math.min(0, ...view.map((d) => d.lo)), gHi = Math.max(0, ...view.map((d) => d.hi));
  const sp = view.map((d) => d.spot).filter((x): x is number => x != null);
  const pLo = Math.min(...sp), pHi = Math.max(...sp);
  const xw = (W - padL - padR) / Math.max(1, view.length);
  const x = (i: number) => padL + xw * (i + 0.5);
  const yG = (v: number) => padT + (1 - (v - gLo) / (gHi - gLo || 1)) * (H - padT - padB);
  const yP = (v: number) => padT + (1 - (v - pLo) / (pHi - pLo || 1)) * (H - padT - padB);

  // price polyline broken at data holes
  const segs: string[][] = [];
  view.forEach((d, i) => {
    if (d.spot == null) return;
    if (!segs.length || d.gapBefore) segs.push([]);
    segs[segs.length - 1].push(`${x(i)},${yP(d.spot)}`);
  });
  const h = hover != null ? view[hover] : null;
  const labelEvery = Math.ceil(view.length / Math.max(2, Math.floor((W - padL - padR) / 60)));

  return (
    <div className="rounded-lg p-3 md:p-4" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>Gamma river</span>
        <span className="text-[12px]" style={{ color: "var(--ink-2)" }}>settled net γ per session · history, not today's read</span>
        <div className="flex-1" />
        {(["30", "all"] as const).map((k) => (
          <button key={k} onClick={() => setAll(k === "all")} className="rounded px-2 py-0.5 text-[11px]"
            style={{ background: (k === "all") === all ? "var(--s2)" : "transparent", color: (k === "all") === all ? "var(--ink-1)" : "var(--ink-3)" }}>
            {k === "30" ? "30 sessions" : `all · ${days.length}`}
          </button>
        ))}
      </div>
      <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} className="block">
          <line x1={padL} x2={W - padR} y1={yG(0)} y2={yG(0)} stroke="var(--axis)" />
          <text x={padL - 6} y={yG(0) + 3} textAnchor="end" fontSize="9" fill="var(--ink-3)">0</text>
          <text x={padL - 6} y={yG(gHi) + 8} textAnchor="end" fontSize="9" fill="var(--ink-3)">{lak(gHi)}</text>
          <text x={padL - 6} y={yG(gLo)} textAnchor="end" fontSize="9" fill="var(--ink-3)">{lak(gLo)}</text>
          {sp.length > 0 && <>
            <text x={W - padR + 6} y={yP(pHi) + 8} fontSize="9" fill="var(--ink-3)">{num(pHi)}</text>
            <text x={W - padR + 6} y={yP(pLo)} fontSize="9" fill="var(--ink-3)">{num(pLo)}</text>
          </>}
          {segs.map((s, i) => s.length > 1 && <polyline key={i} points={s.join(" ")} fill="none" stroke="var(--put)" strokeWidth={1} />)}
          {view.map((d, i) => {
            const c = d.net >= 0 ? "var(--cool)" : "var(--warm)";
            const bw = Math.max(2, Math.min(8, xw * 0.4));
            return (
              <g key={d.date}>
                {d.gapBefore && (
                  <g>
                    <line x1={x(i) - xw / 2} x2={x(i) - xw / 2} y1={padT} y2={H - padB} stroke="var(--line-2)" strokeDasharray="2 3" />
                    <title>no data</title>
                  </g>
                )}
                <rect x={x(i) - bw / 2} y={yG(d.hi)} width={bw} height={Math.max(1, yG(d.lo) - yG(d.hi))} fill="var(--ink-3)" opacity={0.35} />
                <circle cx={x(i)} cy={yG(d.net)} r={3} fill={d.complete ? c : "var(--s1)"} stroke={c} strokeWidth={1.2} />
                {d.dte === 0 && <text x={x(i)} y={H - padB + 10} textAnchor="middle" fontSize="8" fill="var(--ink-2)">0</text>}
                {i % labelEvery === 0 && <text x={x(i)} y={H - 3} textAnchor="middle" fontSize="9" fill="var(--ink-3)">{dShort(d.date)}</text>}
                <rect x={x(i) - xw / 2} y={0} width={xw} height={H} fill={hover === i ? "var(--ink-1)" : "transparent"} opacity={hover === i ? 0.05 : 1}
                  onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-1 min-h-[18px] text-[12px]" style={{ color: h ? "var(--ink-1)" : "var(--ink-3)" }}>
        {h ? `${dShort(h.date)} · settled ${lak(h.net)} Cr · range ${lak(h.lo)} … ${lak(h.hi)}${h.spot != null ? ` · spot ${num(h.spot, 1)}` : ""}${h.dte != null ? ` · ${h.dte} DTE` : ""}${h.complete ? "" : " · session incomplete"}${h.gapBefore ? " · no data before this session" : ""}`
          : "● settled net γ · ○ incomplete session · grey bar = session min–max · line = spot (right scale) · 0 under a day = 0-DTE · dashed break = no data"}
      </p>
    </div>
  );
}

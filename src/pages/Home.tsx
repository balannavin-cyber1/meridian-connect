import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSymbol } from "@/contexts/SymbolContext";
import {
  useSessions, useGammaNow, useAbsExposure, useRepricedFlip, useWalls, useStrikeRank,
  useIvFront, useOpenGap, useMaxPain, useFlowSim, useIvTerm, useDailyContext, isAwaiting, useNextOpen,
} from "@/lib/board";
import { useBoardRead } from "@/lib/read";
import { SplitBar } from "@/components/board/SplitBar";

const n = (v: any): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const num = (v: number, d = 0) => v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), d)}`;
const pctS = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)} %`;
const dShort = (d: string | null | undefined) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : null;

function Absent({ word }: { word: string }) {
  return (
    <span className="inline-block rounded border border-dashed px-1.5 py-0.5 text-[12px]"
      style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}>{word}</span>
  );
}

// ---------- 220×56 pictures ----------
const W = 220, H = 56;
function TrackPic({ spot, ticks, band = 0.025 }: { spot: number; band?: number; ticks: { at: number; color: string; dashed?: boolean; span?: [number, number] }[] }) {
  const lo = spot * (1 - band), hi = spot * (1 + band);
  const x = (v: number) => Math.min(W - 2, Math.max(2, ((v - lo) / (hi - lo)) * W));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--axis)" />
      {ticks.filter((t) => t.span).map((t, i) => (
        <rect key={`s${i}`} x={x(t.span![0])} width={Math.max(1, x(t.span![1]) - x(t.span![0]))} y={H / 2 - 4} height={8} fill="var(--s2)" />
      ))}
      {ticks.filter((t) => !t.span).map((t, i) => (
        <line key={i} x1={x(t.at)} x2={x(t.at)} y1={H / 2 - 12} y2={H / 2 + 12} stroke={t.color}
          strokeWidth={t.dashed ? 1 : 2} strokeDasharray={t.dashed ? "3 2" : undefined} />
      ))}
      <circle cx={x(spot)} cy={H / 2} r={3.5} fill="var(--ink-1)" />
    </svg>
  );
}
function BarsPic({ a, b }: { a: number; b: number | null }) {
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full">
      <rect x={0} y={16} width={W} height={8} fill="var(--rule)" />
      {b != null && a > 0 && <rect x={0} y={32} width={(b / a) * W} height={8} fill="var(--ink-3)" />}
    </svg>
  );
}
function FlowPic({ dn, up }: { dn: number; up: number }) {
  const m = Math.max(Math.abs(dn), Math.abs(up)) || 1;
  const y = (v: number) => H / 2 - (v / m) * (H / 2 - 8);
  const x1 = 40, x2 = W - 40;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--axis)" />
      <line x1={x1} y1={y(dn)} x2={x2} y2={y(up)} stroke="var(--rule)" />
      {[[x1, dn, "−1%"], [x2, up, "+1%"]].map(([xx, v, l]) => (
        <g key={l as string}>
          <circle cx={xx as number} cy={y(v as number)} r={3} fill="var(--ink-1)" />
          <text x={(xx as number) + ((xx as number) < W / 2 ? -34 : 6)} y={y(v as number) + 4} fontSize={9} fill="var(--ink-2)">
            {(v as number) >= 0 ? "BUY" : "SELL"}
          </text>
          <text x={xx as number} y={H - 1} fontSize={8} textAnchor="middle" fill="var(--ink-3)">{l}</text>
        </g>
      ))}
    </svg>
  );
}
function IvPic({ front, back }: { front: number; back: number | null }) {
  const vals = [front, back ?? front], lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
  const y = (v: number) => H - 8 - ((v - lo) / (hi - lo)) * (H - 16);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full">
      {back != null && <line x1={50} y1={y(front)} x2={W - 50} y2={y(back)} stroke="var(--rule)" />}
      <circle cx={50} cy={y(front)} r={3.5} fill="var(--ink-1)" />
      {back != null && <circle cx={W - 50} cy={y(back)} r={3.5} fill="var(--ink-1)" />}
    </svg>
  );
}

type CardDef = { key: number; tab: string; sel: string; q: string; answer: React.ReactNode; pic: React.ReactNode };

export default function Home() {
  const { symbol } = useSymbol();
  const nav = useNavigate();
  const sess = useSessions();
  const session = sess.data?.session ?? null, prev = sess.data?.prev ?? null;
  const g = useGammaNow(symbol).data as any;
  const abs = useAbsExposure(symbol).data as any;
  const flip = useRepricedFlip(symbol).data as any;
  const walls = useWalls(symbol).data as any;
  const rank = (useStrikeRank(symbol).data ?? []) as any[];
  const iv = useIvFront(symbol).data as any;
  const og = useOpenGap(symbol, session, prev).data;
  const mp = useMaxPain(symbol).data as any;
  const flows = (useFlowSim(symbol).data ?? []) as any[];
  const termRaw = useIvTerm(symbol).data as any;
  const ivAwait = isAwaiting(termRaw);
  const term = (Array.isArray(termRaw) ? termRaw : []) as any[];
  const nextOpen = useNextOpen().data ?? null;
  const ctx = useDailyContext(symbol).data;
  const read = useBoardRead(symbol);

  const spot = n(g?.spot);
  const prevClose = og?.prevClose ?? null;
  const chg = spot != null && prevClose != null ? spot - prevClose : null;
  const openRef = og?.open ?? og?.preOpen ?? null;
  const gap = openRef != null && prevClose != null ? ((openRef - prevClose) / prevClose) * 100 : null;
  const dteS = n(iv?.dte_sessions);
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const leftWord = g?.expiry_date === today ? "EXPIRY TODAY" : dteS != null ? `${dteS} SESSION${dteS === 1 ? "" : "S"} LEFT` : null;

  // card values
  const pw = n(walls?.put_wall), cw = n(walls?.call_wall), cState = walls?.corridor_state as string | undefined;
  const fOk = flip?.status === "OK", fv = fOk ? n(flip?.flip) : null;
  // S90 MV-2: distance from the displayed spot (same clock as the number on screen).
  const fPct = fv != null && spot ? ((fv - spot) / spot) * 100 : null;
  const flipAwait = isAwaiting(flip);
  const closedWord = `market closed${nextOpen ? ` · next ${dShort(nextOpen)}` : ""}`;
  const flipWord: Record<string, string> = { NO_CROSSING: "no flip in grid", SKIPPED_EXPIRY: "skipped · expiry day", UNMEASURABLE_R: "carry unmeasurable" };
  const r1 = rank.find((r) => r.strike_rank === 1), r2 = rank.find((r) => r.strike_rank === 2);
  const sh1 = n(r1?.share_of_abs), sh2 = n(r2?.share_of_abs), pin = n(r1?.strike);
  const net = n(abs?.net_gex_cr), gross = n(abs?.abs_gex_cr);
  const mps = n(mp?.max_pain_strike);
  const f1 = flows.find((r) => Math.abs(Number(r.spot_pct) + 0.01) < 1e-6), f2 = flows.find((r) => Math.abs(Number(r.spot_pct) - 0.01) < 1e-6);
  const front = term.find((t) => t.leg === 1), back = term.find((t) => t.leg === 2);
  const strad = n(g?.straddle_atm);

  const cards: CardDef[] = [
    { key: 1, tab: "Overview", sel: "s5", q: "What kind of day, and where are the edges?",
      answer: cState === "UNDEFINED" || pw == null || cw == null ? <Absent word="corridor undefined" /> :
        <>corridor {num(pw)}–{num(cw)} · {fPct != null ? `flip ${pctS(fPct)}` : flipAwait ? <Absent word={closedWord} /> : flipWord[flip?.status] ?? "no flip run"}</>,
      pic: spot != null ? <TrackPic spot={spot} ticks={[
        ...(pw != null && cw != null && cState !== "UNDEFINED" ? [{ at: 0, color: "", span: [pw, cw] as [number, number] }, { at: pw, color: "var(--put)" }, { at: cw, color: "var(--call)" }] : []),
        ...(fv != null ? [{ at: fv, color: "var(--rule)", dashed: true }] : []),
      ]} /> : null },
    { key: 2, tab: "Pin", sel: "s6", q: "How settled is the centre?",
      answer: sh1 == null ? <Absent word="no run" /> :
        <>{num(pin!)} holds {(sh1 * 100).toFixed(1)} % of gross{sh2 != null ? ` · lead ${((sh1 - sh2) * 100).toFixed(1)} pts` : ""}</>,
      pic: sh1 != null ? <BarsPic a={sh1} b={sh2} /> : null },
    { key: 3, tab: "Gamma", sel: "s3", q: "Can I trust single strikes?",
      answer: net == null || !gross ? <Absent word="no run" /> :
        <>net/gross {(net / gross).toFixed(2)}{sh1 != null ? ` · top strike ${(sh1 * 100).toFixed(1)} %` : ""}</>,
      pic: net != null && gross ? <div className="flex h-14 w-[220px] max-w-full items-center"><SplitBar net={net} gross={gross} className="h-3" /></div> : null },
    { key: 4, tab: "OI", sel: "s6", q: "What is actually written?",
      answer: mps == null ? <Absent word="no max pain" /> :
        <>max pain {num(mps)}{pin != null ? ` · pin ${num(pin)} · ${sgn(mps - pin, 0)}` : ""}</>,
      pic: spot != null && mps != null ? <TrackPic spot={spot} ticks={[{ at: mps, color: "var(--put)" }, ...(pin != null ? [{ at: pin, color: "var(--rule)" }] : [])]} /> : null },
    { key: 5, tab: "Flows", sel: "s3", q: "What must dealers trade if spot moves?",
      answer: !f1 || !f2 ? <Absent word="no flow sim" /> :
        <>−1 %: {f1.direction} {num(Math.abs(Number(f1.flow_cr)))} Cr · +1 %: {f2.direction} {num(Math.abs(Number(f2.flow_cr)))} Cr</>,
      pic: f1 && f2 ? <FlowPic dn={Number(f1.flow_cr)} up={Number(f2.flow_cr)} /> : null },
    { key: 6, tab: "IV", sel: "s7", q: "What do time and cover cost?",
      answer: ivAwait ? <Absent word={closedWord} /> : n(front?.atm_iv) == null ? <Absent word="no chain" /> :
        <>front {Number(front.atm_iv).toFixed(1)}{n(back?.atm_iv) != null ? ` · back ${Number(back.atm_iv).toFixed(1)}` : ""}{strad != null ? ` · straddle ±${num(strad)}` : ""}</>,
      pic: n(front?.atm_iv) != null ? <IvPic front={Number(front.atm_iv)} back={n(back?.atm_iv)} /> : null },
  ];

  const open = (c: CardDef) => nav(`/board?tab=${c.tab.toLowerCase()}&sel=${c.sel}`);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      const c = cards.find((c) => String(c.key) === e.key);
      if (c) open(c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const env = ctx?.env, wcb = ctx?.wcb;
  const ctxParts = [
    env?.ambient_regime ? String(env.ambient_regime).toLowerCase().replace(/_/g, " ") : null,
    env?.lens_alignment ? String(env.lens_alignment).toLowerCase() : null,
    env?.as_of_date ? `as of ${dShort(env.as_of_date)}` : null,
    n(wcb?.wcb_score) != null ? `WCB ${Number(wcb.wcb_score).toFixed(1)} ${String(wcb.wcb_regime ?? "").toLowerCase()}` : null,
    n(wcb?.weighted_advances_pct) != null ? `${Number(wcb.weighted_advances_pct).toFixed(0)} % wtd up / ${Number(wcb.weighted_declines_pct).toFixed(0)} % down` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-8 px-4 py-6 md:px-8 md:py-10">
      {/* Masthead + read */}
      <section className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-end">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: "var(--ink-3)" }}>
            {[symbol, g?.expiry_date ? dShort(g.expiry_date)!.toUpperCase() : null, leftWord].filter(Boolean).join(" · ")}
            {isAwaiting(iv) && nextOpen && <span className="ml-2 normal-case tracking-normal" style={{ color: "var(--ink-3)" }}>next {dShort(nextOpen)}</span>}
          </div>
          <div className="mt-1 text-[44px] font-semibold leading-none md:text-[56px]" style={{ fontFamily: "var(--font-plex-cond)", color: "var(--ink-1)" }}>
            {spot != null ? num(spot, 1) : <Absent word="no run" />}
          </div>
          <div className="mt-2 text-[14px]" style={{ fontFamily: "var(--font-plex-cond)" }}>
            {chg != null && prevClose ? (
              <span style={{ color: chg >= 0 ? "var(--cool)" : "var(--warm)" }}>{sgn(chg, 1)} · {pctS((chg / prevClose) * 100)}</span>
            ) : <Absent word="prev close missing" />}
            {gap != null && (
              <span style={{ color: "var(--ink-2)" }}> · opened <span className="text-[10px]">{gap > 0 ? "▲" : gap < 0 ? "▼" : "◆"}</span> {Math.abs(gap).toFixed(2)} %</span>
            )}
          </div>
        </div>
        <p className="text-[17px] leading-relaxed lg:pl-8" style={{ color: "var(--ink-1)" }}>{read ?? ""}</p>
      </section>

      {/* Six question cards */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <button key={c.key} onClick={() => open(c)}
            className="group flex min-w-0 flex-col rounded-lg p-4 text-left transition-colors hover:bg-[var(--s2)]"
            style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
            <div className="flex items-baseline gap-3">
              <span className="text-[28px] font-semibold leading-none" style={{ fontFamily: "var(--font-plex-cond)", color: "var(--ink-3)" }}>{c.key}</span>
              <span className="text-[13px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--ink-1)" }}>{c.tab}</span>
            </div>
            <div className="mt-2 text-[13px]" style={{ color: "var(--ink-2)" }}>{c.q}</div>
            <div className="mt-2 truncate text-[14px] font-medium" style={{ color: "var(--ink-1)" }}>{c.answer}</div>
            <div className="mt-3 hidden h-14 md:block">{c.pic}</div>
          </button>
        ))}
      </section>

      {/* Context line */}
      <Link to="/context" className="block truncate border-t pt-4 text-[12px] hover:text-[var(--ink-1)]"
        style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}>
        <span className="font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--ink-3)" }}>Context · Daily</span>
        {ctxParts.length ? ` · ${ctxParts.join(" · ")}` : " · not published"} ›
      </Link>
    </div>
  );
}

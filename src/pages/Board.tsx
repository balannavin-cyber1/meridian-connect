import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useBoardRead } from "@/lib/read";
import { SplitBar } from "@/components/board/SplitBar";
import { useSymbol } from "@/contexts/SymbolContext";
import {
  useSessions, useGammaNow, useAbsExposure, useRepricedFlip, useWalls, useStrikeRank,
  useIvFront, useFutures, useSpotPocket, useGammaSession, useOpenGap, usePrevBasis,
  istTime, istDateOf, isAwaiting, useNextOpen, useLadderStrikes, usePinBand,
  useConcentration, useNetGammaToday, useGammaRiver,
  useMaxPainRun, useLiveSpot,
  usePinBoard, useStrikeRankAll, useGreeksNet, useGreeksStrike, useFlowSim,
} from "@/lib/board";
import { LadderPanel, TABS, type Tab, type OverviewItem } from "@/components/board/LadderPanel";
import type { Level } from "@/components/board/StrikeLadder";
import { GammaRiver } from "@/components/board/GammaRiver";
import { IVPanel } from "@/components/board/IVPanel";
import { useIvTab } from "@/lib/board";

const CELL_TO_ITEM: Record<string, string> = { s1: "dte", s2: "spot", s3: "net", s4: "flip", s5: "corridor", s6: "pin", s7: "priced" };

// ---------- formatting ----------
const num = (v: number | null | undefined, d = 0) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), d)}`;
const crLakh = (v: number) => (Math.abs(v) >= 1e5 ? `${sgn(v / 1e5, 1)}L Cr` : `${sgn(v, 0)} Cr`);
const n = (v: any): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const expShort = (d: string | null | undefined) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase() : null;

// ---------- primitives ----------
function Mark({ delta }: { delta: number | null }) {
  if (delta == null || !Number.isFinite(delta)) return null;
  return <span className="mr-1 text-[9px]" style={{ color: "var(--ink-2)" }}>{delta > 0 ? "▲" : delta < 0 ? "▼" : "◆"}</span>;
}
function Absent({ word }: { word: string }) {
  return (
    <span className="inline-block rounded border border-dashed px-1.5 py-0.5 text-[12px] font-medium"
      style={{ borderColor: "var(--line-2)", color: "var(--ink-3)", fontFamily: "var(--font-plex)" }}>{word}</span>
  );
}
const hue = (v: number | null) => (v == null ? "var(--ink-1)" : v >= 0 ? "var(--cool)" : "var(--warm)");

function Track({ lo, hi, spot, ticks }: { lo: number; hi: number; spot: number; ticks: { at: number; color: string; dashed?: boolean }[] }) {
  const pos = (x: number) => `${Math.min(100, Math.max(0, ((x - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="relative mt-2 h-3 w-full">
      <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: "var(--axis)" }} />
      {ticks.map((t, i) => (
        <div key={i} className="absolute top-0 h-3 w-0" style={{ left: pos(t.at), borderLeft: `${t.dashed ? "1px dashed" : "2px solid"} ${t.color}` }} />
      ))}
      <div className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: pos(spot), background: "var(--ink-1)" }} />
    </div>
  );
}

function Spark({ pts }: { pts: number[] }) {
  const lo = Math.min(...pts), hi = Math.max(...pts), r = hi - lo || 1;
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${16 - ((p - lo) / r) * 14 - 1}`).join(" ");
  return (
    <svg viewBox="0 0 100 16" preserveAspectRatio="none" className="mt-2 h-4 w-full">
      <polyline points={d} fill="none" stroke="var(--rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type CellProps = { id: string; label: string; value: React.ReactNode; color?: string; sub?: React.ReactNode; viz?: React.ReactNode; sel: string | null; onSel: (id: string) => void };
function Cell({ id, label, value, color, sub, viz, sel, onSel }: CellProps) {
  const on = sel === id;
  return (
    <button onClick={() => onSel(id)} aria-pressed={on}
      className="min-w-0 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[var(--s2)]"
      style={{ background: on ? "var(--s-sel-row)" : "var(--s1)", border: `1px solid ${on ? "var(--sel)" : "var(--line)"}` }}>
      <div className="truncate text-[10px] font-medium uppercase tracking-[0.10em]" style={{ color: "var(--ink-3)" }}>{label}</div>
      <div className="mt-1 truncate text-[20px] font-semibold leading-tight" style={{ fontFamily: "var(--font-plex-cond)", color: color ?? "var(--ink-1)" }}>{value}</div>
      <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--ink-2)" }}>{sub ?? "\u00a0"}</div>
      {viz}
    </button>
  );
}

// ---------- page ----------
export default function Board() {
  const { symbol } = useSymbol();
  const [params] = useSearchParams();
  const fromParam = (v: string | null) => (v ? CELL_TO_ITEM[v] ?? v : null);
  const [sel, setSel] = useState<string | null>(fromParam(params.get("sel")) ?? (params.get("tab") === "gamma" ? "g_top" : "net"));
  const [tab, setTabRaw] = useState<Tab>(() => TABS.find((t) => t.toLowerCase() === params.get("tab")) ?? "Overview");
  const FIRST: Partial<Record<Tab, string>> = { Overview: "net", Gamma: "g_top", OI: "oi_max", Pin: "p_pin", Flows: "f_hedge" };
  const setTab = (t: Tab) => { setTabRaw(t); if (t !== tab && FIRST[t]) setSel(FIRST[t]!); };
  useEffect(() => { const s = fromParam(params.get("sel")); if (s) setSel(s); }, [params]);
  const nextOpen = useNextOpen().data ?? null;
  const closedWord = `market closed${nextOpen ? ` · next ${new Date(nextOpen + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : ""}`;
  const ladder = useLadderStrikes(symbol).data;
  const pinBandRow = usePinBand(symbol).data as any;
  const sess = useSessions();
  const session = sess.data?.session ?? null, prev = sess.data?.prev ?? null;

  const g = useGammaNow(symbol).data as any;
  const abs = useAbsExposure(symbol).data as any;
  const flip = useRepricedFlip(symbol).data as any;
  const walls = useWalls(symbol).data as any;
  const rank = (useStrikeRank(symbol).data ?? []) as any[];
  const iv = useIvFront(symbol).data as any;
  const fut = useFutures(symbol).data as any;
  const pocket = useSpotPocket(symbol).data;
  const gs = useGammaSession(symbol, session, prev).data;
  const og = useOpenGap(symbol, session, prev).data;
  const prevBasis = usePrevBasis(symbol, prev).data ?? null;

  const spot = n(g?.spot);  // γ-run spot: flip / walls / pin / ladder are measured against it (MV-2)
  const liveSpot = useLiveSpot(symbol).data ?? null;  // S90: the Spot cell shows the live 1-min spot, with its time
  const headSpot = liveSpot?.spot ?? spot;
  const prevClose = og?.prevClose ?? null;
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  // S1
  const expiry = g?.expiry_date ?? null;
  const dteS = n(iv?.dte_sessions);
  const s1sub = isAwaiting(iv) ? (nextOpen ? `next ${new Date(nextOpen + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : undefined) : expiry && expiry === today ? "expiry today" : dteS != null ? `${dteS} DTE` : undefined;

  // S2
  const spotChg = headSpot != null && prevClose != null ? headSpot - prevClose : null;
  const boardChg = spot != null && prevClose != null ? spot - prevClose : null;  // overview item shows the γ-run spot, so its change is from that spot
  const series = gs?.series ?? [];
  const sparkPts = series.map((p) => p.spot);

  // S3
  const net = n(abs?.net_gex_cr), gross = n(abs?.abs_gex_cr);
  const ratio = net != null && gross ? net / gross : null;

  // S4
  const fStatus: string | null = flip?.status ?? null;
  const fVal = fStatus === "OK" ? n(flip?.flip) : null;
  const fms = n(flip?.flip_minus_spot);
  const fSpot = n(flip?.spot) ?? spot;
  // S90 MV-2: measure against the displayed spot (gamma clock), not the L3 row's own spot (chain clock),
  // so the % and the ladder can never put flip and spot on opposite sides. fms/fSpot kept for the tooltip.
  const fPct = fVal != null && spot ? ((fVal - spot) / spot) * 100 : null;
  const flipAbsent: Record<string, string> = { NO_CROSSING: "no flip in grid", SKIPPED_EXPIRY: "skipped · expiry day", UNMEASURABLE_R: "carry unmeasurable" };

  // S5
  const pw = n(walls?.put_wall), cw = n(walls?.call_wall), wSpot = n(walls?.spot) ?? spot;
  const cState: string | null = walls?.corridor_state ?? null;
  const stateWord: Record<string, string> = { INSIDE: "inside", ABOVE_CEILING: "above call wall", BELOW_FLOOR: "below put wall", UNDEFINED: "corridor undefined" };
  const widthPct = pw != null && cw != null && wSpot ? ((cw - pw) / wSpot) * 100 : null;

  // S6
  const r1 = rank.find((r) => r.strike_rank === 1), r2 = rank.find((r) => r.strike_rank === 2);
  const pin = n(r1?.strike), sh1 = n(r1?.share_of_abs), sh2 = n(r2?.share_of_abs);
  const lead = sh1 != null && sh2 != null ? (sh1 - sh2) * 100 : null;
  const pinWall = pin != null ? (pin === cw ? "≡ call OI wall" : pin === pw ? "≡ put OI wall" : null) : null;

  // S7
  const atmIv = n(iv?.atm_iv), vix = n(g?.vix), strad = n(g?.straddle_atm);
  const vixChg = vix != null && gs?.prevVix != null ? vix - gs.prevVix : null;

  // S8
  const fp = n(fut?.futures_price), basis = n(fut?.basis);
  const futToday = fut?.ts && session ? istDateOf(fut.ts) === session : false;
  const futAgeMin = fut?.ts ? (Date.now() - new Date(fut.ts).getTime()) / 60000 : null;
  const istMins = (() => { const d = new Date(Date.now() + 5.5 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); })();
  const live = session === today && istMins >= 9 * 60 + 30 && istMins <= 15 * 60 + 30;
  const futMsg = session === today && !futToday ? "futures from 09:30" : live && futAgeMin != null && futAgeMin > 15 ? "futures stale" : null;
  const basisChg = basis != null && prevBasis != null ? basis - prevBasis : null;
  const contract = fut?.expiry_date ? expShort(fut.expiry_date)!.replace(/^\d+ /, (m) => m) : null;

  // S9
  const preOpen = og?.preOpen ?? null, open = og?.open ?? null;
  const openRef = open ?? preOpen;
  const gap = openRef != null && prevClose != null ? ((openRef - prevClose) / prevClose) * 100 : null;
  const gapFilled = open != null && prevClose != null && sparkPts.length > 0 && gap != null &&
    ((gap > 0 && Math.min(...sparkPts) <= prevClose) || (gap < 0 && Math.max(...sparkPts) >= prevClose));
  const s9sub = prevClose == null ? null : [
    preOpen != null ? `pre-open ${num(preOpen)}${open == null && og?.preOpenTs ? ` @${istTime(og.preOpenTs)}` : ""}` : "no pre-open print",
    open != null ? `final ${num(open)}` : null,
    `prev ${num(prevClose)}`,
    gapFilled ? "gap filled" : null,
  ].filter(Boolean).join(" · ");

  // S10
  const clockDiff = walls?.ts && flip?.ts ? Math.abs(new Date(walls.ts).getTime() - new Date(flip.ts).getTime()) / 60000 : 0;

  // ---------- Gamma tab (Phase 1c) ----------
  const conc = useConcentration(symbol).data as any;
  const netToday = (useNetGammaToday(symbol, session).data ?? []) as { ts: string; v: number }[];
  const river = useGammaRiver(symbol).data ?? [];
  const painRows = useMaxPainRun(symbol, ladder?.runId ?? null).data ?? [];

  const read = useBoardRead(symbol);

  // ---------- ladder (Overview) ----------
  const step = symbol === "NIFTY" ? 50 : 100;
  const lad = (v: number) => (Math.abs(v) >= 1e5 ? `${sgn(v / 1e5, 1)}L` : sgn(v, 0));
  const rows = (ladder?.rows ?? []).map((r) => ({ strike: r.strike, value: r.gex, tint: r.gex, readout: r.gex == null ? "·" : lad(r.gex), full: r.gex == null ? "no quote" : `${lad(r.gex)} Cr` }));
  const levels: Level[] = [
    ...(spot != null ? [{ id: "spot", name: "SPOT", at: spot, style: "spot" as const }] : []),
    ...(fVal != null ? [{ id: "flip", name: "FLIP", at: fVal, style: "dashed" as const }] : []),
    ...(cw != null && cState !== "UNDEFINED" ? [{ id: "callwall", name: "CALL OI WALL", at: cw, style: "solid" as const }] : []),
    ...(pw != null && cState !== "UNDEFINED" ? [{ id: "putwall", name: "PUT OI WALL", at: pw, style: "solid" as const }] : []),
    ...(pin != null ? [{ id: "gconc", name: "γ-CONC", at: pin, style: "dotted" as const }] : []),
  ];
  const items: OverviewItem[] = [
    { id: "net", label: "Net Γ", sub: net != null ? `${net >= 0 ? "long γ" : "short γ"}${ratio != null ? ` · ${ratio.toFixed(2)} of gross` : ""}` : "",
      value: net != null ? <span style={{ color: hue(net) }}>{crLakh(net)}</span> : <Absent word="no run" />, levelIds: [],
      caption: net != null ? `Net gamma is ${crLakh(net)}${ratio != null ? `, ${ratio.toFixed(2)} of gross` : ""}; bars show signed γ per strike.` : "Net gamma has no run." },
    { id: "flip", label: "Flip", sub: fPct != null ? `${fPct >= 0 ? "+" : "−"}${Math.abs(fPct).toFixed(2)} % from spot` : "",
      value: fVal != null ? num(fVal) : isAwaiting(flip) ? <Absent word={closedWord} /> : fStatus && flipAbsent[fStatus] ? <Absent word={flipAbsent[fStatus]} /> : <Absent word="no run" />,
      levelIds: ["flip"], caption: fVal != null ? `Flip at ${num(fVal)}, ${fPct! >= 0 ? "+" : "−"}${Math.abs(fPct!).toFixed(2)}% from spot (dashed rule).` : isAwaiting(flip) ? `Flip: ${closedWord}.` : `Flip: ${fStatus && flipAbsent[fStatus] ? flipAbsent[fStatus] : "no run"}.` },
    { id: "corridor", label: "Corridor", sub: cState ? stateWord[cState] ?? cState.toLowerCase() : "",
      value: pw != null && cw != null && cState !== "UNDEFINED" ? `${num(pw)}–${num(cw)}` : <Absent word="corridor undefined" />,
      levelIds: ["callwall", "putwall"], caption: pw != null && cw != null ? `Put OI wall ${num(pw)} to call OI wall ${num(cw)}${widthPct != null ? `, ${widthPct.toFixed(2)}% wide` : ""}; spot is ${stateWord[cState ?? ""] ?? "—"}.` : "Corridor undefined." },
    { id: "pin", label: "Pin (γ-conc)", sub: [sh1 != null ? `${(sh1 * 100).toFixed(1)} % of gross` : null, lead != null ? `lead ${lead.toFixed(1)} pts` : null].filter(Boolean).join(" · "),
      value: pin != null ? num(pin) : <Absent word="no run" />, levelIds: ["gconc"],
      caption: pin != null ? `${num(pin)} carries the largest gamma share${sh1 != null ? `, ${(sh1 * 100).toFixed(1)}% of gross` : ""} (dotted rule).` : "No ranked strike." },
    { id: "priced", label: "Priced move", sub: strad != null && spot ? `±${((strad / spot) * 100).toFixed(2)} % to expiry` : "",
      value: strad != null ? `±${num(strad)}` : <Absent word="no run" />, levelIds: [], priced: true,
      caption: strad != null ? `The straddle prices ±${num(strad)} to expiry; the left gutter marks strikes inside it.` : "No straddle." },
    { id: "spot", label: `Spot · board ${istTime(g?.ts)}`, sub: boardChg != null && prevClose ? `${sgn(boardChg, 1)} · ${sgn((boardChg / prevClose) * 100, 2)} %` : "",
      value: spot != null ? num(spot, 1) : <Absent word="no run" />, levelIds: ["spot"],
      caption: spot != null ? `${liveSpot ? `Live ${num(liveSpot.spot, 1)} at ${istTime(liveSpot.ts)}. ` : ""}The board is measured against spot ${num(spot, 1)} at the γ run of ${istTime(g?.ts)}.` : "No spot." },
    { id: "dte", label: "Time to expiry", sub: expiry ? `front ${expShort(expiry)}` : "",
      value: dteS != null ? `${dteS} sess` : isAwaiting(iv) ? <Absent word={closedWord} /> : <Absent word="no chain" />, levelIds: [],
      caption: dteS != null ? `${dteS} trading session${dteS === 1 ? "" : "s"} to the front expiry.` : isAwaiting(iv) ? `Time to expiry: ${closedWord}.` : "No chain." },
  ];

  const C = { sel, onSel: setSel };
  const silhouette = (() => {
    const rs = ladder?.rows ?? []; if (!rs.length) return null;
    const m = new Map<number, number>(); let acc = 0;
    for (let k = rs.length - 1; k >= 0; k--) { acc += rs[k].gex ?? 0; m.set(rs[k].strike, acc); }
    return m;
  })();
  const hasPositive = (ladder?.rows ?? []).some((r) => (r.gex ?? 0) > 0);
  const netLong = hasPositive ? n(g?.max_gamma_strike) : null;
  const gammaLevels: Level[] = [
    ...(spot != null ? [{ id: "spot", name: "SPOT", at: spot, style: "spot" as const }] : []),
    ...(fVal != null ? [{ id: "flip", name: "FLIP", at: fVal, style: "dashed" as const }] : []),
    ...(netLong != null ? [{ id: "netlong", name: "NET-LONG γ", at: netLong, style: "dotted" as const }] : []),
  ];
  const hN = n(conc?.hhi_net), hC = n(conc?.hhi_call), hP = n(conc?.hhi_put);
  const bucket: string | null = conc?.dte_bucket ?? null;
  const nC = n(abs?.n_contributing), nS = n(abs?.n_strikes);
  const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)} %`);
  const sparkG = netToday.map((r) => r.v);
  const crossings = silhouette ? (() => { const a = [...silhouette.entries()].sort((x, y) => y[0] - x[0]); let c = 0; for (let k = 1; k < a.length; k++) if (Math.sign(a[k][1]) !== Math.sign(a[k - 1][1]) && a[k][1] !== 0) c++; return c; })() : 0;
  const gammaItems: OverviewItem[] = [
    { id: "g_top", label: "Top-strike share", sub: bucket ? `${bucket === "0" ? "0" : bucket} DTE bucket${n(conc?.top_strike_net) != null ? ` · at ${num(n(conc.top_strike_net))}` : ""}` : "",
      value: hN != null ? pct(hN) : <Absent word="no run" />, levelIds: [],
      caption: hN != null ? `The largest strike carries ${pct(hN)} of gross |γ| (calls ${pct(hC)}, puts ${pct(hP)}); ${bucket ?? "—"} DTE bucket.` : "No concentration run.",
      extra: hN != null ? (
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>Call / put split</div>
          {[["calls", hC, "var(--call)"], ["puts", hP, "var(--put)"]].map(([l, v, c]) => (
            <div key={l as string} className="mt-1 flex items-center gap-2 text-[12px]">
              <span className="w-10" style={{ color: "var(--ink-3)" }}>{l as string}</span>
              <div className="h-2 flex-1 max-w-[240px]" style={{ background: "var(--s2)" }}><div className="h-full" style={{ width: `${Math.min(100, ((v as number) ?? 0) * 100)}%`, background: c as string }} /></div>
              <span style={{ color: "var(--ink-1)" }}>{pct(v as number | null)}</span>
            </div>
          ))}
        </div>) : undefined },
    { id: "g_gross", label: "Gross |Γ|", sub: "₹ Cr · unit pending (E-D1)", value: gross != null ? crLakh(gross).replace(/^\+/, "") : <Absent word="no run" />, levelIds: [],
      caption: gross != null ? `Gross absolute gamma is ${crLakh(gross).replace(/^\+/, "")}${ratio != null ? `; net is ${ratio.toFixed(2)} of it` : ""}.` : "No exposure run." },
    { id: "g_net", label: "Net Γ", sub: net != null ? `${net >= 0 ? "dampening" : "amplifying"}${crossings ? ` · Σ crosses zero ${crossings}×` : ""}` : "",
      value: net != null ? <span style={{ color: hue(net) }}>{crLakh(net)}</span> : <Absent word="no run" />, levelIds: [],
      caption: net != null ? `Net γ ${crLakh(net)}. White dots = running sum from the top strike down; ${crossings ? `it crosses zero ${crossings}× — the book changes sign there` : "it never crosses zero in the chain"}.` : "No exposure run." },
    { id: "g_contrib", label: "Contributing strikes", sub: nC != null && nS ? `${((nC / nS) * 100).toFixed(0)} % of stored` : "",
      value: nC != null && nS != null ? `${nC} / ${nS}` : <Absent word="no run" />, levelIds: [],
      caption: nC != null && nS != null ? `${nC} of ${nS} stored strikes carry gamma.` : "No exposure run." },
    ...(netLong != null ? [{ id: "g_netlong", label: "Net-long γ strike", sub: spot ? `${sgn(((netLong - spot) / spot) * 100, 2)} % from spot · not "near spot"` : "",
      value: num(netLong), levelIds: ["netlong"], caption: `Dealers are most net-long gamma at ${num(netLong)} (dotted rule).` }] : []),
    { id: "g_spark", label: "Net Γ today", sub: sparkG.length >= 3 ? `${sparkG.length} runs · ${istTime(netToday[0].ts)}–${istTime(netToday[netToday.length - 1].ts)}` : `${sparkG.length} run${sparkG.length === 1 ? "" : "s"} · sparkline needs 3`,
      value: sparkG.length >= 3 ? <span className="inline-block w-[90px]"><Spark pts={sparkG} /></span> : <span style={{ color: "var(--ink-3)" }}>—</span>, levelIds: [],
      caption: sparkG.length >= 3 ? `Net γ moved from ${crLakh(sparkG[0])} to ${crLakh(sparkG[sparkG.length - 1])} over ${sparkG.length} runs today.` : "Fewer than 3 runs today — no sparkline." },
  ];

  const ivTab = useIvTab(symbol).data;
  // ---------- OI tab (Phase 1d) ----------
  const oiRaw = ladder?.rows ?? [];
  const totalCall = oiRaw.reduce((sum, r) => sum + (r.oiCall ?? 0), 0);
  const totalPut = oiRaw.reduce((sum, r) => sum + (r.oiPut ?? 0), 0);
  const totalOI = totalCall + totalPut;
  const oiFmt = (v: number) => Math.abs(v) >= 1e5 ? `${sgn(v / 1e5, 1)}L` : Math.abs(v) >= 1e3 ? `${sgn(v / 1e3, 1)}K` : sgn(v, 0);
  const deltaAvailable = symbol !== "SENSEX" && (ladder?.runCount ?? 0) >= 2;
  const deltaNet = deltaAvailable ? oiRaw.reduce((sum, r) => sum + (r.deltaCall ?? 0) + (r.deltaPut ?? 0), 0) : null;
  const maxPain = painRows[0]?.maxPain ?? null;
  const maxPainPct = maxPain != null && spot ? ((maxPain - spot) / spot) * 100 : null;
  const oiRows = oiRaw.map((r) => ({
    strike: r.strike, value: null, tint: null,
    leftValue: r.oiPut, rightValue: r.oiCall,
    deltaLeft: deltaAvailable ? r.deltaPut : null, deltaRight: deltaAvailable ? r.deltaCall : null,
    readout: oiFmt((r.oiCall ?? 0) + (r.oiPut ?? 0)),
    full: `put ${oiFmt(r.oiPut ?? 0)} · call ${oiFmt(r.oiCall ?? 0)}`,
  }));
  const painCurve = painRows.length ? new Map(painRows.map((r) => [r.strike, r.pain])) : null;
  const oiLevels: Level[] = maxPain != null ? [{ id: "maxpain", name: `MAX PAIN ${num(maxPain)}`, at: maxPain, style: "spot" }] : [];
  const oiDeltaNote = symbol === "SENSEX" ? "ΔOI · n/a (SENSEX)" : (ladder?.runCount ?? 0) < 2 ? "ΔOI · 1 run" : "ΔOI · since first run";
  const oiItems: OverviewItem[] = [
    { id: "oi_max", label: "Max pain", sub: "γ clock · pain minimum", value: maxPain != null ? num(maxPain) : <Absent word="no run" />, levelIds: ["maxpain"], caption: maxPain != null ? `Max pain is ${num(maxPain)}; the ink rule marks the minimum of the faint pain valley.` : "No max-pain run." },
    { id: "oi_dist", label: "Distance to max pain", sub: maxPainPct == null ? "" : maxPainPct > 0 ? "above spot" : maxPainPct < 0 ? "below spot" : "at spot", value: maxPainPct != null ? `${sgn(maxPainPct, 2)} %` : <Absent word="no run" />, levelIds: ["maxpain"], caption: maxPainPct != null ? `Max pain is ${Math.abs(maxPainPct).toFixed(2)}% ${maxPainPct > 0 ? "above" : maxPainPct < 0 ? "below" : "at"} spot.` : "Distance unavailable." },
    { id: "oi_callwall", label: "Call OI wall", sub: "calls · right wing", value: cw != null ? num(cw) : <Absent word="no wall" />, levelIds: [], caption: cw != null ? `Call OI wall is ${num(cw)}; call contracts extend right from the strike axis.` : "No call wall." },
    { id: "oi_putwall", label: "Put OI wall", sub: "puts · left wing", value: pw != null ? num(pw) : <Absent word="no wall" />, levelIds: [], caption: pw != null ? `Put OI wall is ${num(pw)}; put contracts extend left from the strike axis.` : "No put wall." },
    { id: "oi_total", label: "Total OI", sub: `calls ${oiFmt(totalCall)} · puts ${oiFmt(totalPut)}`, value: totalOI ? oiFmt(totalOI).replace(/^\+/, "") : <Absent word="no run" />, levelIds: [], caption: `Stored chain OI totals ${oiFmt(totalOI).replace(/^\+/, "")} contracts: calls ${oiFmt(totalCall).replace(/^\+/, "")}, puts ${oiFmt(totalPut).replace(/^\+/, "")}.` },
    ...(symbol !== "SENSEX" ? [{ id: "oi_delta", label: "ΔOI net", sub: oiDeltaNote, value: deltaNet != null ? <span style={{ color: hue(deltaNet) }}>{oiFmt(deltaNet)}</span> : <span style={{ color: "var(--ink-3)" }}>—</span>, levelIds: [], caption: deltaNet != null ? `Net OI changed ${oiFmt(deltaNet)} contracts since today's first gamma run.` : "One run today — ΔOI ticks are hidden." }] : []),
  ];

  // ---------- Pin tab (S92: L12 — rulings S92-D, S92-F) ----------
  const pinHist = (usePinBoard(symbol).data ?? []) as any[];
  const rankAll = (useStrikeRankAll(symbol).data ?? []) as { strike: number; rank: number; share: number; cum: number | null; gex: number; side: string | null; ts: string }[];
  const pinLatest = pinHist.find((r) => r.is_latest) ?? pinHist[pinHist.length - 1] ?? null;
  const pinSession: string | null = pinLatest?.session_date_ist ?? null;
  const pinPrevSession = pinSession != null && session != null && pinSession !== session;
  const pinState: string | null = pinLatest?.pin_state ?? null;
  const heldCycles = n(pinLatest?.held_for_cycles);
  const conviction = n(pinLatest?.conviction);
  const r2r1 = n(pinLatest?.runnerup_share_ratio);
  const hhiTrue = n(pinLatest?.conc_hhi), top5 = n(pinLatest?.top5_share);
  const pinRunner = n(r2?.strike);
  const pinBandLo = n(pinBandRow?.pin_lower), pinBandHi = n(pinBandRow?.pin_upper);
  const pinDist = pin != null && spot ? ((pin - spot) / spot) * 100 : null;
  const legacyPinRisk = n(g?.pin_risk_score);
  const stretches = (() => {
    const out: { strike: number | null; from: string; to: string; cycles: number }[] = [];
    for (const r of pinHist) {
      const k = n(r.pin_leader_strike);
      const last = out[out.length - 1];
      if (last && last.strike === k) { last.to = r.ts; last.cycles++; } else out.push({ strike: k, from: r.ts, to: r.ts, cycles: 1 });
    }
    return out;
  })();
  const leaderChanges = Math.max(0, stretches.length - 1);
  const pinRows = rankAll.length ? (ladder?.rows ?? []).map((lr) => {
    const rk = rankAll.find((x) => x.strike === lr.strike);
    return rk ? { strike: lr.strike, value: rk.share, tint: rk.gex, faint: rk.rank > 10,
      readout: `#${rk.rank} · ${(rk.share * 100).toFixed(1)}%`, full: `#${rk.rank} · ${(rk.share * 100).toFixed(1)}% of gross · ${rk.side?.toLowerCase() ?? "—"}` }
      : { strike: lr.strike, value: null, tint: null, readout: "·", full: "unranked" };
  }) : [];
  const pinLevels: Level[] = [
    ...(spot != null ? [{ id: "spot", name: "SPOT", at: spot, style: "spot" as const }] : []),
    ...(pin != null ? [{ id: "gconc", name: "γ-CONC #1", at: pin, style: "dotted" as const }] : []),
    ...(pinRunner != null && pinRunner !== pin ? [{ id: "runner", name: "#2", at: pinRunner, style: "dotted" as const }] : []),
  ];
  const minsHeld = heldCycles != null ? heldCycles * 5 : null;
  const pinStateWord: Record<string, string> = { "NO PIN": "no pin", SHIFTING: "shifting", STABLE: "stable", LOCKED: "locked" };
  const pinItems: OverviewItem[] = [
    { id: "p_pin", label: "Pin (γ-conc)", sub: [sh1 != null ? `${(sh1 * 100).toFixed(1)} % of gross` : null, r1?.strike != null ? (rankAll.find((x) => x.rank === 1)?.side?.toLowerCase() ?? null) : null, pinWall].filter(Boolean).join(" · "),
      value: pin != null ? num(pin) : <Absent word="no run" />, levelIds: ["gconc"],
      caption: pin != null ? `${num(pin)} holds the largest share of gross |γ|${sh1 != null ? `, ${(sh1 * 100).toFixed(1)}%` : ""}; bars show every ranked strike's share.` : "No ranked strike." },
    { id: "p_state", label: "Pin state", sub: pinLatest ? [minsHeld != null ? `held ${heldCycles} cycles · ${minsHeld} min` : null, pinPrevSession ? `session ${pinSession}` : null, pinLatest.reconciled_at ? "reconciled" : "live · unreconciled"].filter(Boolean).join(" · ") : "",
      value: pinState ? pinState : pinLatest ? <Absent word={pinLatest.pin_state_reason ? "state n/a" : "no state"} /> : <Absent word="no history" />, levelIds: ["gconc"],
      caption: pinState ? `Pin ${pinStateWord[pinState] ?? pinState.toLowerCase()} at ${num(n(pinLatest.pin_leader_strike))}${heldCycles != null ? `, leader held ${heldCycles} OPEN cycles (${minsHeld} min)` : ""}.` : pinLatest?.pin_state_reason ? `Pin state unavailable: ${pinLatest.pin_state_reason}.` : "No pin history for this session yet." },
    { id: "p_conv", label: "Conviction", sub: "stage 1 · no band (D-6)",
      value: conviction != null ? conviction.toFixed(2) : pinLatest?.conviction_reason ? <Absent word="n/a" /> : <Absent word="no history" />, levelIds: ["gconc", "runner"],
      caption: conviction != null ? `Conviction ${conviction.toFixed(2)} = (1 − #2/#1${r2r1 != null ? ` = ${r2r1.toFixed(2)}` : ""}) × time boost. A number, not a grade.` : pinLatest?.conviction_reason ? `Conviction unavailable: ${pinLatest.conviction_reason}.` : "No conviction yet." },
    { id: "p_runner", label: "Runner-up", sub: r2r1 != null ? `#2/#1 = ${r2r1.toFixed(2)}` : sh2 != null ? `${(sh2 * 100).toFixed(1)} % of gross` : "",
      value: pinRunner != null ? num(pinRunner) : <Absent word="no #2" />, levelIds: ["runner"],
      caption: pinRunner != null ? `${num(pinRunner)} is second${sh2 != null ? ` with ${(sh2 * 100).toFixed(1)}% of gross` : ""}.` : "Fewer than two ranked strikes." },
    { id: "p_lead", label: "Lead", sub: "#1 − #2, share points",
      value: lead != null ? `${lead.toFixed(1)} pts` : <Absent word="no #2" />, levelIds: ["gconc", "runner"],
      caption: lead != null ? `#1 leads #2 by ${lead.toFixed(1)} share points (both outlined).` : "No lead without a runner-up." },
    { id: "p_hhi", label: "Concentration (HHI)", sub: top5 != null ? `top-5 share ${(top5 * 100).toFixed(1)} %` : "",
      value: hhiTrue != null ? hhiTrue.toFixed(3) : <Absent word="no history" />, levelIds: [],
      caption: hhiTrue != null ? `Herfindahl Σshare² = ${hhiTrue.toFixed(3)}${top5 != null ? `; the top 5 strikes hold ${(top5 * 100).toFixed(1)}%` : ""}.` : "No concentration history yet." },
    { id: "p_band", label: "Pin band", sub: "τ-weighted zone (ENH-81)",
      value: pinBandLo != null && pinBandHi != null ? (pinBandLo === pinBandHi ? num(pinBandLo) : `${num(pinBandLo)}–${num(pinBandHi)}`) : <Absent word="no band" />, levelIds: [],
      caption: pinBandLo != null ? `Pin band ${num(pinBandLo)}–${num(pinBandHi)}; the right gutter marks it.` : "No pin band." },
    { id: "p_dist", label: "Pin distance", sub: pinDist == null ? "" : pinDist > 0 ? "above spot" : pinDist < 0 ? "below spot" : "at spot",
      value: pinDist != null ? `${sgn(pinDist, 2)} %` : <Absent word="no run" />, levelIds: ["gconc", "spot"],
      caption: pinDist != null ? `The pin is ${Math.abs(pinDist).toFixed(2)}% ${pinDist > 0 ? "above" : pinDist < 0 ? "below" : "at"} spot.` : "Distance unavailable." },
    { id: "p_today", label: "Leader today", sub: pinHist.length ? `${pinHist.length} cycles · ${istTime(pinHist[0].ts)}–${istTime(pinHist[pinHist.length - 1].ts)}` : "",
      value: pinHist.length ? `${leaderChanges} change${leaderChanges === 1 ? "" : "s"}` : <Absent word="no history" />, levelIds: [],
      caption: pinHist.length ? `The leader changed ${leaderChanges} time${leaderChanges === 1 ? "" : "s"} over ${pinHist.length} OPEN cycles.` : "No pin history yet.",
      extra: stretches.length ? (
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>Leader stretches</div>
          <div className="mt-1 grid max-w-[420px] grid-cols-[auto_1fr_auto] gap-x-4 gap-y-0.5 text-[12px]">
            {stretches.slice(-12).map((st, i) => (
              <div key={i} className="contents">
                <span style={{ color: "var(--ink-1)" }}>{st.strike != null ? num(st.strike) : "—"}</span>
                <span style={{ color: "var(--ink-3)" }}>{istTime(st.from)}–{istTime(st.to)}</span>
                <span style={{ color: "var(--ink-2)" }}>{st.cycles} cyc</span>
              </div>
            ))}
          </div>
          {stretches.length > 12 && <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>latest 12 of {stretches.length}</div>}
        </div>) : undefined },
    ...(legacyPinRisk != null ? [{ id: "p_legacy", label: "Legacy pin-risk score", sub: "number only · no band (E-D4)", value: `${num(legacyPinRisk)}/100`, levelIds: [],
      caption: `The pre-parity pin-risk score reads ${num(legacyPinRisk)}/100; its 25/50/75 words were never measured.` }] : []),
  ];
  const pinNote = pinHist.length ? `pin state · ${pinPrevSession ? `previous session ${pinSession}` : "this session"} · front leg` : "pin state · no history";

  // ---------- Flows tab (S92: L7/L8 — rulings S92-C, S92-E) ----------
  const flowSim = (useFlowSim(symbol).data ?? []) as any[];
  const l78raw = useGreeksNet(symbol).data as any;
  const l78 = (Array.isArray(l78raw) ? l78raw : []) as any[];
  const l78Leg = l78.find((r) => r.status === "OK") ?? l78[0] ?? null;
  const l78FrontSkipped = l78[0] && l78[0] !== l78Leg && l78[0].status === "SKIPPED_EXPIRY";
  const l78Strikes = (useGreeksStrike(symbol, l78Leg?.ts ?? null, l78Leg?.expiry_date ?? null).data ?? []) as { strike: number; d_div: number | null; d_dt: number | null; g_div: number | null; g_dt: number | null }[];
  const fKey: Record<string, "d_dt" | "d_div" | "g_dt" | "g_div"> = { f_ddt: "d_dt", f_ddiv: "d_div", f_gdt: "g_dt", f_gdiv: "g_div" };
  const flowLayer = (sel && fKey[sel]) || "d_dt";
  const fmtCr = (v: number | null) => (v == null ? "—" : crLakh(v));
  const flowRows = l78Strikes.length ? (ladder?.rows ?? []).map((lr) => {
    const r = l78Strikes.find((x) => x.strike === lr.strike);
    const v = r ? r[flowLayer] : null;
    return { strike: lr.strike, value: v, tint: null, readout: v == null ? "·" : lad(v), full: v == null ? "no legs" : `${lad(v)} Cr` };
  }) : [];
  const flowLevels: Level[] = [
    ...(spot != null ? [{ id: "spot", name: "SPOT", at: spot, style: "spot" as const }] : []),
    ...(fVal != null ? [{ id: "flip", name: "FLIP (L3)", at: fVal, style: "dashed" as const }] : []),
  ];
  const fl = (k: string) => n(l78Leg?.[k]);
  const pairVal = (net: number | null, gross: number | null) => net == null ? <Absent word={l78Leg ? (l78Leg.status === "OK" ? "no value" : l78Leg.status.toLowerCase().replace(/_/g, " ")) : "no chain"} /> :
    <span><span style={{ color: hue(net) }}>{fmtCr(net)}</span>{gross != null && <span style={{ color: "var(--ink-2)" }}> / {fmtCr(gross).replace(/^\+/, "")}</span>}</span>;
  const flowAt = (pct: number) => n(flowSim.find((r) => Math.abs(Number(r.spot_pct) - pct) < 1e-9)?.flow_cr);
  const fm1 = flowAt(-0.01), fp1 = flowAt(0.01);
  const flowWord = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "BUY" : "SELL"} ${num(Math.abs(v))}`);
  const flowChart = flowSim.length >= 2 ? (() => {
    const pts = flowSim.map((r) => ({ x: Number(r.spot_pct) * 100, y: Number(r.flow_cr) })).sort((a, b) => a.x - b.x);
    const yMax = Math.max(1, ...pts.map((p) => Math.abs(p.y)));
    const VW = 640, VH = 200, L = 40, R = 16, T = 18, B = 26;
    const X = (x: number) => L + ((x + 2.5) / 5) * (VW - L - R), Y = (y: number) => T + (1 - (y / yMax + 1) / 2) * (VH - T - B);
    const flipX = fPct != null && Math.abs(fPct) <= 2.5 ? X(fPct) : null;
    const tick = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x)}%`;
    return (
      <div className="mb-3 rounded-md p-3" style={{ border: "1px solid var(--line)" }}>
        <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>Hedge flow vs spot move (₹ Cr)</div>
        <svg viewBox={`0 0 ${VW} ${VH}`} className="mt-1 block h-auto w-full max-w-[760px]" style={{ fontFamily: "var(--font-plex-cond)" }}>
          <line x1={L} x2={VW - R} y1={Y(0)} y2={Y(0)} stroke="var(--axis)" />
          <text x={L - 6} y={Y(0) + 3} fontSize="10" textAnchor="end" fill="var(--ink-3)">0</text>
          <line x1={X(0)} x2={X(0)} y1={T} y2={VH - B} stroke="var(--axis)" />
          {flipX != null && <line x1={flipX} x2={flipX} y1={T} y2={VH - B} stroke="var(--rule)" strokeDasharray="4 3" />}
          <polyline points={pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")} fill="none" stroke="var(--ink-1)" strokeWidth="1.5" />
          {pts.map((p, i) => (
            <g key={i}>
              <line x1={X(p.x)} x2={X(p.x)} y1={VH - B} y2={VH - B + 4} stroke="var(--axis)" />
              <text x={X(p.x)} y={VH - 8} fontSize="10" textAnchor="middle" fill="var(--ink-3)">{tick(p.x)}</text>
              <circle cx={X(p.x)} cy={Y(p.y)} r="3.5" fill={p.y >= 0 ? "var(--cool)" : "var(--warm)"} />
              <text x={X(p.x)} y={Y(p.y) + (p.y >= 0 ? -8 : 15)} fontSize="10" textAnchor="middle" fill="var(--ink-2)">{flowWord(p.y)}</text>
            </g>
          ))}
        </svg>
        <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          {flipX != null ? "Dashed = L3 repriced flip at its distance from spot." : fPct != null ? `L3 flip is ${sgn(fPct, 2)}% away — outside ±2.5%.` : "L3 flip not available."}
        </div>
      </div>);
  })() : undefined;
  const legLine = (r: any) => `${expShort(r.expiry_date)} · ${r.dte} d · ${String(r.status).toLowerCase().replace(/_/g, " ")}`;
  const flowItems: OverviewItem[] = [
    { id: "f_hedge", label: "Hedge per 1 %", sub: fm1 != null ? `−1 %: ${flowWord(fm1)} · +1 %: ${flowWord(fp1)}` : "",
      value: fp1 != null ? <span style={{ color: hue(fp1) }}>{flowWord(fp1)}</span> : <Absent word="no run" />, levelIds: [],
      caption: fp1 != null ? `For a +1% move dealers would ${fp1 >= 0 ? "buy" : "sell"} about ₹${num(Math.abs(fp1))} Cr; for −1%, ${fm1 != null && fm1 >= 0 ? "buy" : "sell"} about ₹${num(Math.abs(fm1 ?? 0))} Cr. Bars show ∂Δ/∂t per strike.` : "No flow simulation." },
    { id: "f_ddt", ratio: fl("net_over_gross_delta_drift_time"), label: "∂Δ/∂t · per day", sub: fl("net_over_gross_delta_drift_time") != null ? `net/gross ${fl("net_over_gross_delta_drift_time")!.toFixed(2)} · Cr Δ-notional` : "Cr Δ-notional",
      value: pairVal(fl("net_delta_drift_time_cr_per_day"), fl("gross_strike_delta_drift_time")), levelIds: [],
      caption: fl("net_delta_drift_time_cr_per_day") != null ? `Dealer delta-notional drifts ${fmtCr(fl("net_delta_drift_time_cr_per_day"))} per calendar day (gross ${fmtCr(fl("gross_strike_delta_drift_time")).replace(/^\+/, "")}); bars per strike.` : "No ∂Δ/∂t for this leg." },
    { id: "f_ddiv", ratio: fl("net_over_gross_delta_drift_iv"), label: "∂Δ/∂σ · per vol pt", sub: fl("net_over_gross_delta_drift_iv") != null ? `net/gross ${fl("net_over_gross_delta_drift_iv")!.toFixed(2)} · Cr Δ-notional` : "Cr Δ-notional",
      value: pairVal(fl("net_delta_drift_iv_cr_per_volpt"), fl("gross_strike_delta_drift_iv")), levelIds: [],
      caption: fl("net_delta_drift_iv_cr_per_volpt") != null ? `A +1 IV point moves dealer delta-notional ${fmtCr(fl("net_delta_drift_iv_cr_per_volpt"))} (gross ${fmtCr(fl("gross_strike_delta_drift_iv")).replace(/^\+/, "")}); bars per strike.` : "No ∂Δ/∂σ for this leg." },
    { id: "f_gdt", ratio: fl("net_over_gross_gex_drift_time"), label: "∂Γ/∂t · per day", sub: fl("net_over_gross_gex_drift_time") != null ? `net / gross · ratio ${fl("net_over_gross_gex_drift_time")!.toFixed(2)} — read together` : "net / gross — read together",
      value: pairVal(fl("net_gex_drift_time_cr_per_day"), fl("gross_strike_gex_drift_time")), levelIds: [],
      caption: fl("net_gex_drift_time_cr_per_day") != null ? `∂Γ/∂t net ${fmtCr(fl("net_gex_drift_time_cr_per_day"))} against gross ${fmtCr(fl("gross_strike_gex_drift_time")).replace(/^\+/, "")} — a residue of opposing strikes; read the bars.` : "No ∂Γ/∂t for this leg." },
    { id: "f_gdiv", ratio: fl("net_over_gross_gex_drift_iv"), label: "∂Γ/∂σ · per vol pt", sub: fl("net_over_gross_gex_drift_iv") != null ? `net / gross · ratio ${fl("net_over_gross_gex_drift_iv")!.toFixed(2)} — read together` : "net / gross — read together",
      value: pairVal(fl("net_gex_drift_iv_cr_per_volpt"), fl("gross_strike_gex_drift_iv")), levelIds: [],
      caption: fl("net_gex_drift_iv_cr_per_volpt") != null ? `∂Γ/∂σ net ${fmtCr(fl("net_gex_drift_iv_cr_per_volpt"))} against gross ${fmtCr(fl("gross_strike_gex_drift_iv")).replace(/^\+/, "")}; read the bars.` : "No ∂Γ/∂σ for this leg." },
    { id: "f_leg", label: "Expiry leg", sub: l78Leg ? `${l78FrontSkipped ? "front skipped · expiry day · " : ""}chain ${istTime(l78Leg.ts)}` : "",
      value: l78Leg ? expShort(l78Leg.expiry_date) ?? "—" : isAwaiting(l78raw) ? <Absent word={closedWord} /> : <Absent word="no chain" />, levelIds: [],
      caption: l78Leg ? `Showing ${legLine(l78Leg)}.` : "No L7/L8 rows.",
      extra: l78.length ? (
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>All captured legs</div>
          <div className="mt-1 grid max-w-[520px] grid-cols-[auto_auto_1fr_1fr] gap-x-4 gap-y-0.5 text-[12px]">
            <span style={{ color: "var(--ink-3)" }}>leg</span><span style={{ color: "var(--ink-3)" }}>status</span><span style={{ color: "var(--ink-3)" }}>∂Δ/∂t /day</span><span style={{ color: "var(--ink-3)" }}>∂Δ/∂σ /vol pt</span>
            {l78.map((r, i) => (
              <div key={i} className="contents">
                <span style={{ color: "var(--ink-1)" }}>{expShort(r.expiry_date)} · {r.dte} d</span>
                <span style={{ color: "var(--ink-2)" }}>{String(r.status).toLowerCase().replace(/_/g, " ")}</span>
                <span style={{ color: "var(--ink-2)" }}>{fmtCr(n(r.net_delta_drift_time_cr_per_day))}</span>
                <span style={{ color: "var(--ink-2)" }}>{fmtCr(n(r.net_delta_drift_iv_cr_per_volpt))}</span>
              </div>
            ))}
          </div>
        </div>) : undefined },
  ];
  const flowsBadge = (
    <div className="mb-3 rounded border border-dashed px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ borderColor: "var(--rule)", color: "var(--ink-1)" }}>
      PROVISIONAL — flow-vs-book (D-4) not built
    </div>);
  const layerName: Record<string, string> = { d_dt: "∂Δ/∂t", d_div: "∂Δ/∂σ", g_dt: "∂Γ/∂t", g_div: "∂Γ/∂σ" };
  const flowsNote = l78Leg ? `bars · ${layerName[flowLayer]} · ${expShort(l78Leg.expiry_date)} leg · chain ${istTime(l78Leg.ts)}` : "bars · no L7/L8 rows";

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-4 md:px-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5 min-[1440px]:grid-flow-col min-[1440px]:auto-cols-fr min-[1440px]:grid-cols-none">
        <Cell id="dte" label="Symbol · Expiry" {...C}
          value={expiry ? `${expShort(expiry)}` : <Absent word="no expiry" />} sub={[symbol, s1sub].filter(Boolean).join(" · ")} />

        <Cell id="spot" label={liveSpot ? `Spot · live ${istTime(liveSpot.ts)}` : "Spot"} {...C}
          value={headSpot != null ? num(headSpot, 1) : <Absent word="no run" />}
          sub={spotChg != null && prevClose ? <><Mark delta={spotChg} />{sgn(spotChg, 1)} · {sgn((spotChg / prevClose) * 100, 2)} %{liveSpot && spot != null ? ` · board ${istTime(g?.ts)} @ ${num(spot, 1)}` : ""}</> : undefined}
          viz={sparkPts.length >= 3 ? <Spark pts={sparkPts} /> : undefined} />

        <Cell id="net" label="Net Γ" {...C}
          value={net != null ? crLakh(net) : <Absent word="no run" />} color={hue(net)}
          sub={net != null ? `${net >= 0 ? "long γ" : "short γ"}${ratio != null ? ` · ${ratio.toFixed(2)} of gross` : ""} · unit definition pending` : undefined}
          viz={net != null && gross ? (
            <SplitBar net={net} gross={gross} />
          ) : undefined} />

        <Cell id="flip" label="Flip" {...C}
          value={fVal != null ? num(fVal, 0) : isAwaiting(flip) ? <Absent word={closedWord} /> : fStatus && flipAbsent[fStatus] ? <Absent word={flipAbsent[fStatus]} /> : <Absent word="no run" />}
          sub={fPct != null ? `${fPct >= 0 ? "+" : "−"}${Math.abs(fPct).toFixed(2)} % from spot` : undefined}
          viz={fSpot != null ? <Track lo={fSpot * 0.97} hi={fSpot * 1.03} spot={fSpot}
            ticks={fVal != null ? [{ at: fVal, color: "var(--rule)", dashed: true }] : []} /> : undefined} />

        <Cell id="corridor" label="Corridor" {...C}
          value={pw != null && cw != null && cState !== "UNDEFINED" ? `${num(pw)}–${num(cw)}` : <Absent word="corridor undefined" />}
          sub={cState ? [stateWord[cState] ?? cState.toLowerCase(), widthPct != null && cState !== "UNDEFINED" ? `${widthPct.toFixed(2)} % wide` : null, walls?.iv_fresh === false ? "IV stale" : null].filter(Boolean).join(" · ") : undefined}
          viz={pw != null && cw != null && wSpot != null && cState !== "UNDEFINED" ? (() => {
            const lo = Math.min(pw, wSpot), hi = Math.max(cw, wSpot), pad = (hi - lo) * 0.08 || 1;
            return <Track lo={lo - pad} hi={hi + pad} spot={wSpot} ticks={[{ at: pw, color: "var(--put)" }, { at: cw, color: "var(--call)" }]} />;
          })() : undefined} />

        <Cell id="pin" label="Pin (γ-conc)" {...C}
          value={pin != null ? num(pin) : <Absent word="no run" />}
          sub={pin != null ? [sh1 != null ? `${(sh1 * 100).toFixed(1)} % of gross` : null, lead != null ? `lead ${lead.toFixed(1)} pts` : null, pinWall].filter(Boolean).join(" · ") : undefined}
          viz={sh1 != null ? (
            <div className="mt-2 space-y-0.5">
              <div className="h-1 w-full rounded-sm" style={{ background: "var(--rule)" }} />
              {sh2 != null && sh1 > 0 && <div className="h-1 rounded-sm" style={{ width: `${(sh2 / sh1) * 100}%`, background: "var(--ink-3)" }} />}
            </div>
          ) : undefined} />

        <Cell id="priced" label="IV · VIX" {...C}
          value={isAwaiting(iv) && vix == null ? <Absent word={closedWord} /> : atmIv != null || vix != null ? <>{isAwaiting(iv) ? <Absent word="market closed" /> : atmIv != null ? atmIv.toFixed(1) : "—"} · {vix != null ? vix.toFixed(2) : "—"}</> : <Absent word="no chain" />}
          sub={<>
            {vixChg != null && <><Mark delta={vixChg} />VIX {sgn(vixChg, 2)}</>}
            {strad != null && spot ? `${vixChg != null ? " · " : ""}±${num(strad, 0)} · ±${((strad / spot) * 100).toFixed(2)} %` : ""}
            {iv?.front_is_0dte ? " · front is 0 DTE" : ""}
          </>} />

        <Cell id="s8" label="Fut · Basis" {...C}
          value={futMsg === "futures from 09:30" ? <Absent word="futures from 09:30" /> : fp != null ? <>{num(fp)} · {basis != null ? sgn(basis, 1) : "—"}</> : <Absent word="no futures" />}
          sub={futMsg === "futures stale" ? "futures stale" : <>
            {basisChg != null && <><Mark delta={basisChg} />{sgn(basisChg, 1)} · </>}{contract ?? ""}
          </>} />

        <Cell id="s9" label="Open · Gap" {...C}
          value={prevClose == null ? <Absent word="prev close missing" /> : openRef == null ? <Absent word="no pre-open print" /> : <><Mark delta={gap} />{sgn(gap!, 2)} %</>}
          sub={s9sub ?? undefined} />

        {clockDiff > 5 && (
          <Cell id="s10" label="Clocks" {...C}
            value={<span className="text-[15px]">γ {istTime(walls.ts)} · chain {istTime(flip.ts)}</span>}
            sub={`${Math.round(clockDiff)} min apart`} />
        )}
      </div>

      <p className="max-w-[1100px] text-[15px] leading-relaxed" style={{ color: "var(--ink-1)" }}>
        {read ?? <Absent word="no run" />}
      </p>

      <LadderPanel symbol={symbol} step={step} rows={rows} spot={spot} straddle={strad} levels={levels}
        pinBand={n(pinBandRow?.pin_lower) != null ? { lo: Number(pinBandRow.pin_lower), hi: Number(pinBandRow.pin_upper) } : null}
        corridor={pw != null && cw != null && cState !== "UNDEFINED" ? { lo: pw, hi: cw } : null}
        items={items} sel={sel} setSel={setSel} tab={tab} setTab={setTab}
        gammaItems={gammaItems} gammaLevels={gammaLevels} silhouette={silhouette}
        oiRows={oiRows} oiItems={oiItems} oiLevels={oiLevels} painCurve={painCurve} oiDeltaNote={oiDeltaNote}
        river={<GammaRiver days={river} />} ivPanel={<IVPanel data={ivTab} />}
        pinItems={pinItems} pinRows={pinRows} pinLevels={pinLevels} pinNote={pinNote} pinStretches={stretches}
        flowItems={flowItems} flowRows={flowRows} flowLevels={flowLevels} flowsBadge={flowsBadge} flowsNote={flowsNote} flowsTop={flowChart} />
    </div>
  );
}

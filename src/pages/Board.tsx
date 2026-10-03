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
} from "@/lib/board";
import { LadderPanel, TABS, type Tab, type OverviewItem } from "@/components/board/LadderPanel";
import type { Level } from "@/components/board/StrikeLadder";
import { GammaRiver } from "@/components/board/GammaRiver";

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
  const [sel, setSel] = useState<string | null>(fromParam(params.get("sel")) ?? "net");
  const [tab, setTabRaw] = useState<Tab>(() => TABS.find((t) => t.toLowerCase() === params.get("tab")) ?? "Overview");
  const FIRST: Partial<Record<Tab, string>> = { Overview: "net", Gamma: "g_top" };
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

  const spot = n(g?.spot);
  const prevClose = og?.prevClose ?? null;
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  // S1
  const expiry = g?.expiry_date ?? null;
  const dteS = n(iv?.dte_sessions);
  const s1sub = isAwaiting(iv) ? (nextOpen ? `next ${new Date(nextOpen + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : undefined) : expiry && expiry === today ? "expiry today" : dteS != null ? `${dteS} DTE` : undefined;

  // S2
  const spotChg = spot != null && prevClose != null ? spot - prevClose : null;
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
  const fPct = fVal != null && fms != null && fSpot ? (fms / fSpot) * 100 : null;
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
    { id: "spot", label: "Spot", sub: spotChg != null && prevClose ? `${sgn(spotChg, 1)} · ${sgn((spotChg / prevClose) * 100, 2)} %` : "",
      value: spot != null ? num(spot, 1) : <Absent word="no run" />, levelIds: ["spot"],
      caption: spot != null ? `Spot ${num(spot, 1)} at the γ run of ${istTime(g?.ts)}.` : "No spot." },
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
      caption: hN != null ? `The largest strike carries ${pct(hN)} of net γ (calls ${pct(hC)}, puts ${pct(hP)}); ${bucket ?? "—"} DTE bucket.` : "No concentration run.",
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

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-4 md:px-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5 min-[1440px]:grid-flow-col min-[1440px]:auto-cols-fr min-[1440px]:grid-cols-none">
        <Cell id="dte" label="Symbol · Expiry" {...C}
          value={expiry ? `${expShort(expiry)}` : <Absent word="no expiry" />} sub={[symbol, s1sub].filter(Boolean).join(" · ")} />

        <Cell id="spot" label="Spot" {...C}
          value={spot != null ? num(spot, 1) : <Absent word="no run" />}
          sub={spotChg != null && prevClose ? <><Mark delta={spotChg} />{sgn(spotChg, 1)} · {sgn((spotChg / prevClose) * 100, 2)} %</> : undefined}
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
        gammaItems={gammaItems} gammaLevels={gammaLevels} silhouette={silhouette} river={<GammaRiver days={river} />} />
    </div>
  );
}

import { useMemo, useState } from "react";
import { useSymbol } from "@/contexts/SymbolContext";
import {
  useSessions, useGammaNow, useAbsExposure, useRepricedFlip, useWalls, useStrikeRank,
  useIvFront, useFutures, useSpotPocket, useGammaSession, useOpenGap, usePrevBasis,
  istTime, istDateOf,
} from "@/lib/board";

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
  const [sel, setSel] = useState<string | null>(null);
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
  const s1sub = expiry && expiry === today ? "expiry today" : dteS != null ? `${dteS} DTE` : undefined;

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

  // ---------- the read ----------
  const read = useMemo(() => {
    if (spot == null) return null;
    let out = "";
    if (pocket) out += `Spot ${num(spot, 1)} sits in ${pocket.gex_cr >= 0 ? "a dampening" : "an amplifying"} pocket`;
    else out += `Spot ${num(spot, 1)}`;
    if (cState && cState !== "UNDEFINED" && pw != null && cw != null) {
      const dC = Math.abs(cw - spot), dP = Math.abs(spot - pw);
      const useCall = dC <= dP;
      const wall = useCall ? cw : pw;
      const side = spot < wall ? "under" : "above";
      out += `, ${((Math.abs(wall - spot) / spot) * 100).toFixed(1)}% ${side} the ${useCall ? "call" : "put"} OI wall at ${num(wall)}`;
      if (pin != null && pin === wall) out += ", which is also the largest gamma strike";
    }
    if (fStatus === "OK" && fPct != null && fms != null) {
      out += `. Flip is ${fPct >= 0 ? "+" : "−"}${Math.abs(fPct).toFixed(2)}% away`;
      if (strad != null) out += `, ${Math.abs(fms) <= strad ? "inside" : "outside"} the ±${num(strad, 0)} the straddle is pricing by expiry`;
    } else if (fStatus && flipAbsent[fStatus]) {
      out += fStatus === "NO_CROSSING" ? ". There is no flip in the grid" : fStatus === "SKIPPED_EXPIRY" ? ". Flip is skipped on expiry day" : ". Flip carry is unmeasurable";
    }
    if (ratio != null) out += `. Net gamma is ${ratio.toFixed(2)} of gross`;
    return out + ".";
  }, [spot, pocket, cState, pw, cw, pin, fStatus, fPct, fms, strad, ratio]);

  const C = { sel, onSel: setSel };
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-4 md:px-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5 min-[1440px]:grid-flow-col min-[1440px]:auto-cols-fr min-[1440px]:grid-cols-none">
        <Cell id="s1" label="Symbol · Expiry" {...C}
          value={expiry ? `${symbol} ${expShort(expiry)}` : <Absent word="no expiry" />} sub={s1sub} />

        <Cell id="s2" label="Spot" {...C}
          value={spot != null ? num(spot, 1) : <Absent word="no run" />}
          sub={spotChg != null && prevClose ? <><Mark delta={spotChg} />{sgn(spotChg, 1)} · {sgn((spotChg / prevClose) * 100, 2)} %</> : undefined}
          viz={sparkPts.length >= 3 ? <Spark pts={sparkPts} /> : undefined} />

        <Cell id="s3" label="Net Γ" {...C}
          value={net != null ? crLakh(net) : <Absent word="no run" />} color={hue(net)}
          sub={net != null ? `${net >= 0 ? "long γ" : "short γ"}${ratio != null ? ` · ${ratio.toFixed(2)} of gross` : ""} · unit definition pending` : undefined}
          viz={net != null && gross ? (
            <div className="relative mt-2 flex h-1.5 w-full overflow-hidden rounded-sm" style={{ background: "var(--s2)" }}>
              <div style={{ width: `${((gross + net) / 2 / gross) * 100}%`, background: "var(--cool)" }} />
              <div style={{ width: `${((gross - net) / 2 / gross) * 100}%`, background: "var(--warm)" }} />
              <div className="absolute left-1/2 top-0 h-full w-px" style={{ background: "var(--ink-1)" }} />
            </div>
          ) : undefined} />

        <Cell id="s4" label="Flip" {...C}
          value={fVal != null ? num(fVal, 0) : fStatus && flipAbsent[fStatus] ? <Absent word={flipAbsent[fStatus]} /> : <Absent word="no run" />}
          sub={fPct != null ? `${fPct >= 0 ? "+" : "−"}${Math.abs(fPct).toFixed(2)} % from spot` : undefined}
          viz={fSpot != null ? <Track lo={fSpot * 0.97} hi={fSpot * 1.03} spot={fSpot}
            ticks={fVal != null ? [{ at: fVal, color: "var(--rule)", dashed: true }] : []} /> : undefined} />

        <Cell id="s5" label="Corridor" {...C}
          value={pw != null && cw != null && cState !== "UNDEFINED" ? `${num(pw)}–${num(cw)}` : <Absent word="corridor undefined" />}
          sub={cState ? [stateWord[cState] ?? cState.toLowerCase(), widthPct != null && cState !== "UNDEFINED" ? `${widthPct.toFixed(2)} % wide` : null, walls?.iv_fresh === false ? "IV stale" : null].filter(Boolean).join(" · ") : undefined}
          viz={pw != null && cw != null && wSpot != null && cState !== "UNDEFINED" ? (() => {
            const lo = Math.min(pw, wSpot), hi = Math.max(cw, wSpot), pad = (hi - lo) * 0.08 || 1;
            return <Track lo={lo - pad} hi={hi + pad} spot={wSpot} ticks={[{ at: pw, color: "var(--put)" }, { at: cw, color: "var(--call)" }]} />;
          })() : undefined} />

        <Cell id="s6" label="Pin (γ-conc)" {...C}
          value={pin != null ? num(pin) : <Absent word="no run" />}
          sub={pin != null ? [sh1 != null ? `${(sh1 * 100).toFixed(1)} % of gross` : null, lead != null ? `lead ${lead.toFixed(1)} pts` : null, pinWall].filter(Boolean).join(" · ") : undefined}
          viz={sh1 != null ? (
            <div className="mt-2 space-y-0.5">
              <div className="h-1 w-full rounded-sm" style={{ background: "var(--rule)" }} />
              {sh2 != null && sh1 > 0 && <div className="h-1 rounded-sm" style={{ width: `${(sh2 / sh1) * 100}%`, background: "var(--ink-3)" }} />}
            </div>
          ) : undefined} />

        <Cell id="s7" label="IV · VIX" {...C}
          value={atmIv != null || vix != null ? <>{atmIv != null ? atmIv.toFixed(1) : "—"} · {vix != null ? vix.toFixed(2) : "—"}</> : <Absent word="no chain" />}
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
    </div>
  );
}

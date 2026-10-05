// The read (D.4) — one factual sentence from bound values. Shared by Board and Home.
import { useSpotPocket, useWalls, useStrikeRank, useRepricedFlip, useGammaNow, useAbsExposure } from "./board";
import type { Symbol } from "./queries";

const num = (v: number, d = 0) => v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const n = (v: any): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export function useBoardRead(symbol: Symbol): string | null {
  const g = useGammaNow(symbol).data as any;
  const abs = useAbsExposure(symbol).data as any;
  const flip = useRepricedFlip(symbol).data as any;
  const walls = useWalls(symbol).data as any;
  const rank = (useStrikeRank(symbol).data ?? []) as any[];
  const pocket = useSpotPocket(symbol).data;

  const spot = n(g?.spot);
  if (spot == null) return null;
  const pw = n(walls?.put_wall), cw = n(walls?.call_wall), cState: string | null = walls?.corridor_state ?? null;
  const pin = n(rank.find((r) => r.strike_rank === 1)?.strike);
  const fStatus: string | null = flip?.status ?? null;
  // S90 MV-2: distance from the displayed spot, not the L3 row's own spot.
  const fFlip = n(flip?.flip);
  const fPct = fStatus === "OK" && fFlip != null ? ((fFlip - spot) / spot) * 100 : null;
  const strad = n(g?.straddle_atm);
  const net = n(abs?.net_gex_cr), gross = n(abs?.abs_gex_cr);
  const ratio = net != null && gross ? net / gross : null;

  let out = pocket
    ? `Spot ${num(spot, 1)} sits in ${pocket.gex_cr >= 0 ? "a dampening" : "an amplifying"} pocket`
    : `Spot ${num(spot, 1)}`;
  if (cState && cState !== "UNDEFINED" && pw != null && cw != null) {
    const useCall = Math.abs(cw - spot) <= Math.abs(spot - pw);
    const wall = useCall ? cw : pw;
    const wallDistancePct = (Math.abs(wall - spot) / spot) * 100;
    out += wallDistancePct < 0.05
      ? `, at the ${useCall ? "call" : "put"} OI wall at ${num(wall)}`
      : `, ${wallDistancePct.toFixed(1)}% ${spot < wall ? "under" : "above"} the ${useCall ? "call" : "put"} OI wall at ${num(wall)}`;
    if (pin != null && pin === wall) out += ", which is also the largest gamma strike";
  }
  if (fPct != null && fFlip != null) {
    out += `. Flip is ${fPct >= 0 ? "+" : "−"}${Math.abs(fPct).toFixed(2)}% away`;
    if (strad != null) out += `, ${Math.abs(fFlip - spot) <= strad ? "inside" : "outside"} the ±${num(strad)} the straddle is pricing by expiry`;
  } else if (fStatus === "NO_CROSSING") out += ". There is no flip in the grid";
  else if (fStatus === "SKIPPED_EXPIRY") out += ". Flip is skipped on expiry day";
  else if (fStatus === "UNMEASURABLE_R") out += ". Flip carry is unmeasurable";
  if (ratio != null) out += `. Net gamma is ${ratio.toFixed(2)} of gross`;
  return out + ".";
}

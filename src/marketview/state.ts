import { useMemo } from "react";
import {
  useSpotMarker, useGammaLatest, useGammaToday, useLatestSignal, useTodaysSignals,
  useGexStrikes, usePinZone, useAccelZone, useIctZones, useStraddleIntraday,
  useMaxPainByStrike, useBreadthIntraday, useWcbLatest, useIvSmile,
  type Symbol as MSymbol,
} from "@/lib/queries";
import { spotFromMarker, formatDTE } from "./ui";

export type MvState = ReturnType<typeof useMvData>;

/**
 * Central data hook: aggregates every query & derived scalar the terminal needs.
 * Every page consumes this via `useMvData(symbol)`.
 */
export function useMvData(symbol: MSymbol) {
  const marker = useSpotMarker(symbol);
  const gamma = useGammaLatest(symbol);
  const gammaToday = useGammaToday(symbol);
  const signal = useLatestSignal(symbol);
  const signals = useTodaysSignals(symbol);
  const expiry = (gamma.data?.expiry_date ?? gamma.data?.expiry) as string | undefined;
  const strikes = useGexStrikes(symbol, expiry);
  const pin = usePinZone(symbol, expiry);
  const accel = useAccelZone(symbol, expiry);
  const zones = useIctZones(symbol);
  const straddle = useStraddleIntraday(symbol);
  const maxPain = useMaxPainByStrike(symbol);
  const breadth = useBreadthIntraday(symbol);
  const wcb = useWcbLatest(symbol);

  const strikeStep = symbol === "NIFTY" ? 50 : 100;
  const g = gamma.data ?? ({} as any);
  const spot = (g.spot ?? spotFromMarker(marker.data) ?? 0) as number;
  const prevClose = (marker.data?.prev_close_spot ?? null) as number | null;
  const changeAbs = prevClose && spot ? spot - prevClose : 0;
  const changePct = prevClose && spot ? ((spot - prevClose) / prevClose) * 100 : 0;

  const regime = (g.regime ?? null) as string | null;
  const gammaZone = (g.gamma_zone ?? null) as string | null;
  const netDealerGamma = (g.net_gex ?? null) as number | null;
  const sigmaPct = (g.flip_distance_pct ?? null) as number | null;
  const flipLevel = (g.flip_level ?? null) as number | null;
  const pinRiskScore = (g.pin_risk_score ?? null) as number | null;
  const expansionProb = (g.expansion_probability ?? null) as number | null;
  const pinProbability = expansionProb != null ? Math.max(0, Math.min(100, 100 - expansionProb)) : null;
  const atmStraddle = (g.straddle_atm ?? null) as number | null;
  const vix = (g.vix ?? null) as number | null;
  const dteDays = (g.dte ?? null) as number | null;

  const strikeAgg = useMemo(() => {
    const rows = (strikes.data ?? []) as any[];
    if (!rows.length) return { maxGammaStrike: null as number | null, peakGammaCr: null as number | null, strongestAmplifyStrike: null as number | null, dampenTotal: null as number | null, amplifyTotal: null as number | null };
    const pos = rows.filter((s) => (s.gex_cr ?? 0) > 0);
    const neg = rows.filter((s) => (s.gex_cr ?? 0) < 0);
    const maxRow = pos.length ? pos.reduce((m, s) => (s.gex_cr > m.gex_cr ? s : m)) : null;
    const minRow = neg.length ? neg.reduce((m, s) => (s.gex_cr < m.gex_cr ? s : m)) : null;
    const dampenTotal = pos.reduce((a, s) => a + (s.gex_cr ?? 0), 0);
    const amplifyTotal = neg.reduce((a, s) => a + (s.gex_cr ?? 0), 0);
    return {
      maxGammaStrike: maxRow?.strike ?? null,
      peakGammaCr: maxRow?.gex_cr ?? null,
      strongestAmplifyStrike: minRow?.strike ?? null,
      dampenTotal: pos.length ? dampenTotal : null,
      amplifyTotal: neg.length ? amplifyTotal : null,
    };
  }, [strikes.data]);
  const { maxGammaStrike, peakGammaCr, strongestAmplifyStrike, dampenTotal, amplifyTotal } = strikeAgg;

  const ivSmile = useIvSmile(symbol, spot, strikeStep);
  const ivSkewPct = ivSmile.data && ivSmile.data.atmCe && ivSmile.data.atmPe
    ? (ivSmile.data.atmPe / ivSmile.data.atmCe - 1) * 100 : null;

  // Latest activity ts (drives staleness ticker in shell)
  const latestActivityTs = (signal.data?.ts ?? g.ts ?? null) as string | null;
  const signalTs = latestActivityTs ? new Date(latestActivityTs).getTime() : null;

  const dte = formatDTE(expiry, dteDays);

  const zonesNearSpot = useMemo(() => {
    if (!spot) return [];
    return (zones.data ?? [])
      .map((z: any) => {
        const lo = z.zone_low ?? z.range_low;
        const hi = z.zone_high ?? z.range_high;
        return { z, lo, hi, mid: lo != null && hi != null ? (lo + hi) / 2 : null };
      })
      .filter((r) => r.mid != null)
      .sort((a, b) => Math.abs((a.mid as number) - spot) - Math.abs((b.mid as number) - spot))
      .slice(0, 10);
  }, [zones.data, spot]);

  const maxPainStrike = maxPain.data?.[0]?.max_pain_strike ?? null;
  const painSpotDistPct = maxPainStrike && spot ? ((spot - maxPainStrike) / maxPainStrike) * 100 : null;
  const gammaPainGap = maxPainStrike && maxGammaStrike ? Math.abs(maxGammaStrike - maxPainStrike) : null;

  return {
    symbol, strikeStep, expiry, dte, spot, prevClose, changeAbs, changePct,
    regime, gammaZone, netDealerGamma, sigmaPct, flipLevel,
    pinRiskScore, expansionProb, pinProbability, atmStraddle, vix,
    maxGammaStrike, peakGammaCr, strongestAmplifyStrike, dampenTotal, amplifyTotal,
    ivSmile, ivSkewPct, zonesNearSpot, maxPainStrike, painSpotDistPct, gammaPainGap,
    latestActivityTs, signalTs,
    // raw queries
    marker, gamma, gammaToday, signal, signals, strikes, pin, accel, zones,
    straddle, maxPain, breadth, wcb,
  };
}

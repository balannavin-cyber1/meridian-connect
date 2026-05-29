import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type Symbol = "NIFTY" | "SENSEX";

const MV_STALE = 30_000;
const SETTINGS_STALE = 5 * 60_000;

// ---------- Marketview ----------

export function useSpotMarker(symbol: Symbol) {
  return useQuery({
    queryKey: ["spotMarker", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_spot_session_markers")
        .select("*")
        .eq("symbol", symbol)
        .order("trade_date_ist", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useGammaLatest(symbol: Symbol) {
  return useQuery({
    queryKey: ["gammaLatest", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gamma_metrics")
        .select("*")
        .eq("symbol", symbol)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useGammaSeries(symbol: Symbol, limit = 60) {
  return useQuery({
    queryKey: ["gammaSeries", symbol, limit],
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gamma_metrics")
        .select("ts, spot, straddle_atm")
        .eq("symbol", symbol)
        .order("ts", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).slice().reverse();
    },
  });
}

// Intraday straddle: today's series + per-bucket 5-day average.
// Buckets are 5-minute intervals of IST minutes-of-day (e.g. 555 = 09:15).
export type StraddleBucket = { bucket: number; today: number | null; avg: number | null };
export function useStraddleIntraday(symbol: Symbol) {
  return useQuery({
    queryKey: ["straddleIntraday", symbol],
    staleTime: MV_STALE,
    queryFn: async (): Promise<{ buckets: StraddleBucket[]; daysUsed: number }> => {
      const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from("gamma_metrics")
        .select("ts, straddle_atm")
        .eq("symbol", symbol)
        .gte("ts", since.toISOString())
        .order("ts", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []).filter((r: any) => r.straddle_atm != null);

      const istParts = (iso: string) => {
        const t = new Date(iso).getTime() + 5.5 * 60 * 60 * 1000;
        const d = new Date(t);
        const dateKey = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
        const minOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
        return { dateKey, minOfDay };
      };
      const todayKey = (() => {
        const t = Date.now() + 5.5 * 60 * 60 * 1000;
        const d = new Date(t);
        return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
      })();

      const BUCKET = 5;
      const todayMap = new Map<number, number>();
      const histAgg = new Map<number, { sum: number; n: number; days: Set<number> }>();
      for (const r of rows as any[]) {
        const { dateKey, minOfDay } = istParts(r.ts);
        if (minOfDay < 555 || minOfDay > 930) continue;
        const bucket = Math.floor(minOfDay / BUCKET) * BUCKET;
        const v = Number(r.straddle_atm);
        if (dateKey === todayKey) {
          todayMap.set(bucket, v);
        } else {
          const a = histAgg.get(bucket) ?? { sum: 0, n: 0, days: new Set<number>() };
          a.sum += v;
          a.n += 1;
          a.days.add(dateKey);
          histAgg.set(bucket, a);
        }
      }

      const allBuckets = new Set<number>([...todayMap.keys(), ...histAgg.keys()]);
      const buckets: StraddleBucket[] = Array.from(allBuckets)
        .sort((a, b) => a - b)
        .map((bucket) => {
          const a = histAgg.get(bucket);
          return {
            bucket,
            today: todayMap.has(bucket) ? todayMap.get(bucket)! : null,
            avg: a && a.n > 0 ? a.sum / a.n : null,
          };
        });

      const daysUsed = new Set<number>();
      histAgg.forEach((a) => a.days.forEach((d) => daysUsed.add(d)));
      return { buckets, daysUsed: daysUsed.size };
    },
  });
}

export function useLatestSignal(symbol: Symbol) {
  return useQuery({
    queryKey: ["signalLatest", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signal_snapshots")
        .select("*")
        .eq("symbol", symbol)
        .neq("entry_quality", "SKIP")
        .neq("entry_quality", "NO_TRADE")
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useTodaysSignals(symbol: Symbol) {
  return useQuery({
    queryKey: ["signalsToday", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("signal_snapshots")
        .select("ts, action, atm_strike, spot, entry_quality, trade_allowed")
        .eq("symbol", symbol)
        .gte("ts", since.toISOString())
        .order("ts", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGexStrikes(symbol: Symbol, expiry: string | null | undefined) {
  return useQuery({
    queryKey: ["gexStrikes", symbol, expiry],
    staleTime: MV_STALE,
    queryFn: async () => {
      // Find the latest run for this symbol — try expiry filter first, then fall back to symbol-only.
      let latest: { run_id: string } | null = null;
      if (expiry) {
        const { data } = await supabase
          .from("gex_strike_snapshots")
          .select("run_id, ts")
          .eq("symbol", symbol)
          .eq("expiry_date", expiry)
          .order("ts", { ascending: false })
          .limit(1)
          .maybeSingle();
        latest = (data as any) ?? null;
      }
      if (!latest) {
        const { data } = await supabase
          .from("gex_strike_snapshots")
          .select("run_id, ts")
          .eq("symbol", symbol)
          .order("ts", { ascending: false })
          .limit(1)
          .maybeSingle();
        latest = (data as any) ?? null;
      }
      if (!latest) return [];
      const { data, error } = await supabase
        .from("gex_strike_snapshots")
        .select("strike, gex_cr, oi_call, oi_put, spot")
        .eq("run_id", latest.run_id)
        .order("strike", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePinZone(symbol: Symbol, expiry: string | null | undefined) {
  return useQuery({
    queryKey: ["pinZone", symbol, expiry],
    enabled: !!expiry,
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_gex_strike_pin_zone")
        .select("*")
        .eq("symbol", symbol)
        .eq("expiry_date", expiry!)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAccelZone(symbol: Symbol, expiry: string | null | undefined) {
  return useQuery({
    queryKey: ["accelZone", symbol, expiry],
    enabled: !!expiry,
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_gex_strike_accel_zone")
        .select("*")
        .eq("symbol", symbol)
        .eq("expiry_date", expiry!)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useIctZones(symbol: Symbol) {
  return useQuery({
    queryKey: ["ictZones", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ict_zones")
        .select("*")
        .eq("symbol", symbol)
        .order("detected_at_ts", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDealerFlow(symbol: Symbol, expiry: string | null | undefined) {
  return useQuery({
    queryKey: ["dealerFlow", symbol, expiry],
    enabled: !!expiry,
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data: latest } = await supabase
        .from("v_dealer_flow_sim")
        .select("run_id, ts")
        .eq("symbol", symbol)
        .eq("expiry_date", expiry!)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return [];
      const { data, error } = await supabase
        .from("v_dealer_flow_sim")
        .select("*")
        .eq("run_id", latest.run_id)
        .order("spot_pct", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRefetchMarketview() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey[0];
        return [
          "spotMarker",
          "gammaLatest",
          "gammaSeries",
          "gammaToday",
          "signalLatest",
          "signalsToday",
          "gexStrikes",
          "pinZone",
          "accelZone",
          "ictZones",
          "dealerFlow",
          "straddleIntraday",
          "maxPainByStrike",
          "breadthIntraday",
          "ivSmile",
        ].includes(k as string);
      },
    });
  };
}

// Today's gamma_metrics rows (for Pin Risk Timeline + ATM straddle today series)
export function useGammaToday(symbol: Symbol) {
  return useQuery({
    queryKey: ["gammaToday", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const startIst = new Date();
      startIst.setUTCHours(3, 45, 0, 0); // 09:15 IST = 03:45 UTC
      const { data, error } = await supabase
        .from("gamma_metrics")
        .select("ts, spot, pin_risk_score, straddle_atm, expansion_probability")
        .eq("symbol", symbol)
        .gte("ts", startIst.toISOString())
        .order("ts", { ascending: true });
      if (error) return [];
      return data ?? [];
    },
  });
}

// IV smile from option_chain_snapshots (long format: one row per (strike, option_type))
export function useIvSmile(symbol: Symbol, spot: number | null | undefined, step: number) {
  return useQuery({
    queryKey: ["ivSmile", symbol, spot, step],
    enabled: !!spot && spot > 0,
    staleTime: MV_STALE,
    retry: false,
    queryFn: async () => {
      const atm = Math.round((spot as number) / step) * step;
      const lo = atm - step * 5;
      const hi = atm + step * 5;
      const { data, error } = await supabase
        .from("option_chain_snapshots")
        .select("ts, strike, option_type, iv")
        .eq("symbol", symbol)
        .gte("strike", lo)
        .lte("strike", hi)
        .order("ts", { ascending: false })
        .limit(2000);
      if (error) return null;
      const rows = (data ?? []) as any[];
      if (!rows.length) return null;
      // Filter to most recent ts only
      const maxTs = rows[0].ts;
      const latest = rows.filter((r) => r.ts === maxTs);
      // Average CE+PE IV per strike for the smile curve
      const byStrike = new Map<number, { ce: number | null; pe: number | null }>();
      for (const r of latest) {
        const entry = byStrike.get(r.strike) ?? { ce: null, pe: null };
        if (r.option_type === "CE") entry.ce = r.iv;
        else if (r.option_type === "PE") entry.pe = r.iv;
        byStrike.set(r.strike, entry);
      }
      const points: { strike: number; iv: number }[] = [];
      let atmCe: number | null = null;
      let atmPe: number | null = null;
      Array.from(byStrike.entries())
        .sort((a, b) => a[0] - b[0])
        .forEach(([strike, v]) => {
          const ivs = [v.ce, v.pe].filter((x): x is number => x != null && x > 0);
          if (ivs.length) points.push({ strike, iv: ivs.reduce((a, b) => a + b, 0) / ivs.length });
          if (strike === atm) {
            atmCe = v.ce && v.ce > 0 ? v.ce : null;
            atmPe = v.pe && v.pe > 0 ? v.pe : null;
          }
        });
      return { atm, points, atmCe, atmPe };
    },
  });
}

// Max pain (defensive: view may not exist yet)
export function useMaxPainByStrike(symbol: Symbol) {
  return useQuery({
    queryKey: ["maxPainByStrike", symbol],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_max_pain_by_strike")
        .select("candidate_strike, total_pain, max_pain_strike, side")
        .eq("symbol", symbol)
        .order("candidate_strike", { ascending: true });
      if (error) return null;
      return data;
    },
  });
}

// Market breadth (defensive: table may not exist)
export function useBreadthIntraday(symbol: Symbol) {
  return useQuery({
    queryKey: ["breadthIntraday", symbol],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_breadth_intraday")
        .select("*")
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });
}


// ---------- Settings ----------

export type Parameter = {
  id: string;
  key: string;
  value_text: string | null;
  value_num: number | null;
  value_bool: boolean | null;
  value_jsonb: any;
  value_type: "numeric" | "text" | "boolean" | "jsonb";
  category: string;
  description: string | null;
  min_value: number | null;
  max_value: number | null;
  valid_from: string;
  valid_to: string | null;
  changed_by: string | null;
  change_reason: string | null;
};

export function useParameters() {
  return useQuery({
    queryKey: ["parameters"],
    staleTime: SETTINGS_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merdian_parameters")
        .select("*")
        .is("valid_to", null)
        .order("category", { ascending: true })
        .order("key", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Parameter[];
    },
  });
}

export function useParameterAudit() {
  return useQuery({
    queryKey: ["parameterAudit"],
    staleTime: SETTINGS_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_merdian_parameter_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function updateParameter(
  key: string,
  changeReason: string,
  value: number | string | boolean,
  valueType: Parameter["value_type"],
) {
  const args: Record<string, any> = {
    p_key: key,
    p_change_reason: changeReason,
  };
  if (valueType === "numeric") args.p_value_num = Number(value);
  else if (valueType === "boolean") args.p_value_bool = Boolean(value);
  else args.p_value_text = String(value);
  const { data, error } = await supabase.rpc("update_parameter", args);
  if (error) throw error;
  return data;
}

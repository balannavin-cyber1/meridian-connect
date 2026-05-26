// Mock fixtures for MERDIAN Marketview — replace with Supabase wiring later.

export type Symbol = "NIFTY" | "SENSEX";

export interface MarketSnapshot {
  symbol: Symbol;
  spot: number;
  change_pct: number;
  spark: number[];
  gap_pct: number;
  dte_hours: number;
  regime: "long_gamma" | "short_gamma" | "no_flip";
  po3: "PO3_BULLISH" | "PO3_BEARISH" | "NEUTRAL";
  session_phase: "morning" | "midday" | "afternoon" | "closing";
  vix: number;
  breadth: number;
  stale_seconds: number | null;
}

export interface Signal {
  time: string;
  action: "BUY_CE" | "BUY_PE";
  strike: number;
  conf: number;
  status: "blocked" | "allowed" | "fired" | "exited_sl" | "exited_eod";
  status_reason: string;
}

export interface GexBar {
  strike: number;
  gex_cr: number; // signed
}

export interface Zone {
  range_low: number;
  range_high: number;
  type: "PIN" | "ACCEL";
}

export interface IctZone {
  tf: "W" | "D" | "H4" | "H1";
  type: "BEAR_FVG" | "BULL_FVG" | "BEAR_OB" | "BULL_OB";
  range_low: number;
  range_high: number;
}

export interface DealerCell {
  pct: number; // -2, -1, -0.5, 0.5, 1, 2
  dealer_cr: number;
}

export const niftySnap: MarketSnapshot = {
  symbol: "NIFTY",
  spot: 24087.4,
  change_pct: -0.18,
  spark: [24120, 24105, 24098, 24092, 24087],
  gap_pct: -0.26,
  dte_hours: 0,
  regime: "no_flip",
  po3: "PO3_BEARISH",
  session_phase: "morning",
  vix: 15.7,
  breadth: 49,
  stale_seconds: null,
};

export const sensexSnap: MarketSnapshot = {
  symbol: "SENSEX",
  spot: 79214.6,
  change_pct: -0.12,
  spark: [79280, 79255, 79240, 79225, 79214],
  gap_pct: -0.18,
  dte_hours: 24,
  regime: "long_gamma",
  po3: "NEUTRAL",
  session_phase: "morning",
  vix: 15.7,
  breadth: 22,
  stale_seconds: null,
};

export const todaysSignals: Signal[] = [
  { time: "10:57", action: "BUY_PE", strike: 24100, conf: 20, status: "blocked", status_reason: "morning window" },
  { time: "11:14", action: "BUY_PE", strike: 24050, conf: 18, status: "blocked", status_reason: "low conf" },
];

export const activeSignal: Signal | null = todaysSignals[0] ?? null;

// per-strike GEX, 50-point grid around spot
export function buildGex(spot: number, lo = -800, hi = 800, step = 50): GexBar[] {
  const out: GexBar[] = [];
  const base = Math.round(spot / step) * step;
  for (let d = lo; d <= hi; d += step) {
    const strike = base + d;
    // synthetic: PIN cluster +ve around spot+50..+250, ACCEL -ve around spot-250..-50
    const distFromPin = Math.abs(d - 150);
    const distFromAccel = Math.abs(d + 150);
    const pinComp = Math.max(0, 80 - distFromPin) * 1.4;
    const accelComp = Math.max(0, 80 - distFromAccel) * -1.6;
    const noise = Math.sin(d * 0.013) * 6;
    out.push({ strike, gex_cr: +(pinComp + accelComp + noise).toFixed(1) });
  }
  return out;
}

export const niftyGex = buildGex(niftySnap.spot);

export const niftyPin: Zone = { range_low: 24100, range_high: 24300, type: "PIN" };
export const niftyAccel: Zone = { range_low: 23800, range_high: 24000, type: "ACCEL" };
export const niftyMaxGammaStrike = 24200;

export const ictZones: IctZone[] = [
  { tf: "W", type: "BEAR_FVG", range_low: 24160, range_high: 24280 },
  { tf: "D", type: "BEAR_OB", range_low: 24320, range_high: 24400 },
  { tf: "H4", type: "BULL_FVG", range_low: 23900, range_high: 23980 },
  { tf: "H1", type: "BULL_OB", range_low: 23820, range_high: 23870 },
];

export const dealerFlow: DealerCell[] = [
  { pct: -2, dealer_cr: -185 },
  { pct: -1, dealer_cr: -92 },
  { pct: -0.5, dealer_cr: -41 },
  { pct: 0.5, dealer_cr: 38 },
  { pct: 1, dealer_cr: 81 },
  { pct: 2, dealer_cr: 162 },
];

export const straddleSpark = [128, 132, 135, 131, 129, 134, 138, 141, 137, 140, 143, 139, 142, 145, 148];
export const straddleNow = 148;
export const straddleAvg = 137;

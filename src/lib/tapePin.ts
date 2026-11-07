// PIN anchor gate and read-out — pure module for the /tape Flow-vs-book section.
// No I/O, no clock, no randomness: every input is passed in.

import type { Label } from "./tapeLabels";

export type PinMode =
  | "NO_PIN"
  | "SUPPRESSED_DTE0"
  | "CONTESTED"
  | "OWNED_BOTH"
  | "OWNED_BY_CALL"
  | "OWNED_BY_PUT"
  | "LABEL";

export type PinPrimary = "CE" | "PE" | "BOTH" | "UNKNOWN" | null;

export type PinGateIn = {
  K: number | null;
  dte: number | null;
  pin_state: string | null;
  call_wall: number | null;
  put_wall: number | null;
  spot: number | null;
  step: number | null;
};

export type PinGateOut = { mode: PinMode; legs: ("CE" | "PE")[]; primary: PinPrimary };

export function pinGate(g: PinGateIn): PinGateOut {
  const { K, dte, pin_state, call_wall, put_wall, spot, step } = g;
  if (K == null) return { mode: "NO_PIN", legs: [], primary: null };
  if (dte === 0) return { mode: "SUPPRESSED_DTE0", legs: [], primary: null };
  if (pin_state !== "STABLE" && pin_state !== "LOCKED")
    return { mode: "CONTESTED", legs: [], primary: null };
  if (K === call_wall && K === put_wall) return { mode: "OWNED_BOTH", legs: [], primary: null };
  if (K === call_wall) return { mode: "OWNED_BY_CALL", legs: ["PE"], primary: "PE" };
  if (K === put_wall) return { mode: "OWNED_BY_PUT", legs: ["CE"], primary: "CE" };
  const primary: PinPrimary =
    spot == null || step == null
      ? "UNKNOWN"
      : spot < K - step / 2
        ? "CE"
        : spot > K + step / 2
          ? "PE"
          : "BOTH";
  return { mode: "LABEL", legs: ["CE", "PE"], primary };
}

export function pinSign(gamma_at_pin: number | null): 1 | -1 | 0 | null {
  if (gamma_at_pin == null) return null;
  if (gamma_at_pin > 0) return 1;
  if (gamma_at_pin < 0) return -1;
  return 0;
}

export function pinReadout(sign: 1 | -1 | 0 | null, label: Label, partial: boolean): string {
  if (label === "NO_READ") return "";
  if (label === "THINNING")
    return "offers thinning, no concentrated flow" + (partial ? " · flow n/a" : "");
  if (label === "QUIET") return "both measured, nothing at the pin";
  // HIT or ABSORBED
  if (sign === 0 || sign == null) return "sign unavailable";
  if (sign === 1 && label === "ABSORBED") return "flow hit, book held — with the Board's sign";
  if (sign === 1 && label === "HIT") return "book gave way — against the Board's sign";
  if (sign === -1 && label === "HIT") return "flow hit, book gave way — with the Board's sign";
  return "book held — against the Board's sign"; // sign -1 & ABSORBED
}

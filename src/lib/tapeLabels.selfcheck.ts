import vectors from "./tapeLabels.vectors.json";
import pinVectors from "./tapePin.vectors.json";
import { labelWall, type Flags, type Label } from "./tapeLabels";
import { pinGate, pinReadout, type PinGateIn } from "./tapePin";

/** Runs labelWall on every vector; returns ids that failed. */
export function runLabelVectors(log = false): number[] {
  const failed: number[] = [];
  for (const v of vectors.vectors) {
    const got = labelWall(v.flags as Flags);
    const ok = got.label === v.expected.label && got.partial === v.expected.partial && got.reason === v.expected.reason;
    if (!ok) failed.push(v.id);
    if (log) console.info(`tapeLabels vector ${v.id}: ${ok ? "PASS" : "FAIL"}`);
  }
  return failed;
}

/** Runs pinGate and pinReadout on the pin vectors; returns ids that failed. */
export function runPinVectors(log = false): { gate: number[]; readout: number[] } {
  const gate: number[] = [];
  for (const v of pinVectors.gate) {
    const got = pinGate(v.in as PinGateIn);
    const ok =
      got.mode === v.expected.mode &&
      got.primary === v.expected.primary &&
      got.legs.length === v.expected.legs.length &&
      got.legs.every((l, i) => l === v.expected.legs[i]);
    if (!ok) gate.push(v.id);
    if (log) console.info(`tapePin gate vector ${v.id}: ${ok ? "PASS" : "FAIL"}`);
  }
  const readout: number[] = [];
  for (const v of pinVectors.readout) {
    const got = pinReadout(v.in.sign as 1 | -1 | 0 | null, v.in.label as Label, v.in.partial);
    const ok = got === v.expected;
    if (!ok) readout.push(v.id);
    if (log) console.info(`tapePin readout vector ${v.id}: ${ok ? "PASS" : "FAIL"}`);
  }
  return { gate, readout };
}

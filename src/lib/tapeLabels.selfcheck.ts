import vectors from "./tapeLabels.vectors.json";
import { labelWall, type Flags } from "./tapeLabels";

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

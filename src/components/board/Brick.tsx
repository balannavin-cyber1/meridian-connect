// P7a: held / added / removed brick drawn from a centred zero axis (geometry only).
const hue = (v: number) => (v >= 0 ? "var(--cool)" : "var(--warm)");
const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

type Seg = { a: number; b: number; kind: "held" | "added" | "removed"; sign: number };

export function brickSegs(now: number, pre: number): Seg[] {
  const out: Seg[] = [];
  if (now === 0 && pre === 0) return out;
  if (Math.sign(now) === Math.sign(pre) || now === 0 || pre === 0) {
    const s = Math.sign(now || pre);
    const h = s * Math.min(Math.abs(now), Math.abs(pre));
    if (now !== 0 && pre !== 0 && h !== 0) out.push({ a: 0, b: h, kind: "held", sign: s });
    if (Math.abs(now) > Math.abs(pre)) out.push({ a: h, b: now, kind: "added", sign: s });
    if (Math.abs(pre) > Math.abs(now)) out.push({ a: h, b: pre, kind: "removed", sign: s });
  } else {
    out.push({ a: 0, b: now, kind: "added", sign: Math.sign(now) });
    out.push({ a: 0, b: pre, kind: "removed", sign: Math.sign(pre) });
  }
  return out;
}

/** Absolutely positioned segments inside a relative parent; zero at 50 %. */
export function BrickMarks({ now, pre, scale, height }: { now: number; pre: number; scale: number; height: number | string }) {
  const x = (v: number) => 50 + (v / Math.max(1e-9, scale)) * 50;
  return <>
    {brickSegs(now, pre).map((g, i) => {
      const l = Math.min(x(g.a), x(g.b)), w = Math.abs(x(g.b) - x(g.a));
      const c = hue(g.sign);
      return <div key={i} className="absolute top-1/2 -translate-y-1/2 box-border" style={{
        left: `${l}%`, width: `${w}%`, height,
        background: g.kind === "held" ? c : g.kind === "added" ? mix(c, 40) : undefined,
        border: g.kind === "removed" ? `1px dashed ${c}` : undefined,
      }} />;
    })}
  </>;
}

/** Tile-sized brick track with a centre tick; null = gap marker. */
export function BrickBar({ now, pre, scale }: { now: number | null; pre: number | null; scale: number }) {
  return (
    <div className="relative mx-2.5 mb-1 h-3 overflow-hidden rounded-sm" style={{ background: "var(--s2)" }}>
      <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--axis)" }} />
      {now == null || pre == null
        ? <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] leading-none" style={{ color: "var(--ink-3)" }}>·</span>
        : <BrickMarks now={now} pre={pre} scale={scale} height="100%" />}
    </div>
  );
}

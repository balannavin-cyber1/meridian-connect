type Point = { strike: number; iv: number };
type Props = { points: Point[]; atm: number; height?: number; width?: number };

export function IVSmile({ points, atm, height = 56, width = 220 }: Props) {
  if (!points?.length) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="10" fill="#9ca3af">
          no IV data
        </text>
      </svg>
    );
  }
  const xs = points.map((p) => p.strike);
  const ys = points.map((p) => p.iv);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRng = xMax - xMin || 1;
  const yRng = (yMax - yMin) * 1.2 || 1;
  const yLo = yMin - (yMax - yMin) * 0.1;
  const x = (s: number) => ((s - xMin) / xRng) * width;
  const y = (v: number) => height - ((v - yLo) / yRng) * height;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.strike).toFixed(1)},${y(p.iv).toFixed(1)}`)
    .join(" ");
  const atmIV = points.reduce(
    (acc, p) => (Math.abs(p.strike - atm) < Math.abs(acc.strike - atm) ? p : acc),
    points[0],
  ).iv;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
      <line x1={x(atm)} x2={x(atm)} y1={0} y2={height} stroke="#9ca3af" strokeWidth="0.75" strokeDasharray="2,2" />
      <text x={x(atm)} y={9} textAnchor="middle" fontSize="8" fill="#9ca3af">ATM</text>
      <path d={path} fill="none" stroke="var(--indigo, #4f46e5)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <circle cx={x(atm)} cy={y(atmIV)} r={2.4} fill="var(--indigo, #4f46e5)" />
      <text x={2} y={height - 2} fontSize="8" fill="#9ca3af">PE</text>
      <text x={width - 14} y={height - 2} fontSize="8" fill="#9ca3af">CE</text>
    </svg>
  );
}

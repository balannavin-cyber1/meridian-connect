type Props = {
  data: number[];
  avg?: number;
  band?: [number, number];
  color: string;
  bandColor?: string;
  height?: number;
  width?: number;
};

export function Sparkline({
  data,
  avg,
  band,
  color,
  bandColor,
  height = 56,
  width = 200,
}: Props) {
  if (!data || data.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }} />
    );
  }
  const minD = Math.min(...data, ...(band ?? []), ...(avg != null ? [avg] : []));
  const maxD = Math.max(...data, ...(band ?? []), ...(avg != null ? [avg] : []));
  const pad = (maxD - minD) * 0.1 || 1;
  const yLo = minD - pad;
  const yHi = maxD + pad;
  const x = (i: number) => (i / (data.length - 1)) * width;
  const y = (v: number) => height - ((v - yLo) / (yHi - yLo)) * height;
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
    >
      {band && (
        <rect
          x={0}
          y={y(band[1])}
          width={width}
          height={Math.max(0, y(band[0]) - y(band[1]))}
          fill={bandColor ?? color}
          opacity={0.12}
        />
      )}
      {avg != null && (
        <line
          x1={0}
          x2={width}
          y1={y(avg)}
          y2={y(avg)}
          stroke="var(--text-vweak, #d1d5db)"
          strokeWidth="0.75"
          strokeDasharray="3,3"
        />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r={2.6} fill={color} />
    </svg>
  );
}

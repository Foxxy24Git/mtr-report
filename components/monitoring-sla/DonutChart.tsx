"use client";

// Donut chart ringan berbasis SVG (tanpa dependensi chart eksternal).
// Dipakai di Monitoring SLA untuk distribusi jenis gangguan & sumber penyebab.

export interface DonutSlice {
  label: string;
  value: number;
}

// Palet selaras tema (biru primary + warna pendukung), di-cycle bila slice > palet.
const PALETTE = [
  "#2563eb",
  "#0ea5e9",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#84cc16",
  "#f97316",
];

const SIZE = 168;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const CX = SIZE / 2;

export function DonutChart({
  slices,
  total,
}: {
  slices: DonutSlice[];
  total: number;
}) {
  const data = slices.filter((s) => s.value > 0);
  const sum = total || data.reduce((a, s) => a + s.value, 0);

  if (sum === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-gray-400">
        Tidak ada data pada rentang ini.
      </div>
    );
  }

  let acc = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="shrink-0"
        role="img"
        aria-label="Donut chart distribusi"
      >
        <g transform={`rotate(-90 ${CX} ${CX})`}>
          <circle
            cx={CX}
            cy={CX}
            r={R}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={STROKE}
          />
          {data.map((s, i) => {
            const frac = s.value / sum;
            const dash = frac * C;
            const seg = (
              <circle
                key={s.label}
                cx={CX}
                cy={CX}
                r={R}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-acc * C}
                strokeLinecap="butt"
                className="transition-[stroke-dasharray] duration-500"
              >
                <title>{`${s.label}: ${s.value} (${(frac * 100).toFixed(1)}%)`}</title>
              </circle>
            );
            acc += frac;
            return seg;
          })}
        </g>
        <text
          x={CX}
          y={CX - 4}
          textAnchor="middle"
          className="fill-gray-900 text-2xl font-bold"
        >
          {sum.toLocaleString("id-ID")}
        </text>
        <text
          x={CX}
          y={CX + 16}
          textAnchor="middle"
          className="fill-gray-400 text-[11px]"
        >
          total
        </text>
      </svg>

      <ul className="w-full max-w-[14rem] space-y-1.5">
        {data.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
            />
            <span className="truncate text-gray-600" title={s.label}>
              {s.label}
            </span>
            <span className="ml-auto whitespace-nowrap font-semibold text-gray-900">
              {s.value}
            </span>
            <span className="w-10 whitespace-nowrap text-right text-gray-400">
              {((s.value / sum) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

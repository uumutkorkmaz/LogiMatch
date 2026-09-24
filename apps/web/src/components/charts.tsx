'use client';

import { useState } from 'react';

/**
 * Tek serili çubuk grafik (sıralı tek ton). Hover: çubuk başına tooltip.
 * Tek seri olduğu için lejant yok; başlık seriyi adlandırır.
 */
export function BarChart({
  data,
  format,
  height = 180,
}: {
  data: { label: string; value: number }[];
  format: (n: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">Veri yok</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 100 / data.length;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Günlük GMV"
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2="100"
            y1={height * g}
            y2={height * g}
            stroke="var(--color-border)"
            strokeWidth="0.3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {data.map((d, i) => {
          const h = Math.max(1, (d.value / max) * (height - 8));
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Görünmez geniş hit alanı */}
              <rect x={i * w} y={0} width={w} height={height} fill="transparent" />
              <rect
                x={i * w + w * 0.15}
                y={height - h}
                width={w * 0.7}
                height={h}
                rx="0.6"
                fill="var(--color-primary)"
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute -top-2 rounded-md border border-border bg-card px-2 py-1 text-xs shadow"
          style={{ left: `min(calc(${(hover + 0.5) * w}% - 3rem), calc(100% - 7rem))` }}
        >
          <p className="font-medium">{data[hover]!.label}</p>
          <p className="tabular-nums">{format(data[hover]!.value)}</p>
        </div>
      ) : null}
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]!.label}</span>
        <span>{data.at(-1)!.label}</span>
      </div>
    </div>
  );
}

/** Huni: yatay çubuklar, her adım doğrudan etiketli (değer + ilk adıma oran). */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s) => (
        <li
          key={s.label}
          className="grid grid-cols-[9rem_1fr_5rem] items-center gap-3 text-sm"
          title={`${s.label}: ${s.value}`}
        >
          <span className="text-muted-foreground">{s.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.max(1, (s.value / top) * 100)}%` }}
            />
          </span>
          <span className="text-right tabular-nums">
            {s.value}{' '}
            <span className="text-xs text-muted-foreground">
              ({Math.round((s.value / top) * 100)}%)
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

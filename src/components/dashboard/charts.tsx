import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Table2, BarChart3 } from "lucide-react";
import { ProgressSeries, WeekBucket, LoadMatrix, addDays, diffDays, fmtDay, fmtLongDay } from "../../lib/dashboard";

// Small SVG/HTML chart kit for the dashboard. Colours come from the --viz-*
// roles in index.css (light and dark), so nothing here hard-codes a hex.

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.clientWidth));
    const ro = new ResizeObserver((entries) => setW(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const CARD =
  "viz-card bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl shadow-sm";

// ---- card with an optional table view (the accessible twin of the chart) ------

export interface TableData {
  head: string[];
  rows: (string | number)[][];
}

export function ChartCard({
  title,
  subtitle,
  table,
  right,
  className = "",
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  table?: TableData;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`${CARD} p-4 flex flex-col min-w-0 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              title={showTable ? "Show chart" : "Show as table"}
              aria-label={showTable ? "Show chart" : "Show as table"}
              className="no-print p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C2027]"
            >
              {showTable ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </header>
      {showTable && table ? (
        <div className="overflow-auto max-h-72">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#1E222B]">
                {table.head.map((h, i) => (
                  <th key={h} className={`py-1.5 pr-3 font-semibold ${i > 0 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-300">
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-[#1A1E26] last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className={`py-1 pr-3 ${j > 0 ? "text-right tabular-nums" : ""}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

// ---- tooltip --------------------------------------------------------------------

function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  const TIP_W = 190;
  const left = Math.max(0, Math.min(width - TIP_W, x - TIP_W / 2));
  return (
    <div
      role="tooltip"
      className="no-print pointer-events-none absolute z-10 rounded-lg border border-slate-200 dark:border-[#2A303B] bg-white dark:bg-[#1C1F26] shadow-xl px-2.5 py-2 text-[11px] leading-snug text-slate-600 dark:text-slate-300"
      style={{ left, top: y, width: TIP_W }}
    >
      {children}
    </div>
  );
}

const TipRow = ({ color, dashed, label, value }: { color?: string; dashed?: boolean; label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="flex items-center gap-1.5 min-w-0">
      {color && (
        <span
          className="inline-block w-3 shrink-0"
          style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
        />
      )}
      <span className="truncate">{label}</span>
    </span>
    <b className="text-slate-900 dark:text-white tabular-nums">{value}</b>
  </div>
);

// ---- stat tile -------------------------------------------------------------------

export function StatTile({
  label,
  value,
  sub,
  delta,
  deltaGoodWhenUp = true,
  deltaLabel,
  hero = false,
  meter,
  onClick,
  active = false,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: number | null;
  deltaGoodWhenUp?: boolean;
  deltaLabel?: string;
  hero?: boolean;
  meter?: number; // 0–100
  onClick?: () => void;
  active?: boolean;
  icon?: React.ReactNode;
}) {
  const good = delta == null || delta === 0 ? null : delta > 0 === deltaGoodWhenUp;
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={`mt-1 font-bold text-slate-900 dark:text-white leading-none ${hero ? "text-5xl" : "text-2xl"}`}
        data-testid="stat-value"
      >
        {value}
      </div>
      {meter !== undefined && (
        <div className="mt-2.5 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--viz-accent-soft)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, meter))}%`, background: "var(--viz-accent)" }} />
        </div>
      )}
      {delta != null && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: good === null ? "var(--viz-muted)" : good ? "var(--viz-good-text)" : "var(--viz-bad-text)" }}>
          {delta > 0 ? <ArrowUpRight className="w-3 h-3" /> : delta < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          <span>
            {delta > 0 ? "+" : delta < 0 ? "−" : ""}
            {Math.abs(delta)}
          </span>
          {deltaLabel && <span className="font-normal text-slate-500 dark:text-slate-400">{deltaLabel}</span>}
        </div>
      )}
      {sub && <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{sub}</div>}
    </>
  );
  const cls = `${CARD} p-4 text-left min-w-0 ${active ? "ring-2 ring-indigo-500 border-transparent" : ""}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-indigo-400/60 transition-colors`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ---- progress against the plan (line) ---------------------------------------------

// A round tick step that gives about four intervals up to `v`.
const niceStep = (v: number) => {
  const rough = Math.max(1, v) / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const m of [1, 2, 2.5, 5, 10]) if (rough <= m * pow) return Math.max(1, m * pow);
  return 10 * pow;
};

export function ProgressChart({ series, today, height = 250 }: { series: ProgressSeries; today: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = series.points;
  const M = { l: 34, r: 14, t: 20, b: 24 };
  const W = Math.max(width, 260);
  const plotW = W - M.l - M.r;
  const plotH = height - M.t - M.b;
  const step = niceStep(series.total);
  const yMax = Math.max(step, Math.ceil(series.total / step) * step);
  const n = pts.length;
  const x = (i: number) => M.l + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v: number) => M.t + plotH - (v / yMax) * plotH;
  const todayIdx = n ? Math.max(0, Math.min(n - 1, diffDays(pts[0].date, today))) : 0;

  const geo = useMemo(() => {
    if (!n) return null;
    const planned = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.planned).toFixed(1)}`).join("");
    const act = pts.filter((p) => p.actual !== null);
    const actual = act.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.actual!).toFixed(1)}`).join("");
    const area = act.length ? `${actual}L${x(act.length - 1).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z` : "";
    // Month (or week) ticks along the bottom.
    const span = diffDays(pts[0].date, pts[n - 1].date);
    const ticks: { i: number; label: string }[] = [];
    pts.forEach((p, i) => {
      const d = new Date(p.date + "T00:00:00Z");
      if (span > 75 ? d.getUTCDate() === 1 : d.getUTCDay() === 0) {
        ticks.push({
          i,
          label:
            span > 75
              ? d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) + (d.getUTCMonth() === 0 ? ` ${d.getUTCFullYear()}` : "")
              : fmtDay(p.date),
        });
      }
    });
    const minGap = 52;
    const kept: typeof ticks = [];
    ticks.forEach((t) => {
      if (!kept.length || x(t.i) - x(kept[kept.length - 1].i) >= minGap) kept.push(t);
    });
    // Forecast: from today's actual to the projected finish (clipped to the frame).
    let forecast: { x2: number; y2: number; reaches: boolean } | null = null;
    const f = series.forecast;
    if (f?.finish) {
      const endIdx = diffDays(pts[0].date, f.finish);
      const a0 = series.doneToday;
      if (endIdx <= n - 1) forecast = { x2: x(endIdx), y2: y(series.total), reaches: true };
      else {
        const frac = (n - 1 - todayIdx) / (endIdx - todayIdx);
        forecast = { x2: x(n - 1), y2: y(a0 + (series.total - a0) * frac), reaches: false };
      }
    }
    return { planned, actual, area, ticks: kept, forecast };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, W, height, today]);

  if (!n || !geo) {
    return <p className="text-xs text-slate-500 dark:text-slate-400 py-10 text-center">Add due dates to tasks to see progress against the plan.</p>;
  }

  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - M.l) / plotW) * (n - 1)))));
  };
  const hp = hover !== null ? pts[hover] : null;
  const tx = x(todayIdx);
  const aY = y(series.doneToday);
  const labelLeft = tx > W - 90; // keep the end label inside the frame

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4" style={{ borderTop: "2px solid var(--viz-accent)" }} /> Done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4" style={{ borderTop: "2px solid var(--viz-context)" }} /> Planned (by due date)
        </span>
        {geo.forecast && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4" style={{ borderTop: "2px dashed var(--viz-accent)" }} /> At the recent pace
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        role="img"
        aria-label={`Progress against the plan: ${series.doneToday} of ${series.total} tasks done; ${series.plannedToday} were due by today.`}
        style={{ display: "block", touchAction: "pan-y" }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
            <text x={M.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--viz-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {v}
            </text>
          </g>
        ))}
        {geo.ticks.map((t) => (
          <text key={t.i} x={x(t.i)} y={height - 7} textAnchor="middle" fontSize={10} fill="var(--viz-muted)">
            {t.label}
          </text>
        ))}
        {/* today */}
        <line x1={tx} x2={tx} y1={M.t - 6} y2={y(0)} stroke="var(--viz-axis)" strokeWidth={1} />
        <text x={tx} y={M.t - 9} textAnchor={labelLeft ? "end" : "middle"} fontSize={10} fontWeight={600} fill="var(--viz-ink-2)">
          Today
        </text>
        {geo.area && <path d={geo.area} fill="var(--viz-accent)" opacity={0.1} />}
        <path d={geo.planned} fill="none" stroke="var(--viz-context)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {geo.forecast && (
          <line x1={tx} y1={aY} x2={geo.forecast.x2} y2={geo.forecast.y2} stroke="var(--viz-accent)" strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" />
        )}
        <path d={geo.actual} fill="none" stroke="var(--viz-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={tx} cy={aY} r={5} fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth={2} />
        {/* direct labels: the two ends that matter */}
        <text x={W - M.r} y={y(series.total) - 7} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--viz-ink-2)">
          {series.total} planned
        </text>
        <text
          x={labelLeft ? tx - 9 : tx + 9}
          y={Math.min(y(0) - 6, aY + (y(series.total) - aY > -26 && !labelLeft ? 16 : 4))}
          textAnchor={labelLeft ? "end" : "start"}
          fontSize={11}
          fontWeight={700}
          fill="var(--viz-ink)"
        >
          {series.doneToday} done
        </text>
        {hp && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={y(0)} stroke="var(--viz-muted)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(hp.planned)} r={4} fill="var(--viz-context)" stroke="var(--viz-surface)" strokeWidth={2} />
            {hp.actual !== null && <circle cx={x(hover)} cy={y(hp.actual)} r={4} fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth={2} />}
          </g>
        )}
      </svg>
      {hp && hover !== null && (
        <Tip x={(x(hover) / W) * width} y={34} width={width}>
          <div className="font-semibold text-slate-900 dark:text-white mb-1">{fmtLongDay(hp.date)}</div>
          {hp.actual !== null && <TipRow color="var(--viz-accent)" label="Done" value={hp.actual} />}
          <TipRow color="var(--viz-context)" label="Planned by then" value={hp.planned} />
          {hp.actual !== null && hp.planned !== hp.actual && (
            <div className="mt-1 pt-1 border-t border-slate-100 dark:border-[#2A303B]">
              {hp.planned > hp.actual ? `${hp.planned - hp.actual} behind the plan` : `${hp.actual - hp.planned} ahead of the plan`}
            </div>
          )}
        </Tip>
      )}
    </div>
  );
}

// ---- weekly columns ----------------------------------------------------------------

export function WeekColumns({
  weeks,
  pick,
  format,
  unit,
  height = 122,
}: {
  weeks: WeekBucket[];
  pick: (w: WeekBucket) => number;
  format: (v: number) => string;
  unit: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = Math.max(width, 200);
  const M = { l: 4, r: 4, t: 16, b: 18 };
  const plotH = height - M.t - M.b;
  const band = (W - M.l - M.r) / Math.max(1, weeks.length);
  const bw = Math.max(3, Math.min(24, band - 4));
  const vals = weeks.map(pick);
  const max = Math.max(1, ...vals);
  const maxIdx = vals.indexOf(Math.max(...vals));
  const lastIdx = weeks.length - 1;
  const labelEvery = Math.max(1, Math.ceil(52 / band));
  const h = (v: number) => (v / max) * plotH;
  const base = M.t + plotH;

  return (
    <div ref={ref} className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        role="img"
        aria-label={`${unit} per week for the last ${weeks.length} weeks`}
        style={{ display: "block", touchAction: "pan-y" }}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={M.l} x2={W - M.r} y1={base} y2={base} stroke="var(--viz-axis)" strokeWidth={1} />
        {weeks.map((w, i) => {
          const v = vals[i];
          const cx = M.l + band * i + band / 2;
          const bh = v > 0 ? Math.max(2, h(v)) : 0;
          const r = Math.min(4, bw / 2, bh);
          const top = base - bh;
          const showLabel = v > 0 && (i === maxIdx || i === lastIdx);
          return (
            <g key={w.start}>
              {bh > 0 && (
                <path
                  d={`M${cx - bw / 2},${base}V${top + r}Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top}H${cx + bw / 2 - r}Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r}V${base}Z`}
                  fill="var(--viz-accent)"
                  opacity={hover === i ? 0.8 : w.current ? 0.45 : 1}
                />
              )}
              {showLabel && (
                <text x={cx} y={top - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--viz-ink-2)">
                  {format(v)}
                </text>
              )}
              {(i % labelEvery === 0 || i === lastIdx) && (i === lastIdx || lastIdx - i >= labelEvery) && (
                <text x={cx} y={height - 5} textAnchor="middle" fontSize={10} fill="var(--viz-muted)">
                  {w.current ? "This wk" : fmtDay(w.start)}
                </text>
              )}
              <rect
                x={M.l + band * i}
                y={0}
                width={band}
                height={height}
                fill="transparent"
                tabIndex={0}
                aria-label={`Week of ${fmtDay(w.start)}: ${format(v)} ${unit}`}
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ outline: "none" }}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && weeks[hover] && (
        <Tip x={((M.l + band * hover + band / 2) / W) * width} y={-4} width={width}>
          <div className="font-semibold text-slate-900 dark:text-white mb-0.5">
            {fmtDay(weeks[hover].start)} – {fmtDay(addDays(weeks[hover].start, 6))}
            {weeks[hover].current ? " (so far)" : ""}
          </div>
          <TipRow label={unit} value={format(vals[hover])} />
        </Tip>
      )}
    </div>
  );
}

// ---- tall segmented bar (one whole, split into parts) --------------------------------

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string; // css colour (var)
  ink: string; // text colour inside the block
  detail?: string; // e.g. the column names behind this part
}

export function SegmentedBar({ parts }: { parts: Segment[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="text-xs text-slate-500 dark:text-slate-400 py-4">No tasks yet.</p>;
  const gaps = (shown.length - 1) * 2;
  let acc = 0;
  const hp = shown.find((p) => p.key === hover);
  let hoverX = 0;
  return (
    <div ref={ref} className="relative">
      <div className="flex gap-[2px] h-7" role="img" aria-label={shown.map((p) => `${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`).join(", ")}>
        {shown.map((p) => {
          const share = p.value / total;
          const px = Math.max(0, (width - gaps) * share);
          const pct = `${Math.round(share * 100)}%`;
          const mid = acc + px / 2;
          acc += px + 2;
          if (p.key === hover) hoverX = mid;
          return (
            <div
              key={p.key}
              tabIndex={0}
              onPointerEnter={() => setHover(p.key)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(p.key)}
              onBlur={() => setHover(null)}
              className="h-full rounded flex items-center min-w-0 outline-none"
              style={{ flex: `${p.value} 1 0`, background: p.color, opacity: hover && hover !== p.key ? 0.7 : 1 }}
            >
              {px >= pct.length * 7 + 14 && (
                <span className="pl-2 text-[11px] font-bold" style={{ color: p.ink }}>
                  {pct}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
        {shown.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
            <span>{p.label}</span>
            <b className="text-slate-900 dark:text-white tabular-nums">{p.value}</b>
          </li>
        ))}
      </ul>
      {hp && (
        <Tip x={hoverX} y={34} width={width}>
          <TipRow label={hp.label} value={`${hp.value} · ${Math.round((hp.value / total) * 100)}%`} />
          {hp.detail && <div className="mt-0.5 text-slate-500 dark:text-slate-400">{hp.detail}</div>}
        </Tip>
      )}
    </div>
  );
}

// ---- meter list (several ratios, one per named row) ----------------------------------

export interface MeterRow {
  key: string;
  label: string;
  value: number;
  max: number;
  figure: React.ReactNode; // right-aligned figure
  note?: React.ReactNode; // small text under the name
  color?: string;
  track?: string;
}

export function MeterList({ rows, empty = "Nothing to show." }: { rows: MeterRow[]; empty?: string }) {
  if (!rows.length) return <p className="text-xs text-slate-500 dark:text-slate-400 py-4">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{r.label}</div>
            {r.note && <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{r.note}</div>}
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums text-right sm:order-3 whitespace-nowrap">{r.figure}</div>
          <div
            className="col-span-2 sm:col-span-1 sm:order-2 h-2 rounded-full overflow-hidden"
            style={{ background: r.track || "var(--viz-accent-soft)" }}
            role="img"
            aria-label={`${r.label}: ${r.value} of ${r.max}`}
          >
            <div className="h-full rounded-full" style={{ width: `${r.max > 0 ? Math.min(100, (r.value / r.max) * 100) : 0}%`, background: r.color || "var(--viz-accent)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- workload heatmap (people × weeks) ------------------------------------------------

export function LoadHeatmap({ matrix }: { matrix: LoadMatrix }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  if (!matrix.rows.length) return <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">No open tasks with due dates.</p>;
  const cellStyle = (count: number, late: boolean): React.CSSProperties => {
    if (!count) return { background: "var(--viz-grid)", color: "transparent" };
    const p = Math.round(22 + 78 * (count / Math.max(1, matrix.max)));
    return {
      background: `color-mix(in srgb, ${late ? "var(--viz-late)" : "var(--viz-accent)"} ${p}%, var(--viz-surface))`,
      color: p >= 58 ? "#ffffff" : "var(--viz-ink)",
    };
  };
  const hc = hover ? matrix.rows[hover.r].cells[hover.c] : null;
  return (
    <div ref={ref} className="relative overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 pb-1 pr-2">Open tasks due</th>
            {matrix.columns.map((c, i) => (
              <th key={c.key} title={c.sub} className={`text-[10px] font-semibold text-slate-500 dark:text-slate-400 pb-1 whitespace-nowrap ${i === 0 ? "pr-1.5" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row, ri) => (
            <tr key={row.name}>
              <th className="text-left text-xs font-semibold text-slate-800 dark:text-slate-100 pr-2 max-w-[7.5rem] truncate">{row.name}</th>
              {row.cells.map((cell, ci) => (
                <td key={ci} className={`p-0 ${ci === 0 ? "pr-1.5" : ""}`}>
                  <div
                    tabIndex={cell.count ? 0 : -1}
                    data-testid="load-cell"
                    aria-label={`${row.name}, ${matrix.columns[ci].label}: ${cell.count} tasks`}
                    onPointerEnter={(e) => {
                      if (!cell.count) return;
                      const host = ref.current!.getBoundingClientRect();
                      const b = e.currentTarget.getBoundingClientRect();
                      setHover({ r: ri, c: ci, x: b.left - host.left + b.width / 2, y: b.bottom - host.top + 4 });
                    }}
                    onPointerLeave={() => setHover(null)}
                    onFocus={(e) => {
                      const host = ref.current!.getBoundingClientRect();
                      const b = e.currentTarget.getBoundingClientRect();
                      setHover({ r: ri, c: ci, x: b.left - host.left + b.width / 2, y: b.bottom - host.top + 4 });
                    }}
                    onBlur={() => setHover(null)}
                    className="h-8 min-w-[2.25rem] rounded flex items-center justify-center text-xs font-bold tabular-nums outline-none"
                    style={cellStyle(cell.count, ci === 0)}
                  >
                    {cell.count || "0"}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hover && hc && (
        <Tip x={hover.x} y={hover.y} width={width}>
          <div className="font-semibold text-slate-900 dark:text-white">
            {matrix.rows[hover.r].name} · {matrix.columns[hover.c].label}
          </div>
          <div className="text-slate-500 dark:text-slate-400 mb-1">{matrix.columns[hover.c].sub}</div>
          <TipRow label="Open tasks" value={hc.count} />
          {hc.hours > 0 && <TipRow label="Estimate left" value={`${hc.hours}h`} />}
          <ul className="mt-1 pt-1 border-t border-slate-100 dark:border-[#2A303B] space-y-0.5">
            {hc.titles.slice(0, 4).map((t, i) => (
              <li key={i} className="truncate">
                {t}
              </li>
            ))}
            {hc.titles.length > 4 && <li className="text-slate-400">+{hc.titles.length - 4} more</li>}
          </ul>
        </Tip>
      )}
    </div>
  );
}

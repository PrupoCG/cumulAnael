"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Text } from "@visx/text";
import { NUANCE_COLORS, nuanceColor } from "@/lib/nuanceColors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatEntry = { label: string; value: number };

export type NodeStats = {
  total: number;
  nuances: StatEntry[];
  genre: StatEntry[];
  departements: StatEntry[];
  age: StatEntry[];
  fonctions: StatEntry[];
};

export type StatsPanelProps = {
  stats: NodeStats;
  title: string;
};

// ---------------------------------------------------------------------------
// Nuance color map (mirrors backend suivi_mun_service.py)
// ---------------------------------------------------------------------------

// NUANCE_COLORS and nuanceColor imported from @/lib/nuanceColors

// Genre colors
const GENRE_COLORS: Record<string, string> = {
  M: "#3b82f6", "M.": "#3b82f6",
  Mme: "#ec4899", F: "#ec4899", "Mme.": "#ec4899",
};

// Age bracket colors (sequential slate-blue)
const AGE_COLORS = ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1e40af"];

// Département bar color
const DEPT_COLOR = "#6366f1";

// ---------------------------------------------------------------------------
// Tooltip (glassmorphism via CSS class)
// ---------------------------------------------------------------------------

function Tooltip({ x, y, children, color }: { x: number; y: number; children: React.ReactNode; color?: string }) {
  return (
    <div
      className="chart-tooltip"
      style={{ left: x, top: y }}
    >
      {color && <span className="tooltip-indicator" style={{ backgroundColor: color }} />}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DonutChart (original colors + animations)
// ---------------------------------------------------------------------------

function DonutChart({
  title,
  data,
  colorFn,
  width = 280,
  height = 240,
  large = false,
}: {
  title: string;
  data: StatEntry[];
  colorFn: (label: string) => string;
  width?: number;
  height?: number;
  large?: boolean;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);
  const [hoveredArc, setHoveredArc] = useState<number | null>(null);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  // Group small slices into "Autres"
  const chartData = useMemo(() => {
    if (total === 0) return [];
    const threshold = total * 0.02;
    const main: StatEntry[] = [];
    let autresValue = 0;
    for (const d of data) {
      if (d.value < threshold) autresValue += d.value;
      else main.push(d);
    }
    if (autresValue > 0) main.push({ label: "Autres", value: autresValue });
    return main;
  }, [data, total]);

  const w = large ? 560 : width;
  const h = large ? 400 : height;
  const radius = Math.min(w, h) / 2 - 20;
  const innerRadius = radius * 0.55;
  const centerX = w / 2;
  const centerY = h / 2;

  if (total === 0) {
    return (
      <div className="bg-slate-50/40 rounded-xl p-4">
        <h4 className="text-[13px] font-semibold text-slate-700 mb-2">{title}</h4>
        <p className="text-[12px] text-slate-400 italic">Aucune donnée</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/40 rounded-xl p-4" style={{ position: "relative" }}>
      <h4 className="text-[13px] font-semibold text-slate-700 mb-2">{title}</h4>
      {tooltip && <Tooltip x={tooltip.x} y={tooltip.y} color={tooltip.color}>{tooltip.text}</Tooltip>}
      <svg width={w} height={h} style={{ display: "block", margin: "0 auto" }}>
        <Group top={centerY} left={centerX}>
          <Pie
            data={chartData}
            pieValue={(d) => d.value}
            outerRadius={radius}
            innerRadius={innerRadius}
            padAngle={0.02}
            cornerRadius={3}
          >
            {(pie) =>
              pie.arcs.map((arc, i) => {
                const [cx, cy] = pie.path.centroid(arc);
                const pct = ((arc.data.value / total) * 100).toFixed(1);
                const isHovered = hoveredArc === i;
                const isDimmed = hoveredArc !== null && hoveredArc !== i;
                return (
                  <g
                    key={`arc-${i}`}
                    className="donut-arc"
                    onMouseMove={(e) => {
                      setHoveredArc(i);
                      const svg = e.currentTarget.closest("svg");
                      if (!svg) return;
                      const rect = svg.getBoundingClientRect();
                      setTooltip({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top - 14,
                        text: `${arc.data.label}: ${arc.data.value} (${pct}%)`,
                        color: colorFn(arc.data.label),
                      });
                    }}
                    onMouseLeave={() => {
                      setHoveredArc(null);
                      setTooltip(null);
                    }}
                    style={{
                      cursor: "pointer",
                      animationDelay: `${i * 80}ms`,
                      opacity: isDimmed ? 0.5 : 1,
                      transform: isHovered ? "scale(1.06)" : "scale(1)",
                      transformOrigin: "center",
                      transition: "transform 0.2s ease, opacity 0.2s ease",
                    }}
                  >
                    <path d={pie.path(arc) ?? ""} fill={colorFn(arc.data.label)} />
                    {arc.endAngle - arc.startAngle > 0.35 && (
                      <Text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        verticalAnchor="middle"
                        fill="#fff"
                        fontSize={10}
                        fontWeight={600}
                        fontFamily="Inter, system-ui, sans-serif"
                      >
                        {`${pct}%`}
                      </Text>
                    )}
                  </g>
                );
              })
            }
          </Pie>
          {/* Center label */}
          <Text
            textAnchor="middle"
            verticalAnchor="middle"
            fill="#475569"
            fontSize={16}
            fontWeight={700}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {total}
          </Text>
        </Group>
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
        {chartData.slice(0, 8).map((d) => (
          <div key={d.label} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-[3px] flex-shrink-0"
              style={{ backgroundColor: colorFn(d.label) }}
            />
            <span className="text-[10px] text-slate-500">{d.label}</span>
          </div>
        ))}
        {chartData.length > 8 && (
          <span className="text-[10px] text-slate-400">+{chartData.length - 8}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HorizontalBarChart (original colors + animations)
// ---------------------------------------------------------------------------

function HorizontalBarChart({
  title,
  data,
  colorFn,
  width = 280,
  height = 240,
  large = false,
}: {
  title: string;
  data: StatEntry[];
  colorFn?: (label: string, index: number) => string;
  width?: number;
  height?: number;
  large?: boolean;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const w = large ? 560 : width;
  const h = large ? 400 : height;
  const margin = { top: 4, right: 40, bottom: 4, left: 70 };
  const innerW = w - margin.left - margin.right;
  const innerH = h - margin.top - margin.bottom;

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  const yScale = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.label),
        range: [0, innerH],
        padding: 0.25,
      }),
    [data, innerH],
  );

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, Math.max(...data.map((d) => d.value), 1)],
        range: [0, innerW],
        nice: true,
      }),
    [data, innerW],
  );

  const defaultColor = (_label: string, _i: number) => DEPT_COLOR;
  const getColor = colorFn ?? defaultColor;

  if (data.length === 0 || total === 0) {
    return (
      <div className="bg-slate-50/40 rounded-xl p-4">
        <h4 className="text-[13px] font-semibold text-slate-700 mb-2">{title}</h4>
        <p className="text-[12px] text-slate-400 italic">Aucune donnée</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/40 rounded-xl p-4" style={{ position: "relative" }}>
      <h4 className="text-[13px] font-semibold text-slate-700 mb-2">{title}</h4>
      {tooltip && <Tooltip x={tooltip.x} y={tooltip.y} color={tooltip.color}>{tooltip.text}</Tooltip>}
      <svg width={w} height={h} style={{ display: "block", margin: "0 auto" }}>
        <Group top={margin.top} left={margin.left}>
          {data.map((d, i) => {
            const barHeight = yScale.bandwidth();
            const barWidth = xScale(d.value);
            const barY = yScale(d.label) ?? 0;
            const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0";
            const isHovered = hoveredBar === i;
            const isDimmed = hoveredBar !== null && hoveredBar !== i;
            return (
              <g
                key={`bar-${i}`}
                onMouseMove={(e) => {
                  setHoveredBar(i);
                  const svg = e.currentTarget.closest("svg");
                  if (!svg) return;
                  const rect = svg.getBoundingClientRect();
                  setTooltip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top - 14,
                    text: `${d.label}: ${d.value} (${pct}%)`,
                    color: getColor(d.label, i),
                  });
                }}
                onMouseLeave={() => {
                  setHoveredBar(null);
                  setTooltip(null);
                }}
                style={{ cursor: "pointer" }}
              >
                <rect
                  className="chart-bar"
                  x={0}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  fill={getColor(d.label, i)}
                  rx={3}
                  style={{
                    animationDelay: `${i * 60}ms`,
                    opacity: isDimmed ? 0.4 : 1,
                    transition: "opacity 0.2s ease",
                  }}
                />
                {/* Label */}
                <Text
                  x={-4}
                  y={barY + barHeight / 2}
                  textAnchor="end"
                  verticalAnchor="middle"
                  fill={isHovered ? "#334155" : "#64748b"}
                  fontSize={10}
                  fontWeight={isHovered ? 600 : 400}
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {d.label.length > 10 ? d.label.slice(0, 9) + "…" : d.label}
                </Text>
                {/* Value */}
                <Text
                  x={barWidth + 4}
                  y={barY + barHeight / 2}
                  textAnchor="start"
                  verticalAnchor="middle"
                  fill={isHovered ? "#1e293b" : "#64748b"}
                  fontSize={10}
                  fontWeight={isHovered ? 700 : 600}
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {d.value}
                </Text>
              </g>
            );
          })}
        </Group>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeptMiniMap – real geographic map of France by département
// ---------------------------------------------------------------------------

// GeoJSON cache (shared across all DeptMiniMap instances)
let _geoCache: GeoJSON.FeatureCollection | null = null;
let _geoPromise: Promise<GeoJSON.FeatureCollection> | null = null;

function loadDeptGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  if (_geoCache) return Promise.resolve(_geoCache);
  if (_geoPromise) return _geoPromise;
  _geoPromise = fetch("/data/departements.geojson")
    .then((r) => r.json())
    .then((data: GeoJSON.FeatureCollection) => {
      _geoCache = data;
      return data;
    });
  return _geoPromise;
}

function DeptMiniMap({
  title,
  data,
  width = 280,
  height = 240,
}: {
  title: string;
  data: StatEntry[];
  width?: number;
  height?: number;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(_geoCache);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!geo) {
      loadDeptGeoJSON().then(setGeo);
    }
  }, [geo]);

  // Data labels are département names (e.g. "Bouches-Du-Rhône"), normalize for matching
  const dataMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of data) m[d.label.toLowerCase()] = d.value;
    return m;
  }, [data]);

  const maxVal = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  const colorScale = useMemo(
    () =>
      scaleLinear<string>({
        domain: [0, maxVal],
        range: ["#e2e8f0", "#4f46e5"],
      }),
    [maxVal],
  );

  // DOM-TOM insets (not in GeoJSON, shown as small labeled rectangles)
  const DROM_INSETS: { label: string; name: string }[] = [
    { label: "971", name: "Guadeloupe" },
    { label: "972", name: "Martinique" },
    { label: "973", name: "Guyane" },
    { label: "974", name: "La Réunion" },
    { label: "976", name: "Mayotte" },
  ];

  const mapHeight = height - 28; // reserve bottom strip for DOM-TOM

  // d3-geo projection + path (lazy import to avoid SSR issues)
  const paths = useMemo(() => {
    if (!geo) return [];
    // Dynamic require for d3-geo (already installed)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const d3geo = require("d3-geo") as typeof import("d3-geo");
    const padding = 8;
    const projection = d3geo.geoMercator().fitSize(
      [width - padding * 2, mapHeight - padding * 2],
      geo,
    );
    projection.translate([
      (projection.translate()[0] ?? 0) + padding,
      (projection.translate()[1] ?? 0) + padding,
    ]);
    const pathGen = d3geo.geoPath(projection);

    return geo.features.map((feature) => {
      const code = (feature.properties as { code: string }).code;
      const nom = (feature.properties as { nom: string }).nom;
      const d = pathGen(feature) ?? "";
      return { code, nom, d };
    });
  }, [geo, width, mapHeight]);

  if (total === 0 && !geo) {
    return (
      <div className="bg-slate-50/40 rounded-xl p-4">
        <h4 className="text-[13px] font-semibold text-slate-700 mb-2">{title}</h4>
        <p className="text-[12px] text-slate-400 italic">Chargement...</p>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="bg-slate-50/40 rounded-xl p-4">
        <h4 className="text-[13px] font-semibold text-slate-700 mb-2">{title}</h4>
        <p className="text-[12px] text-slate-400 italic">Aucune donnée</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/40 rounded-xl p-4" style={{ position: "relative" }}>
      <h4 className="text-[13px] font-semibold text-slate-700 mb-2">{title}</h4>
      {tooltip && <Tooltip x={tooltip.x} y={tooltip.y} color={tooltip.color}>{tooltip.text}</Tooltip>}
      <svg ref={svgRef} width={width} height={height} style={{ display: "block", margin: "0 auto" }}>
        {/* Metropolitan France */}
        {paths.map(({ code, nom, d }) => {
          const val = dataMap[nom.toLowerCase()] ?? 0;
          const fill = val > 0 ? colorScale(val) : "#f1f5f9";
          return (
            <path
              key={code}
              d={d}
              fill={fill}
              stroke="#fff"
              strokeWidth={0.5}
              onMouseMove={(e) => {
                const svg = svgRef.current;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                setTooltip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top - 14,
                  text: `${nom} (${code}) : ${val} pers.`,
                  color: fill,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: "pointer", transition: "fill 0.15s ease" }}
            />
          );
        })}
        {/* DOM-TOM insets */}
        {DROM_INSETS.map((drom, i) => {
          const val = dataMap[drom.name.toLowerCase()] ?? 0;
          const fill = val > 0 ? colorScale(val) : "#f1f5f9";
          const boxW = 14;
          const gap = (width - DROM_INSETS.length * boxW) / (DROM_INSETS.length + 1);
          const bx = gap + i * (boxW + gap);
          const by = mapHeight + 4;
          return (
            <g
              key={drom.label}
              onMouseMove={(e) => {
                const svg = svgRef.current;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                setTooltip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top - 14,
                  text: `${drom.name} (${drom.label}) : ${val} pers.`,
                  color: fill,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: "pointer" }}
            >
              <rect x={bx} y={by} width={boxW} height={boxW} rx={2} fill={fill} stroke="#cbd5e1" strokeWidth={0.5} />
              <text x={bx + boxW / 2} y={by + boxW + 8} textAnchor="middle" fill="#64748b" fontSize={6} fontFamily="Inter, system-ui, sans-serif">
                {drom.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main StatsPanel
// ---------------------------------------------------------------------------

function ExpandButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-md bg-white/80 hover:bg-slate-100 border border-slate-200/60 text-slate-400 hover:text-slate-600 transition-colors"
      title={expanded ? "Réduire" : "Agrandir"}
    >
      {expanded ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
      )}
    </button>
  );
}

function ChartWrapper({ id, expanded, onExpand, onCollapse, children }: {
  id: string;
  expanded: string | null;
  onExpand: (id: string) => void;
  onCollapse: () => void;
  children: React.ReactNode;
}) {
  if (expanded !== null && expanded !== id) return null;
  return (
    <div className="relative" style={expanded === id ? { gridColumn: "1 / -1" } : undefined}>
      <ExpandButton expanded={expanded === id} onClick={() => expanded === id ? onCollapse() : onExpand(id)} />
      {children}
    </div>
  );
}

export default function StatsPanel({ stats, title }: StatsPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="mt-5 bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm shadow-slate-200/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100/80 bg-slate-50/60">
        <h3 className="text-[14px] font-bold text-slate-800">{title}</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">{stats.total} personne{stats.total > 1 ? "s" : ""}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <ChartWrapper id="nuances" expanded={expanded} onExpand={setExpanded} onCollapse={() => setExpanded(null)}>
          <DonutChart
            title="Nuances politiques"
            data={stats.nuances}
            colorFn={nuanceColor}
            large={expanded === "nuances"}
          />
        </ChartWrapper>
        <ChartWrapper id="genre" expanded={expanded} onExpand={setExpanded} onCollapse={() => setExpanded(null)}>
          <DonutChart
            title="Genre"
            data={stats.genre}
            colorFn={(label) => GENRE_COLORS[label] ?? "#94a3b8"}
            large={expanded === "genre"}
          />
        </ChartWrapper>
        <ChartWrapper id="carte" expanded={expanded} onExpand={setExpanded} onCollapse={() => setExpanded(null)}>
          <DeptMiniMap
            title="Carte des départements"
            data={stats.departements}
            width={expanded === "carte" ? 560 : 280}
            height={expanded === "carte" ? 480 : 240}
          />
        </ChartWrapper>
        <ChartWrapper id="age" expanded={expanded} onExpand={setExpanded} onCollapse={() => setExpanded(null)}>
          <HorizontalBarChart
            title="Tranches d'âge"
            data={stats.age}
            colorFn={(_label, i) => AGE_COLORS[i % AGE_COLORS.length]}
            large={expanded === "age"}
          />
        </ChartWrapper>
      </div>
    </div>
  );
}

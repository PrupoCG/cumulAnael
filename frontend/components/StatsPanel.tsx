"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Text } from "@visx/text";
import { AxisBottom } from "@visx/axis";
import { useTooltip, useTooltipInPortal, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { NUANCE_COLORS, nuanceColor } from "@/lib/nuanceColors";
import { Users, Palette, Target, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatEntry = { label: string; value: number };

type EfficaciteNuance = {
  nuance: string;
  candidats: number;
  elus: number;
  battus: number;
  taux_election: number;
  taux_defaite: number;
};

export type EfficaciteStats = {
  nuances: EfficaciteNuance[];
  nuporec?: EfficaciteNuance[];
  total_candidats: number;
  total_elus: number;
};

export type NodeStats = {
  total: number;
  nuances: StatEntry[];
  nuporec?: StatEntry[];
  genre: StatEntry[];
  departements: StatEntry[];
  age: StatEntry[];
  fonctions: StatEntry[];
  efficacite?: EfficaciteStats;
};

export type StatsPanelProps = {
  stats: NodeStats;
  title: string;
  onReset?: () => void;
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

// NuPoREC color palette
const NUPOREC_COLORS: Record<string, string> = {
  "DROITE GOUV": "#1e40af",
  "DivDROITE": "#3b82f6",
  "CENTRE": "#f59e0b",
  "GAUCHE GOUV": "#dc2626",
  "DivGAUCHE": "#f87171",
  "GAUCHE UNIE": "#b91c1c",
  "AUTRE": "#6b7280",
  "ExDROITE": "#1e3a5f",
  "ECOLO": "#16a34a",
  "COMMUNISTES": "#991b1b",
  "INSOUMIS": "#c026d3",
  "ExGAUCHE": "#9f1239",
  "Inconnu": "#9ca3af",
};
function nuporecColor(label: string): string {
  return NUPOREC_COLORS[label] ?? "#94a3b8";
}

type ViewKey = "profil" | "nuances" | "efficacite";

const VIEW_BUTTONS: { key: ViewKey; label: string; icon: typeof Users }[] = [
  { key: "profil", label: "Profil", icon: Users },
  { key: "nuances", label: "Nuances", icon: Palette },
  { key: "efficacite", label: "Efficacité", icon: Target },
];

const DIVERGING_TOOLTIP_STYLES = {
  ...defaultStyles,
  background: "rgba(15, 23, 42, 0.95)",
  color: "#fff",
  padding: "10px 14px",
  borderRadius: "8px",
  fontSize: "12px",
  fontFamily: "Inter, system-ui, sans-serif",
  lineHeight: "1.5",
  boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const DIVERGING_W = 700;
const DIVERGING_MARGIN = { top: 12, right: 16, bottom: 40, left: 90 };

type DivergingTooltipData = {
  nuance: string;
  candidats: number;
  elus: number;
  battus: number;
  taux_election: number;
  color: string;
};

function DivergingReussiteChart({ data }: { data: EfficaciteStats }) {
  const [mode, setMode] = useState<"nuances" | "nuporec">("nuances");
  const {
    tooltipOpen, tooltipLeft, tooltipTop, tooltipData,
    hideTooltip, showTooltip,
  } = useTooltip<DivergingTooltipData>();
  const { containerRef, TooltipInPortal } = useTooltipInPortal({ scroll: true });

  const hasNuporec = data.nuporec && data.nuporec.length > 0;
  const rows = mode === "nuporec" && hasNuporec ? data.nuporec! : data.nuances;

  const innerWidth = DIVERGING_W - DIVERGING_MARGIN.left - DIVERGING_MARGIN.right;
  const chartHeight = Math.max(120, rows.length * 12 + DIVERGING_MARGIN.top + DIVERGING_MARGIN.bottom);
  const innerHeight = chartHeight - DIVERGING_MARGIN.top - DIVERGING_MARGIN.bottom;

  const yScale = useMemo(
    () => scaleBand<string>({
      domain: rows.map((d) => d.nuance),
      range: [0, innerHeight],
      padding: 0.2,
    }),
    [rows, innerHeight],
  );

  const xScale = useMemo(
    () => scaleLinear<number>({
      domain: [-100, 100],
      range: [0, innerWidth],
      nice: true,
    }),
    [innerWidth],
  );

  const centerX = xScale(0);

  const handleMouse = useCallback(
    (e: React.MouseEvent, row: EfficaciteStats["nuances"][number]) => {
      const coords = localPoint(e) || { x: 0, y: 0 };
      showTooltip({
        tooltipData: {
          nuance: row.nuance,
          candidats: row.candidats,
          elus: row.elus,
          battus: row.battus,
          taux_election: row.taux_election,
          color: nuanceColor(row.nuance),
        },
        tooltipTop: coords.y,
        tooltipLeft: coords.x,
      });
    },
    [showTooltip],
  );

  const avgTauxElection = useMemo(() => {
    if (data.total_candidats === 0) return 0;
    return Math.round((data.total_elus / data.total_candidats) * 100);
  }, [data]);

  if (!rows.length) {
    return (
      <div className="bg-slate-50/40 rounded-xl p-4">
        <h4 className="text-[13px] font-semibold text-slate-700 mb-1">Efficacité électorale</h4>
        <p className="text-[12px] text-slate-400 italic">Aucune donnée</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="px-1 mb-2 flex items-start justify-between">
        <div>
          <h4 className="text-[13px] font-bold text-slate-800">Efficacité électorale</h4>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {data.total_candidats} parlementaires candidats — {data.total_elus} élus ({avgTauxElection}% de réussite globale)
          </p>
        </div>
        {hasNuporec && (
          <div className="flex gap-1">
            <button
              onClick={() => setMode("nuances")}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${
                mode === "nuances" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              Nuance parl.
            </button>
            <button
              onClick={() => setMode("nuporec")}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${
                mode === "nuporec" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              NuPoREC
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-6 justify-center mb-2">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: "#10b981" }} />
          <span className="text-[11px] text-slate-600 font-medium">Élus</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: "#ef4444" }} />
          <span className="text-[11px] text-slate-600 font-medium">Battus</span>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="w-full" style={{ maxHeight: "65vh", overflow: "auto" }}>
        <svg
          width="100%"
          viewBox={`0 0 ${DIVERGING_W} ${chartHeight}`}
          style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}
        >
          <Group top={DIVERGING_MARGIN.top} left={DIVERGING_MARGIN.left}>
            {/* Grid lines */}
            {[-75, -50, -25, 25, 50, 75, 100].map((tick) => (
              <line
                key={`grid-${tick}`}
                x1={xScale(tick)} x2={xScale(tick)}
                y1={0} y2={innerHeight}
                stroke="#f1f5f9" strokeWidth={1}
              />
            ))}

            {/* Center line (0%) */}
            <line
              x1={centerX} x2={centerX}
              y1={-10} y2={innerHeight + 5}
              stroke="#94a3b8" strokeWidth={1.5}
            />

            {/* Bars */}
            {rows.map((row) => {
              const barY = yScale(row.nuance) ?? 0;
              const barH = yScale.bandwidth();
              const elusWidth = xScale(row.taux_election) - centerX;
              const battusWidth = centerX - xScale(-row.taux_defaite);

              return (
                <g
                  key={row.nuance}
                  onMouseMove={(e) => handleMouse(e, row)}
                  onMouseLeave={hideTooltip}
                  style={{ cursor: "pointer" }}
                >
                  {/* Élu bar (right, green) */}
                  <rect
                    x={centerX} y={barY}
                    width={Math.max(0, elusWidth)} height={barH}
                    fill="#10b981" rx={3} opacity={0.85}
                  />
                  {/* Battu bar (left, red) */}
                  <rect
                    x={centerX - battusWidth} y={barY}
                    width={Math.max(0, battusWidth)} height={barH}
                    fill="#ef4444" rx={3} opacity={0.75}
                  />
                  {/* Nuance label (left) */}
                  <Text
                    x={-6} y={barY + barH / 2}
                    textAnchor="end" verticalAnchor="middle"
                    fill={mode === "nuporec" ? nuporecColor(row.nuance) : nuanceColor(row.nuance)}
                    fontSize={10} fontWeight={700}
                    fontFamily="Inter, system-ui, sans-serif"
                  >
                    {row.nuance}
                  </Text>
                  {/* % élus (white inside green bar) */}
                  {elusWidth > 25 && (
                    <Text
                      x={centerX + elusWidth - 6} y={barY + barH / 2}
                      textAnchor="end" verticalAnchor="middle"
                      fill="#fff" fontSize={9} fontWeight={700}
                      fontFamily="Inter, system-ui, sans-serif"
                    >
                      {`${row.taux_election}%`}
                    </Text>
                  )}
                  {/* % battus (white inside red bar) */}
                  {battusWidth > 25 && (
                    <Text
                      x={centerX - battusWidth + 6} y={barY + barH / 2}
                      textAnchor="start" verticalAnchor="middle"
                      fill="#fff" fontSize={9} fontWeight={600}
                      fontFamily="Inter, system-ui, sans-serif"
                    >
                      {`${row.taux_defaite}%`}
                    </Text>
                  )}
                  {/* Count (far right) */}
                  <Text
                    x={centerX + elusWidth + 6} y={barY + barH / 2}
                    textAnchor="start" verticalAnchor="middle"
                    fill="#94a3b8" fontSize={9}
                    fontFamily="Inter, system-ui, sans-serif"
                  >
                    {`${row.candidats}`}
                  </Text>
                </g>
              );
            })}

            {/* X Axis */}
            <AxisBottom
              top={innerHeight}
              scale={xScale}
              numTicks={9}
              stroke="#cbd5e1"
              tickStroke="#cbd5e1"
              tickFormat={(v) => `${Math.abs(v as number)}%`}
              tickLabelProps={() => ({
                fill: "#64748b",
                fontSize: 10,
                fontFamily: "Inter, system-ui, sans-serif",
                textAnchor: "middle" as const,
                dy: "0.25em",
              })}
              hideTicks
            />

            {/* Axis annotations */}
            <Text
              x={centerX + innerWidth * 0.25} y={innerHeight + 40}
              textAnchor="middle" fill="#10b981"
              fontSize={10} fontWeight={600}
              fontFamily="Inter, system-ui, sans-serif"
            >
              {"← Élus →"}
            </Text>
            <Text
              x={centerX - innerWidth * 0.25} y={innerHeight + 40}
              textAnchor="middle" fill="#ef4444"
              fontSize={10} fontWeight={600}
              fontFamily="Inter, system-ui, sans-serif"
            >
              {"← Battus →"}
            </Text>
          </Group>
        </svg>

        {/* Tooltip */}
        {tooltipOpen && tooltipData && (
          <TooltipInPortal top={tooltipTop} left={tooltipLeft} style={DIVERGING_TOOLTIP_STYLES}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
              <span
                style={{
                  display: "inline-block", width: 10, height: 10,
                  borderRadius: "50%", backgroundColor: tooltipData.color, marginRight: 8,
                }}
              />
              {tooltipData.nuance}
            </div>
            <div style={{ opacity: 0.85 }}>
              <span style={{ color: "#10b981" }}>{tooltipData.elus} élus</span>
              {" / "}
              <span style={{ color: "#ef4444" }}>{tooltipData.battus} battus</span>
              {" sur "}
              {tooltipData.candidats} candidats
            </div>
            <div style={{ fontWeight: 700, marginTop: 4, fontSize: 13 }}>
              {tooltipData.taux_election}% de réussite
            </div>
          </TooltipInPortal>
        )}
      </div>
    </div>
  );
}

export default function StatsPanel({ stats, title, onReset }: StatsPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("profil");

  const hasNuporec = stats.nuporec && stats.nuporec.length > 0;

  return (
    <div className="mt-5 bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm shadow-slate-200/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100/80 bg-slate-50/60 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-bold text-slate-800">{title}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{stats.total} personne{stats.total > 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-1">
          {VIEW_BUTTONS.map((v) => (
            <button
              key={v.key}
              onClick={() => { setView(v.key); setExpanded(null); }}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full flex items-center gap-1 transition-colors ${
                view === v.key
                  ? "bg-slate-700 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              <v.icon size={11} />
              {v.label}
            </button>
          ))}
          {onReset && (
            <button
              onClick={onReset}
              className="ml-1 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 transition-colors"
              title="Réinitialiser"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Vue Profil */}
      {view === "profil" && (
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
      )}

      {/* Vue Nuances */}
      {view === "nuances" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          <DonutChart
            title="Nuances parlementaires"
            data={stats.nuances}
            colorFn={nuanceColor}
            large
          />
          {hasNuporec ? (
            <DonutChart
              title="NuPoREC"
              data={stats.nuporec!}
              colorFn={nuporecColor}
              large
            />
          ) : (
            <div className="bg-slate-50/40 rounded-xl p-4 flex items-center justify-center">
              <p className="text-[12px] text-slate-400 italic">Données NuPoREC indisponibles</p>
            </div>
          )}
        </div>
      )}

      {/* Vue Efficacité */}
      {view === "efficacite" && (
        <div className="p-4">
          {stats.efficacite && stats.efficacite.nuances.length > 0 ? (
            <DivergingReussiteChart data={stats.efficacite} />
          ) : (
            <div className="bg-slate-50/40 rounded-xl p-4 flex items-center justify-center">
              <p className="text-[12px] text-slate-400 italic">Aucune donnée d'efficacité</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

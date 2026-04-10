"use client";

import { useMemo, useState, useCallback } from "react";
import { Pack } from "@visx/hierarchy";
import { Group } from "@visx/group";
import { hierarchy } from "d3-hierarchy";
import { nuanceColor } from "@/lib/nuanceColors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HemicyclePerson = {
  nom: string;
  prenom: string;
  nuance: string;
  nuporec: string;
  demissionnaire: number;
};

export type HemicycleData = {
  persons: HemicyclePerson[];
  total: number;
};

type HierarchyNode = {
  name: string;
  children?: HierarchyNode[];
  person?: HemicyclePerson;
  value?: number;
};

// ---------------------------------------------------------------------------
// NuPoREC political ordering (left → right)
// ---------------------------------------------------------------------------

const NUPOREC_ORDER: Record<string, number> = {
  "ExGAUCHE": 0,
  "COMMUNISTES": 1,
  "INSOUMIS": 2,
  "GAUCHE UNIE": 3,
  "ECOLO": 4,
  "GAUCHE GOUV": 5,
  "DivGAUCHE": 6,
  "CENTRE": 7,
  "DROITE GOUV": 8,
  "DivDROITE": 9,
  "ExDROITE": 10,
  "AUTRE": 11,
  "Inconnu": 12,
};

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HemicycleChart({ data, width = 700 }: { data: HemicycleData; width?: number }) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    person: HemicyclePerson;
  } | null>(null);

  const height = width * 0.55;

  // Build hierarchy: root → NuPoREC groups → individuals
  const root = useMemo(() => {
    const groups = new Map<string, HemicyclePerson[]>();
    for (const p of data.persons) {
      const g = groups.get(p.nuporec) || [];
      g.push(p);
      groups.set(p.nuporec, g);
    }

    const children: HierarchyNode[] = Array.from(groups.entries())
      .sort((a, b) => (NUPOREC_ORDER[a[0]] ?? 99) - (NUPOREC_ORDER[b[0]] ?? 99))
      .map(([name, persons]) => ({
        name,
        children: persons.map((p) => ({
          name: `${p.prenom} ${p.nom}`,
          person: p,
          value: 1,
        })),
      }));

    const tree: HierarchyNode = { name: "root", children };
    return hierarchy(tree)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [data.persons]);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent, person: HemicyclePerson) => {
      const rect = (e.currentTarget as SVGElement).closest("svg")?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10,
        person,
      });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // Count démissionnaires
  const nbDemissions = useMemo(
    () => data.persons.filter((p) => p.demissionnaire === 1).length,
    [data.persons],
  );

  // Legend entries from actual data
  const legendEntries = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of data.persons) {
      seen.set(p.nuporec, (seen.get(p.nuporec) || 0) + 1);
    }
    return Array.from(seen.entries())
      .sort((a, b) => (NUPOREC_ORDER[a[0]] ?? 99) - (NUPOREC_ORDER[b[0]] ?? 99));
  }, [data.persons]);

  return (
    <div style={{ position: "relative" }}>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 justify-center">
        {legendEntries.map(([name, count]) => (
          <div key={name} className="flex items-center gap-1 text-[10px] text-slate-600">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: NUPOREC_COLORS[name] ?? "#94a3b8" }}
            />
            {name} ({count})
          </div>
        ))}
        {nbDemissions > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-red-600 font-medium">
            <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-red-500 bg-transparent" />
            Démissionnaires ({nbDemissions})
          </div>
        )}
      </div>

      <svg width={width} height={height} style={{ display: "block", margin: "0 auto" }}>
        <defs>
          <clipPath id="hemicycle-clip">
            <path d={`M 0,${height} A ${width / 2},${height} 0 0,1 ${width},${height} L ${width},${height} L 0,${height} Z`} />
          </clipPath>
        </defs>
        <g clipPath="url(#hemicycle-clip)">
          <Pack<HierarchyNode> root={root} size={[width, height * 2]} padding={2}>
            {(packData) => {
              const circles = packData.descendants().filter((d) => !d.children);
              return (
                <Group top={0} left={0}>
                  {circles.map((circle, i) => {
                    const person = circle.data.person;
                    if (!person) return null;
                    const fill = nuanceColor(person.nuance);
                    const isDem = person.demissionnaire === 1;
                    return (
                      <circle
                        key={i}
                        cx={circle.x}
                        cy={circle.y}
                        r={Math.max(circle.r, 2.5)}
                        fill={fill}
                        stroke={isDem ? "#dc2626" : "rgba(255,255,255,0.4)"}
                        strokeWidth={isDem ? 2 : 0.5}
                        opacity={isDem ? 1 : 0.85}
                        style={{ cursor: "pointer", transition: "opacity 0.15s" }}
                        onMouseEnter={(e) => handleMouseEnter(e, person)}
                        onMouseLeave={handleMouseLeave}
                      />
                    );
                  })}
                </Group>
              );
            }}
          </Pack>
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="chart-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
            pointerEvents: "none",
          }}
        >
          <div className="text-[11px] font-semibold">
            {tooltip.person.prenom} {tooltip.person.nom}
          </div>
          <div className="text-[10px] text-slate-300">
            {tooltip.person.nuance} - {tooltip.person.nuporec}
          </div>
          {tooltip.person.demissionnaire === 1 && (
            <div className="text-[10px] text-red-400 font-medium">Démissionnaire</div>
          )}
        </div>
      )}
    </div>
  );
}

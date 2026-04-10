"use client";

import { useMemo, useState, useCallback } from "react";
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
// Seat layout computation
// ---------------------------------------------------------------------------

type Seat = { x: number; y: number; person: HemicyclePerson };

function computeSeats(
  persons: HemicyclePerson[],
  width: number,
  height: number,
): Seat[] {
  const total = persons.length;
  if (total === 0) return [];

  // Sort: NuPoREC left→right, then by nuance within group
  const sorted = [...persons].sort((a, b) => {
    const orderDiff = (NUPOREC_ORDER[a.nuporec] ?? 99) - (NUPOREC_ORDER[b.nuporec] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return a.nuance.localeCompare(b.nuance);
  });

  const cx = width / 2;
  const cy = height - 4; // center at bottom

  // Dynamically size seats based on total count
  const seatRadius = Math.max(1.5, Math.min(4, width / (total * 0.18)));
  const gap = seatRadius * 0.4;
  const rowGap = seatRadius * 0.6;
  const step = seatRadius * 2 + gap;
  const rowStep = seatRadius * 2 + rowGap;

  const rMin = width * 0.08;
  const rMax = Math.min(width / 2 - 4, height - 8);

  // Calculate how many rows fit
  const numRows = Math.max(1, Math.floor((rMax - rMin) / rowStep) + 1);

  // Round-robin: distribute persons across rows so each row
  // has the full political spectrum (gauche à gauche, droite à droite)
  const rowPersons: HemicyclePerson[][] = Array.from({ length: numRows }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    rowPersons[i % numRows].push(sorted[i]);
  }

  const seats: Seat[] = [];
  const padding = 0.05;

  for (let r = 0; r < numRows; r++) {
    const radius = rMin + r * rowStep;
    const persons = rowPersons[r];
    if (persons.length === 0) continue;

    for (let j = 0; j < persons.length; j++) {
      const theta =
        persons.length === 1
          ? Math.PI / 2
          : Math.PI * (1 - padding) - j * (Math.PI * (1 - 2 * padding)) / (persons.length - 1);
      const x = cx + radius * Math.cos(theta);
      const y = cy - radius * Math.sin(theta);
      seats.push({ x, y, person: persons[j] });
    }
  }

  return seats;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HemicycleChart({ data, width = 700 }: { data: HemicycleData; width?: number }) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    person: HemicyclePerson;
  } | null>(null);

  const height = Math.round(width * 0.52);

  const seats = useMemo(() => computeSeats(data.persons, width, height), [data.persons, width, height]);

  const seatRadius = useMemo(() => {
    const total = data.persons.length;
    return Math.max(1.5, Math.min(4, width / (total * 0.18)));
  }, [data.persons.length, width]);

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

  const nbDemissions = useMemo(
    () => data.persons.filter((p) => p.demissionnaire === 1).length,
    [data.persons],
  );

  const legendEntries = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of data.persons) {
      seen.set(p.nuporec, (seen.get(p.nuporec) || 0) + 1);
    }
    return Array.from(seen.entries())
      .sort((a, b) => (NUPOREC_ORDER[a[0]] ?? 99) - (NUPOREC_ORDER[b[0]] ?? 99));
  }, [data.persons]);

  if (data.persons.length === 0) {
    return <p className="text-[12px] text-slate-400 italic text-center">Aucune donnée</p>;
  }

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
        {seats.map((seat, i) => {
          const isDem = seat.person.demissionnaire === 1;
          return (
            <circle
              key={i}
              cx={seat.x}
              cy={seat.y}
              r={seatRadius}
              fill={nuanceColor(seat.person.nuance)}
              stroke={isDem ? "#dc2626" : "rgba(255,255,255,0.3)"}
              strokeWidth={isDem ? 1.5 : 0.3}
              opacity={isDem ? 1 : 0.9}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => handleMouseEnter(e, seat.person)}
              onMouseLeave={handleMouseLeave}
            />
          );
        })}
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
            {tooltip.person.nuance} — {tooltip.person.nuporec}
          </div>
          {tooltip.person.demissionnaire === 1 && (
            <div className="text-[10px] text-red-400 font-medium">Démissionnaire</div>
          )}
        </div>
      )}
    </div>
  );
}

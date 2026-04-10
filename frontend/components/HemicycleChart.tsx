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
  "DROITE GOUV": "#a3c4e0",
  "DivDROITE": "#b8d4f0",
  "CENTRE": "#fae0a8",
  "GAUCHE GOUV": "#f2a8b0",
  "DivGAUCHE": "#f5c0c6",
  "GAUCHE UNIE": "#e8949d",
  "AUTRE": "#c8ccd4",
  "ExDROITE": "#5c6178",
  "ECOLO": "#a8d8b0",
  "COMMUNISTES": "#d4a0a6",
  "INSOUMIS": "#d8b0e0",
  "ExGAUCHE": "#d4a0b0",
  "Inconnu": "#d0d5dd",
};

// ---------------------------------------------------------------------------
// Seat layout — groups as angular sectors, rows concentric
// ---------------------------------------------------------------------------

type Seat = { x: number; y: number; person: HemicyclePerson };

function computeSeats(
  persons: HemicyclePerson[],
  width: number,
  height: number,
): { seats: Seat[]; seatRadius: number } {
  const total = persons.length;
  if (total === 0) return { seats: [], seatRadius: 3 };

  // Group by NuPoREC, sorted left→right
  const groupMap = new Map<string, HemicyclePerson[]>();
  for (const p of persons) {
    const g = groupMap.get(p.nuporec) || [];
    g.push(p);
    groupMap.set(p.nuporec, g);
  }
  const groups = Array.from(groupMap.entries())
    .sort((a, b) => (NUPOREC_ORDER[a[0]] ?? 99) - (NUPOREC_ORDER[b[0]] ?? 99));

  const cx = width / 2;
  const cy = height - 2;

  // Compute seat radius based on count
  const seatRadius = Math.max(2, Math.min(6, width / (Math.sqrt(total) * 3.2)));
  const diameter = seatRadius * 2;

  const rMin = diameter * 2;
  const rMax = Math.min(width / 2 - seatRadius - 2, height - seatRadius - 4);

  // Determine number of rows
  const numRows = Math.max(3, Math.round((rMax - rMin) / diameter));
  const rowStep = (rMax - rMin) / (numRows - 1);
  const radii = Array.from({ length: numRows }, (_, i) => rMin + i * rowStep);

  // Total arc-capacity across all rows (for proportional angular allocation)
  const totalArcLen = radii.reduce((s, r) => s + Math.PI * r, 0);

  // Each group gets an angular share proportional to its size
  const groupGap = 0.02; // small angular gap between groups
  const totalGap = groupGap * (groups.length - 1);
  const usableAngle = Math.PI - totalGap;

  // Compute angular sector for each group
  type GroupSector = {
    name: string;
    persons: HemicyclePerson[];
    startAngle: number;
    endAngle: number;
  };

  const sectors: GroupSector[] = [];
  let angle = Math.PI; // start from left (π)

  for (let gi = 0; gi < groups.length; gi++) {
    const [name, gpersons] = groups[gi];
    const share = gpersons.length / total;
    const sectorAngle = usableAngle * share;
    const startAngle = angle;
    const endAngle = angle - sectorAngle;
    sectors.push({ name, persons: gpersons, startAngle, endAngle });
    angle = endAngle - groupGap;
  }

  const seats: Seat[] = [];

  for (const sector of sectors) {
    const { persons: gpersons, startAngle, endAngle } = sector;
    const sectorSpan = startAngle - endAngle;

    // Distribute group members across rows, filling from inner to outer
    // Calculate how many seats fit per row in this sector
    const rowCapacities = radii.map((r) => {
      const arcLen = sectorSpan * r;
      return Math.max(1, Math.floor(arcLen / diameter));
    });
    const totalCap = rowCapacities.reduce((s, c) => s + c, 0);

    // Assign persons to rows proportionally
    let personIdx = 0;
    for (let ri = 0; ri < numRows && personIdx < gpersons.length; ri++) {
      const remaining = gpersons.length - personIdx;
      const remainingCap = rowCapacities.slice(ri).reduce((s, c) => s + c, 0);
      const seatsInRow = Math.min(
        rowCapacities[ri],
        Math.round((rowCapacities[ri] / remainingCap) * remaining),
      );
      if (seatsInRow <= 0) continue;

      const r = radii[ri];
      // Place seats evenly within the sector
      for (let j = 0; j < seatsInRow && personIdx < gpersons.length; j++) {
        const theta =
          seatsInRow === 1
            ? (startAngle + endAngle) / 2
            : startAngle - j * sectorSpan / (seatsInRow - 1);
        const x = cx + r * Math.cos(theta);
        const y = cy - r * Math.sin(theta);
        seats.push({ x, y, person: gpersons[personIdx] });
        personIdx++;
      }
    }

    // Safety: remaining persons on last row
    if (personIdx < gpersons.length) {
      const r = radii[numRows - 1] + rowStep;
      const remaining = gpersons.length - personIdx;
      for (let j = 0; j < remaining; j++) {
        const theta =
          remaining === 1
            ? (startAngle + endAngle) / 2
            : startAngle - j * sectorSpan / (remaining - 1);
        const x = cx + r * Math.cos(theta);
        const y = cy - r * Math.sin(theta);
        seats.push({ x, y, person: gpersons[personIdx] });
        personIdx++;
      }
    }
  }

  return { seats, seatRadius };
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

  const height = Math.round(width * 0.55);

  const { seats, seatRadius } = useMemo(
    () => computeSeats(data.persons, width, height),
    [data.persons, width, height],
  );

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
              fill={isDem ? "#dc2626" : nuanceColor(seat.person.nuance)}
              stroke={isDem ? "#991b1b" : "rgba(255,255,255,0.15)"}
              strokeWidth={isDem ? 1.5 : 0.2}
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

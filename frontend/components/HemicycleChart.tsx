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

/**
 * Compute hemicycle seat positions.
 *
 * Strategy:
 * 1. Determine seat size, row count, and radii.
 * 2. Compute total seat capacity across all rows.
 * 3. Assign each NuPoREC group a contiguous angular sector proportional
 *    to its member count, with small gaps between groups.
 * 4. Within each sector, fill each row to maximum capacity — seats touch
 *    with no extra spacing, producing a dense packed hemicycle.
 */
function computeSeats(
  persons: HemicyclePerson[],
  width: number,
  height: number,
): { seats: Seat[]; seatRadius: number } {
  const total = persons.length;
  if (total === 0) return { seats: [], seatRadius: 3 };

  // -- Group persons by NuPoREC, sorted left → right -----------------------
  const groupMap = new Map<string, HemicyclePerson[]>();
  for (const p of persons) {
    const g = groupMap.get(p.nuporec) || [];
    g.push(p);
    groupMap.set(p.nuporec, g);
  }
  const groups = Array.from(groupMap.entries()).sort(
    (a, b) => (NUPOREC_ORDER[a[0]] ?? 99) - (NUPOREC_ORDER[b[0]] ?? 99),
  );

  // -- Geometry constants ---------------------------------------------------
  const cx = width / 2;
  const cy = height - 2;

  // Seat radius scaled to fit all seats; clamped 3–7px
  const seatRadius = Math.max(
    3,
    Math.min(7, width / (Math.sqrt(total) * 2.8)),
  );
  const diameter = seatRadius * 2;
  // Circles touch: spacing = diameter exactly (no extra gap)
  const spacing = diameter;

  const rMin = width * 0.15;
  const rMax = Math.min(width / 2 - seatRadius - 2, height - seatRadius - 6);

  // Number of rows: pack as many as fit with diameter step (rows touch)
  const numRows = Math.max(
    3,
    Math.floor((rMax - rMin) / spacing) + 1,
  );
  const rowStep = (rMax - rMin) / (numRows - 1);
  const radii = Array.from({ length: numRows }, (_, i) => rMin + i * rowStep);

  // -- Assign angular sectors to groups ------------------------------------
  // Each group gets an angular share proportional to its size.
  const groupGap = 0.02; // radians gap between groups
  const numGaps = Math.max(0, groups.length - 1);
  const usableAngle = Math.PI - groupGap * numGaps;

  type GroupSector = {
    name: string;
    persons: HemicyclePerson[];
    startAngle: number; // left edge (higher angle)
    endAngle: number; // right edge (lower angle)
  };

  const sectors: GroupSector[] = [];
  let cursor = Math.PI; // start from left

  for (let gi = 0; gi < groups.length; gi++) {
    const [name, gpersons] = groups[gi];
    const share = gpersons.length / total;
    const sectorAngle = usableAngle * share;
    const startAngle = cursor;
    const endAngle = cursor - sectorAngle;
    sectors.push({ name, persons: gpersons, startAngle, endAngle });
    cursor = endAngle - groupGap;
  }

  // -- Place seats ----------------------------------------------------------
  const seats: Seat[] = [];

  for (const sector of sectors) {
    const { persons: gpersons, startAngle, endAngle } = sector;
    const sectorSpan = startAngle - endAngle;
    const groupSize = gpersons.length;

    // Maximum seats each row can hold — use chord-based angle to avoid overlap
    const rowCaps = radii.map((r) => {
      if (r < diameter) return 0; // skip degenerate rows
      const minAngle = 2 * Math.asin(seatRadius / r); // true min angular separation
      return Math.max(0, Math.floor(sectorSpan / minAngle));
    });
    const sectorCapacity = rowCaps.reduce((s, c) => s + c, 0);

    // Distribute group members across rows proportionally to each row's
    // capacity. Use Largest Remainder Method for integer rounding.
    const idealShares = rowCaps.map(
      (cap) => (cap / sectorCapacity) * groupSize,
    );
    const floorShares = idealShares.map(Math.floor);
    let assigned = floorShares.reduce((s, v) => s + v, 0);
    // remainders sorted descending, give +1 to the largest remainders
    const remainders = idealShares.map((v, i) => ({
      i,
      r: v - Math.floor(v),
    }));
    remainders.sort((a, b) => b.r - a.r);
    for (let k = 0; assigned < groupSize && k < remainders.length; k++) {
      const idx = remainders[k].i;
      if (floorShares[idx] < rowCaps[idx]) {
        floorShares[idx]++;
        assigned++;
      }
    }

    // Place each row's seats — fill the sector edge-to-edge
    let personIdx = 0;
    for (let ri = 0; ri < numRows; ri++) {
      const n = floorShares[ri];
      if (n <= 0) continue;
      const r = radii[ri];

      // Chord-based min angle between seat centers to prevent overlap
      const minAngle = 2 * Math.asin(seatRadius / r);
      const margin = minAngle * 0.5;
      const usable = sectorSpan - margin * 2;
      const step = n > 1 ? usable / (n - 1) : 0;

      for (let j = 0; j < n && personIdx < groupSize; j++) {
        const theta = startAngle - margin - j * step;

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

export default function HemicycleChart({
  data,
  width = 700,
}: {
  data: HemicycleData;
  width?: number;
}) {
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
      const rect = (
        e.currentTarget as SVGElement
      ).closest("svg")?.getBoundingClientRect();
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
    return Array.from(seen.entries()).sort(
      (a, b) => (NUPOREC_ORDER[a[0]] ?? 99) - (NUPOREC_ORDER[b[0]] ?? 99),
    );
  }, [data.persons]);

  if (data.persons.length === 0) {
    return (
      <p className="text-[12px] text-slate-400 italic text-center">
        Aucune donnee
      </p>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 justify-center">
        {legendEntries.map(([name, count]) => (
          <div
            key={name}
            className="flex items-center gap-1 text-[10px] text-slate-600"
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: NUPOREC_COLORS[name] ?? "#94a3b8",
              }}
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

      <svg
        width={width}
        height={height}
        style={{ display: "block", margin: "0 auto" }}
      >
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
            <div className="text-[10px] text-red-400 font-medium">
              Démissionnaire
            </div>
          )}
        </div>
      )}
    </div>
  );
}

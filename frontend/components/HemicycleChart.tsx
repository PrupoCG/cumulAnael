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
 * Strategy — greedy outer-to-inner filling:
 * 1. Iterative seat sizing: find largest seatRadius where totalCapacity >= total.
 * 2. For each sector, fill from the OUTERMOST row inward.
 *    Each row gets min(rowCap, remainingPersons) seats — never exceeds capacity.
 *    Small groups naturally occupy only the outer rows (no gaps in inner rows).
 * 3. Seat placement uses arc-based spacing (diameter / r) centered in the sector.
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
  const groupGap = 0.02; // radians gap between groups
  const numGaps = Math.max(0, groups.length - 1);
  const usableAngle = Math.PI - groupGap * numGaps;

  // -- Helper: build rows and sector structure for a given seatRadius ------
  type SectorInfo = {
    name: string;
    persons: HemicyclePerson[];
    startAngle: number;
    sectorSpan: number;
  };

  function buildLayout(sr: number) {
    const diameter = sr * 2;
    const rMin = width * 0.15;
    const rMax = Math.min(width / 2 - sr - 2, height - sr - 6);

    const numRows = Math.max(3, Math.floor((rMax - rMin) / diameter) + 1);
    const rowStep = numRows > 1 ? (rMax - rMin) / (numRows - 1) : 0;
    const radii = Array.from({ length: numRows }, (_, i) => rMin + i * rowStep);

    // Build sectors
    const sectors: SectorInfo[] = [];
    let cursor = Math.PI;
    for (const [name, gpersons] of groups) {
      const share = gpersons.length / total;
      const sectorAngle = usableAngle * share;
      sectors.push({
        name,
        persons: gpersons,
        startAngle: cursor,
        sectorSpan: sectorAngle,
      });
      cursor -= sectorAngle + groupGap;
    }

    // Compute per-sector, per-row capacities using arc-based spacing
    let totalCapacity = 0;
    const sectorRowCaps: number[][] = [];
    for (const sector of sectors) {
      const rowCaps = radii.map((r) => {
        if (r < diameter) return 0;
        const arcStep = diameter / r;
        return Math.max(0, Math.floor(sector.sectorSpan / arcStep));
      });
      sectorRowCaps.push(rowCaps);
      totalCapacity += rowCaps.reduce((s, c) => s + c, 0);
    }

    return { radii, numRows, sectors, sectorRowCaps, totalCapacity };
  }

  // -- Iterative sizing: shrink seatRadius until all persons fit -----------
  let seatRadius = Math.max(2, Math.min(7, width / (Math.sqrt(total) * 2.8)));
  let layout = buildLayout(seatRadius);
  let iterations = 0;
  const maxIterations = 30;

  while (layout.totalCapacity < total && iterations < maxIterations) {
    seatRadius *= 0.9;
    if (seatRadius < 0.5) {
      seatRadius = 0.5;
      layout = buildLayout(seatRadius);
      break;
    }
    layout = buildLayout(seatRadius);
    iterations++;
  }

  if (layout.totalCapacity < total) {
    seatRadius = 0.5;
    layout = buildLayout(seatRadius);
  }

  const { radii, numRows, sectors, sectorRowCaps } = layout;
  const diameter = seatRadius * 2;

  // -- Place seats: greedy outer-to-inner per sector -----------------------
  const seats: Seat[] = [];

  for (let si = 0; si < sectors.length; si++) {
    const sector = sectors[si];
    const { persons: gpersons, startAngle, sectorSpan } = sector;
    const groupSize = gpersons.length;
    const rowCaps = sectorRowCaps[si];

    // Distribute: fill from outermost row (last index) inward
    const distribution = new Array(numRows).fill(0);
    let remaining = groupSize;
    for (let ri = numRows - 1; ri >= 0 && remaining > 0; ri--) {
      const n = Math.min(rowCaps[ri], remaining);
      distribution[ri] = n;
      remaining -= n;
    }

    // Place each row's seats with arc-based centering
    let personIdx = 0;
    for (let ri = 0; ri < numRows; ri++) {
      const n = distribution[ri];
      if (n <= 0) continue;
      const r = radii[ri];

      // Arc-based angular step between seat centers
      const arcStep = diameter / r;
      // Total angular span occupied by n seats (center-to-center)
      const totalArc = (n - 1) * arcStep;
      // Margin to center the group of seats within the sector
      const marginAngle = (sectorSpan - totalArc) / 2;

      for (let j = 0; j < n && personIdx < groupSize; j++) {
        const theta = startAngle - marginAngle - j * arcStep;
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

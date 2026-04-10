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
 * Strategy — iterative seat-sizing:
 * 1. Start with an initial seatRadius guess, clamped to [2, 7].
 * 2. Compute rows (radii from rMin to rMax, step = diameter).
 * 3. Compute angular sectors per NuPoREC group (proportional to size).
 * 4. For each sector+row, compute capacity via chord-based formula.
 * 5. Sum total capacity across ALL sectors and rows.
 * 6. If totalCapacity < total persons: reduce seatRadius by 10% and retry.
 * 7. Repeat until totalCapacity >= total (max 30 iterations, then tiny
 *    radius fallback).
 * 8. Distribute and place ALL persons — verified with a final assertion.
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
  function buildLayout(sr: number) {
    const diameter = sr * 2;
    const rMin = width * 0.15;
    const rMax = Math.min(width / 2 - sr - 2, height - sr - 6);

    const numRows = Math.max(3, Math.floor((rMax - rMin) / diameter) + 1);
    const rowStep = numRows > 1 ? (rMax - rMin) / (numRows - 1) : 0;
    const radii = Array.from({ length: numRows }, (_, i) => rMin + i * rowStep);

    // Build sectors
    type SectorInfo = {
      name: string;
      persons: HemicyclePerson[];
      startAngle: number;
      endAngle: number;
      sectorSpan: number;
    };
    const sectors: SectorInfo[] = [];
    let cursor = Math.PI;
    for (const [name, gpersons] of groups) {
      const share = gpersons.length / total;
      const sectorAngle = usableAngle * share;
      const startAngle = cursor;
      const endAngle = cursor - sectorAngle;
      sectors.push({
        name,
        persons: gpersons,
        startAngle,
        endAngle,
        sectorSpan: sectorAngle,
      });
      cursor = endAngle - groupGap;
    }

    // Compute per-sector, per-row capacities
    let totalCapacity = 0;
    const sectorRowCaps: number[][] = [];
    for (const sector of sectors) {
      const rowCaps = radii.map((r) => {
        if (r < diameter) return 0;
        const minAngle = 2 * Math.asin(Math.min(1, sr / r));
        return Math.max(0, Math.floor(sector.sectorSpan / minAngle));
      });
      sectorRowCaps.push(rowCaps);
      totalCapacity += rowCaps.reduce((s, c) => s + c, 0);
    }

    return { radii, numRows, sectors, sectorRowCaps, totalCapacity, rMax };
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

  // Absolute fallback: if still not enough capacity, use tiny radius
  if (layout.totalCapacity < total) {
    seatRadius = 0.5;
    layout = buildLayout(seatRadius);
  }

  const { radii, numRows, sectors, sectorRowCaps, rMax } = layout;

  // -- Place seats ----------------------------------------------------------
  const seats: Seat[] = [];

  for (let si = 0; si < sectors.length; si++) {
    const sector = sectors[si];
    const { persons: gpersons, startAngle, sectorSpan } = sector;
    const groupSize = gpersons.length;
    const rowCaps = sectorRowCaps[si];
    const sectorCapacity = rowCaps.reduce((s, c) => s + c, 0);

    // Distribute group members across rows — Largest Remainder Method
    // without the cap that previously dropped persons.
    const distribution = new Array(numRows).fill(0);

    if (sectorCapacity >= groupSize) {
      // Normal path: proportional distribution respecting row caps
      const idealShares = rowCaps.map(
        (cap) => (sectorCapacity > 0 ? (cap / sectorCapacity) * groupSize : 0),
      );
      const floorShares = idealShares.map(Math.floor);
      let assigned = floorShares.reduce((s, v) => s + v, 0);

      // Remainders sorted descending — give +1 to largest remainders
      const remainders = idealShares.map((v, i) => ({
        i,
        r: v - Math.floor(v),
      }));
      remainders.sort((a, b) => b.r - a.r);

      // First pass: fill up to row caps
      for (let k = 0; assigned < groupSize && k < remainders.length; k++) {
        const idx = remainders[k].i;
        if (floorShares[idx] < rowCaps[idx]) {
          floorShares[idx]++;
          assigned++;
        }
      }

      // Second pass (safety): if still not all assigned, allow exceeding
      // row caps — better to slightly overlap than to drop persons
      if (assigned < groupSize) {
        for (let k = 0; assigned < groupSize && k < remainders.length; k++) {
          const idx = remainders[k].i;
          floorShares[idx]++;
          assigned++;
        }
      }

      for (let ri = 0; ri < numRows; ri++) {
        distribution[ri] = floorShares[ri];
      }
    } else {
      // Overflow path (shouldn't happen after iterative sizing, but safety):
      // fill each row to its cap, then overflow remaining onto extra rows
      let remaining = groupSize;
      for (let ri = 0; ri < numRows && remaining > 0; ri++) {
        const n = Math.min(rowCaps[ri], remaining);
        distribution[ri] = n;
        remaining -= n;
      }
      // If still remaining, we'll handle them in the overflow block below
    }

    // Place each row's seats
    let personIdx = 0;
    for (let ri = 0; ri < numRows; ri++) {
      const n = distribution[ri];
      if (n <= 0) continue;
      const r = radii[ri];

      const minAngle =
        r > 0 ? 2 * Math.asin(Math.min(1, seatRadius / r)) : sectorSpan;
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

    // Overflow: place any remaining persons on extra rows beyond rMax
    if (personIdx < groupSize) {
      let extraRow = 1;
      while (personIdx < groupSize) {
        const r = rMax + extraRow * seatRadius * 2;
        const minAngle =
          r > 0 ? 2 * Math.asin(Math.min(1, seatRadius / r)) : sectorSpan;
        const rowCap = Math.max(1, Math.floor(sectorSpan / minAngle));
        const n = Math.min(rowCap, groupSize - personIdx);

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
        extraRow++;
      }
    }
  }

  // -- Final safety: if any persons were still missed, place on outermost row
  if (seats.length < total) {
    const placed = new Set(seats.map((s) => s.person));
    const missing = persons.filter((p) => !placed.has(p));
    const r = rMax + seatRadius * 4;
    const step = missing.length > 1 ? Math.PI / (missing.length - 1) : 0;
    for (let i = 0; i < missing.length; i++) {
      const theta = Math.PI - i * step;
      seats.push({
        x: cx + r * Math.cos(theta),
        y: cy - r * Math.sin(theta),
        person: missing[i],
      });
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

"use client";

import { useMemo, useCallback, useState } from "react";
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  type SankeyNode as D3SankeyNode,
  type SankeyLink as D3SankeyLink,
} from "d3-sankey";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Backend SankeyData format (parallel arrays) */
export type SankeyData = {
  labels: string[];
  colors: string[];
  x: number[];
  y: number[];
  source: number[];
  target: number[];
  value: number[];
  link_colors: string[];
  link_origins?: (string | null)[];
  title: string;
  node_keys: string[];
  annotations: Array<{ x: number; text: string }>;
};

interface NodeExtra {
  id: number;
  key: string;
  label: string;
  color: string;
  backendX: number; // 0-1 column position from backend
  backendY: number; // 0-1 vertical position from backend
}

interface LinkExtra {
  color: string;
  origin: string | null;
  originalIndex: number;
}

type SNode = D3SankeyNode<NodeExtra, LinkExtra>;
type SLink = D3SankeyLink<NodeExtra, LinkExtra>;

export type SankeyVisxChartProps = {
  data: SankeyData;
  height: number;
  highlightedPath?: string[];
  highlightOrigin?: "with_cm_cc" | "with_cm" | "without_cm";
  onNodeClick?: (nodeKey: string) => void;
  onLinkClick?: (sourceKey: string, targetKey: string, origin?: string | null) => void;
  nodeColors?: string[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARGIN = { top: 45, right: 80, bottom: 15, left: 5 };
const NODE_WIDTH = 18;
const NODE_PADDING = 14;
const WIDTH = 1200;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SankeyVisxChart({
  data,
  height,
  highlightedPath,
  highlightOrigin,
  onNodeClick,
  onLinkClick,
  nodeColors,
}: SankeyVisxChartProps) {
  // Build column mapping from backend x values
  const columnMap = useMemo(() => {
    const distinctX = [...new Set(data.x)].sort((a, b) => a - b);
    const map = new Map<number, number>();
    distinctX.forEach((x, i) => map.set(x, i));
    return { map, count: distinctX.length };
  }, [data.x]);

  // Convert backend format → d3-sankey graph format
  const graph = useMemo(() => {
    const nodes: NodeExtra[] = data.labels.map((label, i) => ({
      id: i,
      key: data.node_keys[i],
      label,
      color: nodeColors?.[i] ?? data.colors[i],
      backendX: data.x[i],
      backendY: data.y[i],
    }));
    const links = data.source.map((s, i) => ({
      source: s,
      target: data.target[i],
      value: data.value[i],
      color: data.link_colors[i],
      origin: data.link_origins?.[i] ?? null,
      originalIndex: i,
    }));
    return { nodes, links };
  }, [data, nodeColors]);

  // Run d3-sankey layout with custom column alignment
  const layout = useMemo(() => {
    // Custom nodeAlign: map backend x → column index
    const nodeAlign = (node: D3SankeyNode<NodeExtra, LinkExtra>) => {
      return columnMap.map.get(node.backendX) ?? 0;
    };

    const generator = d3Sankey<NodeExtra, LinkExtra>()
      .nodeId((d) => d.id)
      .nodeAlign(nodeAlign)
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .nodeSort((a, b) => {
        // Sort nodes within each column by backend y position
        return (a.backendY ?? 0) - (b.backendY ?? 0);
      })
      .extent([
        [MARGIN.left, MARGIN.top],
        [WIDTH - MARGIN.right, height - MARGIN.bottom],
      ])
      .linkSort((a: SLink, b: SLink) => {
        const order: Record<string, number> = { with_cm_cc: 0, with_cm: 1, without_cm: 2 };
        const aOrigin = (a as unknown as LinkExtra).origin;
        const bOrigin = (b as unknown as LinkExtra).origin;
        return (order[aOrigin ?? ""] ?? 2) - (order[bOrigin ?? ""] ?? 2);
      });

    // Deep-copy
    const nodesCopy = graph.nodes.map((n) => ({ ...n }));
    const linksCopy = graph.links.map((l) => ({ ...l }));

    return generator({
      nodes: nodesCopy,
      links: linksCopy,
    });
  }, [graph, height, columnMap]);

  // Path generator
  const linkPath = useMemo(() => sankeyLinkHorizontal(), []);

  // Highlighted path — ordered list of links matching the person's trajectory
  const pathLinks = useMemo(() => {
    if (!highlightedPath || highlightedPath.length < 2) return null;
    const result: SLink[] = [];
    for (let step = 0; step < highlightedPath.length - 1; step++) {
      const srcKey = highlightedPath[step];
      const tgtKey = highlightedPath[step + 1];
      let found: SLink | null = null;
      for (let li = 0; li < layout.links.length; li++) {
        const link = layout.links[li];
        const sNode = link.source as SNode;
        const tNode = link.target as SNode;
        if (
          sNode.key === srcKey &&
          tNode.key === tgtKey &&
          ((link as unknown as LinkExtra).origin === highlightOrigin || (link as unknown as LinkExtra).origin === null)
        ) {
          found = link;
          break;
        }
      }
      if (found) result.push(found);
    }
    return result.length > 0 ? result : null;
  }, [layout, highlightedPath, highlightOrigin]);

  // Build a single continuous SVG path that connects all segments through nodes
  const continuousPathD = useMemo(() => {
    if (!pathLinks || pathLinks.length === 0) return null;
    // Each link goes from source.x1 → target.x0 as a cubic Bézier.
    // Between consecutive links, we bridge through the intermediate node
    // using a smooth cubic Bézier so the path doesn't have sharp jumps.
    const parts: string[] = [];
    for (let i = 0; i < pathLinks.length; i++) {
      const link = pathLinks[i];
      const sNode = link.source as SNode;
      const tNode = link.target as SNode;
      const x0 = sNode.x1 ?? 0;  // right edge of source node
      const x1 = tNode.x0 ?? 0;  // left edge of target node
      const y0 = link.y0 ?? 0;
      const y1 = link.y1 ?? 0;
      const midX = (x0 + x1) / 2;

      if (i === 0) {
        parts.push(`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1}`);
      } else {
        // Bridge through intermediate node: previous endpoint is at (prevX1, prevY1)
        // Current segment starts at (x0, y0). The node spans from prevX1 to x0.
        // Use a smooth cubic through the node width.
        const prevLink = pathLinks[i - 1];
        const prevTarget = prevLink.target as SNode;
        const prevX1 = prevTarget.x0 ?? 0;  // left edge = where previous segment ended
        const prevY1 = prevLink.y1 ?? 0;
        const nodeMidX = (prevX1 + x0) / 2;
        // Smooth S-curve through the node
        parts.push(`C${nodeMidX},${prevY1} ${nodeMidX},${y0} ${x0},${y0}`);
        // Then the regular link curve
        parts.push(`C${midX},${y0} ${midX},${y1} ${x1},${y1}`);
      }
    }
    return parts.join(" ");
  }, [pathLinks]);

  const handleNodeClick = useCallback(
    (node: SNode) => { onNodeClick?.(node.key); },
    [onNodeClick]
  );

  const handleLinkClick = useCallback(
    (link: SLink) => {
      const sNode = link.source as SNode;
      const tNode = link.target as SNode;
      onLinkClick?.(sNode.key, tNode.key, (link as unknown as LinkExtra).origin);
    },
    [onLinkClick]
  );

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent, text: string) => {
    const svg = e.currentTarget.closest("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
      text,
    });
  }, []);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div style={{ position: "relative" }}>
    {tooltip && (
      <div
        style={{
          position: "absolute",
          left: tooltip.x,
          top: tooltip.y,
          transform: "translate(-50%, -100%)",
          background: "rgba(15, 23, 42, 0.92)",
          color: "#fff",
          padding: "5px 10px",
          borderRadius: 6,
          fontSize: 12,
          fontFamily: "Inter, system-ui, sans-serif",
          pointerEvents: "none",
          whiteSpace: "pre-line",
          zIndex: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        {tooltip.text}
      </div>
    )}
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      width="100%"
      height={height}
      style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}
    >
      {/* Column headers — aligned to actual node column positions */}
      {data.annotations.map((ann, i) => {
        const colNode = layout.nodes.find(
          (n) => (n as unknown as NodeExtra).backendX === ann.x
        );
        const annX = colNode
          ? ((colNode.x0 ?? 0) + (colNode.x1 ?? 0)) / 2
          : MARGIN.left + ann.x * (WIDTH - MARGIN.left - MARGIN.right);
        return (
          <text
            key={`header-${i}`}
            x={annX}
            y={28}
            textAnchor="middle"
            fill="#334155"
            fontSize={12}
            fontWeight={600}
          >
            {ann.text}
          </text>
        );
      })}

      {/* Links */}
      <g fill="none">
        {layout.links.map((link, i) => {
          const opacity = 0.35;
          return (
            <path
              key={`link-${i}`}
              d={linkPath(link as never) ?? undefined}
              stroke={(link as unknown as LinkExtra).color}
              strokeWidth={Math.max(1, link.width ?? 1)}
              strokeOpacity={opacity}
              onClick={() => handleLinkClick(link)}
              onMouseMove={(e) => handleMouseMove(e, `${(link.source as SNode).label} → ${(link.target as SNode).label}\n${link.value} personne${(link.value ?? 0) > 1 ? "s" : ""}`)}
              onMouseLeave={handleMouseLeave}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </g>

      {/* Nodes */}
      {layout.nodes.map((node, i) => {
        const x0 = node.x0 ?? 0;
        const y0 = node.y0 ?? 0;
        const x1 = node.x1 ?? 0;
        const y1 = node.y1 ?? 0;
        const w = x1 - x0;
        const h = y1 - y0;
        if (h < 1) return null;

        // Label to the right, except last column → label to the left
        const col = columnMap.map.get(node.backendX) ?? 0;
        const isLast = col === columnMap.count - 1;
        const labelX = isLast ? x0 - 6 : x1 + 6;
        const labelAnchor = isLast ? "end" : "start";

        return (
          <g key={`node-${i}`}>
            <rect
              x={x0}
              y={y0}
              width={w}
              height={h}
              fill={nodeColors?.[i] ?? node.color}
              rx={3}
              onClick={() => handleNodeClick(node)}
              onMouseMove={(e) => handleMouseMove(e, `${node.label}\n${node.value} personne${(node.value ?? 0) > 1 ? "s" : ""}`)}
              onMouseLeave={handleMouseLeave}
              style={{ cursor: "pointer" }}
            />
            {h > 8 && (
              <text
                x={labelX}
                y={y0 + h / 2}
                dy="0.35em"
                textAnchor={labelAnchor}
                fill="#475569"
                fontSize={11}
                pointerEvents="none"
              >
                {node.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Individual path overlay (3px red line — rendered AFTER nodes so it's visible through them) */}
      {continuousPathD && (
        <path
          d={continuousPathD}
          stroke="rgba(239, 68, 68, 0.9)"
          strokeWidth={3}
          fill="none"
          pointerEvents="none"
        />
      )}

    </svg>
    </div>
  );
}

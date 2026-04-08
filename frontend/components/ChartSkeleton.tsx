"use client";

type ChartSkeletonProps = {
  /** "bar" | "heatmap" | "network" | "sankey" — determines the shape pattern */
  variant?: "bar" | "heatmap" | "network" | "sankey" | "default";
};

function Pulse({ className, style }: { className: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse bg-slate-200/80 rounded ${className}`} style={style} />;
}

function BarSkeleton() {
  return (
    <div className="flex items-end gap-3 h-48 px-8 pt-6">
      {[65, 85, 45, 90, 55, 70, 40, 80, 60, 50].map((h, i) => (
        <Pulse key={i} className="flex-1" style={{ height: `${h}%` } as React.CSSProperties} />
      ))}
    </div>
  );
}

function HeatmapSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-1.5 px-8 pt-6">
      {Array.from({ length: 42 }).map((_, i) => (
        <Pulse key={i} className="aspect-square rounded-md" />
      ))}
    </div>
  );
}

function NetworkSkeleton() {
  return (
    <div className="relative h-48 mx-8 mt-6">
      {[
        "top-4 left-1/4 w-12 h-12 rounded-full",
        "top-2 right-1/3 w-10 h-10 rounded-full",
        "bottom-8 left-1/3 w-14 h-14 rounded-full",
        "bottom-4 right-1/4 w-10 h-10 rounded-full",
        "top-1/2 left-1/2 w-16 h-16 rounded-full -translate-x-1/2 -translate-y-1/2",
      ].map((cls, i) => (
        <Pulse key={i} className={`absolute ${cls}`} />
      ))}
    </div>
  );
}

function SankeySkeleton() {
  return (
    <div className="flex items-stretch gap-4 h-48 px-8 pt-6">
      <div className="flex flex-col gap-2 w-24">
        {[40, 30, 20, 10].map((h, i) => (
          <Pulse key={i} className="rounded-md" style={{ flex: h } as React.CSSProperties} />
        ))}
      </div>
      <div className="flex-1 flex flex-col gap-2 opacity-30">
        {[35, 25, 25, 15].map((h, i) => (
          <Pulse key={i} className="rounded-sm" style={{ flex: h } as React.CSSProperties} />
        ))}
      </div>
      <div className="flex flex-col gap-2 w-24">
        {[25, 35, 20, 20].map((h, i) => (
          <Pulse key={i} className="rounded-md" style={{ flex: h } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="space-y-3 px-8 pt-6">
      <Pulse className="h-4 w-3/4" />
      <Pulse className="h-4 w-1/2" />
      <Pulse className="h-32 w-full rounded-xl" />
      <div className="flex gap-3">
        <Pulse className="h-4 w-1/3" />
        <Pulse className="h-4 w-1/4" />
      </div>
    </div>
  );
}

export default function ChartSkeleton({ variant = "default" }: ChartSkeletonProps) {
  return (
    <div
      className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden"
      role="status"
      aria-label="Chargement du graphique"
    >
      {/* Header skeleton */}
      <div className="px-5 py-4 border-b border-slate-100/80 bg-slate-50/60">
        <Pulse className="h-4 w-48 mb-2" />
        <Pulse className="h-3 w-32" />
      </div>

      {/* Body skeleton */}
      {variant === "bar" && <BarSkeleton />}
      {variant === "heatmap" && <HeatmapSkeleton />}
      {variant === "network" && <NetworkSkeleton />}
      {variant === "sankey" && <SankeySkeleton />}
      {variant === "default" && <DefaultSkeleton />}

      {/* Footer skeleton */}
      <div className="px-8 py-4">
        <Pulse className="h-3 w-24 mx-auto" />
      </div>
    </div>
  );
}

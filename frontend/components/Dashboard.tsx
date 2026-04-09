"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Users, Loader2, ArrowLeft, Download, X, Search } from "lucide-react";
import SankeyVisxChart from "./SankeyVisxChart";
import StatsPanel, { type NodeStats } from "./StatsPanel";
import DeputePhoto from "./DeputePhoto";
import ProfileCard from "./ProfileCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SankeyData = {
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

type OptionWithCount = { label: string; count: number };

type Person = {
  nom: string;
  prenom: string;
  mandat_national: string;
  candidature: string;
  resultat: string;
  fonction: string;
  interco: string;
  issue: string;
  nuance: string;
  departement: string;
  commune: string;
  civilite: string;
  age: number;
};

type ColorMode = "etapes" | "origine";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_LABELS: Record<string, string> = {
  all: "Position d'entrée",
  entry_with_cm_cc: "Sortants CM-CC",
  entry_with_cm: "Sortants CM",
  entry_without_cm: "Sans mandat CM",
  candidat_cm: "Candidats CM",
  non_candidat_cm: "Non candidats CM",
  elu_cm: "Élus mun.",
  non_elu_cm: "Non élus mun.",
  non_reelu_cm: "Non réélus mun.",
  cm_simple: "CM simples",
  adjoint: "Adjoints",
  maire: "Maires",
  cc_simple: "CC simples",
  vp_cc: "VP CC",
  pdt_cc: "Présidents CC",
  sans_interco: "Sans interco",
  garde_cm_cc: "CM-CC",
  garde_cm: "CM",
  demission: "Démission parlementaire",
  demission_cm: "Démission CM",
};

const MODERN_NODE_COLORS = [
  "#1B3A5C", // 0  entry_with_cm_cc — marine
  "#7C2D4A", // 1  entry_with_cm — bordeaux
  "#B8860B", // 2  entry_without_cm — ambre
  "#d4915e", // 3  candidat_cm — warm sand
  "#9ca3af", // 4  non_candidat_cm — cool gray
  "#6889c4", // 5  elu_cm — slate blue
  "#c47272", // 6  non_elu_cm — muted rose
  "#a85656", // 7  non_reelu_cm — dusty rose
  "#6aaa8e", // 8  cm_simple — sage green
  "#8ab352", // 9  adjoint — olive green
  "#3d8b5f", // 10 maire — deep forest
  "#4aa8a0", // 11 cc_simple — soft teal
  "#3b9e96", // 12 vp_cc — medium teal
  "#2b7d77", // 13 pdt_cc — dark teal
  "#b0b8c1", // 14 sans_interco — silver
  "#1B3A5C", // 15 garde_cm_cc — marine (matches entry)
  "#7C2D4A", // 16 garde_cm — bordeaux (matches entry)
  "#c07a4e", // 17 demission — warm terracotta
];

const LEGEND_GROUPS = [
  {
    title: "Entrée",
    items: [
      { color: MODERN_NODE_COLORS[0], label: "CM+CC" },
      { color: MODERN_NODE_COLORS[1], label: "CM" },
      { color: MODERN_NODE_COLORS[2], label: "Sans CM" },
    ],
  },
  {
    title: "Candidature",
    items: [
      { color: MODERN_NODE_COLORS[3], label: "Candidat CM" },
      { color: MODERN_NODE_COLORS[4], label: "Non candidat" },
    ],
  },
  {
    title: "Résultat",
    items: [
      { color: MODERN_NODE_COLORS[5], label: "Élu CM" },
      { color: MODERN_NODE_COLORS[6], label: "Non élu" },
      { color: MODERN_NODE_COLORS[7], label: "Non réélu" },
    ],
  },
  {
    title: "Fonction",
    items: [
      { color: MODERN_NODE_COLORS[8], label: "CM" },
      { color: MODERN_NODE_COLORS[9], label: "Adjoint" },
      { color: MODERN_NODE_COLORS[10], label: "Maire" },
    ],
  },
  {
    title: "Interco",
    items: [
      { color: MODERN_NODE_COLORS[11], label: "CC" },
      { color: MODERN_NODE_COLORS[12], label: "VP CC" },
      { color: MODERN_NODE_COLORS[13], label: "Pdt CC" },
      { color: MODERN_NODE_COLORS[14], label: "Sans" },
    ],
  },
  {
    title: "Position sortie",
    items: [
      { color: MODERN_NODE_COLORS[15], label: "CM-CC" },
      { color: MODERN_NODE_COLORS[16], label: "CM" },
      { color: MODERN_NODE_COLORS[17], label: "Démission" },
    ],
  },
];

// =====================================================================
// Dashboard — entry point (year toggle → Sankey view)
// =====================================================================

export default function Dashboard() {
  const [annee, setAnnee] = useState<20 | 26>(20);

  return <SankeyView annee={annee} onAnneeChange={setAnnee} />;
}

// =====================================================================
// SankeyView — unified "étapes" / "origine" Sankey with persons table
// =====================================================================

function SankeyView({
  annee,
  onAnneeChange,
}: {
  annee: 20 | 26;
  onAnneeChange: (a: 20 | 26) => void;
}) {
  const [data, setData] = useState<SankeyData | null>(null);
  const [categories, setCategories] = useState<Record<string, OptionWithCount> | null>(null);
  const [selected, setSelected] = useState("depute");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("etapes");

  // Persons panel
  const [persons, setPersons] = useState<Person[] | null>(null);
  const [personsLoading, setPersonsLoading] = useState(false);
  const [personsError, setPersonsError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [highlightedPerson, setHighlightedPerson] = useState<number | null>(null);
  const [nodeStats, setNodeStats] = useState<NodeStats | null>(null);
  const personsRef = useRef<HTMLDivElement>(null);
  const sankeyRef = useRef<HTMLDivElement>(null);

  const basePath = colorMode === "etapes"
    ? "/api/suivi-mun/stats/sankey/parlementaires/detail"
    : "/api/suivi-mun/stats/sankey/tracabilite";

  const sankeyHeight = useMemo(() => {
    if (!categories) return 1050;
    const maxCount = Math.max(...Object.values(categories).map(c => c.count));
    const currentCount = categories[selected]?.count ?? maxCount;
    const MIN_H = 350;
    const MAX_H = 1050;
    return Math.round(MIN_H + (currentCount / maxCount) * (MAX_H - MIN_H));
  }, [categories, selected]);

  useEffect(() => {
    fetch(`${API_URL}/api/suivi-mun/stats/sankey/parlementaires/detail/options?annee=${annee}`)
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, [annee]);

  const loadPersonsFor = useCallback((nodeKey: string, origin?: string | null, sourceKey?: string | null) => {
    setSelectedNode(nodeKey);
    setSelectedSource(colorMode === "origine" ? (origin ?? sourceKey ?? null) : (sourceKey ?? null));
    setHighlightedPerson(null);
    setPersonsLoading(true);
    setPersonsError(null);
    setSearchFilter("");
    let params = `categorie=${selected}&node=${nodeKey}`;
    if (colorMode === "origine") {
      if (origin) params += `&origin=${origin}`;
      if (sourceKey) params += `&source=${sourceKey}`;
    } else {
      if (sourceKey) params += `&source=${sourceKey}`;
    }
    fetch(`${API_URL}${basePath}/persons?annee=${annee}&${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Erreur ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!Array.isArray(d)) throw new Error("Réponse invalide");
        setPersons(d);
        setPersonsLoading(false);
        if (nodeKey !== "all") {
          setTimeout(() => personsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        }
      })
      .catch((err) => {
        setPersonsError(err.message);
        setPersonsLoading(false);
      });
    // Fetch stats in parallel
    setNodeStats(null);
    fetch(`${API_URL}/api/suivi-mun/stats/filtered?annee=${annee}&categorie=${selected}&node=${nodeKey}${colorMode === "origine" && origin ? `&origin=${origin}` : ""}${sourceKey ? `&source=${sourceKey}` : ""}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setNodeStats(d); })
      .catch(() => {});
  }, [selected, colorMode, basePath, annee]);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    setPersons(null);
    setNodeStats(null);
    setSelectedNode(null);
    setSelectedSource(null);
    setHighlightedPerson(null);
    fetch(`${API_URL}${basePath}?annee=${annee}&categorie=${selected}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Erreur ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
        loadPersonsFor("all");
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [selected, basePath, loadPersonsFor, annee]);

  useEffect(() => {
    loadData();
  }, [loadData, annee]);

  const filteredPersons = persons?.filter((p) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      p.nom.toLowerCase().includes(q) ||
      p.prenom.toLowerCase().includes(q) ||
      p.departement.toLowerCase().includes(q) ||
      p.commune.toLowerCase().includes(q) ||
      p.nuance.toLowerCase().includes(q)
    );
  });

  const exportCsv = useCallback(() => {
    if (!filteredPersons) return;
    const headers = annee === 26
      ? ["Nom", "Prénom", "Mandat national", "Candidature", "Résultat", "Fonction", "Position sortie", "Nuance", "Département", "Commune"]
      : ["Nom", "Prénom", "Mandat national", "Candidature", "Résultat", "Fonction", "Interco", "Position sortie", "Nuance", "Département", "Commune"];
    const rows = filteredPersons.map((p) =>
      (annee === 26
        ? [p.nom, p.prenom, p.mandat_national, p.candidature, p.resultat, p.fonction, p.issue, p.nuance, p.departement, p.commune]
        : [p.nom, p.prenom, p.mandat_national, p.candidature, p.resultat, p.fonction, p.interco, p.issue, p.nuance, p.departement, p.commune])
        .map((v) => `"${(v || "").replace(/"/g, '""')}"`)
        .join(";")
    );
    const csv = "\uFEFF" + [headers.join(";"), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${colorMode === "etapes" ? "parlementaires" : "tracabilite"}_${selected}_${selectedNode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredPersons, selected, selectedNode, colorMode]);

  // --- Path highlighting helpers ---
  const personToNodeKeys = useCallback((p: Person): string[] => {
    const entry = p.mandat_national?.includes("CM") && p.mandat_national?.includes("CC")
      ? "entry_with_cm_cc"
      : p.mandat_national?.includes("CM") ? "entry_with_cm" : "entry_without_cm";
    const cand = p.candidature === "Non candidat" ? "non_candidat_cm" : "candidat_cm";
    if (cand === "non_candidat_cm") return [entry, cand];
    const res = p.resultat === "Élu" ? "elu_cm"
              : p.mandat_national?.includes("CM") ? "non_reelu_cm" : "non_elu_cm";
    if (res !== "elu_cm") return [entry, cand, res];
    const fonc = p.fonction === "Maire" ? "maire"
               : p.fonction === "Adjoint" ? "adjoint" : "cm_simple";
    // En 2026 : pas de distinction CM-CC en sortie (CC pas encore statué)
    const iss = p.issue === "Démissionnaire" ? "demission"
              : p.issue === "Démission CM" ? "demission_cm"
              : annee === 26 ? "garde_cm"
              : (p.interco === "Pdt CC" || p.interco === "VP CC" || p.interco === "CC") ? "garde_cm_cc"
              : "garde_cm";
    if (annee === 26) return [entry, cand, res, fonc, iss];
    const inter = p.interco === "Pdt CC" ? "pdt_cc"
                : p.interco === "VP CC" ? "vp_cc"
                : p.interco === "CC" ? "cc_simple" : "sans_interco";
    return [entry, cand, res, fonc, inter, iss];
  }, [annee]);

  const highlightedPath = useMemo(() => {
    if (highlightedPerson === null || !filteredPersons) return undefined;
    const person = filteredPersons[highlightedPerson];
    if (!person) return undefined;
    return personToNodeKeys(person);
  }, [highlightedPerson, filteredPersons, personToNodeKeys]);

  const highlightOrigin = useMemo(() => {
    if (colorMode !== "origine") return undefined;
    if (highlightedPerson === null || !filteredPersons) return undefined;
    const person = filteredPersons[highlightedPerson];
    if (!person) return undefined;
    return person.mandat_national?.includes("CM") && person.mandat_national?.includes("CC")
      ? "with_cm_cc" as const
      : person.mandat_national?.includes("CM") ? "with_cm" as const : "without_cm" as const;
  }, [colorMode, highlightedPerson, filteredPersons]);

  const handlePersonClick = useCallback((idx: number) => {
    setHighlightedPerson((prev) => prev === idx ? null : idx);
    setTimeout(() => sankeyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, []);

  const handleNodeClick = useCallback((nodeKey: string) => {
    loadPersonsFor(nodeKey);
  }, [loadPersonsFor]);

  const handleLinkClick = useCallback((sourceKey: string, targetKey: string, origin?: string | null) => {
    if (colorMode === "origine") {
      loadPersonsFor(targetKey, origin, sourceKey);
    } else {
      loadPersonsFor(targetKey, undefined, sourceKey);
    }
  }, [loadPersonsFor, colorMode]);

  // --- PNG Export ---
  const exportPng = useCallback(() => {
    const svgEl = sankeyRef.current?.querySelector("svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = svgEl.viewBox.baseVal.width * scale;
      canvas.height = svgEl.viewBox.baseVal.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.download = `${colorMode === "etapes" ? "parlementaires" : "tracabilite"}_${selected}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [selected, colorMode]);

  return (
    <div className="flex flex-col min-h-full px-4 py-6 bg-gradient-to-b from-slate-50/80 to-white">
      {/* Header */}
      <div className="mb-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <h1 className="text-[22px] font-bold text-slate-900 tracking-tight text-center">
              Cumul municipal et démission des parlementaires élus à une fonction exécutive
            </h1>
          </div>
          <p className="text-slate-400 text-[13px] max-w-xl mx-auto leading-relaxed">
            Cliquez sur un flux ou un nœud pour filtrer - cliquez sur une personne en bas pour tracer son chemin individuel
          </p>
        </div>
      </div>

      {/* Year toggle */}
      <div className="flex items-center justify-center gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit mx-auto">
        <button
          onClick={() => onAnneeChange(20)}
          className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
            annee === 20
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          Municipales 2020
        </button>
        <button
          onClick={() => onAnneeChange(26)}
          className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
            annee === 26
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          Municipales 2026
        </button>
      </div>

      {/* Category selector */}
      {categories && (
        <div className="flex items-center justify-center gap-2 mb-3 flex-wrap">
          {Object.entries(categories).map(([key, opt]) => (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`px-4 py-2 rounded-full text-[13px] border transition-all duration-200 font-medium ${
                selected === key
                  ? "bg-slate-800 text-white border-slate-800 shadow-md shadow-slate-300/30"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-800 hover:shadow-sm"
              }`}
            >
              {opt.label}
              <span className={`ml-1.5 text-[11px] font-normal ${selected === key ? "text-slate-400" : "text-slate-400/70"}`}>
                {opt.count.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* View mode toggle */}
      {categories && (
        <div className="flex items-center justify-center gap-1 mb-3">
          <button
            onClick={() => setColorMode("etapes")}
            className={`px-3 py-1.5 rounded-l-lg text-[12px] font-medium border transition-all duration-200 ${
              colorMode === "etapes"
                ? "bg-slate-700 text-white border-slate-700"
                : "bg-white text-slate-500 border-slate-200 hover:text-slate-700"
            }`}
          >
            Vue par étape
          </button>
          <button
            onClick={() => setColorMode("origine")}
            className={`px-3 py-1.5 rounded-r-lg text-[12px] font-medium border border-l-0 transition-all duration-200 ${
              colorMode === "origine"
                ? "bg-slate-700 text-white border-slate-700"
                : "bg-white text-slate-500 border-slate-200 hover:text-slate-700"
            }`}
          >
            Vue par flux
          </button>
        </div>
      )}

      {/* Export PNG button */}
      {!loading && !error && data && (
        <div className="flex justify-end mb-2">
          <button
            onClick={exportPng}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-colors duration-200"
          >
            <Download size={13} />
            Export PNG
          </button>
        </div>
      )}

      {/* Sankey chart */}
      <div ref={sankeyRef} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm shadow-slate-200/30 p-2">
        {loading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        )}

        {error && (
          <div className="text-center text-red-500 text-[13px] py-8">{error}</div>
        )}

        {!loading && !error && data && (
          <SankeyVisxChart
            data={data}
            height={sankeyHeight}
            highlightedPath={highlightedPath}
            highlightOrigin={highlightOrigin}
            onNodeClick={handleNodeClick}
            onLinkClick={handleLinkClick}
            nodeColors={MODERN_NODE_COLORS}
          />
        )}
      </div>

      {/* Profile card */}
      {highlightedPerson !== null && filteredPersons?.[highlightedPerson] && (
        <ProfileCard person={filteredPersons[highlightedPerson]} onClose={() => setHighlightedPerson(null)} annee={annee} />
      )}

      {/* Stats panel */}
      {nodeStats && (
        <StatsPanel
          stats={nodeStats}
          title={`Statistiques - ${selectedNode ? (NODE_LABELS[selectedNode] || selectedNode) : ""}`}
        />
      )}

      {/* Persons table */}
      {(personsLoading || persons || personsError) && (
        <div ref={personsRef} className="mt-5 bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm shadow-slate-200/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100/80 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-bold text-slate-800">
                {selectedNode ? (NODE_LABELS[selectedNode] || selectedNode) : ""}
              </h3>
              {selectedSource && colorMode === "etapes" && (
                <span
                  className="px-2 py-0.5 text-[11px] font-medium rounded-full text-white"
                  style={{ backgroundColor: "#6366f1" }}
                >
                  ← {NODE_LABELS[selectedSource] || selectedSource}
                </span>
              )}
              {selectedSource && colorMode === "origine" && (
                <span
                  className="px-2 py-0.5 text-[11px] font-medium rounded-full text-white"
                  style={{ backgroundColor: selectedSource === "with_cm_cc" ? MODERN_NODE_COLORS[0] : selectedSource === "with_cm" ? MODERN_NODE_COLORS[1] : MODERN_NODE_COLORS[2] }}
                >
                  {selectedSource === "with_cm_cc" ? "Ex-CM+CC" : selectedSource === "with_cm" ? "Ex-CM" : "Sans CM"}
                </span>
              )}
              {filteredPersons && (
                <span className="text-[12px] text-slate-400">
                  {filteredPersons.length} personne{filteredPersons.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Rechercher..."
                  className="pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-lg w-48 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all duration-200"
                />
              </div>
              <button
                onClick={exportCsv}
                disabled={!filteredPersons?.length}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-800 transition-colors duration-200 disabled:opacity-40"
              >
                <Download size={13} />
                Export CSV
              </button>
              <button
                onClick={() => { setPersons(null); setSelectedNode(null); setSelectedSource(null); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors duration-200"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {highlightedPerson !== null && filteredPersons?.[highlightedPerson] && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-100">
              <DeputePhoto prenom={filteredPersons[highlightedPerson].prenom} nom={filteredPersons[highlightedPerson].nom} size="sm" />
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-700 text-[12px] font-medium">
                Chemin de {filteredPersons[highlightedPerson].prenom} {filteredPersons[highlightedPerson].nom}
              </span>
              <button
                onClick={() => setHighlightedPerson(null)}
                className="ml-auto text-red-400 hover:text-red-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {personsLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          )}

          {!personsLoading && personsError && (
            <div className="text-center py-8">
              <p className="text-red-500 text-[13px] mb-2">{personsError}</p>
              <button
                onClick={() => selectedNode && loadPersonsFor(selectedNode)}
                className="text-[12px] text-slate-500 hover:text-slate-700 underline underline-offset-2"
              >
                Réessayer
              </button>
            </div>
          )}

          {!personsLoading && !personsError && filteredPersons && (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-slate-50/80 sticky top-0">
                  <tr className="text-left text-slate-500 font-medium">
                    <th className="px-3 py-2">Nom</th>
                    <th className="px-3 py-2">Prénom</th>
                    <th className="px-3 py-2">Mandat</th>
                    <th className="px-3 py-2">Candidature</th>
                    <th className="px-3 py-2">Résultat</th>
                    <th className="px-3 py-2">Fonction</th>
                    {annee !== 26 && <th className="px-3 py-2">Interco</th>}
                    <th className="px-3 py-2">Position sortie</th>
                    <th className="px-3 py-2">Nuance</th>
                    <th className="px-3 py-2">Département</th>
                    <th className="px-3 py-2">Commune</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {filteredPersons.map((p, i) => (
                    <tr key={i} onClick={() => handlePersonClick(i)} className={`cursor-pointer transition-colors duration-150 ${highlightedPerson === i ? "bg-red-50 ring-1 ring-red-200" : "hover:bg-slate-50/60"}`}>
                      <td className="px-3 py-2 font-semibold text-slate-800">{p.nom}</td>
                      <td className="px-3 py-2 text-slate-600">{p.prenom}</td>
                      <td className="px-3 py-2 text-slate-500">{p.mandat_national}</td>
                      <td className="px-3 py-2 text-slate-500">{p.candidature}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                          p.resultat === "Élu" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {p.resultat}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{p.fonction}</td>
                      {annee !== 26 && (
                        <td className="px-3 py-2">
                          {p.interco ? (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-teal-50 text-teal-700">{p.interco}</span>
                          ) : "-"}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        {p.issue === "Démissionnaire" ? (
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-orange-50 text-orange-700">Démission parl.</span>
                        ) : p.issue === "Démission CM" ? (
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700">Démission CM</span>
                        ) : p.issue || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium">{p.nuance}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{p.departement}</td>
                      <td className="px-3 py-2 text-slate-500">{p.commune}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Legend — grouped by stage (étapes mode) */}
      {!loading && !error && data && colorMode === "etapes" && (
        <div className="flex items-start justify-center gap-6 mt-5 flex-wrap">
          {LEGEND_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{group.title}</span>
              {group.items.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="w-3 h-3 rounded-[3px] inline-block" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Legend — origin colors (origine mode) */}
      {!loading && !error && data && colorMode === "origine" && (
        <div className="flex items-center justify-center gap-6 mt-5">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Origine</span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-3 h-3 rounded-[3px] inline-block" style={{ backgroundColor: MODERN_NODE_COLORS[0] }} />
            Ex-CM+CC
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-3 h-3 rounded-[3px] inline-block" style={{ backgroundColor: MODERN_NODE_COLORS[1] }} />
            Ex-CM
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-3 h-3 rounded-[3px] inline-block" style={{ backgroundColor: MODERN_NODE_COLORS[2] }} />
            Sans CM
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-3 h-3 rounded-[3px] inline-block" style={{ backgroundColor: MODERN_NODE_COLORS[4] }} />
            Non candidat
          </span>
        </div>
      )}

      {/* Key insight */}
      {!loading && !error && data && (
        <div className="mt-4 mx-auto max-w-2xl bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-center">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {colorMode === "etapes" ? (
              <><strong className="text-slate-600">Cumul & démission (d3-sankey)</strong> : rendu SVG natif avec tooltips au survol. Cliquez sur un flux ou un nœud pour filtrer, puis sur une personne pour tracer son chemin individuel.</>
            ) : (
              <><strong className="text-slate-600">Cumul & démission - origine (d3-sankey)</strong> : rendu SVG natif - les flux ex-CM sont toujours en haut, sans-CM en bas. Le chemin individuel est tracé exactement dans la bonne zone de couleur.</>
            )}
          </p>
        </div>
      )}

      {/* Source */}
      <div className="text-center mt-3 text-[11px] text-slate-300">
        <Users size={11} className="inline mr-1" />
        M1 Gouvernance des Données - <strong className="font-semibold">Clément CHANUT GIRARDI</strong>
      </div>
    </div>
  );
}

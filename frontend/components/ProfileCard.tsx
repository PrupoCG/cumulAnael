"use client";

import { useState, useEffect } from "react";
import { X, Briefcase, MapPin, GraduationCap, ChevronDown } from "lucide-react";
import DeputePhoto from "./DeputePhoto";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

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

type BrefMandate = {
  type: string | null;
  start: string | null;
  end: string | null;
  end_reason: string | null;
  source: string | null;
};

type BrefProfile = {
  birth_date: string | null;
  birth_municipality: string | null;
  birth_department: string | null;
  profession: string | null;
  mandates: BrefMandate[] | null;
};

type TimelineYear = {
  mandat_national: string;
  candidature: string;
  resultat: string;
  fonction: string;
  interco: string;
  issue: string;
  nuance: string;
  departement: string;
  commune: string;
};

type TimelineData = {
  "2020"?: TimelineYear;
  "2026"?: TimelineYear;
};

const MANDATE_LABELS: Record<string, string> = {
  "Member of the National Assembly": "Député",
  "Senator": "Sénateur",
  "Member of the European Parliament": "Eurodéputé",
  "Municipal Councilor": "Conseiller municipal",
  "Departmental Councilor": "Conseiller départemental",
  "Regional Councilor": "Conseiller régional",
  "Mayor": "Maire",
};

function translateMandate(type: string): string {
  return MANDATE_LABELS[type] || type;
}

function formatDate(d: string | null): string {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// ---------------------------------------------------------------------------
// MiniTimeline – visx horizontal milestone chart
// ---------------------------------------------------------------------------

const NODE_R = 4;

// Map mandate codes to election type + approximate date by year context
const MANDAT_ELECTIONS: Record<string, Record<string, string>> = {
  "D":   { "2020": "Lég. juin 2017", "2026": "Lég. 2022/24" },
  "S":   { "2020": "Sén. sept 2017", "2026": "Sén. 2020/23" },
  "RPE": { "2020": "Eur. mai 2019",  "2026": "Eur. juin 2024" },
  "CD":  { "2020": "Dép. mars 2015", "2026": "Dép. juin 2021" },
  "CR":  { "2020": "Rég. déc 2015",  "2026": "Rég. juin 2021" },
};

function enrichMandatLabel(raw: string, year: string): string {
  if (!raw) return raw;
  const parts = raw.split(/\s*\/\s*/);
  return parts.map(p => {
    const info = MANDAT_ELECTIONS[p.trim()]?.[year];
    return info ? `${p.trim()} (${info})` : p.trim();
  }).join(" · ");
}

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  mandat: { bg: "#dbeafe", text: "#1d4ed8" },
  candidature: { bg: "#f3e8ff", text: "#7c3aed" },
  elu: { bg: "#d1fae5", text: "#047857" },
  nonelu: { bg: "#f1f5f9", text: "#475569" },
  fonction: { bg: "#dcfce7", text: "#15803d" },
  interco: { bg: "#ccfbf1", text: "#0f766e" },
  demission_parl: { bg: "#ffedd5", text: "#c2410c" },
  demission_cm: { bg: "#fef3c7", text: "#b45309" },
};

function getBadges(year: TimelineYear | undefined, yearKey: string): { label: string; type: string }[] {
  if (!year) return [];
  const badges: { label: string; type: string }[] = [];
  if (year.mandat_national) badges.push({ label: enrichMandatLabel(year.mandat_national, yearKey), type: "mandat" });
  if (year.candidature && year.candidature !== "Non candidat") badges.push({ label: year.candidature, type: "candidature" });
  if (year.resultat === "Élu") {
    badges.push({ label: year.fonction ? `Élu · ${year.fonction}` : "Élu", type: "elu" });
  } else if (year.candidature && year.candidature !== "Non candidat") {
    badges.push({ label: "Non élu", type: "nonelu" });
  }
  if (year.interco) badges.push({ label: year.interco, type: "interco" });
  if (year.issue === "Démissionnaire") badges.push({ label: "Démission parl.", type: "demission_parl" });
  if (year.issue === "Démission CM") badges.push({ label: "Démission CM", type: "demission_cm" });
  return badges;
}

function BadgeList({ badges, absent }: { badges: { label: string; type: string }[]; absent?: boolean }) {
  if (absent) return <p className="text-[9px] text-slate-300 italic text-center mt-1">Absent</p>;
  return (
    <div className="flex flex-col items-center gap-0.5 mt-1">
      {badges.map((b, i) => {
        const c = BADGE_COLORS[b.type] || BADGE_COLORS.mandat;
        return (
          <span key={i} className="px-1.5 py-[1px] rounded-full text-[8px] font-semibold leading-tight whitespace-nowrap"
            style={{ backgroundColor: c.bg, color: c.text }}>
            {b.label}
          </span>
        );
      })}
    </div>
  );
}

function MiniTimeline({ data }: { data: TimelineData }) {
  const has2020 = !!data["2020"];
  const has2026 = !!data["2026"];
  if (!has2020 && !has2026) return null;

  const badges2020 = getBadges(data["2020"], "2020");
  const badges2026 = getBadges(data["2026"], "2026");

  const nodeColor = (year: TimelineYear | undefined, present: boolean) =>
    !present ? "#e2e8f0" : year?.resultat === "Élu" ? "#10b981" : "#ef4444";

  return (
    <div className="flex items-start gap-2">
      {/* 2020 column */}
      <div className="flex-1 flex flex-col items-center min-w-0">
        <span className={`text-[9px] font-bold mb-1 ${has2020 ? "text-slate-700" : "text-slate-300"}`}>
          15 mars 2020
        </span>
        <svg width="10" height="10"><circle cx="5" cy="5" r={NODE_R} fill={nodeColor(data["2020"], has2020)} /></svg>
        <BadgeList badges={badges2020} absent={!has2020} />
      </div>

      {/* Connection line */}
      <div className="flex items-center pt-5">
        <div className={`w-8 border-t ${has2020 && has2026 ? "border-slate-300" : "border-dashed border-slate-200"}`} />
      </div>

      {/* 2026 column */}
      <div className="flex-1 flex flex-col items-center min-w-0">
        <span className={`text-[9px] font-bold mb-1 ${has2026 ? "text-slate-700" : "text-slate-300"}`}>
          15 mars 2026
        </span>
        <svg width="10" height="10"><circle cx="5" cy="5" r={NODE_R} fill={nodeColor(data["2026"], has2026)} /></svg>
        <BadgeList badges={badges2026} absent={!has2026} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfileCard
// ---------------------------------------------------------------------------

type ProfileCardProps = {
  person: Person;
  onClose: () => void;
  annee?: number;
};

export default function ProfileCard({ person, onClose, annee }: ProfileCardProps) {
  const [bref, setBref] = useState<BrefProfile | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [tlLoading, setTlLoading] = useState(false);

  useEffect(() => {
    setBref(null);
    setShowTimeline(false);
    setTimeline(null);
    const url = `${API_URL}/api/suivi-mun/bref-profile?prenom=${encodeURIComponent(person.prenom)}&nom=${encodeURIComponent(person.nom)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setBref(data))
      .catch(() => {});
  }, [person.prenom, person.nom]);

  const fetchTimeline = () => {
    if (timeline || tlLoading) return;
    setTlLoading(true);
    fetch(`${API_URL}/api/suivi-mun/person-timeline?prenom=${encodeURIComponent(person.prenom)}&nom=${encodeURIComponent(person.nom)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { setTimeline(data); setTlLoading(false); })
      .catch(() => setTlLoading(false));
  };

  const nationalMandates = bref?.mandates?.filter(
    (m) =>
      m.type &&
      (m.type.includes("National Assembly") ||
        m.type.includes("Senator") ||
        m.type.includes("European Parliament"))
  );

  return (
    <div className="mt-3 flex flex-col bg-white/80 backdrop-blur-sm rounded-2xl border border-red-100 shadow-sm animate-in fade-in duration-300">
      <div className="flex items-start gap-4 p-4">
        <DeputePhoto prenom={person.prenom} nom={person.nom} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[14px] font-bold text-slate-800 inline-flex items-center gap-1.5">
                {person.civilite === "M" ? "M." : "Mme"} {person.prenom} {person.nom}
              </span>
              <p className="text-[12px] text-slate-500 mt-0.5">
                {person.nuance} · {person.departement} · {person.commune}
                {person.age > 0 && ` · ${person.age} ans`}
              </p>

              <div className="flex flex-wrap gap-1 mt-1.5">
                {person.mandat_national && (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-100 text-blue-700">
                    {person.mandat_national}
                  </span>
                )}
                {person.candidature && (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-purple-100 text-purple-700">
                    {person.candidature}
                  </span>
                )}
                {person.resultat && (
                  <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                    person.resultat === "Élu" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {person.resultat}
                  </span>
                )}
                {person.fonction && (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-green-100 text-green-700">
                    {person.fonction}
                  </span>
                )}
                {annee !== 26 && person.interco && (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-teal-100 text-teal-700">
                    {person.interco}
                  </span>
                )}
                {person.issue === "Démissionnaire" && (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-orange-100 text-orange-700">
                    Démission parl.
                  </span>
                )}
                {person.issue === "Démission CM" && (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-100 text-amber-700">
                    Démission CM
                  </span>
                )}
              </div>

              {bref && (
                <div className="mt-2 space-y-1">
                  {bref.profession && (
                    <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
                      <GraduationCap size={11} className="text-slate-400 flex-shrink-0" />
                      {bref.profession}
                    </p>
                  )}
                  {bref.birth_municipality && (
                    <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
                      <MapPin size={11} className="text-slate-400 flex-shrink-0" />
                      Né{person.civilite !== "M" ? "e" : ""} à {bref.birth_municipality}
                      {bref.birth_department ? ` (${bref.birth_department})` : ""}
                      {bref.birth_date ? ` le ${formatDate(bref.birth_date)}` : ""}
                    </p>
                  )}
                  {nationalMandates && nationalMandates.length > 0 && (
                    <div className="text-[11px] text-slate-600 flex items-start gap-1.5">
                      <Briefcase size={11} className="text-slate-400 flex-shrink-0 mt-0.5" />
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {nationalMandates.slice(0, 4).map((m, i) => (
                          <span key={i} className="whitespace-nowrap">
                            {translateMandate(m.type!)}
                            {m.start && (
                              <span className="text-slate-400 ml-0.5">
                                ({m.start.slice(0, 4)}{m.end ? `–${m.end.slice(0, 4)}` : "–…"})
                              </span>
                            )}
                          </span>
                        ))}
                        {nationalMandates.length > 4 && (
                          <span className="text-slate-400">+{nationalMandates.length - 4} autres</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Timeline toggle */}
      <button
        onClick={() => { setShowTimeline(!showTimeline); if (!timeline) fetchTimeline(); }}
        className="flex items-center justify-center gap-1.5 py-2 border-t border-slate-100/80 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50/60 transition-colors"
      >
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${showTimeline ? "rotate-180" : ""}`}
        />
        Parcours 2020 – 2026
      </button>

      {/* Timeline content */}
      {showTimeline && (
        <div className="px-4 pb-3 animate-in fade-in slide-in-from-top-2 duration-300 max-w-[340px] mx-auto">
          {tlLoading && (
            <p className="text-[11px] text-slate-400 italic text-center py-3">Chargement…</p>
          )}
          {timeline && Object.keys(timeline).length === 0 && !tlLoading && (
            <p className="text-[11px] text-slate-400 italic text-center py-3">Aucune donnée trouvée</p>
          )}
          {timeline && Object.keys(timeline).length > 0 && (
            <MiniTimeline data={timeline} />
          )}
        </div>
      )}

      {/* Trace indicator */}
      <p className="text-[11px] text-red-500 px-4 pb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
        Chemin tracé sur le diagramme
      </p>
    </div>
  );
}

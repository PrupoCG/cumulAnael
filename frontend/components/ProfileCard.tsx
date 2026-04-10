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

// ---------------------------------------------------------------------------
// Chronological event builder — one event per election on the timeline
// ---------------------------------------------------------------------------

type TlEvent = {
  date: number;       // sortable numeric date (YYYYMM)
  dateLabel: string;   // e.g. "juin 2017"
  election: string;    // e.g. "Législatives"
  details: string[];   // e.g. ["Député"]
  color: string;       // dot color
  bg: string;          // badge bg
  fg: string;          // badge fg
};

const MANDAT_CODE_MAP: Record<string, { election: string; detail: string; bg: string; fg: string }> = {
  "D":   { election: "Législatives",     detail: "Député",      bg: "#dbeafe", fg: "#1d4ed8" },
  "S":   { election: "Sénatoriales",     detail: "Sénateur",    bg: "#e0e7ff", fg: "#4338ca" },
  "RPE": { election: "Européennes",      detail: "Eurodéputé",  bg: "#f3e8ff", fg: "#7c3aed" },
  "CD":  { election: "Départementales",  detail: "Cons. dép.",  bg: "#ccfbf1", fg: "#0f766e" },
  "CR":  { election: "Régionales",       detail: "Cons. rég.",  bg: "#d1fae5", fg: "#047857" },
};

// Approximate election dates for mandates held at each municipal election
const MANDAT_DATES: Record<string, Record<string, { date: number; label: string }>> = {
  "D":   { "2020": { date: 201706, label: "juin 2017" },  "2026": { date: 202206, label: "2022 ou 2024" } },
  "S":   { "2020": { date: 201709, label: "sept 2017" },  "2026": { date: 202309, label: "sept 2023" } },
  "RPE": { "2020": { date: 201905, label: "mai 2019" },   "2026": { date: 202406, label: "juin 2024" } },
  "CD":  { "2020": { date: 201503, label: "mars 2015" },  "2026": { date: 202106, label: "juin 2021" } },
  "CR":  { "2020": { date: 201512, label: "déc 2015" },   "2026": { date: 202106, label: "juin 2021" } },
};

function buildTimelineEvents(data: TimelineData): TlEvent[] {
  const events: TlEvent[] = [];
  const seen = new Set<string>();

  for (const [yearKey, yearData] of Object.entries(data) as [string, TimelineYear][]) {
    // Mandate events from mandat_national (e.g. "D / CD")
    if (yearData.mandat_national) {
      const codes = yearData.mandat_national.split(/\s*\/\s*/);
      for (const code of codes) {
        const c = code.trim();
        const meta = MANDAT_CODE_MAP[c];
        const dateMeta = MANDAT_DATES[c]?.[yearKey];
        if (meta && dateMeta) {
          const key = `${c}-${dateMeta.date}`;
          if (!seen.has(key)) {
            seen.add(key);
            events.push({
              date: dateMeta.date,
              dateLabel: dateMeta.label,
              election: meta.election,
              details: [meta.detail],
              color: meta.fg,
              bg: meta.bg,
              fg: meta.fg,
            });
          }
        }
      }
    }

    // Municipal election event
    const munDate = yearKey === "2020" ? 202003 : 202603;
    const munLabel = yearKey === "2020" ? "mars 2020" : "mars 2026";
    const munDetails: string[] = [];
    if (yearData.candidature && yearData.candidature !== "Non candidat") munDetails.push(yearData.candidature);
    if (yearData.resultat === "Élu") {
      munDetails.push(yearData.fonction ? `Élu · ${yearData.fonction}` : "Élu");
    } else if (yearData.candidature && yearData.candidature !== "Non candidat") {
      munDetails.push("Non élu");
    }
    if (yearData.interco) munDetails.push(yearData.interco);
    if (yearData.issue === "Démissionnaire") munDetails.push("Démission parl.");
    if (yearData.issue === "Démission CM") munDetails.push("Démission CM");

    const isElu = yearData.resultat === "Élu";
    events.push({
      date: munDate,
      dateLabel: munLabel,
      election: "Municipales",
      details: munDetails.length ? munDetails : ["Non candidat"],
      color: isElu ? "#10b981" : (yearData.candidature && yearData.candidature !== "Non candidat" ? "#ef4444" : "#94a3b8"),
      bg: isElu ? "#d1fae5" : "#f1f5f9",
      fg: isElu ? "#047857" : "#475569",
    });
  }

  events.sort((a, b) => a.date - b.date);
  return events;
}

function MiniTimeline({ data }: { data: TimelineData }) {
  const events = buildTimelineEvents(data);
  if (events.length === 0) return null;

  return (
    <div className="relative">
      {/* Horizontal line behind dots */}
      <div className="absolute left-0 right-0 top-[7px] h-px bg-slate-200" />

      {/* Events */}
      <div className="relative flex justify-between gap-2">
        {events.map((ev, i) => (
          <div key={i} className="flex flex-col items-center min-w-0 flex-1">
            {/* Dot */}
            <div className="w-3.5 h-3.5 rounded-full border-2 border-white z-10 flex-shrink-0"
              style={{ backgroundColor: ev.color }} />
            {/* Date */}
            <span className="text-[9px] font-bold text-slate-500 mt-1 whitespace-nowrap">{ev.dateLabel}</span>
            {/* Election type */}
            <span className="text-[9px] font-semibold mt-0.5 whitespace-nowrap" style={{ color: ev.fg }}>
              {ev.election}
            </span>
            {/* Detail badges */}
            <div className="flex flex-col items-center gap-[2px] mt-0.5">
              {ev.details.map((d, j) => (
                <span key={j} className="px-1.5 py-[1px] rounded-full text-[8px] font-medium leading-tight whitespace-nowrap"
                  style={{ backgroundColor: ev.bg, color: ev.fg }}>
                  {d}
                </span>
              ))}
            </div>
          </div>
        ))}
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

"use client";

import { useState, useEffect } from "react";
import { X, Briefcase, MapPin, GraduationCap, ExternalLink } from "lucide-react";
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


type ProfileCardProps = {
  person: Person;
  onClose: () => void;
  annee?: number;
};

export default function ProfileCard({ person, onClose, annee }: ProfileCardProps) {
  const [bref, setBref] = useState<BrefProfile | null>(null);

  useEffect(() => {
    setBref(null);
    const url = `${API_URL}/api/suivi-mun/bref-profile?prenom=${encodeURIComponent(person.prenom)}&nom=${encodeURIComponent(person.nom)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setBref(data))
      .catch(() => {});
  }, [person.prenom, person.nom]);

  const nationalMandates = bref?.mandates?.filter(
    (m) =>
      m.type &&
      (m.type.includes("National Assembly") ||
        m.type.includes("Senator") ||
        m.type.includes("European Parliament"))
  );

  return (
    <div className="mt-3 flex items-start gap-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-red-100 shadow-sm p-4 animate-in fade-in duration-300">
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
        <p className="text-[11px] text-red-500 mt-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          Chemin tracé sur le diagramme
        </p>
      </div>
    </div>
  );
}

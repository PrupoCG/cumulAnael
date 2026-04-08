import Link from "next/link";
import { Scale, GitBranch, ArrowRight, Users, BarChart3 } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col">
      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 md:py-24">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center mb-8 shadow-lg shadow-slate-300/40">
          <GitBranch size={32} className="text-white" />
        </div>

        <h1 className="text-[36px] md:text-[48px] font-bold text-slate-900 tracking-tight text-center mb-4">
          cumul<span className="text-amber-600">Anael</span>
        </h1>

        <p className="text-slate-500 text-[16px] md:text-[18px] text-center max-w-2xl leading-relaxed mb-3">
          Analyse du <strong className="text-slate-700">cumul des mandats</strong> et des{" "}
          <strong className="text-slate-700">démissions</strong> des parlementaires élus à une fonction exécutive municipale.
        </p>
        <p className="text-slate-400 text-[14px] text-center max-w-xl leading-relaxed mb-10">
          Municipales 2020 & 2026 — Données SUIVI_MUN_V3 enrichies par BRÉF
        </p>

        <Link
          href="/dashboard"
          className="group inline-flex items-center gap-3 px-8 py-4 bg-slate-800 text-white rounded-2xl text-[15px] font-semibold hover:bg-slate-700 transition-all duration-300 shadow-lg shadow-slate-300/40 hover:shadow-xl hover:shadow-slate-300/50"
        >
          <Scale size={20} className="text-amber-400" />
          Explorer le diagramme Sankey
          <ArrowRight size={18} className="text-slate-400 group-hover:translate-x-1 transition-transform duration-200" />
        </Link>

        {/* Features */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl w-full">
          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 text-center">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
              <Scale size={20} className="text-amber-600" />
            </div>
            <h3 className="text-[14px] font-bold text-slate-800 mb-1">Diagramme Sankey</h3>
            <p className="text-[12px] text-slate-500 leading-relaxed">
              Parcours complet des parlementaires : entrée, candidature, élection, fonction, interco, sortie
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 text-center">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
              <Users size={20} className="text-blue-600" />
            </div>
            <h3 className="text-[14px] font-bold text-slate-800 mb-1">Listes nominatives</h3>
            <p className="text-[12px] text-slate-500 leading-relaxed">
              Filtrage par nœud ou flux, recherche par nom, export CSV, profils BRÉF enrichis
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <BarChart3 size={20} className="text-emerald-600" />
            </div>
            <h3 className="text-[14px] font-bold text-slate-800 mb-1">Statistiques filtrées</h3>
            <p className="text-[12px] text-slate-500 leading-relaxed">
              Répartition par nuance, département, genre et âge pour chaque segment du Sankey
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-[11px] text-slate-300">
        <Users size={11} className="inline mr-1" />
        BRÉF / M1 Gouvernance des Données — {new Date().getFullYear()}
      </footer>
    </div>
  );
}

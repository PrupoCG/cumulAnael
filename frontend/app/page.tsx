"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50/80 to-white">
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20 md:py-28">
        {/* Badge contexte */}
        <span className="inline-block mb-6 px-4 py-1.5 rounded-full text-[11px] font-semibold tracking-[0.15em] uppercase bg-amber-50 text-amber-700 border border-amber-200/60">
          M1 Gouvernance des Données
        </span>

        {/* Titre */}
        <h1 className="text-center font-bold tracking-tight leading-[1.1] mb-5 text-slate-900" style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
          Cumul des mandats
          <br />
          <span className="text-amber-600">et démissions</span>
        </h1>

        {/* Trait décoratif */}
        <div className="mb-6 w-12 h-[3px] rounded-sm bg-gradient-to-r from-amber-500 to-amber-300" />

        {/* Description */}
        <p className="text-center max-w-2xl leading-relaxed mb-3 text-slate-500" style={{ fontSize: "clamp(1rem, 2.5vw, 1.125rem)" }}>
          Analyse du <strong className="text-slate-700 font-semibold">cumul des mandats</strong> et des{" "}
          <strong className="text-slate-700 font-semibold">démissions</strong> des parlementaires élus à une fonction exécutive municipale.
        </p>

        <p className="text-center max-w-xl leading-relaxed mb-10 text-slate-400 text-[14px]">
          Municipales 2020 &amp; 2026 - Données SUIVI_MUN_V3
        </p>

        {/* CTA */}
        <Link
          href="/dashboard"
          className="inline-block px-9 py-3.5 bg-slate-800 text-white rounded-xl text-[15px] font-semibold hover:bg-slate-700 transition-all duration-300 shadow-md shadow-slate-300/40 hover:shadow-lg hover:shadow-slate-300/50 hover:-translate-y-0.5"
        >
          Explorer les données
        </Link>

        {/* Cards */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl w-full">
          {[
            {
              num: "01",
              title: "Identification",
              desc: "Repérage des parlementaires cumulant un mandat national et une fonction exécutive municipale après les élections.",
            },
            {
              num: "02",
              title: "Analyse",
              desc: "Étude des profils, des temporalités de démission et des facteurs influençant le choix entre mandats.",
            },
            {
              num: "03",
              title: "Comparaison",
              desc: "Mise en regard des dynamiques observées entre les scrutins municipaux de 2020 et de 2026.",
            },
          ].map((card) => (
            <div
              key={card.num}
              className="relative rounded-xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg bg-white/80 backdrop-blur-sm border border-slate-200/60 shadow-sm shadow-slate-200/30"
            >
              <span className="block text-[12px] font-bold mb-3 text-amber-500 tracking-wider">
                {card.num}
              </span>
              <h3 className="text-[16px] font-semibold mb-2 text-slate-800">
                {card.title}
              </h3>
              <p className="text-[13.5px] leading-relaxed text-slate-500">
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-[11px] text-slate-400 border-t border-slate-100">
        M1 Gouvernance des Données - <strong className="font-semibold">Clément CHANUT GIRARDI</strong>
      </footer>
    </div>
  );
}

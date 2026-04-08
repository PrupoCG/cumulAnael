"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f8fafc 100%)" }}>
      {/* Ligne d'accent */}
      <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #2563eb, #6366f1, #2563eb)" }} />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20 md:py-28">
        {/* Badge contexte */}
        <span
          className="inline-block mb-6 px-4 py-1.5 rounded-full text-[11px] font-semibold tracking-[0.15em] uppercase"
          style={{
            background: "rgba(37, 99, 235, 0.08)",
            color: "#2563eb",
            border: "1px solid rgba(37, 99, 235, 0.15)",
          }}
        >
          M1 Gouvernance des Données
        </span>

        {/* Titre */}
        <h1
          className="text-center font-bold tracking-tight leading-[1.1] mb-5"
          style={{ fontSize: "clamp(2rem, 5vw, 3rem)", color: "#0f172a" }}
        >
          Cumul des mandats
          <br />
          <span style={{ color: "#2563eb" }}>et démissions</span>
        </h1>

        {/* Trait décoratif */}
        <div
          className="mb-6"
          style={{
            width: "48px",
            height: "3px",
            borderRadius: "2px",
            background: "linear-gradient(90deg, #2563eb, #6366f1)",
          }}
        />

        {/* Description */}
        <p className="text-center max-w-2xl leading-relaxed mb-3" style={{ color: "#475569", fontSize: "clamp(1rem, 2.5vw, 1.125rem)" }}>
          Analyse du <strong style={{ color: "#1e293b", fontWeight: 600 }}>cumul des mandats</strong> et des{" "}
          <strong style={{ color: "#1e293b", fontWeight: 600 }}>démissions</strong> des parlementaires élus à une fonction exécutive municipale.
        </p>

        <p className="text-center max-w-xl leading-relaxed mb-10" style={{ color: "#94a3b8", fontSize: "14px" }}>
          Municipales 2020 &amp; 2026 - Données SUIVI_MUN_V3
        </p>

        {/* CTA */}
        <Link
          href="/dashboard"
          className="inline-block font-semibold transition-all duration-300"
          style={{
            padding: "14px 36px",
            background: "linear-gradient(135deg, #2563eb, #4f46e5)",
            color: "#ffffff",
            borderRadius: "12px",
            fontSize: "15px",
            boxShadow: "0 4px 14px rgba(37, 99, 235, 0.3), 0 1px 3px rgba(0, 0, 0, 0.08)",
            letterSpacing: "0.01em",
          }}
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
              accent: "#2563eb",
            },
            {
              num: "02",
              title: "Analyse",
              desc: "Étude des profils, des temporalités de démission et des facteurs influençant le choix entre mandats.",
              accent: "#6366f1",
            },
            {
              num: "03",
              title: "Comparaison",
              desc: "Mise en regard des dynamiques observées entre les scrutins municipaux de 2020 et de 2026.",
              accent: "#8b5cf6",
            },
          ].map((card) => (
            <div
              key={card.num}
              className="relative rounded-xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                borderTop: `3px solid ${card.accent}`,
              }}
            >
              <span
                className="block text-[12px] font-bold mb-3"
                style={{ color: card.accent, letterSpacing: "0.08em" }}
              >
                {card.num}
              </span>
              <h3 className="text-[16px] font-semibold mb-2" style={{ color: "#0f172a" }}>
                {card.title}
              </h3>
              <p className="text-[13.5px] leading-relaxed" style={{ color: "#64748b" }}>
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer
        className="py-6 text-center text-[11px]"
        style={{ color: "#94a3b8", borderTop: "1px solid #e2e8f0" }}
      >
        M1 Gouvernance des Données - Clément CHANUT GIRARDI
      </footer>
    </div>
  );
}

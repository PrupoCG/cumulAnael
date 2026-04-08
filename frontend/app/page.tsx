import Link from "next/link";

export default function Home() {
  return (
    <div
      className="min-h-screen bg-white flex flex-col"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* En-tête */}
      <header className="border-b border-slate-200 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <p className="text-xs tracking-widest uppercase text-slate-400 mb-1">
            M1 Gouvernance des Données
          </p>
          <h1
            className="text-2xl font-normal text-slate-900 tracking-tight"
            style={{
              fontFamily: 'Georgia, "Times New Roman", Times, serif',
            }}
          >
            cumul<span className="font-bold">Anael</span>
          </h1>
        </div>
      </header>

      {/* Corps principal */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
          {/* Titre du sujet */}
          <h2
            className="text-xl md:text-2xl font-normal text-slate-900 leading-snug mb-6"
            style={{
              fontFamily: 'Georgia, "Times New Roman", Times, serif',
            }}
          >
            Cumul des mandats et démissions des parlementaires
            élus à une fonction exécutive municipale
          </h2>

          <p className="text-base text-slate-600 leading-relaxed mb-10 max-w-2xl">
            Cet outil permet d&apos;explorer les trajectoires des
            parlementaires français candidats aux élections municipales de 2020
            et 2026, depuis leur entrée dans le processus électoral
            jusqu&apos;à leur éventuelle démission du mandat parlementaire ou
            leur maintien en situation de cumul.
          </p>

          {/* Données */}
          <section className="mb-10">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4 pb-2 border-b border-slate-100">
              Données
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Municipales 2020
                </p>
                <p className="text-sm text-slate-500">
                  Données consolidées issues de SUIVI_MUN_V3
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Municipales 2026
                </p>
                <p className="text-sm text-slate-500">
                  Données enrichies par BRÉF
                </p>
              </div>
            </div>
          </section>

          {/* Méthodologie */}
          <section className="mb-10">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4 pb-2 border-b border-slate-100">
              Méthodologie
            </h3>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-semibold text-slate-800">
                  Diagramme de Sankey interactif
                </dt>
                <dd className="text-slate-500 mt-0.5">
                  Visualisation des flux de parlementaires à travers les étapes
                  successives : candidature, élection, fonction exécutive,
                  intercommunalité, cumul ou démission.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-800">
                  Listes nominatives
                </dt>
                <dd className="text-slate-500 mt-0.5">
                  Filtrage par nœud ou par flux du Sankey, recherche par nom,
                  profils enrichis et export CSV.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-800">
                  Statistiques filtrées
                </dt>
                <dd className="text-slate-500 mt-0.5">
                  Répartition par nuance politique, département, genre et âge
                  pour chaque segment sélectionné.
                </dd>
              </div>
            </dl>
          </section>

          {/* Cadre académique */}
          <section className="mb-12">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4 pb-2 border-b border-slate-100">
              Cadre académique
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Ce projet est réalisé dans le cadre du Master 1 Gouvernance des
              Données, au sein du programme BRÉF. Il vise à fournir un outil
              d&apos;analyse accessible aux chercheurs, enseignants et étudiants
              en sciences politiques travaillant sur la question du cumul des
              mandats en France.
            </p>
          </section>

          {/* Appel à l'action */}
          <div className="border-t border-slate-200 pt-8">
            <p className="text-sm text-slate-500 mb-4">
              Accéder à l&apos;interface de visualisation et d&apos;exploration
              des données parlementaires.
            </p>
            <Link
              href="/dashboard"
              className="inline-block px-6 py-3 bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 transition-colors duration-150"
            >
              Explorer les données
            </Link>
          </div>
        </div>
      </main>

      {/* Pied de page */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <p className="text-xs text-slate-400">
            BRÉF — M1 Gouvernance des Données — {new Date().getFullYear()}
          </p>
          <p className="text-xs text-slate-400">
            Données : Assemblée nationale, Sénat, Ministère de
            l&apos;Intérieur
          </p>
        </div>
      </footer>
    </div>
  );
}

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

cumulAnael — Analyse du cumul des mandats et des démissions des parlementaires élus à une fonction exécutive municipale (Municipales 2020 & 2026). Diagrammes Sankey interactifs avec listes nominatives, filtres, export CSV/PNG et enrichissement BRÉF.

## Git Conventions

- Tous les messages de commit et descriptions de PR doivent être rédigés en **français**.
- Auteur unique à créditer : **Clément CHANUT GIRARDI** — ne pas ajouter de ligne `Co-Authored-By`.

## Repository

- Remote origin : `https://github.com/PrupoCG/cumulAnael.git`

## Stack

- **Backend** : FastAPI + DuckDB, Python 3.12+, port **8001**
- **Frontend** : Next.js 16 + React 19, Tailwind CSS 4, port **3001**
- **Sankey** : d3-sankey + rendu SVG custom (`SankeyVisxChart.tsx`)
- **Stats panel** : @visx (Pie, Group, Scale, Text, Tooltip, Zoom, Legend)
- **Icônes** : lucide-react
- **Déploiement** : Docker (Dokploy), `docker-compose.yml` à la racine

## Commands

```bash
# Backend
uv sync                                    # installer les dépendances Python
uv run python scripts/load_suivi_mun.py    # charger Excel → DuckDB (data/suivi_mun.duckdb)
uv run uvicorn api.main:app --port 8001    # lancer l'API

# Frontend
cd frontend && npm install                 # installer les dépendances Node
cd frontend && npm run dev                 # dev server (port 3001, turbopack)
cd frontend && npm run build               # build production (standalone)
cd frontend && npm run lint                # linter Next.js

# Docker
docker compose up --build                  # lancer les deux services

# Variables d'environnement (docker-compose ou .env)
NEXT_PUBLIC_API_URL=http://localhost:8001   # URL API côté frontend
ALLOWED_ORIGINS=http://localhost:3001       # CORS côté backend
```

## Architecture — Flux de données

```
Excel (SUIVI_MUN_V3.xlsx)
  → load_suivi_mun.py → DuckDB (mun_20, mun_26)
    → suivi_mun_service.py (SQL pur, ~3200 lignes)
      → routes/suivi_mun.py (FastAPI, ~590 lignes)
        → Dashboard.tsx (fetch API + state management)
          → SankeyVisxChart.tsx (d3-sankey layout → SVG)
          → StatsPanel.tsx (@visx pie charts + bars)
```

**Backend : connexion DuckDB stateless.** Chaque appel `_query()` ouvre et ferme une connexion `read_only=True`. Pas de pool ni de cache SQL — le service est un gros fichier de fonctions de requêtes DuckDB.

**Frontend : données en tableaux parallèles.** L'API retourne les Sankey sous forme de tableaux parallèles (`labels[]`, `source[]`, `target[]`, `value[]`, `colors[]`, `link_colors[]`, `link_origins[]`) que `SankeyVisxChart` convertit en graphe d3-sankey.

**Deux modes de coloration Sankey** : `etapes` (couleur par étape du parcours) et `origine` (couleur par situation d'entrée : sortant CM-CC / CM / sans mandat).

**StatsPanel** : reçoit des `NodeStats` (nuances, genre, départements, âge, fonctions) et affiche des pie charts @visx + barres horizontales SVG + carte GeoJSON départements.

**Enrichissement BRÉF** : les routes `/photo` et `/bref-profile` font des lookups dans des fichiers Parquet BRÉF puis proxient les photos depuis assemblee-nationale.fr, senat.fr ou Wikipedia.

## Paramètre `annee`

La plupart des endpoints et fonctions acceptent `annee` = **20** (municipales 2020) ou **26** (municipales 2026). En interne, cela sélectionne la table `mun_20` ou `mun_26`.

## Data

- `data/SUIVI_MUN_V3.xlsx` — fichier source (non versionné)
- `data/suivi_mun.duckdb` — base générée par `load_suivi_mun.py` (non versionnée)
- `data/elections/bref/parquet/` — fichiers BRÉF Parquet optionnels (`bref_individuals.parquet`, `bref_mandates.parquet`, `bref_professions.parquet`)
- `frontend/public/data/departements.geojson` — contours départements pour la carte StatsPanel

## API — Structure des routes

Toutes les routes sont sous `/api/suivi-mun/`. L'ordre de déclaration dans `suivi_mun.py` est important : les routes Sankey spécifiques (préfixe `/stats/sankey/...`) sont déclarées **avant** les routes paramétrées `/stats/{annee}/...` pour éviter les conflits de matching FastAPI.

Principaux groupes :
- `/stats/sankey/parlementaires/detail` + `/options` + `/persons` — Sankey par étapes
- `/stats/sankey/tracabilite` + `/options` + `/persons` — Sankey par origine (flux)
- `/stats/sankey/ancrage`, `/horizontal`, `/nuances`, `/fonctions`, `/evolution` — variantes Sankey
- `/stats/filtered` + `/persons` + `/export` — stats filtrées avec export CSV
- `/photo`, `/bref-profile` — enrichissement BRÉF

## Contraintes techniques

- **React 19 + @visx 3.x** : visx n'a pas officiellement le peer dependency React 19 — les packages sont installés avec `--legacy-peer-deps`
- **Pas de tests** : ni backend ni frontend n'ont de suite de tests
- **Pas de linter Python** configuré (pas de ruff/flake8 dans pyproject.toml)
- **Next.js standalone** : le build production utilise `output: "standalone"` pour Docker

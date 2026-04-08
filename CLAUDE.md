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
- **Stats panel** : @visx (Pie, Group, Scale, Text)
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

# Docker
docker compose up --build                  # lancer les deux services
```

## Architecture

```
api/
  main.py              # FastAPI app (CORS + 2 routeurs)
  config.py            # Pydantic Settings (ports, CORS, DATA_DIR)
  routes/
    health.py          # GET /api/health
    suivi_mun.py       # Routes Sankey + filtres + export + BRÉF (sans auth)
  services/
    suivi_mun_service.py  # 3197 lignes de queries DuckDB pures
scripts/
  load_suivi_mun.py    # Excel → DuckDB (mun_20, mun_26)
frontend/
  app/
    page.tsx           # Landing page
    dashboard/page.tsx # Dashboard Sankey
  components/
    Dashboard.tsx      # Vue principale (year toggle + SankeyView)
    SankeyVisxChart.tsx # Rendu SVG Sankey (d3-sankey layout)
    StatsPanel.tsx     # Panel stats filtrées (@visx pie)
    DeputePhoto.tsx    # Photo proxy BRÉF
    ProfileCard.tsx    # Profil enrichi BRÉF
    ChartErrorBoundary.tsx
    ChartSkeleton.tsx
  lib/
    api.ts             # API_URL constant
    nuanceColors.ts    # Couleurs par nuance politique
```

## Data

- `data/SUIVI_MUN_V3.xlsx` — fichier source (non versionné)
- `data/suivi_mun.duckdb` — base générée par `load_suivi_mun.py` (non versionnée)
- Fichiers BRÉF parquet optionnels pour enrichissement photo/profil

## API Endpoints principaux

- `GET /api/suivi-mun/stats/sankey/parlementaires/detail` — Sankey par étapes
- `GET /api/suivi-mun/stats/sankey/tracabilite` — Sankey par origine (flux)
- `GET /api/suivi-mun/stats/sankey/parlementaires/detail/options` — catégories disponibles
- `GET /api/suivi-mun/stats/sankey/parlementaires/detail/persons` — liste nominative
- `GET /api/suivi-mun/stats/filtered` — stats filtrées (nuance, dept, genre, âge)
- `GET /api/suivi-mun/photo` — proxy photo BRÉF
- `GET /api/suivi-mun/bref-profile` — profil enrichi BRÉF

#!/bin/sh
set -e

# Auto-generate DuckDB from Excel if not already done
if [ ! -f /app/data/suivi_mun.duckdb ] && [ -f /app/data/SUIVI_MUN_V3.xlsx ]; then
  echo "[entrypoint] Génération de suivi_mun.duckdb depuis SUIVI_MUN_V3.xlsx..."
  uv run python scripts/load_suivi_mun.py
  echo "[entrypoint] Base DuckDB générée."
fi

exec "$@"

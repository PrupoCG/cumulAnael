#!/usr/bin/env python3
"""
Load Cumul_2020_2026.xlsx into DuckDB for the Trajectoire/Sankey dashboard.

Reads the CENTRAL sheet, splits by Année (2020/2026),
renames columns for backward compatibility, and creates tables mun_20 and mun_26.

Usage:
    uv run python scripts/load_suivi_mun.py
"""

import sys
from pathlib import Path

import duckdb
import pandas as pd

PROJECT_ROOT = Path(__file__).parent.parent
EXCEL_FILE = PROJECT_ROOT / "data" / "Cumul_2020_2026.xlsx"
DB_FILE = PROJECT_ROOT / "data" / "suivi_mun.duckdb"

# Colonnes renommées pour compatibilité avec le service existant
RENAME_MAP = {
    "elu_cm_2": "elu_cm",
    "CUM_2": "position_cumul_2",
}


def load():
    if not EXCEL_FILE.exists():
        print(f"❌ Fichier Excel introuvable : {EXCEL_FILE}")
        return 1

    print(f"📖 Lecture de la feuille CENTRAL depuis {EXCEL_FILE.name}…")
    df = pd.read_excel(EXCEL_FILE, sheet_name="CENTRAL")

    # Split par année
    df_20 = df[df["Année"] == 2020].copy()
    df_26 = df[df["Année"] == 2026].copy()

    # Renommer les colonnes pour compatibilité service
    df_20.rename(columns=RENAME_MAP, inplace=True)
    df_26.rename(columns=RENAME_MAP, inplace=True)

    # Corriger les typos "Démissionaire" / "Démissonaire" → "Démissionnaire"
    for frame in (df_20, df_26):
        if "mvmt_parlementaire" in frame.columns:
            frame["mvmt_parlementaire"] = frame["mvmt_parlementaire"].replace(
                {"Démissionaire": "Démissionnaire", "Démissonaire": "Démissionnaire"}
            )

    # S'assurer que les colonnes attendues par le service existent
    for col in ("t_csp", "statut_csp"):
        for frame in (df_20, df_26):
            if col not in frame.columns:
                frame[col] = None

    # Charger dans DuckDB
    con = duckdb.connect(str(DB_FILE))

    con.execute("DROP TABLE IF EXISTS mun_20")
    con.execute("CREATE TABLE mun_20 AS SELECT * FROM df_20")

    con.execute("DROP TABLE IF EXISTS mun_26")
    con.execute("CREATE TABLE mun_26 AS SELECT * FROM df_26")

    # Vérification
    count_20 = con.execute("SELECT COUNT(*) FROM mun_20").fetchone()[0]
    count_26 = con.execute("SELECT COUNT(*) FROM mun_26").fetchone()[0]
    print(f"✅ mun_20 : {count_20:,} lignes")
    print(f"✅ mun_26 : {count_26:,} lignes")

    # Vérifier les colonnes critiques
    cols_20 = {r[0] for r in con.execute("DESCRIBE mun_20").fetchall()}
    for col in ("elu_cm", "position_cumul_2", "position_cumul_1", "mvmt_parlementaire"):
        status = "✅" if col in cols_20 else "❌"
        print(f"  {status} colonne {col}")

    # Vérifier l'absence du typo
    typo_count = con.execute(
        "SELECT COUNT(*) FROM mun_26 WHERE mvmt_parlementaire = 'Démissionaire'"
    ).fetchone()[0]
    if typo_count > 0:
        print(f"  ⚠️  {typo_count} lignes avec typo 'Démissionaire' restantes en mun_26")
    else:
        print("  ✅ Aucun typo 'Démissionaire' dans mun_26")

    con.close()
    print(f"📦 Base créée : {DB_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(load())

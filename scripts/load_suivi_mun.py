#!/usr/bin/env python3
"""
Load SUIVI_MUN_V3.xlsx into DuckDB for the Trajectoire/Sankey dashboard.

Creates tables mun_20 and mun_26 from the Excel sheets.

Usage:
    uv run python scripts/load_suivi_mun.py
"""

import sys
from pathlib import Path

import duckdb
import pandas as pd

PROJECT_ROOT = Path(__file__).parent.parent
EXCEL_FILE = PROJECT_ROOT / "data" / "SUIVI_MUN_V3.xlsx"
DB_FILE = PROJECT_ROOT / "data" / "suivi_mun.duckdb"


def load():
    if not EXCEL_FILE.exists():
        print(f"❌ Excel file not found: {EXCEL_FILE}")
        return 1

    con = duckdb.connect(str(DB_FILE))

    # MUN_20
    df_20 = pd.read_excel(EXCEL_FILE, sheet_name="MUN_20")
    con.execute("DROP TABLE IF EXISTS mun_20")
    con.execute("CREATE TABLE mun_20 AS SELECT * FROM df_20")

    # MUN_26
    df_26 = pd.read_excel(EXCEL_FILE, sheet_name="MUN_26")
    con.execute("DROP TABLE IF EXISTS mun_26")
    con.execute("CREATE TABLE mun_26 AS SELECT * FROM df_26")

    # Verification
    count_20 = con.execute("SELECT COUNT(*) FROM mun_20").fetchone()[0]
    count_26 = con.execute("SELECT COUNT(*) FROM mun_26").fetchone()[0]
    print(f"✅ mun_20 : {count_20:,} lignes")
    print(f"✅ mun_26 : {count_26:,} lignes")

    con.close()
    print(f"📦 Base créée : {DB_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(load())

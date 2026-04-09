"""
Service for querying SUIVI_MUN DuckDB data.

Provides read-only access to mun_20 and mun_26 tables
containing elected officials data for municipales 2020 and 2026.
"""

import duckdb
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "data" / "suivi_mun.duckdb"

ALLOWED_TABLES = {"mun_20", "mun_26"}


def _get_table(annee: int) -> str:
    table = f"mun_{annee}"
    if table not in ALLOWED_TABLES:
        raise ValueError(f"Année invalide: {annee}. Utiliser 20 ou 26.")
    return table


def _query(sql: str, params: list = None) -> list[dict]:
    """Execute a read-only SQL query and return list of dicts."""
    con = duckdb.connect(str(DB_PATH), read_only=True)
    try:
        result = con.execute(sql, params or []).fetchdf()
        # Replace NaN/None with empty string or 0 to ensure JSON serialization
        result = result.fillna("")
        return result.to_dict(orient="records")
    finally:
        con.close()


def is_available() -> bool:
    """Check if the suivi_mun database exists."""
    return DB_PATH.exists()


def get_elus(annee: int, limit: int = 100, offset: int = 0) -> list[dict]:
    table = _get_table(annee)
    return _query(f"SELECT * FROM {table} LIMIT ? OFFSET ?", [limit, offset])


def get_elu_by_id(annee: int, elu_id: int) -> list[dict]:
    table = _get_table(annee)
    rows = _query(f"SELECT * FROM {table} WHERE ID = ?", [elu_id])
    if rows:
        row = rows[0]
        # Decode mandates
        cumul = row.get("position_cumul_1", "") or ""
        mandate_labels = {
            "D": "Député", "S": "Sénateur", "RPE": "Représentant PE",
            "CR": "Conseiller régional", "CR-P": "Président CR", "CR-VP": "VP CR",
            "CD": "Conseiller départemental", "CD-P": "Président CD", "CD-VP": "VP CD",
            "CC": "Conseiller communautaire", "CC-P": "Président CC", "CC-VP": "VP CC",
            "CM": "Conseiller municipal", "CM-M": "Maire", "CM-A": "Adjoint",
        }
        parts = [p.strip() for p in cumul.split("/") if p.strip()] if cumul else []
        mandats = [mandate_labels.get(p, p) for p in parts]
        row["mandats"] = mandats
    return rows


def stats_cumuls(annee: int) -> list[dict]:
    table = _get_table(annee)
    return _query(f"""
        SELECT position_cumul_1, COUNT(*) AS nb_elus
        FROM {table}
        WHERE position_cumul_1 IS NOT NULL
        GROUP BY position_cumul_1
        ORDER BY nb_elus DESC
    """)


def stats_nuances(annee: int) -> list[dict]:
    table = _get_table(annee)
    return _query(f"""
        SELECT nuance_parlementaire, COUNT(*) AS nb_elus
        FROM {table}
        WHERE nuance_parlementaire IS NOT NULL
        GROUP BY nuance_parlementaire
        ORDER BY nb_elus DESC
    """)


def stats_departements(annee: int) -> list[dict]:
    table = _get_table(annee)
    return _query(f"""
        SELECT COALESCE(t_departement, t_csp) AS t_departement, COUNT(*) AS nb_elus
        FROM {table}
        WHERE COALESCE(t_departement, t_csp) IS NOT NULL
        GROUP BY 1
        ORDER BY nb_elus DESC
    """)


def stats_age(annee: int) -> list[dict]:
    table = _get_table(annee)
    return _query(f"""
        SELECT
            CASE
                WHEN age < 30 THEN '< 30'
                WHEN age < 40 THEN '30-39'
                WHEN age < 50 THEN '40-49'
                WHEN age < 60 THEN '50-59'
                WHEN age < 70 THEN '60-69'
                ELSE '70+'
            END AS tranche_age,
            COUNT(*) AS nb_elus
        FROM {table}
        GROUP BY tranche_age
        ORDER BY tranche_age
    """)


def stats_genre(annee: int) -> list[dict]:
    table = _get_table(annee)
    return _query(f"""
        SELECT civilite_elu, COUNT(*) AS nb_elus
        FROM {table}
        GROUP BY civilite_elu
    """)


def stats_evolution() -> list[dict]:
    return _query("""
        SELECT '2020' AS annee, position_cumul_1, COUNT(*) AS nb_elus
        FROM mun_20 WHERE position_cumul_1 IS NOT NULL
        GROUP BY position_cumul_1
        UNION ALL
        SELECT '2026' AS annee, position_cumul_1, COUNT(*) AS nb_elus
        FROM mun_26 WHERE position_cumul_1 IS NOT NULL
        GROUP BY position_cumul_1
        ORDER BY annee, nb_elus DESC
    """)


# ── Sankey selectable items ──────────────────────────────────────────
# Uses position_cumul_1 column (pre-computed source of truth).
# Format: "D / CM / CC / CD" — codes separated by " / ".
# Mandats match any status (e.g. "CM" matches CM, CM-M, CM-A).
# Fonctions match specific status (e.g. "CM-M" for Maire).
# Multi-select: all patterns must match (AND).

SELECTABLE = {
    # Mandats — LIKE pattern matches any sub-status
    "depute":   {"like": "D",   "label": "Député",     "group": "mandat",   "first_only": True},
    "senateur": {"like": "S",   "label": "Sénateur",   "group": "mandat",   "first_only": True},
    "cr":       {"like": "CR",  "label": "CR",         "group": "mandat",   "first_only": False},
    "cd":       {"like": "CD",  "label": "CD",         "group": "mandat",   "first_only": False},
    "cc":       {"like": "CC",  "label": "CC",         "group": "mandat",   "first_only": False},
    "cm":       {"like": "CM",  "label": "CM",         "group": "mandat",   "first_only": False},
    # Fonctions exécutives — exact sub-status match
    "maire":    {"like": "CM-M",  "label": "Maire",          "group": "fonction", "first_only": False},
    "adjoint":  {"like": "CM-A",  "label": "Adjoint",        "group": "fonction", "first_only": False},
    "pres_cr":  {"like": "CR-P",  "label": "Président CR",   "group": "fonction", "first_only": False},
    "vp_cr":    {"like": "CR-VP", "label": "VP CR",          "group": "fonction", "first_only": False},
    "pres_cd":  {"like": "CD-P",  "label": "Président CD",   "group": "fonction", "first_only": False},
    "vp_cd":    {"like": "CD-VP", "label": "VP CD",          "group": "fonction", "first_only": False},
    "pres_cc":  {"like": "CC-P",  "label": "Président CC",   "group": "fonction", "first_only": False},
    "vp_cc":    {"like": "CC-VP", "label": "VP CC",          "group": "fonction", "first_only": False},
}


def sankey_options(annee: int = 20) -> dict:
    """Return selectable items grouped by mandat / fonction."""
    table = _get_table(annee)
    mandats = {k: v["label"] for k, v in SELECTABLE.items() if v["group"] == "mandat"}
    fonctions = {k: v["label"] for k, v in SELECTABLE.items() if v["group"] == "fonction"}
    return {"mandats": mandats, "fonctions": fonctions}


def _like_condition(item: dict) -> str:
    """Build a SQL condition matching a code in position_cumul_1.

    For short codes that could be substrings of others (D in CD, S in ...),
    we check if position_cumul_1 starts with the code or contains ' / code'.
    For longer codes (CM, CD, CC, CR and their variants), simple LIKE '%code%' works.
    """
    code = item["like"]
    if item.get("first_only"):
        # Short codes like D, S, RPE — always appear first in position_cumul_1
        return f"(position_cumul_1 LIKE '{code}' OR position_cumul_1 LIKE '{code} / %')"
    else:
        return f"position_cumul_1 LIKE '%{code}%'"


def _build_cumul_sql(keys: list[str]) -> tuple[str, str]:
    """Build SQL WHERE clause from selected keys using position_cumul_1.

    All selected items are ANDed: the person must have ALL selected mandats/fonctions.

    Returns (sql_condition, display_label).
    """
    items = [(k, SELECTABLE[k]) for k in keys if k in SELECTABLE]
    if not items:
        raise ValueError(f"Aucune sélection valide parmi : {keys}")

    # Each selection adds a LIKE condition, all ANDed
    conditions = [_like_condition(item) for _, item in items]
    sql = " AND ".join(conditions)

    # Display label
    labels = [SELECTABLE[k]["label"] for k in keys if k in SELECTABLE]
    display = " + ".join(labels) if len(labels) > 1 else labels[0]

    return sql, display


def stats_sankey(mandats: str = "cm", fonctions: str = "", annee: int = 20) -> dict:
    """Build Sankey: cumulants of selection → Candidat → Élu.

    Args:
        mandats: Comma-separated mandat keys (e.g. "cm,cd")
        fonctions: Comma-separated fonction keys (e.g. "maire,vp_cd")
        annee: 20 or 26
    """
    table = _get_table(annee)
    selected = _parse_selected(mandats, fonctions)

    cumul_sql, cumul_label = _build_cumul_sql(selected)
    is_cumul = len(selected) > 1

    sortant_label = f"Cumulant {cumul_label}" if is_cumul else f"{cumul_label} sortant"
    non_sortant_label = "Non cumulant" if is_cumul else f"Non {cumul_label}"

    # Stage 1: cumul status → candidature
    stage1 = _query(f"""
        SELECT
            CASE WHEN ({cumul_sql}) THEN '{sortant_label}' ELSE '{non_sortant_label}' END AS source,
            CASE WHEN statut_candidature != '0_noncandidat' THEN 'Candidat' ELSE 'Non candidat' END AS target,
            COUNT(*) AS value
        FROM {table}
        GROUP BY source, target
    """)

    # Stage 2: candidature → élu (only for the cumulants, not the whole population)
    stage2 = _query(f"""
        SELECT
            CASE WHEN statut_candidature != '0_noncandidat' THEN 'Candidat' ELSE 'Non candidat' END AS source,
            CASE WHEN elu_cm = 1 THEN 'Élu' ELSE 'Non élu' END AS target,
            COUNT(*) AS value
        FROM {table}
        WHERE ({cumul_sql})
        GROUP BY source, target
    """)

    # Build nodes
    labels = [sortant_label, non_sortant_label, "Candidat", "Non candidat", "Élu", "Non élu"]
    node_colors = ["#2ca02c", "#1f77b4", "#ff7f0e", "#9467bd", "#2ca02c", "#d62728"]
    label_to_idx = {l: i for i, l in enumerate(labels)}

    sources, targets, values = [], [], []
    for row in stage1 + stage2:
        src = label_to_idx.get(row["source"])
        tgt = label_to_idx.get(row["target"])
        if src is not None and tgt is not None and row["value"] > 0:
            sources.append(src)
            targets.append(tgt)
            values.append(row["value"])

    # Link colors
    link_colors = []
    for s, t in zip(sources, targets):
        if s == 0:
            link_colors.append("rgba(44, 160, 44, 0.5)")
        elif s == 1 and t == label_to_idx.get("Candidat"):
            link_colors.append("rgba(31, 119, 180, 0.5)")
        elif s == 1:
            link_colors.append("rgba(148, 103, 189, 0.5)")
        elif s == label_to_idx.get("Candidat") and t == label_to_idx.get("Élu"):
            link_colors.append("rgba(44, 160, 44, 0.5)")
        elif s == label_to_idx.get("Candidat"):
            link_colors.append("rgba(214, 39, 40, 0.5)")
        else:
            link_colors.append("rgba(148, 103, 189, 0.5)")

    title = f"Municipales 2020 — Cumul {cumul_label}" if is_cumul else f"Municipales 2020 — {cumul_label}"

    return {
        "labels": labels,
        "colors": node_colors,
        "source": sources,
        "target": targets,
        "value": values,
        "link_colors": link_colors,
        "title": title,
    }


def _parse_selected(mandats: str, fonctions: str) -> list[str]:
    """Parse comma-separated mandat/fonction keys into a validated list."""
    selected = []
    for k in mandats.split(","):
        k = k.strip()
        if k and k in SELECTABLE:
            selected.append(k)
    for k in fonctions.split(","):
        k = k.strip()
        if k and k in SELECTABLE:
            selected.append(k)
    return selected or ["cm"]


def _extract_mandats(cumul: str) -> set[str]:
    """Extract base mandats from a position_cumul string.

    'D / CM / CC / CD' → {'D', 'CM', 'CC', 'CD'}
    'CM-M / CC-VP / CD' → {'CM', 'CC', 'CD'}
    """
    result = set()
    for part in cumul.split(" / "):
        base = part.split("-")[0]  # CM-M → CM, CD-VP → CD
        result.add(base)
    return result


def stats_sankey_evolution(mandats: str = "cm", fonctions: str = "", annee: int = 20) -> dict:
    """Build Sankey showing mandate evolution: position_cumul_1 → position_cumul_2.

    For the selected population, shows which mandates they gained/lost/kept.
    """
    table = _get_table(annee)
    selected = _parse_selected(mandats, fonctions)
    cumul_sql, cumul_label = _build_cumul_sql(selected)

    # Get all persons matching the selection with both cumul positions
    rows = _query(f"""
        SELECT position_cumul_1, position_cumul_2
        FROM {table}
        WHERE ({cumul_sql})
          AND position_cumul_2 IS NOT NULL
    """)

    if not rows:
        return {
            "labels": [], "colors": [], "source": [], "target": [],
            "value": [], "link_colors": [], "title": f"Pas de données",
        }

    # Count transitions between base mandats
    # For each person: mandats before → mandats after
    mandat_order = ["D", "S", "RPE", "CR", "CD", "CC", "CM"]
    transitions: dict[tuple[str, str], int] = {}

    for row in rows:
        before = _extract_mandats(row["position_cumul_1"])
        after = _extract_mandats(row["position_cumul_2"])

        for m in mandat_order:
            was_in = m in before
            is_in = m in after
            if was_in and is_in:
                key = (f"{m} (avant)", f"{m} (après)")
                transitions[key] = transitions.get(key, 0) + 1
            elif was_in and not is_in:
                key = (f"{m} (avant)", f"Perd {m}")
                transitions[key] = transitions.get(key, 0) + 1
            elif not was_in and is_in:
                key = (f"Sans {m}", f"{m} (après)")
                transitions[key] = transitions.get(key, 0) + 1

    # Build unique labels
    all_labels = set()
    for src, tgt in transitions:
        all_labels.add(src)
        all_labels.add(tgt)

    # Order: avant labels, then après/perd labels
    avant_labels = sorted([l for l in all_labels if "(avant)" in l or l.startswith("Sans ")],
                          key=lambda x: mandat_order.index(x.split()[0].replace("Sans", "").strip()) if x.split()[0].replace("Sans", "").strip() in mandat_order else 99)
    apres_labels = sorted([l for l in all_labels if "(après)" in l or l.startswith("Perd ")],
                          key=lambda x: mandat_order.index(x.split()[0].replace("Perd", "").strip()) if x.split()[0].replace("Perd", "").strip() in mandat_order else 99)
    labels = avant_labels + apres_labels
    label_to_idx = {l: i for i, l in enumerate(labels)}

    # Colors
    mandat_colors = {
        "D": "#e74c3c", "S": "#9b59b6", "RPE": "#f39c12",
        "CR": "#3498db", "CD": "#2ecc71", "CC": "#1abc9c", "CM": "#e67e22",
    }

    def get_color(label: str) -> str:
        for m, c in mandat_colors.items():
            if m in label:
                return c
        return "#95a5a6"

    node_colors = [get_color(l) for l in labels]

    sources, targets, values, link_colors = [], [], [], []
    for (src, tgt), val in sorted(transitions.items(), key=lambda x: -x[1]):
        if val < 1:
            continue
        si = label_to_idx[src]
        ti = label_to_idx[tgt]
        sources.append(si)
        targets.append(ti)
        values.append(val)
        # Green for kept, red for lost, blue for gained
        if "Perd" in tgt:
            link_colors.append("rgba(231, 76, 60, 0.4)")
        elif "Sans" in src:
            link_colors.append("rgba(52, 152, 219, 0.4)")
        else:
            link_colors.append("rgba(46, 204, 113, 0.4)")

    is_cumul = len(selected) > 1
    title = f"Évolution des mandats — Cumul {cumul_label}" if is_cumul else f"Évolution des mandats — {cumul_label}"

    return {
        "labels": labels,
        "colors": node_colors,
        "source": sources,
        "target": targets,
        "value": values,
        "link_colors": link_colors,
        "title": title,
    }


ANCRAGE_CATEGORIES = {
    "depute":   {"sql": "(position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %')", "label": "Députés"},
    "senateur": {"sql": "(position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')", "label": "Sénateurs"},
    "rpe":      {"sql": "(position_cumul_1 LIKE 'RPE' OR position_cumul_1 LIKE 'RPE / %')", "label": "Représentants PE"},
    "cd":       {"sql": "position_cumul_1 LIKE '%CD%'", "label": "Conseillers départementaux"},
    "cr":       {"sql": "position_cumul_1 LIKE '%CR%'", "label": "Conseillers régionaux"},
}


def ancrage_options(annee: int = 20) -> dict:
    """Return available categories for the ancrage Sankey."""
    table = _get_table(annee)
    return {k: v["label"] for k, v in ANCRAGE_CATEGORIES.items()}


def stats_sankey_ancrage(categorie: str = "depute", annee: int = 20) -> dict:
    """Sankey: arbre de situations pour une catégorie d'élu.

    6 situations:
    - Sortant CM → Candidat → Réélu / Non réélu
    - Sortant CM → Non candidat
    - Non sortant → Candidat → Élu / Non élu
    - Non sortant → Non candidat
    """
    table = _get_table(annee)
    cat = ANCRAGE_CATEGORIES.get(categorie)
    if not cat:
        raise ValueError(f"Catégorie invalide: {categorie}. Choix: {list(ANCRAGE_CATEGORIES.keys())}")

    cat_sql = cat["sql"]
    cat_label = cat["label"]

    # Query all combinations
    rows = _query(f"""
        SELECT
            CASE WHEN position_cumul_1 LIKE '%CM%' THEN 'sortant' ELSE 'non_sortant' END AS sortant,
            CASE WHEN statut_candidature != '0_noncandidat' THEN 'candidat' ELSE 'non_candidat' END AS candidature,
            CASE WHEN elu_cm = 1 THEN 'elu' ELSE 'non_elu' END AS elu,
            COUNT(*) AS value
        FROM {table}
        WHERE {cat_sql}
        GROUP BY sortant, candidature, elu
    """)

    # Nodes
    labels = [
        f"Sortant CM",           # 0
        f"Non sortant",          # 1
        "Candidat (sortant)",    # 2
        "Non candidat (sort.)",  # 3
        "Candidat (nouveau)",    # 4
        "Non candidat (nouv.)",  # 5
        "Réélu",                 # 6
        "Non réélu",             # 7
        "Élu (nouveau)",         # 8
        "Non élu",               # 9
    ]
    node_colors = [
        "#2ecc71",  # Sortant CM - green
        "#3498db",  # Non sortant - blue
        "#f39c12",  # Candidat sortant - orange
        "#95a5a6",  # Non candidat sortant - gray
        "#e67e22",  # Candidat nouveau - dark orange
        "#bdc3c7",  # Non candidat nouveau - light gray
        "#27ae60",  # Réélu - dark green
        "#e74c3c",  # Non réélu - red
        "#2980b9",  # Élu nouveau - dark blue
        "#c0392b",  # Non élu - dark red
    ]

    sources, targets, values, link_colors = [], [], [], []

    for row in rows:
        s = row["sortant"]
        c = row["candidature"]
        e = row["elu"]
        v = row["value"]

        if s == "sortant":
            # Sortant CM → Candidat/Non candidat
            if c == "candidat":
                sources.append(0); targets.append(2); values.append(v)
                link_colors.append("rgba(46, 204, 113, 0.3)")
                # Candidat → Réélu/Non réélu
                if e == "elu":
                    sources.append(2); targets.append(6); values.append(v)
                    link_colors.append("rgba(39, 174, 96, 0.4)")
                else:
                    sources.append(2); targets.append(7); values.append(v)
                    link_colors.append("rgba(231, 76, 60, 0.4)")
            else:
                sources.append(0); targets.append(3); values.append(v)
                link_colors.append("rgba(149, 165, 166, 0.3)")
        else:
            # Non sortant → Candidat/Non candidat
            if c == "candidat":
                sources.append(1); targets.append(4); values.append(v)
                link_colors.append("rgba(52, 152, 219, 0.3)")
                # Candidat → Élu/Non élu
                if e == "elu":
                    sources.append(4); targets.append(8); values.append(v)
                    link_colors.append("rgba(41, 128, 185, 0.4)")
                else:
                    sources.append(4); targets.append(9); values.append(v)
                    link_colors.append("rgba(192, 57, 43, 0.4)")
            else:
                sources.append(1); targets.append(5); values.append(v)
                link_colors.append("rgba(189, 195, 199, 0.3)")

    total = sum(row["value"] for row in rows)
    title = f"Ancrage municipal — {cat_label} ({total})"

    return {
        "labels": labels,
        "colors": node_colors,
        "source": sources,
        "target": targets,
        "value": values,
        "link_colors": link_colors,
        "title": title,
    }


def stats_sankey_parlementaires(annee: int = 20) -> dict:
    """Sankey: parcours des parlementaires (D+S) vers les municipales.

    4 stages:
    1. Type de parlementaire (Député / Sénateur)
    2. Déjà CM ou nouveau → Candidat / Non candidat
    3. Candidat → Élu CM / Non élu
    4. Élu CM → Garde mandat parlementaire / Démissionnaire
    """
    table = _get_table(annee)
    # Stage 1→2: Parlementaire × statut CM → candidature
    stage1 = _query(f"""
        SELECT
            CASE
                WHEN position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %' THEN 'Député'
                ELSE 'Sénateur'
            END AS parl_type,
            CASE WHEN position_cumul_1 LIKE '%CM%' THEN 'Sortant CM' ELSE 'Nouveau' END AS cm_status,
            CASE WHEN statut_candidature != '0_noncandidat' THEN 'Candidat' ELSE 'Non candidat' END AS candidature,
            COUNT(*) AS value
        FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %')
           OR (position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
        GROUP BY parl_type, cm_status, candidature
    """)

    # Stage 2→3: Candidat → Élu/Non élu (only for parlementaires)
    stage2 = _query(f"""
        SELECT
            CASE WHEN position_cumul_1 LIKE '%CM%' THEN 'Sortant CM' ELSE 'Nouveau' END AS cm_status,
            CASE WHEN statut_candidature != '0_noncandidat' THEN 'Candidat' ELSE 'Non candidat' END AS candidature,
            CASE WHEN elu_cm = 1 THEN 'Élu CM' ELSE 'Non élu' END AS elu,
            COUNT(*) AS value
        FROM {table}
        WHERE ((position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %')
            OR (position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %'))
        GROUP BY cm_status, candidature, elu
    """)

    # Stage 3→4: Élu CM → garde ou lâche mandat parlementaire
    stage3 = _query(f"""
        SELECT
            CASE WHEN elu_cm = 1 THEN 'Élu CM' ELSE 'Non élu' END AS elu,
            CASE
                WHEN elu_cm = 1 AND mvmt_parlementaire = 'Démissionnaire' THEN 'Démissionnaire'
                WHEN elu_cm = 1 THEN 'Garde mandat'
                ELSE 'Reste sans CM'
            END AS outcome,
            COUNT(*) AS value
        FROM {table}
        WHERE ((position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %')
            OR (position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %'))
          AND statut_candidature != '0_noncandidat'
        GROUP BY elu, outcome
    """)

    # Build nodes
    labels = [
        "Député",             # 0
        "Sénateur",           # 1
        "Sortant CM",         # 2
        "Nouveau",            # 3
        "Candidat",           # 4
        "Non candidat",       # 5
        "Élu CM",             # 6
        "Non élu",            # 7
        "Garde mandat",       # 8
        "Démissionnaire",     # 9
    ]
    node_colors = [
        "#e74c3c",  # Député - red
        "#9b59b6",  # Sénateur - purple
        "#2ecc71",  # Sortant CM - green
        "#3498db",  # Nouveau - blue
        "#f39c12",  # Candidat - orange
        "#95a5a6",  # Non candidat - gray
        "#27ae60",  # Élu CM - dark green
        "#e74c3c",  # Non élu - red
        "#2ecc71",  # Garde mandat - green
        "#e67e22",  # Démissionnaire - dark orange
    ]
    idx = {l: i for i, l in enumerate(labels)}

    sources, targets, values, link_colors = [], [], [], []

    # Stage 1: Parlementaire → CM status (aggregate D+S separately into Sortant/Nouveau)
    # We need intermediate: D→Sortant CM, D→Nouveau, S→Sortant CM, S→Nouveau
    parl_cm: dict[tuple[str, str], int] = {}
    cm_cand: dict[tuple[str, str], int] = {}

    for row in stage1:
        key_pc = (row["parl_type"], row["cm_status"])
        parl_cm[key_pc] = parl_cm.get(key_pc, 0) + row["value"]
        key_cc = (row["cm_status"], row["candidature"])
        cm_cand[key_cc] = cm_cand.get(key_cc, 0) + row["value"]

    # Parlementaire → CM status
    for (parl, cm), val in parl_cm.items():
        sources.append(idx[parl])
        targets.append(idx[cm])
        values.append(val)
        link_colors.append("rgba(231, 76, 60, 0.3)" if parl == "Député" else "rgba(155, 89, 182, 0.3)")

    # CM status → Candidature
    for (cm, cand), val in cm_cand.items():
        sources.append(idx[cm])
        targets.append(idx[cand])
        values.append(val)
        link_colors.append("rgba(46, 204, 113, 0.3)" if cm == "Sortant CM" else "rgba(52, 152, 219, 0.3)")

    # Candidature → Élu
    cand_elu: dict[tuple[str, str], int] = {}
    for row in stage2:
        if row["candidature"] == "Non candidat":
            continue  # Non candidat doesn't flow to élu
        key = (row["candidature"], row["elu"])
        cand_elu[key] = cand_elu.get(key, 0) + row["value"]

    for (cand, elu), val in cand_elu.items():
        sources.append(idx[cand])
        targets.append(idx[elu])
        values.append(val)
        link_colors.append("rgba(39, 174, 96, 0.4)" if elu == "Élu CM" else "rgba(231, 76, 60, 0.3)")

    # Élu → Garde/Démissionnaire
    for row in stage3:
        if row["elu"] != "Élu CM":
            continue
        outcome = row["outcome"]
        if outcome not in idx:
            continue
        sources.append(idx["Élu CM"])
        targets.append(idx[outcome])
        values.append(row["value"])
        link_colors.append("rgba(230, 126, 34, 0.5)" if outcome == "Démissionnaire" else "rgba(46, 204, 113, 0.3)")

    return {
        "labels": labels,
        "colors": node_colors,
        "source": sources,
        "target": targets,
        "value": values,
        "link_colors": link_colors,
        "title": f"Parlementaires et municipales {'2026' if annee == 26 else '2020'} — Cumul & démissions",
    }


# ── Card 5: Cumul horizontal CR/CD ────────────────────────────────────

HORIZONTAL_CATEGORIES = {
    "cd": {
        "filter": "position_cumul_1 LIKE '%CD%' AND NOT (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %') AND NOT (position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')",
        "label": "Conseillers départementaux",
        "color": "#364fc7",
    },
    "cr": {
        "filter": "position_cumul_1 LIKE '%CR%' AND NOT (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %') AND NOT (position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')",
        "label": "Conseillers régionaux",
        "color": "#2f9e44",
    },
}


def horizontal_options(annee: int = 20) -> dict:
    """Return available categories for the horizontal Sankey with counts."""
    table = _get_table(annee)
    result = {}
    for key, cat in HORIZONTAL_CATEGORIES.items():
        rows = _query(f"SELECT COUNT(*) AS n FROM {table} WHERE {cat['filter']}")
        result[key] = {"label": cat["label"], "count": rows[0]["n"] if rows else 0}
    return result


def stats_sankey_horizontal(categorie: str = "cd", annee: int = 20) -> dict:
    """Sankey: ancrage horizontal pour CR ou CD (hors parlementaires).

    Stages:
    1. Sortant CM vs Non sortant CM
    2. Candidat vs Non candidat
    3. Élu vs Non élu
    """
    table = _get_table(annee)
    cat = HORIZONTAL_CATEGORIES.get(categorie)
    if not cat:
        raise ValueError(f"Catégorie invalide: {categorie}. Choix: {list(HORIZONTAL_CATEGORIES.keys())}")

    cat_sql = cat["filter"]
    cat_label = cat["label"]
    cat_color = cat["color"]

    rows = _query(f"""
        SELECT
            CASE WHEN position_cumul_1 LIKE '%CM%' THEN 'sortant' ELSE 'non_sortant' END AS sortant,
            CASE WHEN statut_candidature != '0_noncandidat' THEN 'candidat' ELSE 'non_candidat' END AS candidature,
            CASE WHEN elu_cm = 1 THEN 'elu' ELSE 'non_elu' END AS elu,
            COUNT(*) AS value
        FROM {table}
        WHERE {cat_sql}
        GROUP BY sortant, candidature, elu
    """)

    labels = [
        "Sortant CM",           # 0
        "Non sortant CM",       # 1
        "Candidat (sortant)",   # 2
        "Non candidat (sort.)", # 3
        "Candidat (nouveau)",   # 4
        "Non candidat (nouv.)", # 5
        "Réélu",                # 6
        "Non réélu",            # 7
        "Élu (nouveau)",        # 8
        "Non élu",              # 9
    ]
    node_colors = [
        "#fab005",  # Sortant CM
        "#868e96",  # Non sortant CM
        "#1971c2",  # Candidat sortant
        "#e03131",  # Non candidat sortant
        "#1971c2",  # Candidat nouveau
        "#e03131",  # Non candidat nouveau
        "#2f9e44",  # Réélu
        "#e03131",  # Non réélu
        "#2f9e44",  # Élu nouveau
        "#e03131",  # Non élu
    ]

    sources, targets, values, link_colors = [], [], [], []

    for row in rows:
        s = row["sortant"]
        c = row["candidature"]
        e = row["elu"]
        v = row["value"]

        if s == "sortant":
            if c == "candidat":
                sources.append(0); targets.append(2); values.append(v)
                link_colors.append("rgba(250, 176, 5, 0.3)")
                if e == "elu":
                    sources.append(2); targets.append(6); values.append(v)
                    link_colors.append("rgba(47, 158, 68, 0.4)")
                else:
                    sources.append(2); targets.append(7); values.append(v)
                    link_colors.append("rgba(224, 49, 49, 0.4)")
            else:
                sources.append(0); targets.append(3); values.append(v)
                link_colors.append("rgba(134, 142, 150, 0.3)")
        else:
            if c == "candidat":
                sources.append(1); targets.append(4); values.append(v)
                link_colors.append("rgba(134, 142, 150, 0.3)")
                if e == "elu":
                    sources.append(4); targets.append(8); values.append(v)
                    link_colors.append("rgba(47, 158, 68, 0.4)")
                else:
                    sources.append(4); targets.append(9); values.append(v)
                    link_colors.append("rgba(224, 49, 49, 0.4)")
            else:
                sources.append(1); targets.append(5); values.append(v)
                link_colors.append("rgba(134, 142, 150, 0.3)")

    total = sum(row["value"] for row in rows)
    title = f"Ancrage horizontal — {cat_label} ({total})"

    return {
        "labels": labels,
        "colors": node_colors,
        "source": sources,
        "target": targets,
        "value": values,
        "link_colors": link_colors,
        "title": title,
    }


# ── Card 6: Cumul de fonctions exécutives ────────────────────────────

def stats_fonctions_executives(annee: int = 20) -> dict:
    """Sankey: layers of executive functions accumulated by elected officials.

    3 layers:
    1. Mandat de base: CM, CM-M (maire), CM-A (adjoint)
    2. Communautaire: CC, CC-VP, CC-P, or none
    3. Départemental/Régional: CD, CR, and variants, or none
    """
    table = _get_table(annee)
    rows = _query(f"""
        SELECT position_cumul_2, COUNT(*) AS n
        FROM {table}
        WHERE position_cumul_2 LIKE '%CM%'
        GROUP BY 1 ORDER BY 2 DESC
    """)

    if not rows:
        return {
            "labels": [], "colors": [], "source": [], "target": [],
            "value": [], "link_colors": [], "title": "Pas de données",
        }

    # Parse each position_cumul_2 to extract layer values
    def _extract_layer(cumul: str, prefixes: list[str]) -> str | None:
        """Find the most specific match for a code prefix in a cumul string."""
        parts = [p.strip() for p in cumul.split(" / ")]
        for part in parts:
            for prefix in prefixes:
                if part == prefix or part.startswith(prefix + "-"):
                    return part
        return None

    # Count transitions between layers
    layer1_to_layer2: dict[tuple[str, str], int] = {}
    layer2_to_layer3: dict[tuple[str, str], int] = {}

    cm_prefixes = ["CM"]
    cc_prefixes = ["CC"]
    cd_cr_prefixes = ["CD", "CR"]

    for row in rows:
        cumul = row["position_cumul_2"]
        n = row["n"]

        # Layer 1: CM function
        cm_func = _extract_layer(cumul, cm_prefixes) or "CM"

        # Layer 2: CC function
        cc_func = _extract_layer(cumul, cc_prefixes)
        cc_label = cc_func if cc_func else "Sans interco"

        # Layer 3: CD/CR function
        cd_cr_func = _extract_layer(cumul, cd_cr_prefixes)
        cd_cr_label = cd_cr_func if cd_cr_func else "Sans CD/CR"

        key12 = (cm_func, cc_label)
        layer1_to_layer2[key12] = layer1_to_layer2.get(key12, 0) + n

        key23 = (cc_label, cd_cr_label)
        layer2_to_layer3[key23] = layer2_to_layer3.get(key23, 0) + n

    # Collect unique labels per layer
    layer1_labels = sorted(set(k[0] for k in layer1_to_layer2))
    layer2_labels = sorted(set(k[1] for k in layer1_to_layer2) | set(k[0] for k in layer2_to_layer3))
    layer3_labels = sorted(set(k[1] for k in layer2_to_layer3))

    all_labels = layer1_labels + layer2_labels + layer3_labels
    label_to_idx = {l: i for i, l in enumerate(all_labels)}

    # Colors
    def _node_color(label: str) -> str:
        if label.startswith("CM"):
            return "#1971c2"
        elif label.startswith("CC"):
            return "#e67700"
        elif label.startswith("CD") or label.startswith("CR"):
            return "#9c36b5"
        elif label == "Sans interco":
            return "#868e96"
        elif label == "Sans CD/CR":
            return "#868e96"
        return "#495057"

    node_colors = [_node_color(l) for l in all_labels]

    sources, targets, values, link_colors = [], [], [], []

    for (src, tgt), val in sorted(layer1_to_layer2.items(), key=lambda x: -x[1]):
        if val < 1:
            continue
        sources.append(label_to_idx[src])
        targets.append(label_to_idx[tgt])
        values.append(val)
        link_colors.append("rgba(25, 113, 194, 0.3)")  # blue

    for (src, tgt), val in sorted(layer2_to_layer3.items(), key=lambda x: -x[1]):
        if val < 1:
            continue
        sources.append(label_to_idx[src])
        targets.append(label_to_idx[tgt])
        values.append(val)
        link_colors.append("rgba(230, 119, 0, 0.3)")  # orange

    total = sum(row["n"] for row in rows)
    title = f"Cumul de fonctions exécutives — post-municipales 2020 ({total})"

    return {
        "labels": all_labels,
        "colors": node_colors,
        "source": sources,
        "target": targets,
        "value": values,
        "link_colors": link_colors,
        "title": title,
    }


# ── Card 7: Nuances politiques ───────────────────────────────────────

NUANCE_COLORS = {
    "LR": "#1971c2", "UMP": "#1971c2", "DVD": "#1971c2",
    "SOC": "#e03131", "DVG": "#e03131", "COM": "#e03131", "FI": "#e03131",
    "NUP": "#e03131", "UG": "#e03131", "VEC": "#e03131",
    "ENS": "#e67700", "REM": "#e67700", "MDM": "#e67700", "DLF": "#e67700",
    "UDI": "#fab005", "NC": "#fab005", "DVC": "#fab005", "UC": "#fab005",
    "RN": "#343a40", "FN": "#343a40", "EXD": "#343a40",
    "ECO": "#2f9e44", "REG": "#2f9e44",
}


def _nuance_color(nuance: str) -> str:
    """Get color for a nuance code, with fallback."""
    if nuance in NUANCE_COLORS:
        return NUANCE_COLORS[nuance]
    # Try prefix matching
    for prefix in ["LR", "UMP", "DVD", "SOC", "DVG", "COM", "FI", "NUP",
                    "ENS", "REM", "MDM", "UDI", "NC", "DVC", "RN", "FN",
                    "EXD", "ECO", "REG", "UG", "VEC", "UC", "DLF"]:
        if nuance.startswith(prefix):
            return NUANCE_COLORS[prefix]
    return "#868e96"


def nuances_options(annee: int = 20) -> dict:
    """Return available scopes for nuances croisées Sankey."""
    table = _get_table(annee)
    parlementaires_count = _query(f"""
        SELECT COUNT(*) AS n FROM {table}
        WHERE nuance_parlementaire IS NOT NULL AND nuance_municipale IS NOT NULL
          AND (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
               OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
    """)
    all_count = _query(f"""
        SELECT COUNT(*) AS n FROM {table}
        WHERE nuance_parlementaire IS NOT NULL AND nuance_municipale IS NOT NULL
    """)
    return {
        "parlementaires": {
            "label": "Parlementaires (D+S)",
            "count": parlementaires_count[0]["n"] if parlementaires_count else 0,
        },
        "all": {
            "label": "Tous les élus",
            "count": all_count[0]["n"] if all_count else 0,
        },
    }


def stats_nuances_croisees(scope: str = "parlementaires", annee: int = 20) -> dict:
    """Sankey: nuance_parlementaire → nuance_municipale.

    Args:
        scope: "parlementaires" (D+S only) or "all"
        annee: 20 or 26
    """
    table = _get_table(annee)
    if scope not in ("parlementaires", "all"):
        raise ValueError(f"Scope invalide: {scope}. Choix: parlementaires, all")

    scope_filter = ""
    if scope == "parlementaires":
        scope_filter = """
            AND (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
                 OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
        """

    rows = _query(f"""
        SELECT nuance_parlementaire, nuance_municipale, COUNT(*) AS n
        FROM {table}
        WHERE nuance_parlementaire IS NOT NULL AND nuance_municipale IS NOT NULL
          {scope_filter}
        GROUP BY 1, 2 ORDER BY 3 DESC
    """)

    if not rows:
        return {
            "labels": [], "colors": [], "source": [], "target": [],
            "value": [], "link_colors": [], "title": "Pas de données",
        }

    # Filter out small links
    rows = [r for r in rows if r["n"] >= 3]

    # Collect unique nuances
    parl_nuances = sorted(set(r["nuance_parlementaire"] for r in rows))
    mun_nuances = sorted(set(r["nuance_municipale"] for r in rows))

    # Build labels with prefixes to distinguish sides
    labels = [f"{n} (parl.)" for n in parl_nuances] + [f"{n} (mun.)" for n in mun_nuances]
    label_to_idx = {l: i for i, l in enumerate(labels)}

    node_colors = [_nuance_color(n) for n in parl_nuances] + [_nuance_color(n) for n in mun_nuances]

    sources, targets, values, link_colors = [], [], [], []
    for row in rows:
        src_label = f"{row['nuance_parlementaire']} (parl.)"
        tgt_label = f"{row['nuance_municipale']} (mun.)"
        if src_label in label_to_idx and tgt_label in label_to_idx:
            sources.append(label_to_idx[src_label])
            targets.append(label_to_idx[tgt_label])
            values.append(row["n"])
            # Use source nuance color with transparency
            color = _nuance_color(row["nuance_parlementaire"])
            # Convert hex to rgba
            r_val = int(color[1:3], 16)
            g_val = int(color[3:5], 16)
            b_val = int(color[5:7], 16)
            link_colors.append(f"rgba({r_val}, {g_val}, {b_val}, 0.35)")

    total = sum(values)
    scope_label = "Parlementaires" if scope == "parlementaires" else "Tous les élus"
    title = f"Nuances politiques croisées — {scope_label} ({total})"

    return {
        "labels": labels,
        "colors": node_colors,
        "source": sources,
        "target": targets,
        "value": values,
        "link_colors": link_colors,
        "title": title,
    }


def parlementaires_detail_options(annee: int = 20) -> dict:
    """Return available categories for the detailed parlementaires Sankey."""
    table = _get_table(annee)
    deputes = _query(f"SELECT COUNT(*) AS n FROM {table} WHERE position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'")
    senateurs = _query(f"SELECT COUNT(*) AS n FROM {table} WHERE position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %'")
    rpe = _query(f"SELECT COUNT(*) AS n FROM {table} WHERE position_cumul_1 LIKE 'RPE' OR position_cumul_1 LIKE 'RPE / %'")
    return {
        "depute": {"label": "Députés", "count": deputes[0]["n"]},
        "senateur": {"label": "Sénateurs", "count": senateurs[0]["n"]},
        "rpe": {"label": "Députés européens", "count": rpe[0]["n"]},
    }


def stats_sankey_parlementaires_detail(categorie: str = "depute", annee: int = 20) -> dict:
    """Sankey détaillé v2 : Parlementaire (D-CM/D) → Candidat CM → Élu CM → Fonction → Interco → Démission.

    19 nodes across 6 columns. Entry split by sortant CM status.
    Context-dependent labels per category (D/S/RPE).
    """
    valid = {"depute", "senateur", "rpe"}
    if categorie not in valid:
        raise ValueError(f"Catégorie invalide: {categorie}. Utiliser: {', '.join(valid)}")

    # Category config
    CAT_CONFIG = {
        "depute": {
            "where": "(position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %')",
            "title_cat": "Députés",
            "code": "D",
        },
        "senateur": {
            "where": "(position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')",
            "title_cat": "Sénateurs",
            "code": "S",
        },
        "rpe": {
            "where": "(position_cumul_1 LIKE 'RPE' OR position_cumul_1 LIKE 'RPE / %')",
            "title_cat": "Députés européens",
            "code": "RPE",
        },
    }
    table = _get_table(annee)
    cfg = CAT_CONFIG[categorie]
    where = cfg["where"]
    title_cat = cfg["title_cat"]
    code = cfg["code"]

    # Single enriched SQL query
    rows = _query(f"""
        SELECT
            CASE
                WHEN position_cumul_1 LIKE '%CM%' AND position_cumul_1 LIKE '%CC%' THEN 'with_cm_cc'
                WHEN position_cumul_1 LIKE '%CM%' THEN 'with_cm'
                ELSE 'without_cm'
            END AS entry_cm,
            CASE WHEN statut_candidature = '0_noncandidat' THEN 'non_candidat' ELSE 'candidat' END AS candidature,
            CASE
                WHEN statut_candidature = '0_noncandidat' THEN NULL
                WHEN elu_cm = 1 THEN 'elu'
                WHEN position_cumul_1 LIKE '%CM%' THEN 'non_reelu'
                ELSE 'non_elu'
            END AS resultat,
            CASE
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-M%' THEN 'maire'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-A%' THEN 'adjoint'
                WHEN elu_cm = 1 THEN 'cm_simple'
                ELSE NULL
            END AS fonction,
            CASE
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC-VP%' THEN 'vp_cc'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC-P%' THEN 'pdt_cc'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC%' THEN 'cc_simple'
                WHEN elu_cm = 1 THEN 'sans_interco'
                ELSE NULL
            END AS interco,
            CASE
                WHEN mvmt_parlementaire = 'Démissionnaire' THEN 'demission'
                WHEN elu_cm = 1 AND statut_cm_2 = 'Démissionnaire' THEN 'demission_cm'
                WHEN elu_cm = 1 THEN 'garde'
                ELSE NULL
            END AS outcome,
            CASE
                WHEN elu_cm = 1 AND (mvmt_parlementaire IS NULL OR mvmt_parlementaire != 'Démissionnaire') AND statut_cm_2 != 'Démissionnaire' AND position_cumul_2 LIKE '%CM%' AND position_cumul_2 LIKE '%CC%' THEN 'exit_cm_cc'
                WHEN elu_cm = 1 AND (mvmt_parlementaire IS NULL OR mvmt_parlementaire != 'Démissionnaire') AND (statut_cm_2 IS NULL OR statut_cm_2 != 'Démissionnaire') THEN 'exit_cm'
                ELSE NULL
            END AS exit_cm,
            COUNT(*) AS value
        FROM {table}
        WHERE {where}
        GROUP BY entry_cm, candidature, resultat, fonction, interco, outcome, exit_cm
    """)

    # Aggregate counts per dimension
    def _sum(rows, **filters):
        total = 0
        for r in rows:
            match = True
            for k, v in filters.items():
                if isinstance(v, (list, tuple)):
                    if r[k] not in v:
                        match = False
                        break
                elif r[k] != v:
                    match = False
                    break
            if match:
                total += r["value"]
        return total

    total = sum(r["value"] for r in rows)
    n_entry_cm_cc = _sum(rows, entry_cm="with_cm_cc")
    n_entry_cm = _sum(rows, entry_cm="with_cm")
    n_entry_no_cm = _sum(rows, entry_cm="without_cm")
    n_candidat = _sum(rows, candidature="candidat")
    n_non_candidat = _sum(rows, candidature="non_candidat")
    n_elu = _sum(rows, resultat="elu")
    n_non_elu = _sum(rows, resultat="non_elu")
    n_non_reelu = _sum(rows, resultat="non_reelu")
    n_cm_simple = _sum(rows, fonction="cm_simple")
    n_adjoint = _sum(rows, fonction="adjoint")
    n_maire = _sum(rows, fonction="maire")
    # En 2026, les CC n'ont pas encore statué → sauter l'étape interco
    skip_interco = (annee == 26)

    if skip_interco:
        n_cc_simple = 0
        n_vp_cc = 0
        n_pdt_cc = 0
        n_sans_interco = 0
    else:
        n_cc_simple = _sum(rows, interco="cc_simple")
        n_vp_cc = _sum(rows, interco="vp_cc")
        n_pdt_cc = _sum(rows, interco="pdt_cc")
        n_sans_interco = _sum(rows, interco="sans_interco")
    n_garde_cm_cc = _sum(rows, outcome="garde", exit_cm="exit_cm_cc")
    n_garde_cm = _sum(rows, outcome="garde", exit_cm="exit_cm")
    n_demission = _sum(rows, outcome="demission")
    n_demission_cm = _sum(rows, outcome="demission_cm")

    # Helper to format label with count — hide empty nodes for fixed arrangement
    def _lc(label, count):
        return f"{label} ({count})" if count > 0 else ""

    # 19 nodes — context-dependent labels (3 entry, 4 exit)
    node_keys = [
        "entry_with_cm_cc", "entry_with_cm", "entry_without_cm",
        "candidat_cm", "non_candidat_cm",
        "elu_cm", "non_elu_cm", "non_reelu_cm",
        "cm_simple", "adjoint", "maire",
        "cc_simple", "vp_cc", "pdt_cc", "sans_interco",
        "garde_cm_cc", "garde_cm", "demission", "demission_cm",
    ]
    labels = [
        _lc(f"{code}-CM-CC", n_entry_cm_cc),     # 0
        _lc(f"{code}-CM", n_entry_cm),            # 1
        _lc(code, n_entry_no_cm),                 # 2
        _lc("Candidat CM", n_candidat),           # 3
        _lc("Non candidat CM", n_non_candidat),   # 4
        _lc("Élu mun.", n_elu),                    # 5
        _lc("Non élu mun.", n_non_elu),            # 6
        _lc("Non réélu mun.", n_non_reelu),        # 7
        _lc("CM", n_cm_simple),                    # 8
        _lc("Adjoint", n_adjoint),                 # 9
        _lc("Maire", n_maire),                     # 10
        _lc("CC", n_cc_simple),                    # 11
        _lc("VP CC", n_vp_cc),                     # 12
        _lc("Pdt CC", n_pdt_cc),                   # 13
        _lc("Sans interco", n_sans_interco),       # 14
        _lc(f"{code}-CM-CC", n_garde_cm_cc),       # 15
        _lc(f"{code}-CM", n_garde_cm),             # 16
        _lc(f"Démission {code}", n_demission),     # 17
        _lc("Démission CM", n_demission_cm),       # 18
    ]
    base_colors = [
        "#2b3a8f",  # 0 entry_with_cm_cc
        "#364fc7",  # 1 entry_with_cm
        "#5c7cfa",  # 2 entry_without_cm
        "#e67700",  # 3 candidat_cm
        "#868e96",  # 4 non_candidat_cm
        "#1971c2",  # 5 elu_cm
        "#e03131",  # 6 non_elu_cm
        "#c92a2a",  # 7 non_reelu_cm
        "#1098ad",  # 8 cm_simple
        "#74b816",  # 9 adjoint
        "#2f9e44",  # 10 maire
        "#0ca678",  # 11 cc_simple
        "#12b886",  # 12 vp_cc
        "#087f5b",  # 13 pdt_cc
        "#adb5bd",  # 14 sans_interco
        "#1B3A5C",  # 15 garde_cm_cc — marine
        "#7C2D4A",  # 16 garde_cm — bordeaux
        "#d9480f",  # 17 demission parlementaire
        "#e8590c",  # 18 demission_cm — orange clair
    ]
    counts = [n_entry_cm_cc, n_entry_cm, n_entry_no_cm, n_candidat, n_non_candidat,
              n_elu, n_non_elu, n_non_reelu, n_cm_simple, n_adjoint, n_maire,
              n_cc_simple, n_vp_cc, n_pdt_cc, n_sans_interco, n_garde_cm_cc, n_garde_cm, n_demission, n_demission_cm]
    colors = list(base_colors)
    if skip_interco:
        x_pos = [0.001, 0.001, 0.001, 0.20, 0.20, 0.40, 0.40, 0.40, 0.65, 0.65, 0.65, 0.72, 0.72, 0.72, 0.72, 0.999, 0.999, 0.999, 0.999]
    else:
        x_pos = [0.001, 0.001, 0.001, 0.15, 0.15, 0.32, 0.32, 0.32, 0.50, 0.50, 0.50, 0.72, 0.72, 0.72, 0.72, 0.999, 0.999, 0.999, 0.999]
    # y positions: dynamically compute so first node of each column aligns at top
    # Plotly Sankey y positions represent the vertical CENTER of the node, and
    # node height is proportional to its value relative to the total.
    # To align tops, offset y = base + (height/2), where height ~ count/max_col_total.
    total = max(sum(counts[i] for i in col if counts[i] > 0) for col in [
        [0, 1, 2], [3, 4], [5, 6, 7], [8, 9, 10], [11, 12, 13, 14], [15, 16, 17, 18]
    ]) or 1
    TOP_Y = 0.08  # desired top edge for first node in each column
    SPAN = 0.70   # usable vertical space (0..1 range, leave margins)
    PAD_FRAC = 0.06  # gap between nodes as fraction of total span

    def _col_y(indices, extra_pad=0.0):
        """Compute y positions for nodes in a column, top-aligned."""
        active = [(i, counts[i]) for i in indices if counts[i] > 0]
        if not active:
            return {i: 0.5 for i in indices}
        col_total = sum(c for _, c in active)
        pad = PAD_FRAC + extra_pad
        positions = {}
        cursor = TOP_Y
        for idx, cnt in active:
            node_h = (cnt / total) * SPAN
            positions[idx] = cursor + node_h / 2  # y = center of node
            cursor += node_h + pad
        # Inactive nodes: put offscreen
        for i in indices:
            if i not in positions:
                positions[i] = 0.99
        return positions

    columns = [[0, 1, 2], [3, 4], [5, 6, 7], [8, 9, 10], [11, 12, 13, 14], [15, 16, 17, 18]]
    # Extra padding for first column (3 entry nodes need more separation)
    col_extra_pad = [0.06, 0.08, 0.0, 0.0, 0.0, 0.0]
    y_map = {}
    for col, extra in zip(columns, col_extra_pad):
        y_map.update(_col_y(col, extra_pad=extra))
    y_pos = [max(0.001, min(0.999, y_map[i])) for i in range(19)]

    # Build links with original 18-node indices
    raw_links: list[tuple[int, int, int, str]] = []

    def _add_link(src_idx, tgt_idx, val, color):
        if val > 0:
            raw_links.append((src_idx, tgt_idx, val, color))

    # Stage 0: Entry → Candidature (6 links max)
    _add_link(0, 3, _sum(rows, entry_cm="with_cm_cc", candidature="candidat"), "rgba(43,58,143,0.3)")
    _add_link(0, 4, _sum(rows, entry_cm="with_cm_cc", candidature="non_candidat"), "rgba(134,142,150,0.3)")
    _add_link(1, 3, _sum(rows, entry_cm="with_cm", candidature="candidat"), "rgba(54,79,199,0.3)")
    _add_link(1, 4, _sum(rows, entry_cm="with_cm", candidature="non_candidat"), "rgba(134,142,150,0.3)")
    _add_link(2, 3, _sum(rows, entry_cm="without_cm", candidature="candidat"), "rgba(92,124,250,0.3)")
    _add_link(2, 4, _sum(rows, entry_cm="without_cm", candidature="non_candidat"), "rgba(134,142,150,0.25)")

    # Stage 1: Candidature → Résultat (3 links)
    _add_link(3, 5, n_elu, "rgba(25,113,194,0.3)")
    _add_link(3, 6, n_non_elu, "rgba(224,49,49,0.3)")
    _add_link(3, 7, n_non_reelu, "rgba(201,42,42,0.35)")

    # Stage 2: Élu CM → Fonction municipale (3 links)
    _add_link(5, 8, n_cm_simple, "rgba(16,152,173,0.3)")
    _add_link(5, 9, n_adjoint, "rgba(116,184,22,0.35)")
    _add_link(5, 10, n_maire, "rgba(47,158,68,0.4)")

    if skip_interco:
        # 2026 : Fonction → Issue directement (pas d'interco)
        for fct, fct_idx in [("cm_simple", 8), ("adjoint", 9), ("maire", 10)]:
            _add_link(fct_idx, 15, _sum(rows, fonction=fct, outcome="garde", exit_cm="exit_cm_cc"), "rgba(27,58,92,0.3)")
            _add_link(fct_idx, 16, _sum(rows, fonction=fct, outcome="garde", exit_cm="exit_cm"), "rgba(124,45,74,0.3)")
            _add_link(fct_idx, 17, _sum(rows, fonction=fct, outcome="demission"), "rgba(217,72,15,0.5)")
            _add_link(fct_idx, 18, _sum(rows, fonction=fct, outcome="demission_cm"), "rgba(232,89,12,0.45)")
    else:
        # Stage 3: Fonction → Interco (3 fonctions × 4 interco = 12 links max)
        for fct, fct_idx in [("cm_simple", 8), ("adjoint", 9), ("maire", 10)]:
            _add_link(fct_idx, 11, _sum(rows, fonction=fct, interco="cc_simple"), "rgba(12,166,120,0.3)")
            _add_link(fct_idx, 12, _sum(rows, fonction=fct, interco="vp_cc"), "rgba(18,184,134,0.35)")
            _add_link(fct_idx, 13, _sum(rows, fonction=fct, interco="pdt_cc"), "rgba(8,127,91,0.4)")
            _add_link(fct_idx, 14, _sum(rows, fonction=fct, interco="sans_interco"), "rgba(173,181,189,0.25)")

        # Stage 4: Interco → Issue (4 interco × 4 outcomes = 16 links max)
        for ico, ico_idx in [("cc_simple", 11), ("vp_cc", 12), ("pdt_cc", 13), ("sans_interco", 14)]:
            _add_link(ico_idx, 15, _sum(rows, interco=ico, outcome="garde", exit_cm="exit_cm_cc"), "rgba(27,58,92,0.3)")
            _add_link(ico_idx, 16, _sum(rows, interco=ico, outcome="garde", exit_cm="exit_cm"), "rgba(124,45,74,0.3)")
            _add_link(ico_idx, 17, _sum(rows, interco=ico, outcome="demission"), "rgba(217,72,15,0.5)")
            _add_link(ico_idx, 18, _sum(rows, interco=ico, outcome="demission_cm"), "rgba(232,89,12,0.45)")

    # ── Strip empty nodes so Plotly respects x positions ──
    # Identify which nodes are used (appear in at least one link)
    used = set()
    for s, t, _, _ in raw_links:
        used.add(s)
        used.add(t)

    # Keep only used nodes — build old→new index mapping
    keep = sorted(used)
    old_to_new = {old: new for new, old in enumerate(keep)}

    out_labels = [labels[i] for i in keep]
    out_colors = [colors[i] for i in keep]
    out_x = [x_pos[i] for i in keep]
    out_y = [y_pos[i] for i in keep]
    out_keys = [node_keys[i] for i in keep]

    sources = [old_to_new[s] for s, _, _, _ in raw_links]
    targets = [old_to_new[t] for _, t, _, _ in raw_links]
    values_out = [v for _, _, v, _ in raw_links]
    link_colors = [c for _, _, _, c in raw_links]

    annee_label = "2026" if annee == 26 else "2020"
    if skip_interco:
        annotations = [
            {"x": 0, "text": "Position d'entrée"},
            {"x": 0.20, "text": "Candidature"},
            {"x": 0.40, "text": "Résultat"},
            {"x": 0.65, "text": "Fonction exécutive"},
            {"x": 1.0, "text": "Position sortie"},
        ]
        title = f"{title_cat} — Municipales {annee_label} : position d'entrée → candidature → fonction exécutive → position sortie"
    else:
        annotations = [
            {"x": 0, "text": "Position d'entrée"},
            {"x": 0.15, "text": "Candidature"},
            {"x": 0.32, "text": "Résultat"},
            {"x": 0.50, "text": "Fonction exécutive"},
            {"x": 0.72, "text": "Fonction interco"},
            {"x": 1.0, "text": "Position sortie"},
        ]
        title = f"{title_cat} — Municipales {annee_label} : position d'entrée → candidature → fonction exécutive → fonction interco → position sortie"

    return {
        "labels": out_labels,
        "colors": out_colors,
        "x": out_x,
        "y": out_y,
        "source": sources,
        "target": targets,
        "value": values_out,
        "link_colors": link_colors,
        "title": title,
        "node_keys": out_keys,
        "annotations": annotations,
    }


def stats_sankey_tracabilite(categorie: str = "depute", annee: int = 20) -> dict:
    """Sankey with origin-colored flows: track D-CM vs D throughout the entire diagram.

    Same 19 nodes as stats_sankey_parlementaires_detail, but every link from
    Stage 1 onward is split by entry_cm origin so flows can be visually traced.
    """
    table = _get_table(annee)
    valid = {"depute", "senateur", "rpe"}
    if categorie not in valid:
        raise ValueError(f"Catégorie invalide: {categorie}. Utiliser: {', '.join(valid)}")

    CAT_CONFIG = {
        "depute": {
            "where": "(position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %')",
            "title_cat": "Députés",
            "code": "D",
        },
        "senateur": {
            "where": "(position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')",
            "title_cat": "Sénateurs",
            "code": "S",
        },
        "rpe": {
            "where": "(position_cumul_1 LIKE 'RPE' OR position_cumul_1 LIKE 'RPE / %')",
            "title_cat": "Députés européens",
            "code": "RPE",
        },
    }
    cfg = CAT_CONFIG[categorie]
    where = cfg["where"]
    title_cat = cfg["title_cat"]
    code = cfg["code"]

    rows = _query(f"""
        SELECT
            CASE
                WHEN position_cumul_1 LIKE '%CM%' AND position_cumul_1 LIKE '%CC%' THEN 'with_cm_cc'
                WHEN position_cumul_1 LIKE '%CM%' THEN 'with_cm'
                ELSE 'without_cm'
            END AS entry_cm,
            CASE WHEN statut_candidature = '0_noncandidat' THEN 'non_candidat' ELSE 'candidat' END AS candidature,
            CASE
                WHEN statut_candidature = '0_noncandidat' THEN NULL
                WHEN elu_cm = 1 THEN 'elu'
                WHEN position_cumul_1 LIKE '%CM%' THEN 'non_reelu'
                ELSE 'non_elu'
            END AS resultat,
            CASE
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-M%' THEN 'maire'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-A%' THEN 'adjoint'
                WHEN elu_cm = 1 THEN 'cm_simple'
                ELSE NULL
            END AS fonction,
            CASE
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC-VP%' THEN 'vp_cc'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC-P%' THEN 'pdt_cc'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC%' THEN 'cc_simple'
                WHEN elu_cm = 1 THEN 'sans_interco'
                ELSE NULL
            END AS interco,
            CASE
                WHEN mvmt_parlementaire = 'Démissionnaire' THEN 'demission'
                WHEN elu_cm = 1 AND statut_cm_2 = 'Démissionnaire' THEN 'demission_cm'
                WHEN elu_cm = 1 THEN 'garde'
                ELSE NULL
            END AS outcome,
            CASE
                WHEN elu_cm = 1 AND (mvmt_parlementaire IS NULL OR mvmt_parlementaire != 'Démissionnaire') AND (statut_cm_2 IS NULL OR statut_cm_2 != 'Démissionnaire') AND position_cumul_2 LIKE '%CM%' AND position_cumul_2 LIKE '%CC%' THEN 'exit_cm_cc'
                WHEN elu_cm = 1 AND (mvmt_parlementaire IS NULL OR mvmt_parlementaire != 'Démissionnaire') AND (statut_cm_2 IS NULL OR statut_cm_2 != 'Démissionnaire') THEN 'exit_cm'
                ELSE NULL
            END AS exit_cm,
            COUNT(*) AS value
        FROM {table}
        WHERE {where}
        GROUP BY entry_cm, candidature, resultat, fonction, interco, outcome, exit_cm
    """)

    def _sum(rows, **filters):
        total = 0
        for r in rows:
            match = True
            for k, v in filters.items():
                if r[k] != v:
                    match = False
                    break
            if match:
                total += r["value"]
        return total

    # Aggregate counts (same as parlementaires_detail)
    n_entry_cm_cc = _sum(rows, entry_cm="with_cm_cc")
    n_entry_cm = _sum(rows, entry_cm="with_cm")
    n_entry_no_cm = _sum(rows, entry_cm="without_cm")
    n_candidat = _sum(rows, candidature="candidat")
    n_non_candidat = _sum(rows, candidature="non_candidat")
    n_elu = _sum(rows, resultat="elu")
    n_non_elu = _sum(rows, resultat="non_elu")
    n_non_reelu = _sum(rows, resultat="non_reelu")
    n_cm_simple = _sum(rows, fonction="cm_simple")
    n_adjoint = _sum(rows, fonction="adjoint")
    n_maire = _sum(rows, fonction="maire")
    # En 2026, les CC n'ont pas encore statué → sauter l'étape interco
    skip_interco = (annee == 26)

    if skip_interco:
        n_cc_simple = 0
        n_vp_cc = 0
        n_pdt_cc = 0
        n_sans_interco = 0
    else:
        n_cc_simple = _sum(rows, interco="cc_simple")
        n_vp_cc = _sum(rows, interco="vp_cc")
        n_pdt_cc = _sum(rows, interco="pdt_cc")
        n_sans_interco = _sum(rows, interco="sans_interco")
    n_garde_cm_cc = _sum(rows, outcome="garde", exit_cm="exit_cm_cc")
    n_garde_cm = _sum(rows, outcome="garde", exit_cm="exit_cm")
    n_demission = _sum(rows, outcome="demission")
    n_demission_cm = _sum(rows, outcome="demission_cm")

    def _lc(label, count):
        return f"{label} ({count})" if count > 0 else ""

    node_keys = [
        "entry_with_cm_cc", "entry_with_cm", "entry_without_cm",
        "candidat_cm", "non_candidat_cm",
        "elu_cm", "non_elu_cm", "non_reelu_cm",
        "cm_simple", "adjoint", "maire",
        "cc_simple", "vp_cc", "pdt_cc", "sans_interco",
        "garde_cm_cc", "garde_cm", "demission", "demission_cm",
    ]
    labels = [
        _lc(f"{code}-CM-CC", n_entry_cm_cc),     # 0
        _lc(f"{code}-CM", n_entry_cm),            # 1
        _lc(code, n_entry_no_cm),                 # 2
        _lc("Candidat CM", n_candidat),           # 3
        _lc("Non candidat CM", n_non_candidat),   # 4
        _lc("Élu mun.", n_elu),                    # 5
        _lc("Non élu mun.", n_non_elu),            # 6
        _lc("Non réélu mun.", n_non_reelu),        # 7
        _lc("CM", n_cm_simple),                    # 8
        _lc("Adjoint", n_adjoint),                 # 9
        _lc("Maire", n_maire),                     # 10
        _lc("CC", n_cc_simple),                    # 11
        _lc("VP CC", n_vp_cc),                     # 12
        _lc("Pdt CC", n_pdt_cc),                   # 13
        _lc("Sans interco", n_sans_interco),       # 14
        _lc(f"{code}-CM-CC", n_garde_cm_cc),       # 15
        _lc(f"{code}-CM", n_garde_cm),             # 16
        _lc(f"Démission {code}", n_demission),     # 17
        _lc("Démission CM", n_demission_cm),       # 18
    ]
    base_colors = [
        "#2b3a8f",  # 0 entry_with_cm_cc
        "#364fc7",  # 1 entry_with_cm
        "#5c7cfa",  # 2 entry_without_cm
        "#e67700",  # 3 candidat_cm
        "#868e96",  # 4 non_candidat_cm
        "#1971c2",  # 5 elu_cm
        "#e03131",  # 6 non_elu_cm
        "#c92a2a",  # 7 non_reelu_cm
        "#1098ad",  # 8 cm_simple
        "#74b816",  # 9 adjoint
        "#2f9e44",  # 10 maire
        "#0ca678",  # 11 cc_simple
        "#12b886",  # 12 vp_cc
        "#087f5b",  # 13 pdt_cc
        "#adb5bd",  # 14 sans_interco
        "#1B3A5C",  # 15 garde_cm_cc — marine
        "#7C2D4A",  # 16 garde_cm — bordeaux
        "#d9480f",  # 17 demission parlementaire
        "#e8590c",  # 18 demission_cm — orange clair
    ]
    counts = [n_entry_cm_cc, n_entry_cm, n_entry_no_cm, n_candidat, n_non_candidat,
              n_elu, n_non_elu, n_non_reelu, n_cm_simple, n_adjoint, n_maire,
              n_cc_simple, n_vp_cc, n_pdt_cc, n_sans_interco, n_garde_cm_cc, n_garde_cm, n_demission, n_demission_cm]
    colors = list(base_colors)
    if skip_interco:
        x_pos = [0.001, 0.001, 0.001, 0.20, 0.20, 0.40, 0.40, 0.40, 0.65, 0.65, 0.65, 0.72, 0.72, 0.72, 0.72, 0.999, 0.999, 0.999, 0.999]
    else:
        x_pos = [0.001, 0.001, 0.001, 0.15, 0.15, 0.32, 0.32, 0.32, 0.50, 0.50, 0.50, 0.72, 0.72, 0.72, 0.72, 0.999, 0.999, 0.999, 0.999]

    # Dynamic y positions (same algorithm as parlementaires_detail)
    total_max = max(sum(counts[i] for i in col if counts[i] > 0) for col in [
        [0, 1, 2], [3, 4], [5, 6, 7], [8, 9, 10], [11, 12, 13, 14], [15, 16, 17, 18]
    ]) or 1
    TOP_Y = 0.08
    SPAN = 0.70
    PAD_FRAC = 0.06

    def _col_y(indices, extra_pad=0.0):
        active = [(i, counts[i]) for i in indices if counts[i] > 0]
        if not active:
            return {i: 0.5 for i in indices}
        pad = PAD_FRAC + extra_pad
        positions = {}
        cursor = TOP_Y
        for idx, cnt in active:
            node_h = (cnt / total_max) * SPAN
            positions[idx] = cursor + node_h / 2
            cursor += node_h + pad
        for i in indices:
            if i not in positions:
                positions[i] = 0.99
        return positions

    columns = [[0, 1, 2], [3, 4], [5, 6, 7], [8, 9, 10], [11, 12, 13, 14], [15, 16, 17, 18]]
    col_extra_pad = [0.06, 0.08, 0.0, 0.0, 0.0, 0.0]
    y_map = {}
    for col, extra in zip(columns, col_extra_pad):
        y_map.update(_col_y(col, extra_pad=extra))
    y_pos = [max(0.001, min(0.999, y_map[i])) for i in range(19)]

    # ── Build links with origin-colored flows ──
    raw_links: list[tuple[int, int, int, str]] = []

    def _add_link(src_idx, tgt_idx, val, color):
        if val > 0:
            raw_links.append((src_idx, tgt_idx, val, color))

    # Origin color palette — 3 origins
    COLOR_CM_CC = "rgba(27,58,92,0.40)"     # marine (#1B3A5C) — ex-CM+CC
    COLOR_CM = "rgba(124,45,74,0.40)"      # bordeaux (#7C2D4A) — ex-CM only
    COLOR_NO_CM = "rgba(184,134,11,0.40)"   # ambre (#B8860B) — sans CM
    COLOR_GRAY = "rgba(156,163,175,0.22)"   # cool gray (#9ca3af) — non-candidat

    # Stage 0: Entry → Candidature (6 links)
    _add_link(0, 3, _sum(rows, entry_cm="with_cm_cc", candidature="candidat"), COLOR_CM_CC)
    _add_link(0, 4, _sum(rows, entry_cm="with_cm_cc", candidature="non_candidat"), COLOR_GRAY)
    _add_link(1, 3, _sum(rows, entry_cm="with_cm", candidature="candidat"), COLOR_CM)
    _add_link(1, 4, _sum(rows, entry_cm="with_cm", candidature="non_candidat"), COLOR_GRAY)
    _add_link(2, 3, _sum(rows, entry_cm="without_cm", candidature="candidat"), COLOR_NO_CM)
    _add_link(2, 4, _sum(rows, entry_cm="without_cm", candidature="non_candidat"), COLOR_GRAY)

    # Stages 1-4: every link split by origin
    ORIGINS = [("with_cm_cc", COLOR_CM_CC), ("with_cm", COLOR_CM), ("without_cm", COLOR_NO_CM)]

    for entry, color in ORIGINS:
        # Stage 1: Candidature → Résultat
        _add_link(3, 5, _sum(rows, entry_cm=entry, candidature="candidat", resultat="elu"), color)
        _add_link(3, 6, _sum(rows, entry_cm=entry, candidature="candidat", resultat="non_elu"), color)
        _add_link(3, 7, _sum(rows, entry_cm=entry, candidature="candidat", resultat="non_reelu"), color)

        # Stage 2: Élu → Fonction
        _add_link(5, 8, _sum(rows, entry_cm=entry, resultat="elu", fonction="cm_simple"), color)
        _add_link(5, 9, _sum(rows, entry_cm=entry, resultat="elu", fonction="adjoint"), color)
        _add_link(5, 10, _sum(rows, entry_cm=entry, resultat="elu", fonction="maire"), color)

        if skip_interco:
            # 2026 : Fonction → Issue directement
            for fct, fct_idx in [("cm_simple", 8), ("adjoint", 9), ("maire", 10)]:
                _add_link(fct_idx, 15, _sum(rows, entry_cm=entry, fonction=fct, outcome="garde", exit_cm="exit_cm_cc"), color)
                _add_link(fct_idx, 16, _sum(rows, entry_cm=entry, fonction=fct, outcome="garde", exit_cm="exit_cm"), color)
                _add_link(fct_idx, 17, _sum(rows, entry_cm=entry, fonction=fct, outcome="demission"), color)
                _add_link(fct_idx, 18, _sum(rows, entry_cm=entry, fonction=fct, outcome="demission_cm"), color)
        else:
            # Stage 3: Fonction → Interco
            for fct, fct_idx in [("cm_simple", 8), ("adjoint", 9), ("maire", 10)]:
                _add_link(fct_idx, 11, _sum(rows, entry_cm=entry, fonction=fct, interco="cc_simple"), color)
                _add_link(fct_idx, 12, _sum(rows, entry_cm=entry, fonction=fct, interco="vp_cc"), color)
                _add_link(fct_idx, 13, _sum(rows, entry_cm=entry, fonction=fct, interco="pdt_cc"), color)
                _add_link(fct_idx, 14, _sum(rows, entry_cm=entry, fonction=fct, interco="sans_interco"), color)

            # Stage 4: Interco → Sortie
            for ico, ico_idx in [("cc_simple", 11), ("vp_cc", 12), ("pdt_cc", 13), ("sans_interco", 14)]:
                _add_link(ico_idx, 15, _sum(rows, entry_cm=entry, interco=ico, outcome="garde", exit_cm="exit_cm_cc"), color)
                _add_link(ico_idx, 16, _sum(rows, entry_cm=entry, interco=ico, outcome="garde", exit_cm="exit_cm"), color)
                _add_link(ico_idx, 17, _sum(rows, entry_cm=entry, interco=ico, outcome="demission"), color)
                _add_link(ico_idx, 18, _sum(rows, entry_cm=entry, interco=ico, outcome="demission_cm"), color)

    # ── Strip empty nodes ──
    used = set()
    for s, t, _, _ in raw_links:
        used.add(s)
        used.add(t)

    keep = sorted(used)
    old_to_new = {old: new for new, old in enumerate(keep)}

    out_labels = [labels[i] for i in keep]
    out_colors = [colors[i] for i in keep]
    out_x = [x_pos[i] for i in keep]
    out_y = [y_pos[i] for i in keep]
    out_keys = [node_keys[i] for i in keep]

    sources = [old_to_new[s] for s, _, _, _ in raw_links]
    targets = [old_to_new[t] for _, t, _, _ in raw_links]
    values_out = [v for _, _, v, _ in raw_links]
    link_colors = [c for _, _, _, c in raw_links]

    # Map link colors to origin keys for click filtering
    _color_to_origin = {
        COLOR_CM_CC: "with_cm_cc",
        COLOR_CM: "with_cm",
        COLOR_NO_CM: "without_cm",
        COLOR_GRAY: None,  # non-candidat — no origin filter
    }
    link_origins = [_color_to_origin.get(c) for _, _, _, c in raw_links]

    annee_label = "2026" if annee == 26 else "2020"
    if skip_interco:
        annotations = [
            {"x": 0, "text": "Position d'entrée"},
            {"x": 0.20, "text": "Candidature"},
            {"x": 0.40, "text": "Résultat"},
            {"x": 0.65, "text": "Fonction exécutive"},
            {"x": 1.0, "text": "Position sortie"},
        ]
    else:
        annotations = [
            {"x": 0, "text": "Position d'entrée"},
            {"x": 0.15, "text": "Candidature"},
            {"x": 0.32, "text": "Résultat"},
            {"x": 0.50, "text": "Fonction exécutive"},
            {"x": 0.72, "text": "Fonction interco"},
            {"x": 1.0, "text": "Position sortie"},
        ]

    return {
        "labels": out_labels,
        "colors": out_colors,
        "x": out_x,
        "y": out_y,
        "source": sources,
        "target": targets,
        "value": values_out,
        "link_colors": link_colors,
        "link_origins": link_origins,
        "title": f"{title_cat} — Traçabilité par position d'entrée (CM-CC / CM / sans CM) — {annee_label}",
        "node_keys": out_keys,
        "annotations": annotations,
        "legend": [
            {"label": f"Ex-CM+CC ({code}-CM-CC)", "color": "rgba(27,58,92,0.85)"},
            {"label": f"Ex-CM ({code}-CM)", "color": "rgba(124,45,74,0.85)"},
            {"label": f"Sans CM ({code})", "color": "rgba(212,145,94,0.85)"},
        ],
    }


def parlementaires_detail_persons(categorie: str = "depute", node: str = "entry_with_cm", origin: str | None = None, source: str | None = None, annee: int = 20) -> list[dict]:
    """Return person-level data for a given node in the parlementaires detail Sankey v2.

    Args:
        origin: Deprecated — kept for backward compatibility.
        source: Optional source node key for link-click filtering.
                When provided, persons are filtered by BOTH source AND target (node) conditions.
        annee: 20 or 26
    """
    table = _get_table(annee)
    valid_cats = {"depute", "senateur", "rpe"}
    if categorie not in valid_cats:
        raise ValueError(f"Catégorie invalide: {categorie}. Utiliser: {', '.join(valid_cats)}")

    valid_nodes = {
        "all",
        "entry_with_cm_cc", "entry_with_cm", "entry_without_cm",
        "candidat_cm", "non_candidat_cm",
        "elu_cm", "non_elu_cm", "non_reelu_cm",
        "cm_simple", "adjoint", "maire",
        "cc_simple", "vp_cc", "pdt_cc", "sans_interco",
        "garde_cm_cc", "garde_cm", "demission", "demission_cm",
    }
    if node not in valid_nodes:
        raise ValueError(f"Nœud invalide: {node}. Utiliser: {', '.join(sorted(valid_nodes))}")

    if source is not None and source not in valid_nodes:
        raise ValueError(f"Source invalide: {source}. Utiliser: {', '.join(sorted(valid_nodes))}")

    # Base category filter
    cat_where_map = {
        "depute": "(position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %')",
        "senateur": "(position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')",
        "rpe": "(position_cumul_1 LIKE 'RPE' OR position_cumul_1 LIKE 'RPE / %')",
    }
    cat_where = cat_where_map[categorie]

    # Node-specific filter
    node_filters = {
        "all": "1=1",
        "entry_with_cm_cc": "position_cumul_1 LIKE '%CM%' AND position_cumul_1 LIKE '%CC%'",
        "entry_with_cm": "position_cumul_1 LIKE '%CM%' AND position_cumul_1 NOT LIKE '%CC%'",
        "entry_without_cm": "position_cumul_1 NOT LIKE '%CM%'",
        "candidat_cm": "statut_candidature != '0_noncandidat'",
        "non_candidat_cm": "statut_candidature = '0_noncandidat'",
        "elu_cm": "statut_candidature != '0_noncandidat' AND elu_cm = 1",
        "non_elu_cm": "statut_candidature != '0_noncandidat' AND elu_cm = 0 AND position_cumul_1 NOT LIKE '%CM%'",
        "non_reelu_cm": "statut_candidature != '0_noncandidat' AND elu_cm = 0 AND position_cumul_1 LIKE '%CM%'",
        "cm_simple": "elu_cm = 1 AND position_cumul_2 NOT LIKE '%CM-M%' AND position_cumul_2 NOT LIKE '%CM-A%'",
        "adjoint": "elu_cm = 1 AND position_cumul_2 LIKE '%CM-A%' AND position_cumul_2 NOT LIKE '%CM-M%'",
        "maire": "elu_cm = 1 AND position_cumul_2 LIKE '%CM-M%'",
        "cc_simple": "elu_cm = 1 AND position_cumul_2 LIKE '%CC%' AND position_cumul_2 NOT LIKE '%CC-VP%' AND position_cumul_2 NOT LIKE '%CC-P%'",
        "vp_cc": "elu_cm = 1 AND position_cumul_2 LIKE '%CC-VP%'",
        "pdt_cc": "elu_cm = 1 AND position_cumul_2 LIKE '%CC-P%' AND position_cumul_2 NOT LIKE '%CC-VP%'",
        "sans_interco": "elu_cm = 1 AND (position_cumul_2 NOT LIKE '%CC%' OR position_cumul_2 IS NULL)",
        "garde_cm_cc": "elu_cm = 1 AND (mvmt_parlementaire IS NULL OR mvmt_parlementaire != 'Démissionnaire') AND (statut_cm_2 IS NULL OR statut_cm_2 != 'Démissionnaire') AND position_cumul_2 LIKE '%CM%' AND position_cumul_2 LIKE '%CC%'",
        "garde_cm": "elu_cm = 1 AND (mvmt_parlementaire IS NULL OR mvmt_parlementaire != 'Démissionnaire') AND (statut_cm_2 IS NULL OR statut_cm_2 != 'Démissionnaire') AND position_cumul_2 NOT LIKE '%CC%'",
        "demission": "mvmt_parlementaire = 'Démissionnaire'",
        "demission_cm": "elu_cm = 1 AND statut_cm_2 = 'Démissionnaire'",
    }

    # Source node filter (from link click — AND source + target conditions)
    source_clause = ""
    if source is not None:
        source_clause = f" AND ({node_filters[source]})"
    # Origin filter (with_cm_cc / with_cm / without_cm) — applied alongside source if both present
    if origin == "with_cm_cc":
        source_clause += " AND position_cumul_1 LIKE '%CM%' AND position_cumul_1 LIKE '%CC%'"
    elif origin == "with_cm":
        source_clause += " AND position_cumul_1 LIKE '%CM%' AND position_cumul_1 NOT LIKE '%CC%'"
    elif origin == "without_cm":
        source_clause += " AND position_cumul_1 NOT LIKE '%CM%'"

    return _query(f"""
        SELECT
            COALESCE(nom_elu, '') AS nom,
            COALESCE(prenom_elu, '') AS prenom,
            COALESCE(position_cumul_1, '') AS mandat_national,
            CASE
                WHEN statut_candidature = '2_tetedeliste' THEN 'Tête de liste'
                WHEN statut_candidature = '1_candidat' THEN 'Candidat'
                ELSE 'Non candidat'
            END AS candidature,
            CASE WHEN elu_cm = 1 THEN 'Élu' ELSE 'Non élu' END AS resultat,
            CASE
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-M%' THEN 'Maire'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-A%' THEN 'Adjoint'
                WHEN elu_cm = 1 THEN 'CM simple'
                ELSE ''
            END AS fonction,
            CASE
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC-VP%' THEN 'VP CC'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC-P%' AND position_cumul_2 NOT LIKE '%CC-VP%' THEN 'Pdt CC'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC%' THEN 'CC'
                ELSE ''
            END AS interco,
            CASE
                WHEN mvmt_parlementaire IS NOT NULL AND mvmt_parlementaire != '' THEN mvmt_parlementaire
                WHEN statut_cm_2 = 'Démissionnaire' THEN 'Démission CM'
                ELSE ''
            END AS issue,
            COALESCE(nuance_parlementaire, '') AS nuance,
            COALESCE(t_departement, t_csp, '') AS departement,
            COALESCE(t_commune, '') AS commune,
            COALESCE(civilite_elu, '') AS civilite,
            CASE
                WHEN date_naissance_elu IS NOT NULL THEN DATEDIFF('year', date_naissance_elu, CURRENT_DATE)
                ELSE COALESCE(CAST(age AS INTEGER), 0)
            END AS age
        FROM {table}
        WHERE {cat_where} AND ({node_filters[node]}){source_clause}
        ORDER BY nom_elu, prenom_elu
    """)


def sankey_export(mandats: str = "cm", fonctions: str = "", annee: int = 20) -> list[dict]:
    """Return per-person trajectory data for the current Sankey selection."""
    table = _get_table(annee)
    selected = _parse_selected(mandats, fonctions)
    cumul_sql, cumul_label = _build_cumul_sql(selected)
    is_cumul = len(selected) > 1

    return _query(f"""
        SELECT
            nom_elu AS nom,
            prenom_elu AS prenom,
            position_cumul_1 AS cumul,
            CASE
                WHEN statut_candidature = '2_tetedeliste' THEN 'Tête de liste'
                WHEN statut_candidature = '1_candidat' THEN 'Candidat'
                ELSE 'Non candidat'
            END AS candidature,
            CASE WHEN elu_cm = 1 THEN 'Élu' ELSE 'Non élu' END AS elu,
            COALESCE(t_departement, t_csp) AS departement,
            t_commune AS commune
        FROM {table}
        WHERE ({cumul_sql})
        ORDER BY nom_elu, prenom_elu
    """)


# ── Filtered stats API ─────────────────────────────────────────────


def _build_filter_where(categorie=None, node=None, source=None, origin=None,
                         nuance=None, departement=None, civilite=None,
                         age_min=None, age_max=None, elu=None) -> str:
    """Build a WHERE clause from optional filters for the filtered stats API."""
    # Category filter (same as parlementaires_detail_persons)
    cat_where_map = {
        "depute": "(position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %')",
        "senateur": "(position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')",
        "rpe": "(position_cumul_1 LIKE 'RPE' OR position_cumul_1 LIKE 'RPE / %')",
    }
    # Node filters (same as parlementaires_detail_persons)
    node_filters = {
        "all": "1=1",
        "entry_with_cm_cc": "position_cumul_1 LIKE '%CM%' AND position_cumul_1 LIKE '%CC%'",
        "entry_with_cm": "position_cumul_1 LIKE '%CM%' AND position_cumul_1 NOT LIKE '%CC%'",
        "entry_without_cm": "position_cumul_1 NOT LIKE '%CM%'",
        "candidat_cm": "statut_candidature != '0_noncandidat'",
        "non_candidat_cm": "statut_candidature = '0_noncandidat'",
        "elu_cm": "statut_candidature != '0_noncandidat' AND elu_cm = 1",
        "non_elu_cm": "statut_candidature != '0_noncandidat' AND elu_cm = 0 AND position_cumul_1 NOT LIKE '%CM%'",
        "non_reelu_cm": "statut_candidature != '0_noncandidat' AND elu_cm = 0 AND position_cumul_1 LIKE '%CM%'",
        "cm_simple": "elu_cm = 1 AND position_cumul_2 NOT LIKE '%CM-M%' AND position_cumul_2 NOT LIKE '%CM-A%'",
        "adjoint": "elu_cm = 1 AND position_cumul_2 LIKE '%CM-A%' AND position_cumul_2 NOT LIKE '%CM-M%'",
        "maire": "elu_cm = 1 AND position_cumul_2 LIKE '%CM-M%'",
        "cc_simple": "elu_cm = 1 AND position_cumul_2 LIKE '%CC%' AND position_cumul_2 NOT LIKE '%CC-VP%' AND position_cumul_2 NOT LIKE '%CC-P%'",
        "vp_cc": "elu_cm = 1 AND position_cumul_2 LIKE '%CC-VP%'",
        "pdt_cc": "elu_cm = 1 AND position_cumul_2 LIKE '%CC-P%' AND position_cumul_2 NOT LIKE '%CC-VP%'",
        "sans_interco": "elu_cm = 1 AND (position_cumul_2 NOT LIKE '%CC%' OR position_cumul_2 IS NULL)",
        "garde_cm_cc": "elu_cm = 1 AND (mvmt_parlementaire IS NULL OR mvmt_parlementaire != 'Démissionnaire') AND (statut_cm_2 IS NULL OR statut_cm_2 != 'Démissionnaire') AND position_cumul_2 LIKE '%CM%' AND position_cumul_2 LIKE '%CC%'",
        "garde_cm": "elu_cm = 1 AND (mvmt_parlementaire IS NULL OR mvmt_parlementaire != 'Démissionnaire') AND (statut_cm_2 IS NULL OR statut_cm_2 != 'Démissionnaire') AND position_cumul_2 NOT LIKE '%CC%'",
        "demission": "mvmt_parlementaire = 'Démissionnaire'",
        "demission_cm": "elu_cm = 1 AND statut_cm_2 = 'Démissionnaire'",
    }

    clauses = ["1=1"]
    if categorie and categorie in cat_where_map:
        clauses.append(cat_where_map[categorie])
    if node and node != "all" and node in node_filters:
        clauses.append(f"({node_filters[node]})")
    if source and source in node_filters:
        clauses.append(f"({node_filters[source]})")
    if origin == "with_cm_cc":
        clauses.append("position_cumul_1 LIKE '%CM%' AND position_cumul_1 LIKE '%CC%'")
    elif origin == "with_cm":
        clauses.append("position_cumul_1 LIKE '%CM%' AND position_cumul_1 NOT LIKE '%CC%'")
    elif origin == "without_cm":
        clauses.append("position_cumul_1 NOT LIKE '%CM%'")
    if nuance:
        # Validate: only allow alphanumeric values
        vals = [v.strip() for v in nuance.split(",") if v.strip().isalnum()]
        if vals:
            quoted = ", ".join(f"'{v}'" for v in vals)
            clauses.append(f"nuance_parlementaire IN ({quoted})")
    if departement:
        vals = [v.strip() for v in departement.split(",") if v.strip().isalnum()]
        if vals:
            quoted = ", ".join(f"'{v}'" for v in vals)
            clauses.append(f"COALESCE(t_departement, t_csp) IN ({quoted})")
    if civilite:
        vals = [v.strip() for v in civilite.split(",") if v.strip()]
        if vals:
            quoted = ", ".join(f"'{v}'" for v in vals)
            clauses.append(f"civilite_elu IN ({quoted})")
    if age_min is not None:
        clauses.append(f"age >= {int(age_min)}")
    if age_max is not None:
        clauses.append(f"age <= {int(age_max)}")
    if elu is not None:
        clauses.append(f"elu_cm = {int(elu)}")
    return " AND ".join(clauses)


def filtered_stats(annee: int = 20, **kwargs) -> dict:
    """Return aggregated stats for the given filters."""
    table = _get_table(annee)
    where = _build_filter_where(**kwargs)

    total = _query(f"SELECT COUNT(*) AS total FROM {table} WHERE {where}")[0]["total"]

    nuances = _query(f"""
        SELECT COALESCE(nuance_parlementaire, 'Inconnu') AS label, COUNT(*) AS value
        FROM {table} WHERE {where}
        GROUP BY 1 ORDER BY value DESC
    """)
    genre = _query(f"""
        SELECT COALESCE(civilite_elu, 'Inconnu') AS label, COUNT(*) AS value
        FROM {table} WHERE {where}
        GROUP BY 1 ORDER BY value DESC
    """)
    departements = _query(f"""
        SELECT COALESCE(t_departement, t_csp, 'Inconnu') AS label, COUNT(*) AS value
        FROM {table} WHERE {where}
        GROUP BY 1 ORDER BY value DESC
    """)
    age = _query(f"""
        SELECT
            CASE
                WHEN age < 30 THEN '< 30'
                WHEN age < 40 THEN '30-39'
                WHEN age < 50 THEN '40-49'
                WHEN age < 60 THEN '50-59'
                WHEN age < 70 THEN '60-69'
                ELSE '70+'
            END AS label,
            COUNT(*) AS value
        FROM {table} WHERE {where} AND age IS NOT NULL
        GROUP BY 1 ORDER BY MIN(age)
    """)
    fonctions = _query(f"""
        SELECT
            CASE
                WHEN position_cumul_2 LIKE '%CM-M%' THEN 'Maire'
                WHEN position_cumul_2 LIKE '%CM-A%' THEN 'Adjoint'
                WHEN elu_cm = 1 THEN 'CM simple'
                ELSE 'Non élu CM'
            END AS label,
            COUNT(*) AS value
        FROM {table} WHERE {where}
        GROUP BY 1 ORDER BY value DESC
    """)

    return {
        "total": total,
        "nuances": nuances,
        "genre": genre,
        "departements": departements,
        "age": age,
        "fonctions": fonctions,
    }


def filtered_persons(annee: int = 20, **kwargs) -> list[dict]:
    """Return person-level data for the given filters."""
    table = _get_table(annee)
    where = _build_filter_where(**kwargs)

    return _query(f"""
        SELECT
            COALESCE(nom_elu, '') AS nom,
            COALESCE(prenom_elu, '') AS prenom,
            COALESCE(position_cumul_1, '') AS mandat_national,
            CASE
                WHEN statut_candidature = '2_tetedeliste' THEN 'Tête de liste'
                WHEN statut_candidature = '1_candidat' THEN 'Candidat'
                ELSE 'Non candidat'
            END AS candidature,
            CASE WHEN elu_cm = 1 THEN 'Élu' ELSE 'Non élu' END AS resultat,
            CASE
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-M%' THEN 'Maire'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-A%' THEN 'Adjoint'
                WHEN elu_cm = 1 THEN 'CM simple'
                ELSE ''
            END AS fonction,
            CASE
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC-VP%' THEN 'VP CC'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC-P%' AND position_cumul_2 NOT LIKE '%CC-VP%' THEN 'Pdt CC'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC%' THEN 'CC'
                ELSE ''
            END AS interco,
            CASE
                WHEN mvmt_parlementaire IS NOT NULL AND mvmt_parlementaire != '' THEN mvmt_parlementaire
                WHEN statut_cm_2 = 'Démissionnaire' THEN 'Démission CM'
                ELSE ''
            END AS issue,
            COALESCE(nuance_parlementaire, '') AS nuance,
            COALESCE(t_departement, t_csp, '') AS departement,
            COALESCE(t_commune, '') AS commune,
            COALESCE(civilite_elu, '') AS civilite,
            CASE
                WHEN date_naissance_elu IS NOT NULL THEN DATEDIFF('year', date_naissance_elu, CURRENT_DATE)
                ELSE COALESCE(CAST(age AS INTEGER), 0)
            END AS age
        FROM {table}
        WHERE {where}
        ORDER BY nom_elu, prenom_elu
    """)


def filtered_export(annee: int = 20, **kwargs) -> list[dict]:
    """Return export data for the given filters (same as filtered_persons)."""
    return filtered_persons(annee=annee, **kwargs)


def stats_strategies_repli(annee: int = 20) -> dict:
    """Stacked bar: strategies de repli des parlementaires candidats aux municipales.

    For each nuance politique, counts how many parliamentarians ended up in each
    "destiny" category:
    - Démission: resigned from parliament after being elected
    - Exécutif municipal: elected as Maire or Adjoint
    - CC simple: elected to intercommunal council only (no municipal exec)
    - CM simple: elected as basic municipal councillor (no exec, no interco)
    - Non élu: ran but lost

    Returns data shaped for a BarStack chart.
    """
    table = _get_table(annee)
    rows = _query(f"""
        SELECT
            nuance_parlementaire AS nuance,
            CASE
                WHEN mvmt_parlementaire = 'Démissionnaire' THEN 'Démission'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC%'
                    THEN 'Élu intercommunal'
                WHEN elu_cm = 1 THEN 'Élu CM simple'
                WHEN elu_cm = 0 THEN 'Non élu'
                ELSE 'Autre'
            END AS destin,
            COUNT(*) AS n
        FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
            OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
          AND statut_candidature != '0_noncandidat'
        GROUP BY 1, 2
        ORDER BY nuance, destin
    """)

    # Aggregate by nuance — only keep nuances with >= 4 candidates
    nuance_totals: dict[str, int] = {}
    nuance_destins: dict[str, dict[str, int]] = {}
    for row in rows:
        n = row["nuance"] or "Inconnu"
        nuance_totals[n] = nuance_totals.get(n, 0) + row["n"]
        if n not in nuance_destins:
            nuance_destins[n] = {}
        nuance_destins[n][row["destin"]] = row["n"]

    # All nuances sorted by total desc
    nuances_sorted = sorted(
        nuance_totals.items(),
        key=lambda x: -x[1],
    )

    categories = ["Démission", "Élu intercommunal", "Élu CM simple", "Non élu"]
    nuance_labels = [n for n, _ in nuances_sorted]

    # Build series: one array per category
    series: dict[str, list[int]] = {cat: [] for cat in categories}
    for nuance, _ in nuances_sorted:
        destins = nuance_destins.get(nuance, {})
        for cat in categories:
            series[cat].append(destins.get(cat, 0))

    total = sum(t for _, t in nuances_sorted)

    return {
        "nuances": nuance_labels,
        "categories": categories,
        "series": series,
        "total": total,
        "title": f"Stratégies de repli des parlementaires candidats ({total})",
    }


def stats_network_mandats(annee: int = 20) -> dict:
    """Network graph: multi-mandate ecosystem for parliamentarians elected to municipal office.

    Central nodes: Député, Sénateur
    Satellite nodes: local mandates (CM, CC, CD, CR) and executive functions requiring resignation
    Edges: number of parliamentarians holding both the central + satellite mandate.

    Returns nodes and links for a force-directed network graph.
    """
    table = _get_table(annee)
    rows = _query(f"""
        WITH elus AS (
            SELECT
                CASE
                    WHEN position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %' THEN 'Député'
                    ELSE 'Sénateur'
                END AS parl,
                position_cumul_2,
                mvmt_parlementaire
            FROM {table}
            WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
                OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
              AND statut_candidature != '0_noncandidat'
              AND elu_cm = 1
        )
        SELECT parl, 'CM' AS local_mandate, COUNT(*) AS n FROM elus
            WHERE position_cumul_2 LIKE '%CM%' GROUP BY 1
        UNION ALL
        SELECT parl, 'CC' AS local_mandate, COUNT(*) AS n FROM elus
            WHERE position_cumul_2 LIKE '%CC%' GROUP BY 1
        UNION ALL
        SELECT parl, 'CD' AS local_mandate, COUNT(*) AS n FROM elus
            WHERE position_cumul_2 LIKE '%CD%' GROUP BY 1
        UNION ALL
        SELECT parl, 'CR' AS local_mandate, COUNT(*) AS n FROM elus
            WHERE position_cumul_2 LIKE '%CR%' GROUP BY 1
        UNION ALL
        SELECT parl, 'Maire (dém.)' AS local_mandate, COUNT(*) AS n FROM elus
            WHERE position_cumul_2 LIKE '%CM-M%' AND mvmt_parlementaire = 'Démissionnaire' GROUP BY 1
        UNION ALL
        SELECT parl, 'Adjoint (dém.)' AS local_mandate, COUNT(*) AS n FROM elus
            WHERE position_cumul_2 LIKE '%CM-A%' AND mvmt_parlementaire = 'Démissionnaire' GROUP BY 1
        UNION ALL
        SELECT parl, 'Pdt CC (dém.)' AS local_mandate, COUNT(*) AS n FROM elus
            WHERE position_cumul_2 LIKE '%CC-P%' AND mvmt_parlementaire = 'Démissionnaire' GROUP BY 1
        UNION ALL
        SELECT parl, 'VP CC (dém.)' AS local_mandate, COUNT(*) AS n FROM elus
            WHERE position_cumul_2 LIKE '%CC-VP%' AND mvmt_parlementaire = 'Démissionnaire' GROUP BY 1
        ORDER BY n DESC
    """)

    # Build unique node list
    node_ids: dict[str, int] = {}
    nodes: list[dict] = []

    # Node categories for coloring/sizing
    node_meta = {
        "Député": {"group": "central", "color": "#e74c3c", "radius": 40},
        "Sénateur": {"group": "central", "color": "#9b59b6", "radius": 35},
        "CM": {"group": "mandat", "color": "#3b82f6", "radius": 28},
        "CC": {"group": "mandat", "color": "#f59e0b", "radius": 26},
        "CD": {"group": "mandat", "color": "#10b981", "radius": 20},
        "CR": {"group": "mandat", "color": "#06b6d4", "radius": 18},
        "Maire (dém.)": {"group": "demission", "color": "#ef4444", "radius": 22},
        "Adjoint (dém.)": {"group": "demission", "color": "#f87171", "radius": 14},
        "Pdt CC (dém.)": {"group": "demission", "color": "#dc2626", "radius": 16},
        "VP CC (dém.)": {"group": "demission", "color": "#b91c1c", "radius": 15},
    }

    def ensure_node(name: str) -> int:
        if name not in node_ids:
            idx = len(nodes)
            node_ids[name] = idx
            meta = node_meta.get(name, {"group": "other", "color": "#94a3b8", "radius": 12})
            nodes.append({"id": name, "group": meta["group"], "color": meta["color"], "radius": meta["radius"]})
        return node_ids[name]

    links = []
    for row in rows:
        src = ensure_node(row["parl"])
        tgt = ensure_node(row["local_mandate"])
        links.append({"source": src, "target": tgt, "value": row["n"]})

    # Total elected parliamentarians
    total_rows = _query(f"""
        SELECT COUNT(*) AS n FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
            OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
          AND statut_candidature != '0_noncandidat'
          AND elu_cm = 1
    """)
    total = total_rows[0]["n"] if total_rows else 0

    return {
        "nodes": nodes,
        "links": links,
        "total": total,
        "title": f"Polyphonie des mandats — Parlementaires élus CM ({total})",
    }


def stats_network_mandats_3d(annee: int = 20) -> dict:
    """3D network graph: full co-occurrence matrix of all mandate types.

    Explodes position_cumul_2 into atomic mandates, includes D/S/RPE from
    position_cumul_1, then counts co-occurrences for every pair.

    Returns nodes (15 mandate types) and weighted links for 3d-force-graph.
    """
    # Node metadata: group, color, val (base size)
    node_meta = {
        # Parlementaire
        "Député": {"group": "parlementaire", "color": "#e74c3c"},
        "Sénateur": {"group": "parlementaire", "color": "#9b59b6"},
        "RPE": {"group": "parlementaire", "color": "#2563eb"},
        # Municipal
        "CM": {"group": "municipal", "color": "#3b82f6"},
        "CM-M": {"group": "municipal", "color": "#1d4ed8"},
        "CM-A": {"group": "municipal", "color": "#60a5fa"},
        # Intercommunal
        "CC": {"group": "intercommunal", "color": "#f59e0b"},
        "CC-P": {"group": "intercommunal", "color": "#d97706"},
        "CC-VP": {"group": "intercommunal", "color": "#fbbf24"},
        # Départemental
        "CD": {"group": "departemental", "color": "#10b981"},
        "CD-P": {"group": "departemental", "color": "#059669"},
        "CD-VP": {"group": "departemental", "color": "#34d399"},
        # Régional
        "CR": {"group": "regional", "color": "#06b6d4"},
        "CR-P": {"group": "regional", "color": "#0891b2"},
        "CR-VP": {"group": "regional", "color": "#22d3ee"},
    }

    table = _get_table(annee)
    # Get all persons with their position_cumul_1 and position_cumul_2
    rows = _query(f"""
        SELECT
            position_cumul_1,
            position_cumul_2
        FROM {table}
        WHERE position_cumul_2 IS NOT NULL
          AND position_cumul_2 != ''
    """)

    # Explode each person's mandates into a set of atomic mandates
    from collections import Counter

    node_counts: Counter = Counter()
    pair_counts: Counter = Counter()

    parl_prefixes = {"D": "Député", "S": "Sénateur", "RPE": "RPE"}

    for row in rows:
        mandates: set[str] = set()

        # Extract parliamentary mandate from position_cumul_1
        p1 = (row["position_cumul_1"] or "").strip()
        if p1:
            first_token = p1.split(" / ")[0].strip()
            if first_token in parl_prefixes:
                mandates.add(parl_prefixes[first_token])

        # Extract all local mandates from position_cumul_2 (atomic only)
        p2 = (row["position_cumul_2"] or "").strip()
        if p2:
            for part in p2.split(" / "):
                part = part.strip()
                if part and part in node_meta:
                    mandates.add(part)

        # Count individual nodes
        for m in mandates:
            node_counts[m] += 1

        # Count co-occurrence pairs (sorted to avoid duplicates)
        mandate_list = sorted(mandates)
        for i in range(len(mandate_list)):
            for j in range(i + 1, len(mandate_list)):
                pair_counts[(mandate_list[i], mandate_list[j])] += 1

    # Build nodes (only those that appear)
    nodes = []
    node_index: dict[str, int] = {}
    for mandate_id in node_meta:
        if node_counts[mandate_id] > 0:
            meta = node_meta[mandate_id]
            idx = len(nodes)
            node_index[mandate_id] = idx
            nodes.append({
                "id": mandate_id,
                "group": meta["group"],
                "color": meta["color"],
                "val": node_counts[mandate_id],
            })

    # Build links (only pairs that co-occur)
    links = []
    for (src, tgt), value in pair_counts.most_common():
        if src in node_index and tgt in node_index and value > 0:
            links.append({
                "source": node_index[src],
                "target": node_index[tgt],
                "value": value,
            })

    total = len(rows)

    return {
        "nodes": nodes,
        "links": links,
        "total": total,
        "title": f"Polyphonie des mandats 3D — {total} élus",
    }


def network_3d_persons(
    mandate: str | None = None,
    source: str | None = None,
    target: str | None = None,
    annee: int = 20,
) -> list[dict]:
    """Return persons for a node or link click in the 3D network graph.

    - mandate only: persons having that mandate
    - source + target: persons having BOTH mandates simultaneously
    """
    # Map display names back to SQL patterns
    PARL_MAP = {"Député": "D", "Sénateur": "S", "RPE": "RPE"}

    def _mandate_where(m: str) -> str:
        """Build WHERE clause fragment for a single mandate."""
        if m in PARL_MAP:
            code = PARL_MAP[m]
            return (
                f"(position_cumul_1 = '{code}' "
                f"OR position_cumul_1 LIKE '{code} / %')"
            )
        # Local mandate: look in position_cumul_2
        # Base mandates (CM, CC, CD, CR) must NOT match specialised forms (CM-M, etc.)
        if m in ("CM", "CC", "CD", "CR"):
            return (
                f"(position_cumul_2 = '{m}' "
                f"OR position_cumul_2 LIKE '{m} / %' "
                f"OR position_cumul_2 LIKE '% / {m}' "
                f"OR position_cumul_2 LIKE '% / {m} / %') "
                f"AND position_cumul_2 NOT LIKE '%{m}-%'"
            )
        # Specific mandate (CM-M, CC-VP, etc.) — safe to use LIKE
        return f"position_cumul_2 LIKE '%{m}%'"

    conditions = []
    if source and target:
        conditions.append(_mandate_where(source))
        conditions.append(_mandate_where(target))
    elif mandate:
        conditions.append(_mandate_where(mandate))
    else:
        conditions.append("1=1")

    where = " AND ".join(f"({c})" for c in conditions)

    rows = _query(f"""
        SELECT
            COALESCE(nom_elu, '') AS nom,
            COALESCE(prenom_elu, '') AS prenom,
            COALESCE(position_cumul_1, '') AS position_cumul_1,
            COALESCE(position_cumul_2, '') AS position_cumul_2,
            COALESCE(
                NULLIF(nuance_parlementaire, ''),
                NULLIF(nuance_municipale, ''),
                NULLIF(nuance_departementale, ''),
                NULLIF(nuance_regionale, ''),
                ''
            ) AS nuance,
            COALESCE(t_departement, '') AS departement,
            COALESCE(t_commune, '') AS commune,
            COALESCE(civilite_elu, '') AS civilite,
            COALESCE(CAST(age AS INTEGER), 0) AS age
        FROM {_get_table(annee)}
        WHERE position_cumul_2 IS NOT NULL AND position_cumul_2 != ''
          AND {where}
        ORDER BY nom_elu, prenom_elu
    """)

    # Add atomic mandates list per person (no implied base mandates)
    parl_prefixes = {"D": "Député", "S": "Sénateur", "RPE": "RPE"}
    local_mandates = {
        "CM", "CM-M", "CM-A", "CC", "CC-P", "CC-VP",
        "CD", "CD-P", "CD-VP", "CR", "CR-P", "CR-VP",
    }
    for row in rows:
        mandate_set: set[str] = set()
        p1 = row["position_cumul_1"].strip()
        if p1:
            first = p1.split(" / ")[0].strip()
            if first in parl_prefixes:
                mandate_set.add(parl_prefixes[first])
        p2 = row["position_cumul_2"].strip()
        if p2:
            for part in p2.split(" / "):
                part = part.strip()
                if part in local_mandates:
                    mandate_set.add(part)
        row["mandates"] = sorted(mandate_set)

    return rows


def stats_radar_nuances(annee: int = 20) -> dict:
    """Radar chart: profil-type de cumul par nuance politique.

    6 axes (percentages computed on total parlementaires per nuance):
    - Taux de candidature
    - Taux d'élection (parmi candidats)
    - % Exécutif municipal (Maire/Adjoint) parmi élus
    - % Intercommunal (CC) parmi élus
    - % CD/CR parmi élus
    - Taux de démission

    Returns data for all nuances.
    """
    table = _get_table(annee)
    rows = _query(f"""
        SELECT
            nuance_parlementaire AS nuance,
            COUNT(*) AS total,
            SUM(CASE WHEN statut_candidature != '0_noncandidat' THEN 1 ELSE 0 END) AS candidats,
            SUM(CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END) AS elus,
            SUM(CASE WHEN elu_cm = 1 AND (position_cumul_2 LIKE '%CM-M%' OR position_cumul_2 LIKE '%CM-A%')
                THEN 1 ELSE 0 END) AS executif_mun,
            SUM(CASE WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC%'
                THEN 1 ELSE 0 END) AS interco,
            SUM(CASE WHEN elu_cm = 1 AND (position_cumul_2 LIKE '%CD%' OR position_cumul_2 LIKE '%CR%')
                THEN 1 ELSE 0 END) AS cd_cr,
            SUM(CASE WHEN mvmt_parlementaire = 'Démissionnaire'
                THEN 1 ELSE 0 END) AS demissionnaires
        FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
            OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
        GROUP BY 1
        ORDER BY total DESC
    """)

    axes = [
        "Candidature",
        "Élection",
        "Exécutif mun.",
        "Intercommunal",
        "CD / CR",
        "Démission",
    ]

    profiles = []
    for row in rows:
        total = row["total"] or 1
        candidats = row["candidats"] or 0
        elus = row["elus"] or 0
        taux_candidature = (candidats / total) * 100
        taux_election = (elus / candidats * 100) if candidats > 0 else 0
        taux_executif = (row["executif_mun"] / elus * 100) if elus > 0 else 0
        taux_interco = (row["interco"] / elus * 100) if elus > 0 else 0
        taux_cd_cr = (row["cd_cr"] / elus * 100) if elus > 0 else 0
        taux_demission = (row["demissionnaires"] / total * 100)

        profiles.append({
            "nuance": row["nuance"],
            "total": total,
            "candidats": candidats,
            "elus": elus,
            "values": [
                round(taux_candidature, 1),
                round(taux_election, 1),
                round(taux_executif, 1),
                round(taux_interco, 1),
                round(taux_cd_cr, 1),
                round(taux_demission, 1),
            ],
        })

    return {
        "axes": axes,
        "profiles": profiles,
    }


def stats_diverging_reussite(annee: int = 20) -> dict:
    """Diverging bar chart: taux de réussite électorale par nuance.

    For each nuance (among parliamentarians who were candidates):
    - Right bar: % elected
    - Left bar: % not elected (beaten)

    Returns data sorted by election success rate.
    """
    table = _get_table(annee)
    rows = _query(f"""
        SELECT
            nuance_parlementaire AS nuance,
            COUNT(*) AS candidats,
            SUM(CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END) AS elus,
            SUM(CASE WHEN elu_cm = 0 THEN 1 ELSE 0 END) AS battus
        FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
            OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
          AND statut_candidature != '0_noncandidat'
        GROUP BY 1
        ORDER BY (CAST(elus AS FLOAT) / candidats) DESC
    """)

    nuances = []
    for row in rows:
        candidats = row["candidats"] or 1
        elus = row["elus"] or 0
        battus = row["battus"] or 0
        nuances.append({
            "nuance": row["nuance"],
            "candidats": candidats,
            "elus": elus,
            "battus": battus,
            "taux_election": round((elus / candidats) * 100, 1),
            "taux_defaite": round((battus / candidats) * 100, 1),
        })

    total_candidats = sum(n["candidats"] for n in nuances)
    total_elus = sum(n["elus"] for n in nuances)

    return {
        "nuances": nuances,
        "total_candidats": total_candidats,
        "total_elus": total_elus,
    }


def stats_treemap_nuances(annee: int = 20) -> dict:
    """Treemap: poids relatif de chaque nuance dans le vivier parlementaire."""
    table = _get_table(annee)
    rows = _query(f"""
        SELECT
            nuance_parlementaire AS nuance,
            COUNT(*) AS total,
            SUM(CASE WHEN statut_candidature != '0_noncandidat' THEN 1 ELSE 0 END) AS candidats,
            SUM(CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END) AS elus
        FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
            OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
        GROUP BY 1
        ORDER BY total DESC
    """)

    children = []
    for row in rows:
        children.append({
            "nuance": row["nuance"],
            "total": row["total"],
            "candidats": row["candidats"],
            "elus": row["elus"],
            "taux_candidature": round((row["candidats"] / row["total"]) * 100, 1) if row["total"] else 0,
        })

    return {
        "children": children,
        "total_parlementaires": sum(c["total"] for c in children),
    }


def stats_heatmap_destins(annee: int = 20) -> dict:
    """Heatmap: nuance parlementaire × destin (crosstab).

    Municipal destiny is the primary axis. Démission from parliament is tracked
    separately because all 30 démissionnaires are also elu_cm=1 (they resigned
    from parliament to serve locally as Maire/Adjoint/etc.).
    """
    table = _get_table(annee)
    rows = _query(f"""
        SELECT
            nuance_parlementaire AS nuance,
            CASE
                WHEN statut_candidature = '0_noncandidat' THEN 'Non candidat'
                WHEN elu_cm = 1 AND (position_cumul_2 LIKE '%Maire%' OR position_cumul_2 LIKE '%CM-M%')
                    THEN 'Maire'
                WHEN elu_cm = 1 AND (position_cumul_2 LIKE '%CM-A%')
                    THEN 'Adjoint'
                WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC%'
                    THEN 'Interco'
                WHEN elu_cm = 1 THEN 'CM simple'
                WHEN elu_cm = 0 AND statut_candidature != '0_noncandidat' THEN 'Battu'
                ELSE 'Autre'
            END AS destin,
            COUNT(*) AS n,
            SUM(CASE WHEN mvmt_parlementaire = 'Démissionnaire' THEN 1 ELSE 0 END) AS n_demission
        FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
            OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
        GROUP BY 1, 2
        ORDER BY nuance, destin
    """)

    # Build matrix — démission parlementaire is a separate column (not a CASE branch)
    # since all 30 démissionnaires are also elu_cm=1 (Maire, Adjoint, etc.)
    destins_order = ["Non candidat", "Battu", "CM simple", "Adjoint", "Maire", "Interco", "Dém. parl."]
    nuance_totals: dict[str, int] = {}
    matrix: dict[str, dict[str, int]] = {}
    demission_matrix: dict[str, int] = {}
    for row in rows:
        n = row["nuance"] or "Inconnu"
        nuance_totals[n] = nuance_totals.get(n, 0) + row["n"]
        if n not in matrix:
            matrix[n] = {}
        matrix[n][row["destin"]] = row["n"]
        demission_matrix[n] = demission_matrix.get(n, 0) + int(row["n_demission"])

    nuances_sorted = sorted(nuance_totals.keys(), key=lambda x: -nuance_totals[x])

    cells = []
    for nuance in nuances_sorted:
        total = nuance_totals[nuance]
        for destin in destins_order:
            if destin == "Dém. parl.":
                count = demission_matrix.get(nuance, 0)
            else:
                count = matrix.get(nuance, {}).get(destin, 0)
            cells.append({
                "nuance": nuance,
                "destin": destin,
                "count": count,
                "pct": round((count / total) * 100, 1) if total else 0,
            })

    return {
        "nuances": nuances_sorted,
        "destins": destins_order,
        "cells": cells,
        "total": sum(nuance_totals.values()),
    }


def stats_bump_chart(annee: int = 20) -> dict:
    """Bump chart: classement des nuances sur 4 métriques."""
    table = _get_table(annee)
    rows = _query(f"""
        SELECT
            nuance_parlementaire AS nuance,
            COUNT(*) AS total,
            SUM(CASE WHEN statut_candidature != '0_noncandidat' THEN 1 ELSE 0 END) AS candidats,
            SUM(CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END) AS elus,
            SUM(CASE WHEN elu_cm = 1 AND (position_cumul_2 LIKE '%CM-M%' OR position_cumul_2 LIKE '%Maire%' OR position_cumul_2 LIKE '%CM-A%')
                THEN 1 ELSE 0 END) AS executif,
            SUM(CASE WHEN mvmt_parlementaire = 'Démissionnaire' THEN 1 ELSE 0 END) AS demissions
        FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
            OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
        GROUP BY 1
        ORDER BY total DESC
    """)

    metrics = ["Candidature", "Élection", "Exécutif", "Démission"]

    # Compute rates
    nuance_rates = []
    for row in rows:
        total = row["total"] or 1
        candidats = row["candidats"] or 1
        nuance_rates.append({
            "nuance": row["nuance"],
            "total": row["total"],
            "rates": {
                "Candidature": round((row["candidats"] / total) * 100, 1),
                "Élection": round((row["elus"] / candidats) * 100, 1) if row["candidats"] else 0,
                "Exécutif": round((row["executif"] / row["elus"]) * 100, 1) if row["elus"] else 0,
                "Démission": round((row["demissions"] / total) * 100, 1),
            },
        })

    # Compute rankings for each metric
    for metric in metrics:
        sorted_by = sorted(nuance_rates, key=lambda x: -x["rates"][metric])
        for rank, item in enumerate(sorted_by, 1):
            if "ranks" not in item:
                item["ranks"] = {}
            item["ranks"][metric] = rank

    series = []
    for item in nuance_rates:
        series.append({
            "nuance": item["nuance"],
            "total": item["total"],
            "ranks": [item["ranks"][m] for m in metrics],
            "rates": [item["rates"][m] for m in metrics],
        })

    return {
        "metrics": metrics,
        "series": series,
        "max_rank": len(nuance_rates),
    }


def stats_lollipop_demissions(annee: int = 20) -> dict:
    """Lollipop chart: taux de démission par nuance."""
    table = _get_table(annee)
    rows = _query(f"""
        SELECT
            nuance_parlementaire AS nuance,
            COUNT(*) AS total,
            SUM(CASE WHEN mvmt_parlementaire = 'Démissionnaire' THEN 1 ELSE 0 END) AS demissions,
            SUM(CASE WHEN statut_candidature != '0_noncandidat' THEN 1 ELSE 0 END) AS candidats,
            SUM(CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END) AS elus
        FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
            OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
        GROUP BY 1
        ORDER BY total DESC
    """)

    items = []
    for row in rows:
        total = row["total"] or 1
        items.append({
            "nuance": row["nuance"],
            "total": row["total"],
            "demissions": row["demissions"] or 0,
            "taux_demission": round(((row["demissions"] or 0) / total) * 100, 1),
            "candidats": row["candidats"] or 0,
            "elus": row["elus"] or 0,
        })

    # Sort by taux_demission desc
    items.sort(key=lambda x: -x["taux_demission"])

    return {
        "items": items,
        "total_demissions": sum(i["demissions"] for i in items),
        "total_parlementaires": sum(i["total"] for i in items),
    }


def stats_age_distribution(annee: int = 20) -> dict:
    """Bee swarm: distribution d'âge des parlementaires par nuance."""
    table = _get_table(annee)
    # Get individual ages per nuance (for top nuances)
    top_nuances = _query(f"""
        SELECT nuance_parlementaire AS nuance, COUNT(*) AS n
        FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
            OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
          AND age IS NOT NULL
        GROUP BY 1
        ORDER BY n DESC
    """)

    nuance_list = [r["nuance"] for r in top_nuances]

    # Get all individual data points
    placeholders = ", ".join(f"'{n}'" for n in nuance_list)
    rows = _query(f"""
        SELECT nuance_parlementaire AS nuance, age,
            CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END AS elu
        FROM {table}
        WHERE (position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %'
            OR position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %')
          AND age IS NOT NULL
          AND nuance_parlementaire IN ({placeholders})
        ORDER BY nuance_parlementaire, age
    """)

    # Group by nuance
    by_nuance: dict[str, list] = {}
    for row in rows:
        n = row["nuance"]
        if n not in by_nuance:
            by_nuance[n] = []
        by_nuance[n].append({"age": row["age"], "elu": row["elu"]})

    # Build output in order of nuance_list
    groups = []
    for nuance in nuance_list:
        points = by_nuance.get(nuance, [])
        ages = [p["age"] for p in points]
        groups.append({
            "nuance": nuance,
            "points": points,
            "count": len(points),
            "median": sorted(ages)[len(ages) // 2] if ages else 0,
            "min": min(ages) if ages else 0,
            "max": max(ages) if ages else 0,
        })

    return {
        "groups": groups,
        "age_range": [
            min(g["min"] for g in groups) if groups else 25,
            max(g["max"] for g in groups) if groups else 85,
        ],
    }


# =====================================================================
# Chart 11 — Gender Gap (butterfly pyramid)
# =====================================================================

def stats_gender_gap(annee: int = 20) -> dict:
    """Butterfly pyramid: pipeline H/F from total to démission."""
    table = _get_table(annee)
    sql = f"""
    SELECT civilite_elu AS genre, COUNT(*) AS total,
      SUM(CASE WHEN statut_candidature != '0_noncandidat' THEN 1 ELSE 0 END) AS candidats,
      SUM(CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END) AS elus,
      SUM(CASE WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-M%' THEN 1 ELSE 0 END) AS maires,
      SUM(CASE WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-A%' THEN 1 ELSE 0 END) AS adjoints,
      SUM(CASE WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CC%' THEN 1 ELSE 0 END) AS interco,
      SUM(CASE WHEN mvmt_parlementaire = 'Démissionnaire' THEN 1 ELSE 0 END) AS demissions
    FROM {table}
    GROUP BY 1
    """
    rows = _query(sql)
    stages = ["Total", "Candidats", "Élus", "Maires", "Adjoints", "Interco", "Démissions"]
    keys = ["total", "candidats", "elus", "maires", "adjoints", "interco", "demissions"]

    men_row = next((r for r in rows if r["genre"] == "M"), None)
    women_row = next((r for r in rows if r["genre"] == "Mme"), None)

    def build_side(row):
        if not row:
            return [{"count": 0, "pct": 0}] * len(keys)
        total = row["total"] or 1
        return [{"count": row[k], "pct": round(row[k] * 100 / total, 1)} for k in keys]

    return {
        "stages": stages,
        "men": build_side(men_row),
        "women": build_side(women_row),
        "total_men": men_row["total"] if men_row else 0,
        "total_women": women_row["total"] if women_row else 0,
    }


# =====================================================================
# Chart 12 — Cumul Intensity (Cleveland dot plot)
# =====================================================================

def stats_cumul_intensity(annee: int = 20) -> dict:
    """Cleveland dot plot: behavior by number of mandates held."""
    table = _get_table(annee)
    sql = f"""
    WITH cumul AS (
      SELECT *,
        CASE
          WHEN position_cumul_1 IS NULL OR position_cumul_1 = '' THEN 0
          ELSE (length(position_cumul_1) - length(replace(position_cumul_1, ' / ', ''))) / 3 + 1
        END AS nb_mandats
      FROM {table}
    )
    SELECT
      CASE
        WHEN nb_mandats = 1 THEN '1 (parl. seul)'
        WHEN nb_mandats = 2 THEN '2'
        WHEN nb_mandats = 3 THEN '3'
        WHEN nb_mandats >= 4 THEN '4+'
      END AS intensite,
      MIN(nb_mandats) AS sort_key,
      COUNT(*) AS total,
      ROUND(SUM(CASE WHEN statut_candidature != '0_noncandidat' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS taux_candidature,
      ROUND(SUM(CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END) * 100.0
        / NULLIF(SUM(CASE WHEN statut_candidature != '0_noncandidat' THEN 1 ELSE 0 END), 0), 1) AS taux_election,
      ROUND(SUM(CASE WHEN elu_cm = 1 AND (position_cumul_2 LIKE '%CM-M%' OR position_cumul_2 LIKE '%CM-A%')
        THEN 1 ELSE 0 END) * 100.0
        / NULLIF(SUM(CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END), 0), 1) AS taux_executif,
      ROUND(SUM(CASE WHEN mvmt_parlementaire = 'Démissionnaire' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS taux_demission
    FROM cumul
    GROUP BY 1
    ORDER BY sort_key
    """
    rows = _query(sql)
    metrics = ["Candidature", "Élection", "Exécutif", "Démission"]
    metric_keys = ["taux_candidature", "taux_election", "taux_executif", "taux_demission"]

    return {
        "levels": [r["intensite"] for r in rows],
        "metrics": metrics,
        "rows": [
            {
                "intensite": r["intensite"],
                "total": r["total"],
                "values": [r[k] if r[k] is not None else 0 for k in metric_keys],
            }
            for r in rows
        ],
    }


# =====================================================================
# Chart 13 — Tête de Liste (waffle comparison)
# =====================================================================

def stats_tete_de_liste(annee: int = 20) -> dict:
    """Waffle comparison: tête de liste vs simple candidat outcomes."""
    table = _get_table(annee)
    sql = f"""
    SELECT
      CASE
        WHEN statut_candidature = '2_tetedeliste' THEN 'Tête de liste'
        WHEN statut_candidature = '1_candidat' THEN 'Simple candidat'
      END AS positionnement,
      COUNT(*) AS total,
      SUM(CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END) AS elus,
      SUM(CASE WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-M%' THEN 1 ELSE 0 END) AS maires,
      SUM(CASE WHEN elu_cm = 1 AND position_cumul_2 LIKE '%CM-A%' THEN 1 ELSE 0 END) AS adjoints,
      SUM(CASE WHEN elu_cm = 1 AND position_cumul_2 NOT LIKE '%CM-M%'
        AND position_cumul_2 NOT LIKE '%CM-A%' THEN 1 ELSE 0 END) AS cm_simples,
      SUM(CASE WHEN elu_cm = 0 THEN 1 ELSE 0 END) AS battus,
      SUM(CASE WHEN mvmt_parlementaire = 'Démissionnaire' THEN 1 ELSE 0 END) AS demissions
    FROM {table}
    WHERE statut_candidature != '0_noncandidat'
    GROUP BY 1
    ORDER BY positionnement DESC
    """
    rows = _query(sql)

    outcome_colors = {
        "Maire": "#7c3aed",
        "Adjoint": "#f59e0b",
        "CM simple": "#3b82f6",
        "Battu": "#94a3b8",
    }

    panels = []
    for r in rows:
        total = r["total"] or 1
        outcomes = [
            {"label": "Maire", "count": r["maires"], "pct": round(r["maires"] * 100 / total, 1), "color": outcome_colors["Maire"]},
            {"label": "Adjoint", "count": r["adjoints"], "pct": round(r["adjoints"] * 100 / total, 1), "color": outcome_colors["Adjoint"]},
            {"label": "CM simple", "count": r["cm_simples"], "pct": round(r["cm_simples"] * 100 / total, 1), "color": outcome_colors["CM simple"]},
            {"label": "Battu", "count": r["battus"], "pct": round(r["battus"] * 100 / total, 1), "color": outcome_colors["Battu"]},
        ]
        panels.append({
            "label": r["positionnement"],
            "total": r["total"],
            "outcomes": outcomes,
            "demissions": r["demissions"],
            "taux_demission": round(r["demissions"] * 100 / total, 1),
        })

    return {"panels": panels}


# =====================================================================
# Chart 14 — Département Concentration (tile cartogram)
# =====================================================================

def stats_dept_concentration(annee: int = 20) -> dict:
    """Tile cartogram: demissions by département and cumul intensity."""
    table = _get_table(annee)
    sql = f"""
    WITH cumul AS (
      SELECT *,
        COALESCE(t_departement, t_csp) AS dept,
        CASE
          WHEN position_cumul_1 IS NULL OR position_cumul_1 = '' THEN 0
          ELSE (length(position_cumul_1) - length(replace(position_cumul_1, ' / ', ''))) / 3 + 1
        END AS nb_mandats
      FROM {table}
      WHERE COALESCE(t_departement, t_csp) IS NOT NULL AND COALESCE(t_departement, t_csp) != ''
    )
    SELECT
      dept,
      CASE
        WHEN nb_mandats <= 1 THEN '1'
        WHEN nb_mandats = 2 THEN '2'
        WHEN nb_mandats = 3 THEN '3'
        WHEN nb_mandats >= 4 THEN '4+'
      END AS intensite,
      COUNT(*) AS total,
      SUM(CASE WHEN mvmt_parlementaire = 'Démissionnaire' THEN 1 ELSE 0 END) AS demissions
    FROM cumul
    GROUP BY dept, intensite
    ORDER BY dept, intensite
    """
    rows = _query(sql)

    # Aggregate by département
    dept_data: dict[str, dict] = {}
    for r in rows:
        d = r["dept"]
        if d not in dept_data:
            dept_data[d] = {"dept": d, "total": 0, "demissions": 0, "by_intensity": {}}
        dept_data[d]["total"] += r["total"]
        dept_data[d]["demissions"] += r["demissions"]
        dept_data[d]["by_intensity"][r["intensite"]] = {
            "total": r["total"],
            "demissions": r["demissions"],
        }

    # Compute taux_demission per dept
    departments = []
    for dd in dept_data.values():
        dd["taux_demission"] = round(dd["demissions"] * 100 / dd["total"], 1) if dd["total"] else 0
        for intensity_data in dd["by_intensity"].values():
            intensity_data["taux_demission"] = (
                round(intensity_data["demissions"] * 100 / intensity_data["total"], 1)
                if intensity_data["total"] else 0
            )
        departments.append(dd)

    total_all = sum(d["total"] for d in departments)
    total_dem = sum(d["demissions"] for d in departments)

    return {
        "departments": departments,
        "levels": ["1", "2", "3", "4+"],
        "national_avg_demission": round(total_dem * 100 / total_all, 1) if total_all else 0,
    }


# =====================================================================
# Chart 15 — Age × Démission (ridgeline / joyplot)
# =====================================================================

def stats_age_demission(annee: int = 20) -> dict:
    """Ridgeline: age distribution by outcome category."""
    table = _get_table(annee)
    sql = f"""
    SELECT
      CASE
        WHEN mvmt_parlementaire = 'Démissionnaire' THEN 'Démissionnaires'
        WHEN elu_cm = 1 AND statut_candidature != '0_noncandidat' THEN 'Élus non démiss.'
        WHEN elu_cm = 0 AND statut_candidature != '0_noncandidat' THEN 'Battus'
        WHEN statut_candidature = '0_noncandidat' THEN 'Non candidats'
      END AS categorie,
      age
    FROM {table}
    WHERE age IS NOT NULL
    ORDER BY categorie, age
    """
    rows = _query(sql)

    cats_order = ["Démissionnaires", "Élus non démiss.", "Battus", "Non candidats"]
    by_cat: dict[str, list[int]] = {c: [] for c in cats_order}
    for r in rows:
        cat = r["categorie"]
        if cat in by_cat:
            by_cat[cat].append(r["age"])

    all_ages = [r["age"] for r in rows]
    distributions = []
    for cat in cats_order:
        ages = by_cat[cat]
        if not ages:
            continue
        sorted_ages = sorted(ages)
        n = len(sorted_ages)
        distributions.append({
            "categorie": cat,
            "ages": ages,
            "count": n,
            "median": sorted_ages[n // 2],
            "mean": round(sum(ages) / n, 1),
        })

    return {
        "categories": [d["categorie"] for d in distributions],
        "distributions": distributions,
        "age_range": [min(all_ages) if all_ages else 25, max(all_ages) if all_ages else 85],
    }


# =====================================================================
# Chart 16 — Gender × Nuance Matrix (bubble matrix)
# =====================================================================

def stats_gender_nuance_matrix(annee: int = 20) -> dict:
    """Bubble matrix: gender × nuance intersection."""
    table = _get_table(annee)
    sql = f"""
    SELECT nuance_parlementaire AS nuance, civilite_elu AS genre,
      COUNT(*) AS total,
      SUM(CASE WHEN statut_candidature != '0_noncandidat' THEN 1 ELSE 0 END) AS candidats,
      SUM(CASE WHEN elu_cm = 1 THEN 1 ELSE 0 END) AS elus,
      SUM(CASE WHEN elu_cm = 1 AND (position_cumul_2 LIKE '%CM-M%' OR position_cumul_2 LIKE '%CM-A%')
        THEN 1 ELSE 0 END) AS executif,
      SUM(CASE WHEN mvmt_parlementaire = 'Démissionnaire' THEN 1 ELSE 0 END) AS demissions
    FROM {table}
    GROUP BY 1, 2
    ORDER BY nuance, genre
    """
    rows = _query(sql)

    # Get nuances sorted by total desc
    nuance_totals: dict[str, int] = {}
    for r in rows:
        nuance_totals[r["nuance"]] = nuance_totals.get(r["nuance"], 0) + r["total"]
    nuances = sorted(nuance_totals, key=lambda n: -nuance_totals[n])

    cells = []
    for r in rows:
        total = r["total"] or 1
        candidats = r["candidats"] or 0
        elus = r["elus"] or 0
        cells.append({
            **r,
            "taux_candidature": round(candidats * 100 / total, 1),
            "taux_election": round(elus * 100 / candidats, 1) if candidats else 0,
            "taux_executif": round(r["executif"] * 100 / elus, 1) if elus else 0,
        })

    return {
        "nuances": nuances,
        "genres": ["M", "Mme"],
        "cells": cells,
    }


# =====================================================================
# Chart 17 — Circle-packing "Galaxie des cumuls"
# =====================================================================

_PROFIL_SQL = """
    CASE
        WHEN position_cumul_2 LIKE '%CM-M%' THEN 'Maire'
        WHEN position_cumul_2 LIKE '%CM-A%' THEN 'Adjoint'
        WHEN position_cumul_2 LIKE '%CC-P%' OR position_cumul_2 LIKE '%CC-VP%' THEN 'Pres./VP interco'
        WHEN position_cumul_2 LIKE '%CC%' THEN 'Cons. interco'
        WHEN position_cumul_2 LIKE '%CD%' OR position_cumul_2 LIKE '%CR%' THEN 'Depart./Regional'
        WHEN position_cumul_2 LIKE '%CM%' THEN 'CM simple'
        WHEN elu_cm = 1 THEN 'Elu CM autre'
        ELSE 'Non-elu'
    END
"""

_MANDAT_SQL = """
    CASE
        WHEN position_cumul_1 LIKE 'D' OR position_cumul_1 LIKE 'D / %' THEN 'Depute'
        WHEN position_cumul_1 LIKE 'S' OR position_cumul_1 LIKE 'S / %' THEN 'Senateur'
        ELSE 'RPE'
    END
"""


def stats_circle_pack_cumuls(annee: int = 20) -> dict:
    """Circle-packing: nuance → profil de cumul, with démission links.

    Returns a hierarchy tree for visx Pack and optional arcs showing
    which cumul profiles have significant démission rates.
    """
    table = _get_table(annee)
    rows = _query(f"""
        SELECT
            COALESCE(
                NULLIF(nuance_parlementaire, ''),
                NULLIF(nuance_municipale, ''),
                'Autre'
            ) AS nuance,
            {_PROFIL_SQL} AS profil,
            {_MANDAT_SQL} AS mandat_national,
            COUNT(*) AS total,
            SUM(CASE WHEN mvmt_parlementaire = 'Démissionnaire' THEN 1 ELSE 0 END) AS demissions
        FROM {table}
        GROUP BY 1, 2, 3
    """)

    # Build hierarchy: root → nuance → profil (leaves)
    # Aggregate across mandat_national for the hierarchy, keep detail for tooltip
    nuance_map: dict[str, dict[str, dict]] = {}
    for r in rows:
        nu = r["nuance"]
        pr = r["profil"]
        if nu not in nuance_map:
            nuance_map[nu] = {}
        if pr not in nuance_map[nu]:
            nuance_map[nu][pr] = {"total": 0, "demissions": 0, "deputes": 0, "senateurs": 0, "rpe": 0}
        entry = nuance_map[nu][pr]
        entry["total"] += r["total"]
        entry["demissions"] += r["demissions"]
        mn = r["mandat_national"]
        if mn == "Depute":
            entry["deputes"] += r["total"]
        elif mn == "Senateur":
            entry["senateurs"] += r["total"]
        else:
            entry["rpe"] += r["total"]

    # Sort nuances by total descending
    nuance_totals = {nu: sum(p["total"] for p in profils.values()) for nu, profils in nuance_map.items()}
    sorted_nuances = sorted(nuance_totals, key=nuance_totals.get, reverse=True)

    children = []
    for nu in sorted_nuances:
        profils = nuance_map[nu]
        nu_children = []
        for pr, data in sorted(profils.items(), key=lambda x: -x[1]["total"]):
            dem_pct = round(data["demissions"] * 100 / data["total"], 1) if data["total"] else 0
            nu_children.append({
                "name": pr,
                "value": data["total"],
                "demissions": data["demissions"],
                "dem_pct": dem_pct,
                "deputes": data["deputes"],
                "senateurs": data["senateurs"],
                "rpe": data["rpe"],
            })
        children.append({
            "name": nu,
            "total": nuance_totals[nu],
            "children": nu_children,
        })

    # Build démission links: profils with significant démission counts
    # Link = dashed ring around (nuance, profil) circles with démissions >= 2
    links = []
    for nu in sorted_nuances:
        for pr, data in nuance_map[nu].items():
            if data["demissions"] >= 2:
                dem_pct = round(data["demissions"] * 100 / data["total"], 1)
                if dem_pct >= 1:
                    links.append({
                        "nuance": nu,
                        "profil": pr,
                        "total": data["total"],
                        "demissions": data["demissions"],
                        "dem_pct": dem_pct,
                    })

    grand_total = sum(nuance_totals.values())

    return {
        "root": {"name": "Cumuls", "children": children},
        "links": links,
        "total": grand_total,
    }


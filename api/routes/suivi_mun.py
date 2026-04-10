"""
Suivi MUN endpoints — Cumul & Démission / Sankey dashboard.

Routes pour l'analyse du cumul des mandats et des démissions
(municipales 2020 vs 2026). Sans authentification.
"""

import logging
import re
import unicodedata
import urllib.parse
from functools import lru_cache
from typing import Optional

import httpx
import pandas as pd
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import RedirectResponse, StreamingResponse

from api.services import suivi_mun_service as svc

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# BREF name→ID lookup (loaded once at import time)
# ---------------------------------------------------------------------------

def _normalize(s: str) -> str:
    """Strip accents, uppercase, collapse hyphens/spaces — used as lookup key."""
    n = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().upper().strip()
    return re.sub(r"[\s\-']+", " ", n).strip()


def _senat_slug(s: str) -> str:
    """Normalize a name part for the senat.fr photo URL (lowercase, accents stripped, spaces→_)."""
    n = unicodedata.normalize("NFD", str(s).lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s'-]+", "_", n).strip("_")


try:
    _bref = pd.read_parquet("data/elections/bref/parquet/bref_individuals.parquet")
    _bref["_ln"] = _bref["LastName"].apply(_normalize)
    _bref["_fn"] = _bref["FirstName"].apply(_normalize)
    _bref_dedup = _bref.drop_duplicates(subset=["_ln", "_fn"])
    _bref_lookup: dict[tuple[str, str], tuple[Optional[str], Optional[str]]] = {
        (row._ln, row._fn): (row.AssemblyId if pd.notna(row.AssemblyId) else None,
                             row.SenateId   if pd.notna(row.SenateId)   else None)
        for _, row in _bref_dedup.iterrows()
    }
    _bref_id_lookup: dict[tuple[str, str], dict] = {
        (row._ln, row._fn): {
            "individual_id": row.IndividualId,
            "birth_date": str(row.BirthDate) if pd.notna(row.BirthDate) else None,
            "birth_municipality": row.BirthMunicipality if pd.notna(row.BirthMunicipality) else None,
            "birth_department": row.BirthDepartment if pd.notna(row.BirthDepartment) else None,
        }
        for _, row in _bref_dedup.iterrows()
    }
except Exception:
    _bref_lookup = {}
    _bref_id_lookup = {}

try:
    _bref_mandates = pd.read_parquet("data/elections/bref/parquet/bref_mandates.parquet")
    _bref_professions = pd.read_parquet("data/elections/bref/parquet/bref_professions.parquet")
    _prof_map = dict(zip(_bref_professions["ProfessionId"], _bref_professions["ProfessionName"]))
except Exception:
    _bref_mandates = pd.DataFrame()
    _prof_map = {}

# ---------------------------------------------------------------------------
# Photo proxy helpers
# ---------------------------------------------------------------------------

_WIKI_UA = "Mozilla/5.0 (compatible; CumulAnaelBot/1.0)"


def _try_an_photo(assembly_id: str, client: httpx.Client) -> Optional[str]:
    num_id = assembly_id.replace("PA", "")
    for leg in (15, 16, 17):
        url = f"https://www.assemblee-nationale.fr/dyn/static/tribun/{leg}/photos/{num_id}.jpg"
        try:
            r = client.get(url)
            if r.status_code == 200 and "image" in r.headers.get("content-type", ""):
                return url
        except Exception:
            continue
    return None


def _try_senat_photo(senate_id: str, nom: str, prenom: str, client: httpx.Client) -> Optional[str]:
    matricule = senate_id.lower()
    nom_s = _senat_slug(nom)
    prenom_s = _senat_slug(prenom)
    url = f"https://www.senat.fr/senimg/{nom_s}_{prenom_s}{matricule}_carre.jpg"
    try:
        r = client.get(url)
        if r.status_code == 200 and "image" in r.headers.get("content-type", ""):
            return url
    except Exception:
        pass
    return None


def _try_wikipedia(prenom: str, nom: str, client: httpx.Client) -> Optional[str]:
    nom_tc = nom.title()
    title = urllib.parse.quote(f"{prenom} {nom_tc}")
    api_url = (
        f"https://fr.wikipedia.org/w/api.php?action=query"
        f"&titles={title}&prop=pageimages&pithumbsize=120&format=json"
    )
    try:
        r = client.get(api_url, headers={"User-Agent": _WIKI_UA})
        if r.status_code == 200:
            pages = r.json().get("query", {}).get("pages", {})
            page = next(iter(pages.values()), {})
            src = page.get("thumbnail", {}).get("source")
            if src:
                return src
    except Exception:
        pass
    return None


@lru_cache(maxsize=2048)
def _resolve_photo_url(prenom: str, nom: str) -> Optional[str]:
    key = (_normalize(nom), _normalize(prenom))
    assembly_id, senate_id = _bref_lookup.get(key, (None, None))

    with httpx.Client(follow_redirects=True, timeout=6) as client:
        if assembly_id:
            url = _try_an_photo(assembly_id, client)
            if url:
                return url
        if senate_id:
            url = _try_senat_photo(senate_id, nom, prenom, client)
            if url:
                return url
        return _try_wikipedia(prenom, nom, client)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(
    prefix="/api/suivi-mun",
    tags=["suivi-mun"],
)


@router.get("/photo")
def get_parlementaire_photo(prenom: str = Query(...), nom: str = Query(...)):
    """Proxy photo pour un parlementaire."""
    url = _resolve_photo_url(prenom.strip(), nom.strip())
    if not url:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    return RedirectResponse(url=url, status_code=302)


@router.get("/person-timeline")
def get_person_timeline(prenom: str = Query(...), nom: str = Query(...)):
    """Parcours d'une personne sur 2020 et 2026."""
    return service.person_timeline(prenom.strip(), nom.strip())


@router.get("/bref-profile")
def get_bref_profile(prenom: str = Query(...), nom: str = Query(...)):
    """Données BREF d'enrichissement : mandats, profession, naissance."""
    key = (_normalize(nom.strip()), _normalize(prenom.strip()))
    info = _bref_id_lookup.get(key)
    if not info:
        raise HTTPException(status_code=404, detail="Personne non trouvée dans BREF")

    ind_id = info["individual_id"]
    result: dict = {
        "birth_date": info["birth_date"],
        "birth_municipality": info["birth_municipality"],
        "birth_department": info["birth_department"],
    }

    if not _bref_mandates.empty:
        person_mandates = _bref_mandates[_bref_mandates["IndividualId"] == ind_id].copy()
        if not person_mandates.empty:
            mandates_list = []
            for _, m in person_mandates.iterrows():
                mandates_list.append({
                    "type": m["MandateType"] if pd.notna(m["MandateType"]) else None,
                    "start": str(m["MandateStartDate"]) if pd.notna(m["MandateStartDate"]) else None,
                    "end": str(m["MandateEndDate"]) if pd.notna(m["MandateEndDate"]) else None,
                    "end_reason": m["MandateEndReason"] if pd.notna(m["MandateEndReason"]) else None,
                    "source": m["Sources"] if pd.notna(m["Sources"]) else None,
                })
            mandates_list.sort(key=lambda x: x["start"] or "", reverse=True)
            result["mandates"] = mandates_list

            for _, m in person_mandates.iterrows():
                if pd.notna(m.get("ProfessionId")) and m["ProfessionId"] in _prof_map:
                    prof = _prof_map[m["ProfessionId"]]
                    if "SANS PROFESSION" not in prof.upper():
                        result["profession"] = prof.title()
                        break

    return result


@router.get("/elus/{annee}")
def list_elus(annee: int, limit: int = Query(100, le=5000), offset: int = 0):
    """Liste paginée des élus (annee = 20 ou 26)."""
    if not svc.is_available():
        raise HTTPException(status_code=503, detail="Base suivi_mun non disponible")
    try:
        return svc.get_elus(annee, limit, offset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/elus/{annee}/{elu_id}")
def detail_elu(annee: int, elu_id: int):
    """Détail d'un élu par ID."""
    if not svc.is_available():
        raise HTTPException(status_code=503, detail="Base suivi_mun non disponible")
    result = svc.get_elu_by_id(annee, elu_id)
    if not result:
        raise HTTPException(status_code=404, detail="Élu non trouvé")
    return result[0]


def _check_available():
    if not svc.is_available():
        raise HTTPException(status_code=503, detail="Base suivi_mun non disponible")


# =====================================================================
# Sankey routes — MUST come before /stats/{annee}/* to avoid conflicts
# =====================================================================

@router.get("/stats/evolution")
def get_stats_evolution():
    """Comparaison des cumuls entre 2020 et 2026."""
    _check_available()
    return svc.stats_evolution()


@router.get("/stats/sankey/options")
def get_sankey_options(annee: int = Query(20)):
    """Options disponibles pour le Sankey (mandats et fonctions)."""
    _check_available()
    return svc.sankey_options(annee=annee)


@router.get("/stats/sankey/evolution")
def get_sankey_evolution(
    mandats: str = Query("cm"),
    fonctions: str = Query(""),
    annee: int = Query(20),
):
    """Sankey évolution des mandats : position_cumul_1 → position_cumul_2."""
    _check_available()
    try:
        return svc.stats_sankey_evolution(mandats=mandats, fonctions=fonctions, annee=annee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/sankey/ancrage/options")
def get_ancrage_options(annee: int = Query(20)):
    """Catégories disponibles pour le Sankey ancrage."""
    _check_available()
    return svc.ancrage_options(annee=annee)


@router.get("/stats/sankey/ancrage")
def get_sankey_ancrage(
    categorie: str = Query("depute"),
    annee: int = Query(20),
):
    """Sankey arbre de situations : stratégies d'ancrage municipal par catégorie."""
    _check_available()
    try:
        return svc.stats_sankey_ancrage(categorie=categorie, annee=annee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/sankey/parlementaires/detail/options")
def get_parlementaires_detail_options(annee: int = Query(20)):
    """Options pour le Sankey détaillé parlementaires."""
    _check_available()
    return svc.parlementaires_detail_options(annee=annee)


@router.get("/stats/sankey/parlementaires/detail/persons")
def get_parlementaires_detail_persons(
    categorie: str = Query("depute"),
    node: str = Query("total"),
    source: str | None = Query(None),
    annee: int = Query(20),
):
    """Liste nominative des personnes pour un nœud du Sankey parlementaires."""
    _check_available()
    try:
        return svc.parlementaires_detail_persons(categorie=categorie, node=node, source=source, annee=annee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/sankey/parlementaires/detail")
def get_sankey_parlementaires_detail(
    categorie: str = Query("depute"),
    annee: int = Query(20),
):
    """Sankey détaillé : Parlementaire → Candidat → Élu → Fonction → Démission."""
    _check_available()
    try:
        return svc.stats_sankey_parlementaires_detail(categorie=categorie, annee=annee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/sankey/tracabilite/options")
def get_tracabilite_options(annee: int = Query(20)):
    """Options pour le Sankey traçabilité."""
    _check_available()
    return svc.parlementaires_detail_options(annee=annee)


@router.get("/stats/sankey/tracabilite/persons")
def get_tracabilite_persons(
    categorie: str = Query("depute"),
    node: str = Query("total"),
    origin: str | None = Query(None),
    source: str | None = Query(None),
    annee: int = Query(20),
):
    """Liste nominative des personnes pour un nœud du Sankey traçabilité."""
    _check_available()
    try:
        return svc.parlementaires_detail_persons(categorie=categorie, node=node, origin=origin, source=source, annee=annee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/filtered")
def get_filtered_stats(
    categorie: str | None = Query(None),
    node: str | None = Query(None),
    source: str | None = Query(None),
    origin: str | None = Query(None),
    nuance: str | None = Query(None),
    departement: str | None = Query(None),
    civilite: str | None = Query(None),
    age_min: int | None = Query(None),
    age_max: int | None = Query(None),
    elu: int | None = Query(None),
    annee: int = Query(20),
):
    """Stats agrégées filtrables (nuances, genre, départements, âge, fonctions)."""
    _check_available()
    try:
        return svc.filtered_stats(
            annee=annee,
            categorie=categorie, node=node, source=source, origin=origin,
            nuance=nuance, departement=departement, civilite=civilite,
            age_min=age_min, age_max=age_max, elu=elu,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/filtered/persons")
def get_filtered_persons(
    categorie: str | None = Query(None),
    node: str | None = Query(None),
    source: str | None = Query(None),
    origin: str | None = Query(None),
    nuance: str | None = Query(None),
    departement: str | None = Query(None),
    civilite: str | None = Query(None),
    age_min: int | None = Query(None),
    age_max: int | None = Query(None),
    elu: int | None = Query(None),
    annee: int = Query(20),
):
    """Liste nominative filtrée avec civilité et âge."""
    _check_available()
    try:
        return svc.filtered_persons(
            annee=annee,
            categorie=categorie, node=node, source=source, origin=origin,
            nuance=nuance, departement=departement, civilite=civilite,
            age_min=age_min, age_max=age_max, elu=elu,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/filtered/export")
def get_filtered_export(
    categorie: str | None = Query(None),
    node: str | None = Query(None),
    source: str | None = Query(None),
    origin: str | None = Query(None),
    nuance: str | None = Query(None),
    departement: str | None = Query(None),
    civilite: str | None = Query(None),
    age_min: int | None = Query(None),
    age_max: int | None = Query(None),
    elu: int | None = Query(None),
    format: str = Query("json"),
    annee: int = Query(20),
):
    """Export de la liste nominative filtrée (CSV ou JSON)."""
    _check_available()
    try:
        rows = svc.filtered_export(
            annee=annee,
            categorie=categorie, node=node, source=source, origin=origin,
            nuance=nuance, departement=departement, civilite=civilite,
            age_min=age_min, age_max=age_max, elu=elu,
        )
        if format == "csv":
            import csv
            import io
            output = io.StringIO()
            output.write('\ufeff')
            if rows:
                writer = csv.DictWriter(output, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
            output.seek(0)
            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv; charset=utf-8",
                headers={"Content-Disposition": "attachment; filename=export_parlementaires.csv"},
            )
        return rows
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/sankey/tracabilite")
def get_sankey_tracabilite(
    categorie: str = Query("depute"),
    annee: int = Query(20),
):
    """Sankey traçabilité : flux colorés par origine (CM vs non-CM)."""
    _check_available()
    try:
        return svc.stats_sankey_tracabilite(categorie=categorie, annee=annee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/sankey/parlementaires")
def get_sankey_parlementaires(annee: int = Query(20)):
    """Sankey parlementaires (D+S) → municipales → cumul/démissions."""
    _check_available()
    return svc.stats_sankey_parlementaires(annee=annee)


@router.get("/stats/sankey/horizontal/options")
def get_horizontal_options(annee: int = Query(20)):
    """Catégories disponibles pour le Sankey horizontal (CR/CD)."""
    _check_available()
    return svc.horizontal_options(annee=annee)


@router.get("/stats/sankey/horizontal")
def get_sankey_horizontal(
    categorie: str = Query("cd"),
    annee: int = Query(20),
):
    """Sankey ancrage horizontal : CR ou CD (hors parlementaires) → municipales."""
    _check_available()
    try:
        return svc.stats_sankey_horizontal(categorie=categorie, annee=annee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/sankey/fonctions")
def get_fonctions_executives(annee: int = Query(20)):
    """Sankey cumul de fonctions exécutives (position_cumul_2)."""
    _check_available()
    return svc.stats_fonctions_executives(annee=annee)


@router.get("/stats/sankey/nuances/options")
def get_nuances_options(annee: int = Query(20)):
    """Scopes disponibles pour le Sankey nuances croisées."""
    _check_available()
    return svc.nuances_options(annee=annee)


@router.get("/stats/sankey/nuances")
def get_nuances_croisees(
    scope: str = Query("parlementaires"),
    annee: int = Query(20),
):
    """Sankey nuances politiques croisées : parlementaire → municipale."""
    _check_available()
    try:
        return svc.stats_nuances_croisees(scope=scope, annee=annee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/sankey/export")
def export_sankey(
    mandats: str = Query("cm"),
    fonctions: str = Query(""),
    annee: int = Query(20),
):
    """Export CSV des personnes et trajectoires pour la sélection Sankey."""
    _check_available()
    try:
        rows = svc.sankey_export(mandats=mandats, fonctions=fonctions, annee=annee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    import io
    import csv

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["nom", "prenom", "cumul", "candidature", "elu", "departement", "commune"],
        extrasaction="ignore",
    )
    writer.writeheader()
    writer.writerows(rows)

    content = output.getvalue().encode("utf-8-sig")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=sankey_export_{mandats}_{fonctions}.csv"},
    )


@router.get("/stats/sankey")
def get_stats_sankey(
    mandats: str = Query("cm"),
    fonctions: str = Query(""),
    annee: int = Query(20),
):
    """Données pour diagramme Sankey : parcours des cumulants."""
    _check_available()
    try:
        return svc.stats_sankey(mandats=mandats, fonctions=fonctions, annee=annee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =====================================================================
# Year-parameterized routes — AFTER sankey routes to avoid conflicts
# =====================================================================

@router.get("/stats/{annee}/cumuls")
def get_stats_cumuls(annee: int):
    """Répartition des types de cumul de mandats."""
    _check_available()
    return svc.stats_cumuls(annee)


@router.get("/stats/{annee}/nuances")
def get_stats_nuances(annee: int):
    """Répartition par nuance politique."""
    _check_available()
    return svc.stats_nuances(annee)


@router.get("/stats/{annee}/departements")
def get_stats_departements(annee: int):
    """Nombre d'élus en cumul par département."""
    _check_available()
    return svc.stats_departements(annee)


@router.get("/stats/{annee}/age")
def get_stats_age(annee: int):
    """Distribution par tranche d'âge."""
    _check_available()
    return svc.stats_age(annee)


@router.get("/stats/{annee}/genre")
def get_stats_genre(annee: int):
    """Répartition hommes/femmes."""
    _check_available()
    return svc.stats_genre(annee)

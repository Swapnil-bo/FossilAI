from __future__ import annotations

import json
import logging
import os

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/demo", tags=["demo"])

DEMO_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "demo_data")

# ---------------------------------------------------------------------------
# In-memory cache — loaded once at import time, holds all demo JSON files
# ---------------------------------------------------------------------------

_demo_cache: dict[str, dict] = {}


def _load_demo_data() -> None:
    """Scan demo_data/ for JSON files and cache them keyed by repo name."""
    if not os.path.isdir(DEMO_DATA_DIR):
        logger.warning("Demo data directory not found: %s", DEMO_DATA_DIR)
        return

    for filename in os.listdir(DEMO_DATA_DIR):
        if not filename.endswith(".json"):
            continue

        repo_name = filename[:-5]  # strip .json
        filepath = os.path.join(DEMO_DATA_DIR, filename)

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            _demo_cache[repo_name] = data
            logger.info("Loaded demo data: %s (%d bytes)", repo_name, os.path.getsize(filepath))
        except (json.JSONDecodeError, OSError) as exc:
            logger.error("Failed to load demo file %s: %s", filepath, exc)


# Load on module import
_load_demo_data()


# ---------------------------------------------------------------------------
# Metadata for the repo listing endpoint
# ---------------------------------------------------------------------------

_DEMO_METADATA: dict[str, dict] = {
    "express": {
        "name": "expressjs/express",
        "description": "Fast, unopinionated web framework for Node.js",
        "url": "https://github.com/expressjs/express",
        "language": "JavaScript",
        "language_color": "#f1e05a",
        "stars": 65000,
    },
    "flask": {
        "name": "pallets/flask",
        "description": "Lightweight WSGI web application framework in Python",
        "url": "https://github.com/pallets/flask",
        "language": "Python",
        "language_color": "#3572A5",
        "stars": 68000,
    },
    "fastapi": {
        "name": "tiangolo/fastapi",
        "description": "Modern, fast web framework for building APIs with Python",
        "url": "https://github.com/tiangolo/fastapi",
        "language": "Python",
        "language_color": "#3572A5",
        "stars": 78000,
    },
}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/repos")
async def list_demo_repos():
    """Return a list of available pre-analyzed demo repositories."""
    repos = []
    for repo_name, data in _demo_cache.items():
        meta = _DEMO_METADATA.get(repo_name, {})
        repos.append({
            "repo_name": repo_name,
            "name": meta.get("name", f"{data.get('owner', '?')}/{data.get('repo', repo_name)}"),
            "description": meta.get("description", ""),
            "url": meta.get("url", f"https://github.com/{data.get('owner', '?')}/{data.get('repo', repo_name)}"),
            "language": meta.get("language", ""),
            "language_color": meta.get("language_color", "#888"),
            "stars": meta.get("stars", 0),
            "file_count": data.get("file_count", 0),
            "is_demo": True,
        })

    return {"repos": repos}


@router.get("/analysis/{repo_name}")
async def get_demo_analysis(repo_name: str):
    """Return the full pre-analyzed result for a demo repository."""
    data = _demo_cache.get(repo_name)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail=f"Demo repo '{repo_name}' not found. Available: {list(_demo_cache.keys())}",
        )

    return data

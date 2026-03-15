from __future__ import annotations

import logging
import re
import traceback

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.schemas import AnalysisResult
from services.cache import (
    cache_analysis,
    cache_repo,
    get_cached_analysis,
    get_cached_repo,
)
from services.gemini_analyzer import analyze_repo as gemini_analyze
from services.github_fetcher import fetch_repo_zipball
from services.groq_extractor import (
    extract_adrs,
    extract_dependency_graph,
    extract_refactor_seeds,
    extract_tech_debt,
)
from services.import_extractor import build_import_map
from services.section_slicer import slice_gemini_output
from utils.token_counter import estimate_tokens_for_files

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory status tracking
# ---------------------------------------------------------------------------

_analysis_status: dict[str, str] = {}

# Matches: github.com/owner/repo, with optional scheme, www, .git suffix, trailing slashes/paths
_GITHUB_URL_RE = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)"
)


class AnalyzeRequest(BaseModel):
    repo_url: str


def _parse_github_url(url: str) -> tuple[str, str]:
    """Extract (owner, repo) from a GitHub URL."""
    match = _GITHUB_URL_RE.search(url.strip())
    if not match:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub URL. Expected format: https://github.com/owner/repo",
        )

    owner = match.group(1)
    repo = match.group(2)

    if repo.endswith(".git"):
        repo = repo[:-4]

    return owner, repo


def _normalize_repo_url(owner: str, repo: str) -> str:
    """Build a canonical cache key from owner/repo."""
    return f"https://github.com/{owner}/{repo}"


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------

@router.get("/analyze/status")
async def get_analysis_status(repo_url: str = Query(...)):
    """Return the current analysis stage for a given repo URL."""
    owner, repo = _parse_github_url(repo_url)
    cache_key = _normalize_repo_url(owner, repo)
    status = _analysis_status.get(cache_key, "idle")
    return {"repo_url": cache_key, "status": status}


# ---------------------------------------------------------------------------
# Main analysis endpoint
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze_repo_endpoint(request: AnalyzeRequest):
    """Full analysis pipeline: fetch → parse → analyze → extract → return."""
    owner, repo = _parse_github_url(request.repo_url)
    cache_key = _normalize_repo_url(owner, repo)

    # 1. Check cache for completed analysis
    cached_analysis = await get_cached_analysis(cache_key)
    if cached_analysis is not None:
        _analysis_status[cache_key] = "complete"
        return {**cached_analysis, "source": "cache"}

    try:
        # 2. Fetch repo data (from cache or GitHub)
        _analysis_status[cache_key] = "fetching"

        cached_repo = await get_cached_repo(cache_key)
        if cached_repo is not None:
            files, file_tree = cached_repo
        else:
            files, file_tree = await fetch_repo_zipball(owner, repo)
            await cache_repo(cache_key, file_tree, files)

        total_tokens = estimate_tokens_for_files(files)

        # 3. Parse imports
        _analysis_status[cache_key] = "parsing"
        import_map = build_import_map(files)

        # 4. Analyze with Gemini
        _analysis_status[cache_key] = "analyzing"
        raw_analysis, warnings = await gemini_analyze(files, file_tree, import_map)

        # 5. Slice Gemini output into sections
        sections = slice_gemini_output(raw_analysis)

        # 6. Extract structured data with Groq (one call per section)
        _analysis_status[cache_key] = "extracting"

        dependency_graph = await extract_dependency_graph(
            sections.get("DEPENDENCIES", "")
        ) if "DEPENDENCIES" in sections else None

        adrs = await extract_adrs(
            sections.get("DECISIONS", "")
        ) if "DECISIONS" in sections else []

        tech_debt = await extract_tech_debt(
            sections.get("TECH_DEBT", "")
        ) if "TECH_DEBT" in sections else []

        refactor_scenarios = await extract_refactor_seeds(
            sections.get("REFACTORING", "")
        ) if "REFACTORING" in sections else []

        # 7. Assemble the final result
        from models.schemas import DependencyGraph

        result = AnalysisResult(
            architecture=sections.get("ARCHITECTURE", ""),
            modules=sections.get("MODULES", ""),
            dependency_graph=dependency_graph or DependencyGraph(),
            adrs=adrs,
            tech_debt=tech_debt,
            refactor_scenarios=refactor_scenarios,
            warnings=warnings,
        )

        result_dict = result.model_dump()
        result_dict["owner"] = owner
        result_dict["repo"] = repo
        result_dict["file_count"] = len(files)
        result_dict["total_tokens_estimate"] = total_tokens
        result_dict["source"] = "analyzed"

        # 8. Cache the analysis
        await cache_analysis(cache_key, result_dict)

        _analysis_status[cache_key] = "complete"
        return result_dict

    except HTTPException:
        _analysis_status[cache_key] = "error"
        raise

    except Exception as exc:
        _analysis_status[cache_key] = "error"
        logger.error("Analysis failed for %s: %s\n%s", cache_key, exc, traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(exc)}",
        ) from exc

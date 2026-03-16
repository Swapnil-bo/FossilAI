from __future__ import annotations

import logging
import re
import traceback

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from models.prompts import GEMINI_REFACTOR_PROMPT, GROQ_REFACTOR_IMPACT_PROMPT
from models.schemas import GraphEdge, RefactorImpact, RefactorRequest
from services.cache import get_cached_analysis
from services.gemini_analyzer import _call_gemini
from services.groq_extractor import _call_groq_json, _truncate_section

logger = logging.getLogger(__name__)

router = APIRouter()

# Matches: github.com/owner/repo, with optional scheme, www, .git suffix
_GITHUB_URL_RE = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)"
)


def _parse_github_url(url: str) -> tuple[str, str]:
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
    return f"https://github.com/{owner}/{repo}"


@router.post("/refactor")
async def simulate_refactor(request: RefactorRequest):
    """Simulate a refactoring scenario against a previously-analyzed repo."""
    owner, repo = _parse_github_url(request.repo_url)
    cache_key = _normalize_repo_url(owner, repo)

    # 1. Load the cached analysis — repo must have been analyzed first
    cached = await get_cached_analysis(cache_key)
    if cached is None:
        raise HTTPException(
            status_code=404,
            detail="No analysis found for this repository. Run /analyze first.",
        )

    # 2. Build a condensed analysis string for Gemini
    analysis_parts = []
    for key in ("architecture", "modules"):
        val = cached.get(key, "")
        if val:
            analysis_parts.append(f"[{key.upper()}]\n{val}")

    # Include the dependency graph as a readable list
    dep_graph = cached.get("dependency_graph", {})
    if dep_graph:
        nodes = dep_graph.get("nodes", [])
        edges = dep_graph.get("edges", [])
        node_lines = [
            f"  {n.get('id', '')} ({n.get('type', 'file')}): {n.get('description', '')}"
            for n in nodes[:50]
        ]
        edge_lines = [
            f"  {e.get('source', '')} -> {e.get('target', '')} ({e.get('type', 'import')})"
            for e in edges[:80]
        ]
        analysis_parts.append(
            "[DEPENDENCY GRAPH]\nNodes:\n"
            + "\n".join(node_lines)
            + "\n\nEdges:\n"
            + "\n".join(edge_lines)
        )

    # Include tech debt for context
    tech_debt = cached.get("tech_debt", [])
    if tech_debt:
        debt_lines = [
            f"  {d.get('file', '')} [{d.get('severity', '')}]: {d.get('description', '')}"
            for d in tech_debt[:20]
        ]
        analysis_parts.append("[TECH DEBT]\n" + "\n".join(debt_lines))

    analysis_text = "\n\n".join(analysis_parts)

    # Determine target files string
    target_files_str = (
        ", ".join(request.target_files)
        if request.target_files
        else "all relevant files"
    )

    try:
        # 3. Call Gemini for the refactor simulation
        prompt = GEMINI_REFACTOR_PROMPT.format(
            scenario=request.scenario,
            target_files=target_files_str,
            analysis=analysis_text,
        )

        raw_simulation = await _call_gemini(prompt)

        # 4. Extract structured JSON via Groq
        truncated = _truncate_section(raw_simulation)
        groq_prompt = GROQ_REFACTOR_IMPACT_PROMPT.format(section=truncated)
        data = await _call_groq_json(groq_prompt)

        if not isinstance(data, dict):
            data = {}

        # 5. Validate edges
        new_edges = []
        for raw_edge in data.get("new_edges", []):
            try:
                new_edges.append(GraphEdge(**raw_edge))
            except (ValidationError, TypeError):
                continue

        removed_edges = []
        for raw_edge in data.get("removed_edges", []):
            try:
                removed_edges.append(GraphEdge(**raw_edge))
            except (ValidationError, TypeError):
                continue

        # Normalize risk_level
        risk_level = data.get("risk_level", "medium").lower().strip()
        if risk_level not in ("low", "medium", "high", "critical"):
            risk_level = "medium"

        result = RefactorImpact(
            risk_level=risk_level,
            summary=data.get("summary", ""),
            affected_files=data.get("affected_files", []),
            new_edges=new_edges,
            removed_edges=removed_edges,
            steps=data.get("steps", []),
            potential_issues=data.get("potential_issues", []),
        )

        return result.model_dump()

    except HTTPException:
        raise

    except Exception as exc:
        logger.error(
            "Refactor simulation failed for %s: %s\n%s",
            cache_key,
            exc,
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=500,
            detail=f"Refactor simulation failed: {str(exc)}",
        ) from exc

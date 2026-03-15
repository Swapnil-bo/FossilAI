from __future__ import annotations

import json
import logging
import re

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from config import (
    GROQ_API_KEY,
    GROQ_MAX_INPUT_TOKENS,
    GROQ_MAX_RETRIES,
    GROQ_MIN_REQUEST_GAP_SECONDS,
    GROQ_RPM,
)
from models.prompts import (
    GROQ_ADR_PROMPT,
    GROQ_DEPENDENCY_PROMPT,
    GROQ_FIX_JSON_PROMPT,
    GROQ_REFACTOR_PROMPT,
    GROQ_TECH_DEBT_PROMPT,
)
from models.schemas import (
    ADR,
    DependencyGraph,
    GraphEdge,
    GraphNode,
    RefactorScenario,
    TechDebtItem,
)
from utils.rate_limiter import AsyncRateLimiter
from utils.token_counter import estimate_tokens

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"

_groq_limiter = AsyncRateLimiter(
    rpm=GROQ_RPM,
    base_backoff=GROQ_MIN_REQUEST_GAP_SECONDS,
    max_backoff=32.0,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _truncate_section(section: str, max_tokens: int = GROQ_MAX_INPUT_TOKENS) -> str:
    """Truncate a section to fit within Groq's context window budget."""
    if estimate_tokens(section) <= max_tokens:
        return section
    # Rough char limit: max_tokens * 4 chars/token, leave room for the prompt
    char_limit = max_tokens * 4
    truncated = section[:char_limit]
    return truncated + "\n\n...truncated. Focus on the items above."


def _extract_json_from_text(text: str) -> str:
    """Try to extract JSON from a response that might have markdown fences or extra text."""
    # Strip markdown code fences
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1).strip()

    # Try to find JSON array or object
    # Look for the outermost [ ] or { }
    text = text.strip()

    # Find first [ or {
    for i, ch in enumerate(text):
        if ch == "[":
            # Find matching ]
            depth = 0
            for j in range(i, len(text)):
                if text[j] == "[":
                    depth += 1
                elif text[j] == "]":
                    depth -= 1
                    if depth == 0:
                        return text[i : j + 1]
            break
        elif ch == "{":
            depth = 0
            for j in range(i, len(text)):
                if text[j] == "{":
                    depth += 1
                elif text[j] == "}":
                    depth -= 1
                    if depth == 0:
                        return text[i : j + 1]
            break

    return text


async def _call_groq(prompt: str) -> str:
    """Send a prompt to Groq and return the response text.

    Handles rate limiting with retries and exponential backoff.
    """
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured. Add it to your .env file.",
        )

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "temperature": 0.0,
        "max_tokens": 2048,
    }

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    last_error: Exception | None = None

    for attempt in range(1 + GROQ_MAX_RETRIES):
        async with _groq_limiter:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        GROQ_API_URL,
                        headers=headers,
                        json=payload,
                    )
            except httpx.TimeoutException as exc:
                logger.warning("Groq request timed out (attempt %d)", attempt + 1)
                last_error = exc
                await _groq_limiter.backoff()
                continue
            except httpx.RequestError as exc:
                logger.warning("Groq request failed (attempt %d): %s", attempt + 1, exc)
                last_error = exc
                await _groq_limiter.backoff()
                continue

        if response.status_code == 429:
            logger.warning("Groq rate limited (attempt %d/%d)", attempt + 1, 1 + GROQ_MAX_RETRIES)
            await _groq_limiter.backoff()
            last_error = HTTPException(status_code=429, detail="Groq rate limited")
            continue

        if response.status_code != 200:
            body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
            error_msg = body.get("error", {}).get("message", response.text[:300])
            logger.error("Groq API error %d: %s", response.status_code, error_msg)
            raise HTTPException(status_code=502, detail=f"Extraction service error: {error_msg}")

        # Success
        _groq_limiter.reset_backoff()
        body = response.json()
        try:
            return body["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            logger.error("Malformed Groq response: %s", exc)
            raise HTTPException(
                status_code=502,
                detail="Received a malformed response from the extraction service.",
            ) from exc

    # All retries exhausted
    logger.error("Groq: all %d retries exhausted", 1 + GROQ_MAX_RETRIES)
    if isinstance(last_error, HTTPException):
        raise last_error
    raise HTTPException(
        status_code=429,
        detail="Extraction service is overloaded. Please try again in a few minutes.",
    )


async def _call_groq_json(prompt: str) -> object:
    """Call Groq and parse the response as JSON.

    If parsing fails, retries once with a 'Fix this JSON:' prompt.
    """
    raw = await _call_groq(prompt)
    cleaned = _extract_json_from_text(raw)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Self-healing retry: send broken output back with fix instruction
    logger.warning("Groq JSON parse failed, attempting self-healing retry")
    fix_prompt = GROQ_FIX_JSON_PROMPT.format(broken_json=cleaned[:3000])
    raw_fix = await _call_groq(fix_prompt)
    cleaned_fix = _extract_json_from_text(raw_fix)

    try:
        return json.loads(cleaned_fix)
    except json.JSONDecodeError as exc:
        logger.error("Groq self-healing also failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Failed to extract structured data. The analysis text may be malformed.",
        ) from exc


# ---------------------------------------------------------------------------
# Public extraction functions
# ---------------------------------------------------------------------------

async def extract_dependency_graph(dependencies_section: str) -> DependencyGraph:
    """Extract dependency graph from the [DEPENDENCIES] section."""
    section = _truncate_section(dependencies_section)
    prompt = GROQ_DEPENDENCY_PROMPT.format(section=section)

    data = await _call_groq_json(prompt)

    if not isinstance(data, dict):
        data = {"nodes": [], "edges": []}

    # Validate nodes
    nodes: list[GraphNode] = []
    for raw_node in data.get("nodes", []):
        try:
            nodes.append(GraphNode(**raw_node))
        except (ValidationError, TypeError):
            continue

    # Validate edges
    edges: list[GraphEdge] = []
    for raw_edge in data.get("edges", []):
        try:
            edges.append(GraphEdge(**raw_edge))
        except (ValidationError, TypeError):
            continue

    return DependencyGraph(nodes=nodes, edges=edges)


async def extract_adrs(decisions_section: str) -> list[ADR]:
    """Extract ADRs from the [DECISIONS] section."""
    section = _truncate_section(decisions_section)
    prompt = GROQ_ADR_PROMPT.format(section=section)

    data = await _call_groq_json(prompt)

    if not isinstance(data, list):
        data = [data] if isinstance(data, dict) else []

    adrs: list[ADR] = []
    for raw_adr in data:
        try:
            adrs.append(ADR(**raw_adr))
        except (ValidationError, TypeError):
            continue

    return adrs


async def extract_tech_debt(tech_debt_section: str) -> list[TechDebtItem]:
    """Extract tech debt items from the [TECH_DEBT] section."""
    section = _truncate_section(tech_debt_section)
    prompt = GROQ_TECH_DEBT_PROMPT.format(section=section)

    data = await _call_groq_json(prompt)

    if not isinstance(data, list):
        data = [data] if isinstance(data, dict) else []

    items: list[TechDebtItem] = []
    for raw_item in data:
        try:
            items.append(TechDebtItem(**raw_item))
        except (ValidationError, TypeError):
            continue

    return items


async def extract_refactor_seeds(refactoring_section: str) -> list[RefactorScenario]:
    """Extract refactoring scenarios from the [REFACTORING] section."""
    section = _truncate_section(refactoring_section)
    prompt = GROQ_REFACTOR_PROMPT.format(section=section)

    data = await _call_groq_json(prompt)

    if not isinstance(data, list):
        data = [data] if isinstance(data, dict) else []

    scenarios: list[RefactorScenario] = []
    for raw in data:
        try:
            scenarios.append(RefactorScenario(**raw))
        except (ValidationError, TypeError):
            continue

    return scenarios

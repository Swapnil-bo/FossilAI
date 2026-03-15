from __future__ import annotations

import asyncio
import logging

import httpx
from fastapi import HTTPException

from config import (
    GEMINI_API_KEY,
    GEMINI_CHUNK_COOLDOWN_SECONDS,
    GEMINI_MAX_RETRIES,
    GEMINI_RETRY_WAIT_SECONDS,
    GEMINI_RPM,
)
from services.chunker import chunk_repo_for_gemini, prepare_gemini_prompt
from services.section_slicer import merge_section_outputs, slice_gemini_output
from utils.rate_limiter import AsyncRateLimiter

logger = logging.getLogger(__name__)

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    "models/gemini-2.5-flash-preview-04-17:generateContent"
)

_gemini_limiter = AsyncRateLimiter(rpm=GEMINI_RPM, base_backoff=1.0, max_backoff=64.0)


def _is_rate_limited(status_code: int, body: dict) -> bool:
    """Check if the Gemini response indicates a rate-limit / quota error."""
    if status_code == 429:
        return True
    # Gemini sometimes returns 200 with an error nested in the body
    error = body.get("error", {})
    if error.get("status") == "RESOURCE_EXHAUSTED":
        return True
    if error.get("code") == 429:
        return True
    return False


def _extract_text(body: dict) -> str:
    """Extract the generated text from the Gemini response body."""
    try:
        candidates = body["candidates"]
        parts = candidates[0]["content"]["parts"]
        return "".join(part.get("text", "") for part in parts)
    except (KeyError, IndexError, TypeError) as exc:
        logger.error("Malformed Gemini response: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Received a malformed response from the analysis service.",
        ) from exc


async def _call_gemini(prompt: str) -> str:
    """Send a single prompt to Gemini and return the generated text.

    Handles rate limiting with retries and exponential backoff.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured. Add it to your .env file.",
        )

    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
        },
    }

    last_error: Exception | None = None

    for attempt in range(1 + GEMINI_MAX_RETRIES):
        async with _gemini_limiter:
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    response = await client.post(
                        GEMINI_API_URL,
                        params={"key": GEMINI_API_KEY},
                        json=payload,
                    )
            except httpx.TimeoutException as exc:
                logger.warning("Gemini request timed out (attempt %d)", attempt + 1)
                last_error = exc
                await _gemini_limiter.backoff()
                continue
            except httpx.RequestError as exc:
                logger.warning("Gemini request failed (attempt %d): %s", attempt + 1, exc)
                last_error = exc
                await _gemini_limiter.backoff()
                continue

        body = response.json()

        # Rate-limited — wait and retry
        if _is_rate_limited(response.status_code, body):
            logger.warning(
                "Gemini rate limited (attempt %d/%d). Waiting %ds...",
                attempt + 1,
                1 + GEMINI_MAX_RETRIES,
                GEMINI_RETRY_WAIT_SECONDS,
            )
            await asyncio.sleep(GEMINI_RETRY_WAIT_SECONDS)
            await _gemini_limiter.backoff()
            last_error = HTTPException(
                status_code=429,
                detail="Analysis service is overloaded. Please try again in a few minutes.",
            )
            continue

        # Other API error
        if response.status_code != 200:
            error_msg = body.get("error", {}).get("message", response.text[:300])
            logger.error("Gemini API error %d: %s", response.status_code, error_msg)
            raise HTTPException(
                status_code=502,
                detail=f"Analysis service error: {error_msg}",
            )

        # Success
        _gemini_limiter.reset_backoff()
        return _extract_text(body)

    # All retries exhausted
    logger.error("Gemini: all %d retries exhausted", 1 + GEMINI_MAX_RETRIES)
    if isinstance(last_error, HTTPException):
        raise last_error
    raise HTTPException(
        status_code=429,
        detail="Analysis service is overloaded. Please try again in a few minutes.",
    )


async def analyze_repo(
    repo_files: dict[str, str],
    file_tree: str,
    import_map: dict[str, list[str]],
) -> tuple[str, list[str]]:
    """Run the full Gemini analysis pipeline on a repository.

    Returns:
        (raw_analysis, warnings) — the merged analysis text across all chunks,
        plus any warnings (e.g. "large repo, core modules only").
    """
    chunks = chunk_repo_for_gemini(repo_files, import_map)
    warnings: list[str] = []

    # Collect warnings from chunker
    for chunk in chunks:
        if chunk.warning and chunk.warning not in warnings:
            warnings.append(chunk.warning)

    logger.info(
        "Analyzing repo: %d files, %d chunk(s)",
        len(repo_files),
        len(chunks),
    )

    chunk_analyses: list[dict[str, str]] = []

    for i, chunk in enumerate(chunks):
        if i > 0:
            # Enforce cooldown between chunks to reset Gemini's TPM counter
            logger.info(
                "Cooling down %ds before chunk %d/%d...",
                GEMINI_CHUNK_COOLDOWN_SECONDS,
                i + 1,
                len(chunks),
            )
            await asyncio.sleep(GEMINI_CHUNK_COOLDOWN_SECONDS)

        prompt = prepare_gemini_prompt(chunk, file_tree, import_map)

        logger.info(
            "Sending chunk %d/%d to Gemini (~%d tokens, %d files)",
            i + 1,
            len(chunks),
            chunk.token_count,
            len(chunk.files),
        )

        raw_text = await _call_gemini(prompt)
        sections = slice_gemini_output(raw_text)
        chunk_analyses.append(sections)

    # Merge all chunk results by section
    merged = merge_section_outputs(chunk_analyses)

    # Reconstruct the full labeled analysis string
    parts: list[str] = []
    for label in ["ARCHITECTURE", "MODULES", "DECISIONS", "TECH_DEBT", "DEPENDENCIES", "REFACTORING"]:
        if label in merged:
            parts.append(f"[{label}]\n{merged[label]}")

    full_analysis = "\n\n".join(parts)
    return full_analysis, warnings

from __future__ import annotations

import logging
import re
import traceback

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.cache import get_cached_analysis, get_cached_repo
from services.gemini_analyzer import _call_gemini

logger = logging.getLogger(__name__)

router = APIRouter()

# Matches: github.com/owner/repo, with optional scheme, www, .git suffix
_GITHUB_URL_RE = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)"
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: str = Field(..., description="user | assistant")
    content: str


class ChatRequest(BaseModel):
    repo_url: str
    message: str
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    referenced_files: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def _build_analysis_context(cached: dict, file_tree: str | None) -> str:
    """Build a condensed context string from the cached analysis + file tree."""
    parts: list[str] = []

    # Architecture overview
    arch = cached.get("architecture", "")
    if arch:
        parts.append(f"[ARCHITECTURE]\n{arch}")

    # Module descriptions
    modules = cached.get("modules", "")
    if modules:
        parts.append(f"[MODULES]\n{modules}")

    # Dependency graph summary
    dep_graph = cached.get("dependency_graph", {})
    if dep_graph:
        nodes = dep_graph.get("nodes", [])
        edges = dep_graph.get("edges", [])
        node_lines = [
            f"  {n.get('id', '')} ({n.get('type', 'file')}): {n.get('description', '')}"
            for n in nodes[:60]
        ]
        edge_lines = [
            f"  {e.get('source', '')} -> {e.get('target', '')} ({e.get('type', 'import')})"
            for e in edges[:100]
        ]
        parts.append(
            "[DEPENDENCY GRAPH]\nNodes:\n"
            + "\n".join(node_lines)
            + "\n\nEdges:\n"
            + "\n".join(edge_lines)
        )

    # ADRs
    adrs = cached.get("adrs", [])
    if adrs:
        adr_lines = [
            f"  - {a.get('title', '')}: {a.get('decision', '')}"
            for a in adrs[:15]
        ]
        parts.append("[ARCHITECTURAL DECISIONS]\n" + "\n".join(adr_lines))

    # Tech debt
    tech_debt = cached.get("tech_debt", [])
    if tech_debt:
        debt_lines = [
            f"  {d.get('file', '')} [{d.get('severity', '')}]: {d.get('description', '')}"
            for d in tech_debt[:20]
        ]
        parts.append("[TECH DEBT]\n" + "\n".join(debt_lines))

    # File tree
    if file_tree:
        # Truncate very long trees
        tree_lines = file_tree.split("\n")
        if len(tree_lines) > 200:
            tree_text = "\n".join(tree_lines[:200]) + "\n... (truncated)"
        else:
            tree_text = file_tree
        parts.append(f"[FILE TREE]\n{tree_text}")

    return "\n\n".join(parts)


def _extract_referenced_files(reply: str, cached: dict) -> list[str]:
    """Find file paths mentioned in the reply that match known nodes."""
    dep_graph = cached.get("dependency_graph", {})
    known_ids = {n.get("id", "") for n in dep_graph.get("nodes", [])}

    referenced = []
    for node_id in known_ids:
        if not node_id:
            continue
        # Check if the file path or filename appears in the reply
        if node_id in reply:
            referenced.append(node_id)
        else:
            # Also match just the filename portion
            filename = node_id.rsplit("/", 1)[-1]
            if len(filename) > 3 and filename in reply:
                referenced.append(node_id)

    return sorted(set(referenced))


CHAT_SYSTEM_PROMPT = """\
You are FossilAI, an expert AI code archaeologist. You have already analyzed a GitHub repository \
and have a deep understanding of its architecture, dependencies, tech debt, and design decisions.

Use the analysis context below to answer the user's questions about this codebase. Be concise, \
specific, and reference actual file paths when relevant. If the user asks about something not \
covered by the analysis, say so honestly.

When referencing files, use the exact file paths from the analysis (e.g. src/utils/api.js).

<analysis_context>
{context}
</analysis_context>
"""


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=ChatResponse)
async def chat_with_codebase(request: ChatRequest):
    """Answer questions about a previously-analyzed repository."""
    owner, repo = _parse_github_url(request.repo_url)
    cache_key = _normalize_repo_url(owner, repo)

    # 1. Load cached analysis
    cached = await get_cached_analysis(cache_key)
    if cached is None:
        raise HTTPException(
            status_code=404,
            detail="No analysis found for this repository. Run /analyze first.",
        )

    # 2. Try to load file tree from cached repo data
    file_tree: str | None = None
    cached_repo = await get_cached_repo(cache_key)
    if cached_repo is not None:
        _, file_tree = cached_repo

    # 3. Build system context from cached analysis
    analysis_context = _build_analysis_context(cached, file_tree)
    system_prompt = CHAT_SYSTEM_PROMPT.format(context=analysis_context)

    # 4. Build conversation: system + history + current message
    # Gemini uses a flat content array; we prepend system context as the first user turn
    # then alternate user/model messages.
    gemini_contents = []

    # System context as the first "user" message
    gemini_contents.append({
        "role": "user",
        "parts": [{"text": system_prompt}],
    })
    gemini_contents.append({
        "role": "model",
        "parts": [{"text": "Understood. I have the full analysis of this repository loaded. Ask me anything about the codebase."}],
    })

    # Conversation history (limit to last 20 messages to stay within context)
    history = request.history[-20:]
    for msg in history:
        role = "user" if msg.role == "user" else "model"
        gemini_contents.append({
            "role": role,
            "parts": [{"text": msg.content}],
        })

    # Current user message
    gemini_contents.append({
        "role": "user",
        "parts": [{"text": request.message}],
    })

    # 5. Build the raw prompt as a single string for _call_gemini
    # We format it as a multi-turn conversation in a single prompt
    prompt_parts = []
    for turn in gemini_contents:
        role_label = "User" if turn["role"] == "user" else "Assistant"
        text = turn["parts"][0]["text"]
        prompt_parts.append(f"{role_label}: {text}")

    prompt_parts.append("Assistant:")
    full_prompt = "\n\n".join(prompt_parts)

    try:
        # 6. Call Gemini
        reply = await _call_gemini(full_prompt)
        reply = reply.strip()

        # 7. Extract referenced files
        referenced_files = _extract_referenced_files(reply, cached)

        return ChatResponse(reply=reply, referenced_files=referenced_files)

    except HTTPException:
        raise

    except Exception as exc:
        logger.error(
            "Chat failed for %s: %s\n%s",
            cache_key,
            exc,
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=500,
            detail=f"Chat failed: {str(exc)}",
        ) from exc

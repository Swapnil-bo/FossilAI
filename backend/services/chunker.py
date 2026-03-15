from __future__ import annotations

import os
from dataclasses import dataclass, field

from config import (
    GEMINI_MAX_TOKENS_PER_REQUEST,
    REPO_MEDIUM_THRESHOLD,
    REPO_SMALL_THRESHOLD,
)
from models.prompts import GEMINI_ANALYSIS_PROMPT
from utils.token_counter import estimate_tokens, estimate_tokens_for_files

# Directories / filename patterns that signal "low priority" files
_SKIP_PATTERNS_LARGE_REPO = {
    "test", "tests", "spec", "specs", "__tests__", "__test__",
    "docs", "doc", "documentation",
    "examples", "example", "samples", "sample",
    "benchmarks", "benchmark",
    "fixtures", "testdata", "test_data",
    "generated", "vendor", "third_party",
}

# Entry-point / high-priority filename patterns for large repos
_PRIORITY_NAMES = {
    "main", "app", "index", "server", "cli", "run", "entry",
    "config", "settings", "setup",
}
_PRIORITY_DIRS = {
    "src", "lib", "cmd", "api", "routers", "routes", "controllers",
    "models", "schemas", "services", "core", "pkg", "internal",
}


@dataclass
class Chunk:
    """A group of files that fits within the token budget."""
    files: dict[str, str] = field(default_factory=dict)
    token_count: int = 0
    warning: str | None = None


def _top_level_dir(filepath: str) -> str:
    """Return the first path component, or '__root__' for top-level files."""
    parts = filepath.split("/", 1)
    if len(parts) == 1:
        return "__root__"
    return parts[0]


def _is_low_priority(filepath: str) -> bool:
    """Check if any path component matches low-priority patterns."""
    parts = filepath.lower().split("/")
    return any(p in _SKIP_PATTERNS_LARGE_REPO for p in parts)


def _is_high_priority(filepath: str) -> bool:
    """Check if file is an entry point, router, model, or config."""
    parts = filepath.lower().split("/")
    basename = os.path.splitext(os.path.basename(filepath))[0].lower()

    # Check directory names
    if any(p in _PRIORITY_DIRS for p in parts):
        return True

    # Check filename
    if basename in _PRIORITY_NAMES:
        return True

    return False


def _group_by_top_dir(files: dict[str, str]) -> dict[str, dict[str, str]]:
    """Group files by their top-level directory."""
    groups: dict[str, dict[str, str]] = {}
    for filepath, content in files.items():
        top = _top_level_dir(filepath)
        if top not in groups:
            groups[top] = {}
        groups[top][filepath] = content
    return groups


def chunk_repo_for_gemini(
    files: dict[str, str],
    import_map: dict[str, list[str]],
    max_tokens: int = GEMINI_MAX_TOKENS_PER_REQUEST,
) -> list[Chunk]:
    """Split repo files into chunks that fit within the Gemini token budget.

    Strategy:
      - Small (<200K tokens): single chunk
      - Medium (200K-600K): group by top-level directory
      - Large (>600K): prioritize core files, skip tests/docs/examples
    """
    total_tokens = estimate_tokens_for_files(files)

    # --- Small repo: single chunk ---
    if total_tokens <= REPO_SMALL_THRESHOLD:
        return [Chunk(files=files, token_count=total_tokens)]

    # --- Large repo: filter to high-priority files first ---
    if total_tokens > REPO_MEDIUM_THRESHOLD:
        priority_files: dict[str, str] = {}
        for fp, content in files.items():
            if _is_high_priority(fp) and not _is_low_priority(fp):
                priority_files[fp] = content

        # If aggressive filtering cut too much, add back non-test files
        priority_tokens = estimate_tokens_for_files(priority_files)
        if priority_tokens < max_tokens * 0.3:
            for fp, content in files.items():
                if not _is_low_priority(fp):
                    priority_files[fp] = content

        files = priority_files
        total_tokens = estimate_tokens_for_files(files)

        warning = (
            "This repo is very large. Analyzing core modules only "
            "(entry points, routers, models, configs). Tests and docs are excluded."
        )

        # If it now fits in one chunk, return early
        if total_tokens <= max_tokens:
            chunk = Chunk(files=files, token_count=total_tokens, warning=warning)
            return [chunk]

        # Otherwise fall through to the medium strategy with filtered files
        # and carry the warning forward
    else:
        warning = None

    # --- Medium repo (or filtered large): group by top-level directory ---
    groups = _group_by_top_dir(files)

    # Sort groups by token size (largest first) for better bin-packing
    sorted_groups = sorted(
        groups.items(),
        key=lambda kv: estimate_tokens_for_files(kv[1]),
        reverse=True,
    )

    chunks: list[Chunk] = []
    current = Chunk(warning=warning)

    for _dir_name, dir_files in sorted_groups:
        dir_tokens = estimate_tokens_for_files(dir_files)

        # If a single directory exceeds the budget, split it file by file
        if dir_tokens > max_tokens:
            for fp, content in dir_files.items():
                file_tokens = estimate_tokens(content)
                if current.token_count + file_tokens > max_tokens and current.files:
                    chunks.append(current)
                    current = Chunk(warning=warning)
                current.files[fp] = content
                current.token_count += file_tokens
            continue

        # If adding this directory would exceed budget, start a new chunk
        if current.token_count + dir_tokens > max_tokens and current.files:
            chunks.append(current)
            current = Chunk(warning=warning)

        current.files.update(dir_files)
        current.token_count += dir_tokens

    # Don't forget the last chunk
    if current.files:
        chunks.append(current)

    return chunks


def _format_file_contents(files: dict[str, str]) -> str:
    """Format file contents for the prompt."""
    parts: list[str] = []
    for filepath in sorted(files.keys()):
        content = files[filepath]
        parts.append(f"--- {filepath} ---\n{content}")
    return "\n\n".join(parts)


def _format_import_map(import_map: dict[str, list[str]]) -> str:
    """Format the import map as a readable string for the prompt."""
    if not import_map:
        return "(no internal imports detected)"

    lines: list[str] = []
    for source in sorted(import_map.keys()):
        targets = import_map[source]
        for target in targets:
            lines.append(f"  {source} -> {target}")
    return "\n".join(lines)


def prepare_gemini_prompt(
    chunk: Chunk,
    file_tree: str,
    import_map: dict[str, list[str]],
) -> str:
    """Format the Gemini analysis prompt with file tree, contents, and import map.

    The file tree is always included in full (for structural context),
    but file_contents only includes files in this chunk.
    """
    # Filter import map to only include entries relevant to this chunk
    chunk_files = set(chunk.files.keys())
    relevant_imports = {
        k: v for k, v in import_map.items()
        if k in chunk_files
    }

    return GEMINI_ANALYSIS_PROMPT.format(
        file_tree=file_tree,
        file_contents=_format_file_contents(chunk.files),
        import_map=_format_import_map(relevant_imports),
    )

from __future__ import annotations


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 characters per token."""
    return len(text) // 4


def estimate_tokens_for_files(files: dict[str, str]) -> int:
    """Estimate total tokens across all file contents."""
    return sum(estimate_tokens(content) for content in files.values())

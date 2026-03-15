from __future__ import annotations

import re

# The section labels Gemini is asked to produce
SECTION_LABELS = [
    "ARCHITECTURE",
    "MODULES",
    "DECISIONS",
    "TECH_DEBT",
    "DEPENDENCIES",
    "REFACTORING",
]

# Matches "[SECTION_NAME]" at the start of a line, with optional whitespace
_SECTION_RE = re.compile(
    r"^\s*\[(" + "|".join(SECTION_LABELS) + r")\]\s*$",
    re.MULTILINE | re.IGNORECASE,
)


def slice_gemini_output(raw_analysis: str) -> dict[str, str]:
    """Split Gemini's labeled analysis into per-section text chunks.

    Returns a dict mapping section name (uppercase) to its text content.
    Sections that are missing from the output are omitted from the result.
    Any text before the first section label is discarded.
    """
    sections: dict[str, str] = {}

    # Find all section header positions
    matches = list(_SECTION_RE.finditer(raw_analysis))

    if not matches:
        # No labeled sections found — return entire output as ARCHITECTURE fallback
        stripped = raw_analysis.strip()
        if stripped:
            sections["ARCHITECTURE"] = stripped
        return sections

    for i, match in enumerate(matches):
        label = match.group(1).upper()

        # Content starts right after the header line
        content_start = match.end()

        # Content ends at the next section header, or end of string
        if i + 1 < len(matches):
            content_end = matches[i + 1].start()
        else:
            content_end = len(raw_analysis)

        content = raw_analysis[content_start:content_end].strip()

        if content:
            sections[label] = content

    return sections


def merge_section_outputs(chunks: list[dict[str, str]]) -> dict[str, str]:
    """Merge sliced sections from multiple Gemini chunks into a single dict.

    When the same section appears in multiple chunks, their content is
    concatenated with a separator.
    """
    merged: dict[str, str] = {}

    for chunk_sections in chunks:
        for label, content in chunk_sections.items():
            if label in merged:
                merged[label] += f"\n\n--- (continued) ---\n\n{content}"
            else:
                merged[label] = content

    return merged

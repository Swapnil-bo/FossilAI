from __future__ import annotations

import os
import re

# ---------------------------------------------------------------------------
# Language-specific import regexes
# ---------------------------------------------------------------------------

# Python: "import foo", "import foo.bar", "from foo import bar", "from foo.bar import baz"
_PY_IMPORT = re.compile(
    r"^\s*import\s+([\w.]+)", re.MULTILINE
)
_PY_FROM_IMPORT = re.compile(
    r"^\s*from\s+([\w.]+)\s+import\b", re.MULTILINE
)

# JavaScript / TypeScript:
#   import ... from "mod"  /  import ... from 'mod'
#   import "mod"  (side-effect import)
#   require("mod")  /  require('mod')
#   export ... from "mod"
_JS_IMPORT_FROM = re.compile(
    r"""^\s*import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]""", re.MULTILINE
)
_JS_IMPORT_SIDE = re.compile(
    r"""^\s*import\s+['"]([^'"]+)['"]""", re.MULTILINE
)
_JS_REQUIRE = re.compile(
    r"""require\(\s*['"]([^'"]+)['"]\s*\)"""
)
_JS_EXPORT_FROM = re.compile(
    r"""^\s*export\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]""", re.MULTILINE
)

# Java: "import com.example.ClassName;"
_JAVA_IMPORT = re.compile(
    r"^\s*import\s+([\w.]+)\s*;", re.MULTILINE
)

# Go: import "pkg"  and grouped  import ( "pkg1"\n"pkg2" )
_GO_IMPORT_SINGLE = re.compile(
    r'^\s*import\s+"([^"]+)"', re.MULTILINE
)
_GO_IMPORT_GROUP = re.compile(
    r'^\s*import\s*\((.*?)\)', re.MULTILINE | re.DOTALL
)
_GO_IMPORT_LINE = re.compile(r'"([^"]+)"')

# Rust: "use crate::module::item;", "use super::thing;", "use self::thing;"
_RUST_USE = re.compile(
    r"^\s*use\s+((?:crate|super|self)::[\w:]+)", re.MULTILINE
)


# ---------------------------------------------------------------------------
# Extension helpers
# ---------------------------------------------------------------------------

def _get_language(filename: str) -> str | None:
    ext = os.path.splitext(filename)[1].lower()
    mapping = {
        ".py": "python",
        ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
        ".ts": "typescript", ".tsx": "typescript",
        ".java": "java",
        ".go": "go",
        ".rs": "rust",
    }
    return mapping.get(ext)


# ---------------------------------------------------------------------------
# Per-language extractors  (return raw import strings)
# ---------------------------------------------------------------------------

def _extract_python(content: str) -> list[str]:
    targets: list[str] = []
    for m in _PY_IMPORT.finditer(content):
        targets.append(m.group(1))
    for m in _PY_FROM_IMPORT.finditer(content):
        targets.append(m.group(1))
    return targets


def _extract_js_ts(content: str) -> list[str]:
    targets: list[str] = []
    for m in _JS_IMPORT_FROM.finditer(content):
        targets.append(m.group(1))
    for m in _JS_IMPORT_SIDE.finditer(content):
        targets.append(m.group(1))
    for m in _JS_REQUIRE.finditer(content):
        targets.append(m.group(1))
    for m in _JS_EXPORT_FROM.finditer(content):
        targets.append(m.group(1))
    # dedupe while preserving order
    seen: set[str] = set()
    deduped: list[str] = []
    for t in targets:
        if t not in seen:
            seen.add(t)
            deduped.append(t)
    return deduped


def _extract_java(content: str) -> list[str]:
    return [m.group(1) for m in _JAVA_IMPORT.finditer(content)]


def _extract_go(content: str) -> list[str]:
    targets: list[str] = []
    for m in _GO_IMPORT_SINGLE.finditer(content):
        targets.append(m.group(1))
    for m in _GO_IMPORT_GROUP.finditer(content):
        block = m.group(1)
        for line_m in _GO_IMPORT_LINE.finditer(block):
            targets.append(line_m.group(1))
    return targets


def _extract_rust(content: str) -> list[str]:
    return [m.group(1) for m in _RUST_USE.finditer(content)]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_imports(filename: str, content: str) -> list[str]:
    """Extract raw import target strings from a single file."""
    lang = _get_language(filename)
    if lang == "python":
        return _extract_python(content)
    if lang in ("javascript", "typescript"):
        return _extract_js_ts(content)
    if lang == "java":
        return _extract_java(content)
    if lang == "go":
        return _extract_go(content)
    if lang == "rust":
        return _extract_rust(content)
    return []


# ---------------------------------------------------------------------------
# Import resolution — map raw import strings to actual repo file paths
# ---------------------------------------------------------------------------

def _is_relative(target: str, lang: str) -> bool:
    """Check if an import target refers to a local/relative file."""
    if lang in ("javascript", "typescript"):
        return target.startswith(".")
    if lang == "python":
        return target.startswith(".")
    if lang == "rust":
        return target.startswith(("crate::", "super::", "self::"))
    # Go and Java: we try to match against repo paths heuristically
    return False


def _resolve_js_ts(target: str, importer: str, file_index: set[str]) -> str | None:
    """Resolve a JS/TS relative import to an actual file path in the repo."""
    importer_dir = os.path.dirname(importer)
    # Normalize the relative path
    resolved_base = os.path.normpath(os.path.join(importer_dir, target))
    resolved_base = resolved_base.replace("\\", "/")

    # Try exact match, then with extensions, then as directory index
    extensions = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]

    # Exact match (already has extension)
    if resolved_base in file_index:
        return resolved_base

    # Add extensions
    for ext in extensions:
        candidate = resolved_base + ext
        if candidate in file_index:
            return candidate

    # Directory index files
    for ext in extensions:
        candidate = resolved_base + "/index" + ext
        if candidate in file_index:
            return candidate

    return None


def _resolve_python(target: str, importer: str, file_index: set[str]) -> str | None:
    """Resolve a Python import to an actual file path in the repo."""
    # Convert dotted path to file path: "foo.bar.baz" -> "foo/bar/baz"
    path_parts = target.split(".")

    # Try as a module file
    as_file = "/".join(path_parts) + ".py"
    if as_file in file_index:
        return as_file

    # Try as a package __init__.py
    as_package = "/".join(path_parts) + "/__init__.py"
    if as_package in file_index:
        return as_package

    # Try relative to the importer's directory
    importer_dir = os.path.dirname(importer)
    if importer_dir:
        rel_file = os.path.normpath(os.path.join(importer_dir, as_file)).replace("\\", "/")
        if rel_file in file_index:
            return rel_file

        rel_pkg = os.path.normpath(os.path.join(importer_dir, as_package)).replace("\\", "/")
        if rel_pkg in file_index:
            return rel_pkg

    return None


def _resolve_rust(target: str, importer: str, file_index: set[str]) -> str | None:
    """Resolve a Rust use path to an actual file path."""
    # crate::module::item -> module/item.rs or module/mod.rs
    parts = target.split("::")

    # Strip the leading crate/super/self
    if parts[0] in ("crate", "super", "self"):
        parts = parts[1:]

    if not parts:
        return None

    # Try as module.rs
    as_file = "/".join(parts) + ".rs"
    if as_file in file_index:
        return as_file

    # Try as module/mod.rs
    as_mod = "/".join(parts) + "/mod.rs"
    if as_mod in file_index:
        return as_mod

    # Try parent path (the last part might be an item, not a file)
    if len(parts) > 1:
        parent_file = "/".join(parts[:-1]) + ".rs"
        if parent_file in file_index:
            return parent_file
        parent_mod = "/".join(parts[:-1]) + "/mod.rs"
        if parent_mod in file_index:
            return parent_mod

    return None


def _resolve_go(target: str, importer: str, file_index: set[str]) -> str | None:
    """Resolve a Go import to repo files — only matches internal packages."""
    # Go imports are full paths like "github.com/user/repo/pkg/sub"
    # We match the suffix against repo directories
    parts = target.split("/")

    # Try progressively shorter suffixes
    for i in range(len(parts)):
        candidate_dir = "/".join(parts[i:])
        # Check if any file lives under this directory
        for f in file_index:
            if f.startswith(candidate_dir + "/") and f.endswith(".go"):
                return f

    return None


def _resolve_java(target: str, file_index: set[str]) -> str | None:
    """Resolve a Java import to an actual file path."""
    # com.example.ClassName -> com/example/ClassName.java
    as_file = target.replace(".", "/") + ".java"
    if as_file in file_index:
        return as_file

    # Sometimes classes are nested; try matching the package path
    # e.g. com.example.sub.Class -> find anything under com/example/sub/
    parts = target.split(".")
    if len(parts) > 1:
        package_dir = "/".join(parts[:-1])
        class_file = parts[-1] + ".java"
        # Check common Java source roots
        for f in file_index:
            if f.endswith("/" + class_file) and package_dir in f:
                return f

    return None


def build_import_map(files: dict[str, str]) -> dict[str, list[str]]:
    """Build an adjacency list of internal file-to-file dependencies.

    Takes {filepath: content}, returns {filepath: [resolved_imported_filepaths]}.
    Only includes edges where the imported target resolves to an actual file in the repo.
    """
    file_index = set(files.keys())
    import_map: dict[str, list[str]] = {}

    for filepath, content in files.items():
        lang = _get_language(filepath)
        if lang is None:
            continue

        raw_imports = extract_imports(filepath, content)
        resolved: list[str] = []

        for target in raw_imports:
            result = None

            if lang in ("javascript", "typescript"):
                # Only resolve relative imports (./  ../)
                if target.startswith("."):
                    result = _resolve_js_ts(target, filepath, file_index)
            elif lang == "python":
                result = _resolve_python(target, filepath, file_index)
            elif lang == "rust":
                result = _resolve_rust(target, filepath, file_index)
            elif lang == "go":
                result = _resolve_go(target, filepath, file_index)
            elif lang == "java":
                result = _resolve_java(target, file_index)

            if result and result != filepath:
                resolved.append(result)

        if resolved:
            # Dedupe while preserving order
            seen: set[str] = set()
            deduped: list[str] = []
            for r in resolved:
                if r not in seen:
                    seen.add(r)
                    deduped.append(r)
            import_map[filepath] = deduped

    return import_map

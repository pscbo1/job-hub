"""Local file store for Materials Library versions.

Files live under ``data/materials`` (or an injected root). Paths are never
served as public static assets. ``file_ref`` is a relative token, not a
directory listing.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Final

ALLOWED_EXTENSIONS: Final[frozenset[str]] = frozenset(
    {".pdf", ".docx", ".doc", ".txt", ".md", ".png", ".jpg", ".jpeg"}
)
MAX_BYTES: Final[int] = 25 * 1024 * 1024
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


class StorageError(ValueError):
    """Invalid upload or file_ref."""


def sanitize_filename(name: str) -> str:
    raw = Path(name or "upload").name
    cleaned = _SAFE_NAME.sub("_", raw).strip("._") or "upload"
    return cleaned[:180]


def extension_ok(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


class MaterialStorage:
    """Write-once helper. New content always creates a new version file."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def write_bytes(self, material_id: str, version_id: str, filename: str, data: bytes) -> str:
        if not data:
            raise StorageError("Empty file")
        if len(data) > MAX_BYTES:
            raise StorageError("File exceeds 25 MB")
        safe = sanitize_filename(filename)
        if not extension_ok(safe):
            raise StorageError("Unsupported file type")
        rel = f"{material_id}/{version_id}/{safe}"
        dest = self.resolve(rel)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return rel

    def resolve(self, file_ref: str) -> Path:
        if not file_ref or file_ref.startswith("/") or ".." in Path(file_ref).parts:
            raise StorageError("Invalid file reference")
        root = self.root.resolve()
        path = (root / file_ref).resolve()
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise StorageError("Invalid file reference") from exc
        return path

    def exists(self, file_ref: str) -> bool:
        try:
            return self.resolve(file_ref).is_file()
        except StorageError:
            return False

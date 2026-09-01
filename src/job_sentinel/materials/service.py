"""Materials Library + Packet bindings. Business rules live here, not in routes."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlparse

from job_sentinel.core.models import (
    FILE_MATERIAL_KINDS,
    KNOWLEDGE_MATERIAL_KINDS,
    ApplicationMaterialBinding,
    Material,
    MaterialVersion,
    PacketSnapshot,
    PacketSnapshotItem,
)
from job_sentinel.materials.storage import MaterialStorage, StorageError, sanitize_filename

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository

ALLOWED_KINDS = FILE_MATERIAL_KINDS | KNOWLEDGE_MATERIAL_KINDS
KNOWLEDGE_FILENAME = "content.md"


class MaterialsError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _clean_purpose(values: list[str] | None) -> list[str]:
    if not values:
        return []
    seen: list[str] = []
    for raw in values:
        text = str(raw).strip()
        if text and text not in seen:
            seen.append(text)
    return seen


def _clean_url(url: str) -> str:
    text = url.strip()
    if not text:
        return ""
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise MaterialsError("URL must start with http:// or https://")
    return text


def _require_kind(kind: str) -> str:
    value = (kind or "other").strip().lower() or "other"
    if value not in ALLOWED_KINDS:
        raise MaterialsError(f"Unknown material type: {kind}")
    return value


class MaterialsService:
    def __init__(self, repo: JobRepository, storage: MaterialStorage) -> None:
        self.repo = repo
        self.storage = storage

    @classmethod
    def from_paths(cls, repo: JobRepository, materials_dir: Path) -> MaterialsService:
        return cls(repo, MaterialStorage(materials_dir))

    def create_material(
        self,
        *,
        title: str,
        kind: str = "other",
        purpose: list[str] | None = None,
        notes: str = "",
        url: str = "",
        version_label: str = "",
        version_purpose: list[str] | None = None,
        version_notes: str = "",
        filename: str = "",
        data: bytes | None = None,
        content_type: str = "",
        content: str = "",
    ) -> Material:
        name = title.strip()
        kind_value = _require_kind(kind)
        payload, payload_name, payload_type = _content_payload(
            data=data, filename=filename, content_type=content_type, content=content
        )
        if payload:
            if not name:
                name = _stem(payload_name) or "Untitled material"
        elif not name:
            name = "Untitled material"
        if not payload and not url.strip():
            raise MaterialsError("Save needs a file, a URL, or text")
        material = Material(
            title=name,
            kind=kind_value,
            purpose=_clean_purpose(purpose),
            notes=notes.strip(),
        )
        self.repo.create_material(material)
        try:
            self.add_version(
                material.id,
                url=url,
                version_label=version_label,
                purpose=version_purpose,
                notes=version_notes,
                filename=payload_name,
                data=payload,
                content_type=payload_type,
            )
        except Exception:
            self.repo.hard_delete_material(material.id)
            raise
        stored = self.repo.get_material(material.id, include_archived=True)
        if stored is None:
            raise MaterialsError("Material missing after create", status_code=500)
        return self.hydrate_material(stored)

    def add_version(
        self,
        material_id: str,
        *,
        url: str = "",
        version_label: str = "",
        purpose: list[str] | None = None,
        notes: str = "",
        filename: str = "",
        data: bytes | None = None,
        content_type: str = "",
        content: str = "",
    ) -> MaterialVersion:
        material = self.repo.get_material(material_id, include_archived=True)
        if material is None:
            raise MaterialsError("Material not found", status_code=404)
        payload, payload_name, payload_type = _content_payload(
            data=data, filename=filename, content_type=content_type, content=content
        )
        if not payload and not url.strip():
            raise MaterialsError("A version needs a file, a URL, or text")
        if payload and url.strip():
            url = ""
        file_ref = ""
        original = ""
        size = 0
        version = MaterialVersion(
            material_id=material.id,
            version_number=self.repo.next_version_number(material.id),
            version_label=version_label.strip(),
            purpose=_clean_purpose(purpose),
            notes=notes.strip(),
            url=_clean_url(url) if url else "",
            content_type=payload_type,
        )
        if payload is not None:
            try:
                file_ref = self.storage.write_bytes(material.id, version.id, payload_name, payload)
            except StorageError as exc:
                raise MaterialsError(str(exc)) from exc
            original = payload_name
            size = len(payload)
            version.file_ref = file_ref
            version.original_filename = original
            version.byte_size = size
            if not version.content_type:
                version.content_type = _guess_type(payload_name)
        self.repo.create_material_version(version)
        self.repo.touch_material(material.id)
        stored = self.repo.get_material_version(version.id)
        if stored is None:
            raise MaterialsError("Version missing after create", status_code=500)
        return self.hydrate_version(stored)

    def update_material(
        self,
        material_id: str,
        *,
        title: str | None = None,
        kind: str | None = None,
        purpose: list[str] | None = None,
        notes: str | None = None,
    ) -> Material:
        material = self.repo.get_material(material_id, include_archived=True)
        if material is None:
            raise MaterialsError("Material not found", status_code=404)
        fields: dict[str, object] = {}
        if title is not None:
            name = title.strip()
            if not name:
                raise MaterialsError("Name is required")
            fields["title"] = name
        if kind is not None:
            fields["kind"] = _require_kind(kind)
        if purpose is not None:
            fields["purpose"] = _clean_purpose(purpose)
        if notes is not None:
            fields["notes"] = notes.strip()
        self.repo.update_material(material_id, **fields)
        stored = self.repo.get_material(material_id, include_archived=True)
        if stored is None:
            raise MaterialsError("Material not found", status_code=404)
        return self.hydrate_material(stored)

    def update_version(
        self,
        version_id: str,
        *,
        version_label: str | None = None,
        purpose: list[str] | None = None,
        notes: str | None = None,
    ) -> MaterialVersion:
        version = self.repo.get_material_version(version_id)
        if version is None:
            raise MaterialsError("Version not found", status_code=404)
        fields: dict[str, object] = {}
        if version_label is not None:
            fields["version_label"] = version_label.strip()
        if purpose is not None:
            fields["purpose"] = _clean_purpose(purpose)
        if notes is not None:
            fields["notes"] = notes.strip()
        self.repo.update_material_version(version_id, **fields)
        self.repo.touch_material(version.material_id)
        stored = self.repo.get_material_version(version_id)
        if stored is None:
            raise MaterialsError("Version not found", status_code=404)
        return self.hydrate_version(stored)

    def set_material_archived(self, material_id: str, archived: bool) -> Material:
        material = self.repo.get_material(material_id, include_archived=True)
        if material is None:
            raise MaterialsError("Material not found", status_code=404)
        stamp = _now() if archived else None
        self.repo.update_material(material_id, archived_at=stamp)
        stored = self.repo.get_material(material_id, include_archived=True)
        if stored is None:
            raise MaterialsError("Material not found", status_code=404)
        return self.hydrate_material(stored)

    def set_version_archived(self, version_id: str, archived: bool) -> MaterialVersion:
        version = self.repo.get_material_version(version_id)
        if version is None:
            raise MaterialsError("Version not found", status_code=404)
        stamp = _now() if archived else None
        self.repo.update_material_version(version_id, archived_at=stamp)
        self.repo.touch_material(version.material_id)
        stored = self.repo.get_material_version(version_id)
        if stored is None:
            raise MaterialsError("Version not found", status_code=404)
        return self.hydrate_version(stored)

    def hydrate_version(self, version: MaterialVersion) -> MaterialVersion:
        if not _is_text_version(version):
            return version
        if not version.file_ref or not self.storage.exists(version.file_ref):
            return version
        try:
            version.text = self.storage.read_text(version.file_ref)
        except StorageError:
            version.text = ""
        return version

    def hydrate_material(self, material: Material) -> Material:
        material.versions = [self.hydrate_version(v) for v in material.versions]
        return material

    def freeze_snapshot(self, submission_id: str, snapshot: PacketSnapshot) -> PacketSnapshot:
        """Copy bound files into a submission-owned path so later edits cannot change bytes."""
        frozen: list[PacketSnapshotItem] = []
        for index, item in enumerate(snapshot.items):
            copy = item.model_copy()
            if item.file_ref and self.storage.exists(item.file_ref):
                filename = sanitize_filename(item.original_filename or item.file_ref) or "file"
                dest = f"submissions/{submission_id}/{index}/{filename}"
                try:
                    copy.snapshot_file_ref = self.storage.copy_ref(item.file_ref, dest)
                except StorageError as exc:
                    raise MaterialsError(str(exc), status_code=409) from exc
            frozen.append(copy)
        return PacketSnapshot(
            binding_ids=list(snapshot.binding_ids),
            material_version_ids=list(snapshot.material_version_ids),
            items=frozen,
            note=snapshot.note,
        )

    def replace_packet(
        self, application_id: str, version_ids: list[str]
    ) -> list[ApplicationMaterialBinding]:
        app = self.repo.get_application(application_id)
        if app is None or app.deleted_at is not None:
            raise MaterialsError("Application not found", status_code=404)
        seen: set[str] = set()
        rows: list[ApplicationMaterialBinding] = []
        for index, version_id in enumerate(version_ids):
            version = self.repo.get_material_version(version_id)
            if version is None:
                raise MaterialsError("Version not found", status_code=404)
            if version.material_id in seen:
                raise MaterialsError("Each material can appear once in a packet")
            seen.add(version.material_id)
            rows.append(
                ApplicationMaterialBinding(
                    application_id=application_id,
                    material_id=version.material_id,
                    material_version_id=version.id,
                    sort_order=index,
                )
            )
        self.repo.replace_application_bindings(application_id, rows)
        return self.repo.list_application_bindings(application_id)

    def add_binding(self, application_id: str, version_id: str) -> ApplicationMaterialBinding:
        current = self.repo.list_application_bindings(application_id)
        if any(row.material_version_id == version_id for row in current):
            return next(row for row in current if row.material_version_id == version_id)
        version = self.repo.get_material_version(version_id)
        if version is None:
            raise MaterialsError("Version not found", status_code=404)
        if any(row.material_id == version.material_id for row in current):
            raise MaterialsError("Each material can appear once in a packet")
        binding = ApplicationMaterialBinding(
            application_id=application_id,
            material_id=version.material_id,
            material_version_id=version.id,
            sort_order=len(current),
        )
        try:
            self.repo.create_application_binding(binding)
        except ValueError as exc:
            raise MaterialsError(str(exc), status_code=409) from exc
        return binding

    def change_binding_version(
        self, application_id: str, binding_id: str, version_id: str
    ) -> ApplicationMaterialBinding:
        binding = self.repo.get_application_binding(binding_id)
        if binding is None or binding.application_id != application_id:
            raise MaterialsError("Binding not found", status_code=404)
        version = self.repo.get_material_version(version_id)
        if version is None:
            raise MaterialsError("Version not found", status_code=404)
        if version.material_id != binding.material_id:
            raise MaterialsError("Version belongs to a different material")
        self.repo.update_application_binding(binding_id, material_version_id=version.id)
        stored = self.repo.get_application_binding(binding_id)
        if stored is None:
            raise MaterialsError("Binding not found", status_code=404)
        return stored

    def remove_binding(self, application_id: str, binding_id: str) -> None:
        binding = self.repo.get_application_binding(binding_id)
        if binding is None or binding.application_id != application_id:
            raise MaterialsError("Binding not found", status_code=404)
        self.repo.delete_application_binding(binding_id)

    def packet_snapshot(self, application_id: str) -> PacketSnapshot:
        bindings = self.repo.list_application_bindings(application_id)
        items: list[PacketSnapshotItem] = []
        for binding in bindings:
            version = self.repo.get_material_version(binding.material_version_id)
            material = self.repo.get_material(binding.material_id, include_archived=True)
            if version is None or material is None:
                raise MaterialsError("Packet has a missing material version", status_code=409)
            if version.file_ref and not self.storage.exists(version.file_ref):
                raise MaterialsError(
                    f"File for {material.title} is missing. Change version or remove it.",
                    status_code=409,
                )
            items.append(
                PacketSnapshotItem(
                    binding_id=binding.id,
                    material_id=material.id,
                    material_version_id=version.id,
                    title=material.title,
                    kind=material.kind,
                    version_number=version.version_number,
                    version_label=version.version_label,
                    original_filename=version.original_filename,
                    file_ref=version.file_ref,
                    snapshot_file_ref="",
                    url=version.url,
                    material_purpose=list(material.purpose),
                    version_purpose=list(version.purpose),
                    material_notes=material.notes,
                    version_notes=version.notes,
                )
            )
        return PacketSnapshot(
            binding_ids=[item.binding_id for item in items],
            material_version_ids=[item.material_version_id for item in items],
            items=items,
        )

    def clear_bindings(self, application_id: str) -> None:
        self.repo.replace_application_bindings(application_id, [])


def _content_payload(
    *,
    data: bytes | None,
    filename: str,
    content_type: str,
    content: str,
) -> tuple[bytes | None, str, str]:
    if data is not None:
        return data, filename or "upload", content_type.strip()
    text = content.strip()
    if text:
        return text.encode("utf-8"), KNOWLEDGE_FILENAME, "text/markdown"
    return None, filename, content_type.strip()


def _is_text_version(version: MaterialVersion) -> bool:
    name = (version.original_filename or version.file_ref).lower()
    return version.content_type in {"text/markdown", "text/plain"} or name.endswith(
        (".md", ".txt", KNOWLEDGE_FILENAME)
    )


def _stem(filename: str) -> str:
    return Path(filename or "").stem.replace("_", " ").strip()


def _guess_type(filename: str) -> str:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "txt": "text/plain",
        "md": "text/markdown",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
    }.get(suffix, "application/octet-stream")

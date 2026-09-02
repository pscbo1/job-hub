"""Notebook pages — free writing, not Materials and not bound to Application."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.db.repository import JobRepository
from job_sentinel.notebook.service import (
    create_page,
    delete_page,
    extract_topics,
    list_pages,
    update_page,
)

if TYPE_CHECKING:
    from pathlib import Path


def test_extract_topics_from_typed_hashtags() -> None:
    assert extract_topics("Notes", "Prep for #research and #civic-tech.") == [
        "research",
        "civic-tech",
    ]
    assert extract_topics("## Heading", "not a tag") == []


def test_notebook_crud_search_and_topics(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        first = create_page(
            repo,
            title="Boss messages",
            markdown_body="Keep a #follow-up log. Mention #research.",
        )
        create_page(repo, title="Scratch", markdown_body="No tags here")
        update_page(repo, first.id, markdown_body="Updated #follow-up only")
        found = list_pages(repo, q="updated")
        assert [page.id for page in found] == [first.id]
        tagged = list_pages(repo, topic="follow-up")
        assert [page.id for page in tagged] == [first.id]
        delete_page(repo, first.id)
        assert list_pages(repo, topic="follow-up") == []
    finally:
        repo.close()


def test_notebook_api_not_materials(tmp_path: Path) -> None:
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "j.db"))
    created = client.post(
        "/api/notebook/pages",
        json={"title": "Offer notes", "markdown_body": "Ask about #visa."},
    )
    assert created.status_code == 200
    page_id = created.json()["id"]
    assert created.json()["topics"] == ["visa"]
    listed = client.get("/api/notebook/pages", params={"q": "visa"})
    assert listed.status_code == 200
    assert listed.json()["pages"][0]["id"] == page_id
    assert "visa" in listed.json()["topics"]
    materials = client.get("/api/materials")
    assert materials.status_code == 200
    assert materials.json() == []
    deleted = client.delete(f"/api/notebook/pages/{page_id}")
    assert deleted.status_code == 200
    empty = client.get("/api/notebook/pages")
    assert empty.json()["pages"] == []

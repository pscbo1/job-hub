"""Notebook pages: title + markdown body, hashtag topics, search."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Literal

from job_sentinel.core.models import NotebookPage

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository

_HASHTAG = re.compile(r"(?<![#\w])#([^\s#]{1,40})")
NotebookSort = Literal["updated", "title"]


class NotebookError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def extract_topics(*texts: str) -> list[str]:
    """Topics exist because the user typed ``#tag``. No tag admin."""
    seen: set[str] = set()
    out: list[str] = []
    for text in texts:
        for match in _HASHTAG.finditer(text or ""):
            topic = match.group(1).strip()
            if not topic:
                continue
            key = topic.casefold()
            if key in seen:
                continue
            seen.add(key)
            out.append(topic)
    return out


def with_topics(page: NotebookPage) -> NotebookPage:
    page.topics = extract_topics(page.title, page.markdown_body)
    return page


def list_pages(
    repo: JobRepository,
    *,
    q: str = "",
    topic: str = "",
    sort: NotebookSort = "updated",
) -> list[NotebookPage]:
    rows = [with_topics(page) for page in repo.list_notebook_pages(sort=sort)]
    needle = q.strip().casefold()
    if needle:
        rows = [
            page
            for page in rows
            if needle in page.title.casefold() or needle in page.markdown_body.casefold()
        ]
    wanted = topic.strip().lstrip("#").casefold()
    if wanted:
        rows = [page for page in rows if any(item.casefold() == wanted for item in page.topics)]
    return rows


def unique_topics(pages: list[NotebookPage]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for page in pages:
        for topic in page.topics:
            key = topic.casefold()
            if key in seen:
                continue
            seen.add(key)
            out.append(topic)
    return out


def get_page(repo: JobRepository, page_id: str) -> NotebookPage:
    page = repo.get_notebook_page(page_id)
    if page is None:
        raise NotebookError("Page not found", status_code=404)
    return with_topics(page)


def create_page(
    repo: JobRepository,
    *,
    title: str = "",
    markdown_body: str = "",
) -> NotebookPage:
    heading = title.strip() or "Untitled"
    page = NotebookPage(title=heading, markdown_body=markdown_body)
    return with_topics(repo.insert_notebook_page(page))


def update_page(
    repo: JobRepository,
    page_id: str,
    *,
    title: str | None = None,
    markdown_body: str | None = None,
    sort_order: int | None = None,
) -> NotebookPage:
    get_page(repo, page_id)
    fields: dict[str, str | int] = {}
    if title is not None:
        fields["title"] = title.strip() or "Untitled"
    if markdown_body is not None:
        fields["markdown_body"] = markdown_body
    if sort_order is not None:
        fields["sort_order"] = sort_order
    if not fields:
        return get_page(repo, page_id)
    updated = repo.update_notebook_page(page_id, **fields)
    if updated is None:
        raise NotebookError("Page not found", status_code=404)
    return with_topics(updated)


def delete_page(repo: JobRepository, page_id: str) -> None:
    if not repo.delete_notebook_page(page_id):
        raise NotebookError("Page not found", status_code=404)

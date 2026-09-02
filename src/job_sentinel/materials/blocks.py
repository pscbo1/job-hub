"""Deterministic Markdown material blocks used by search and copy actions."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from markdown_it import MarkdownIt
from markdown_it.token import Token


@dataclass(frozen=True)
class MaterialBlock:
    """A stable, copyable section of one immutable material version."""

    key: str
    title: str | None
    heading_path: tuple[str, ...]
    markdown: str
    copy_text: str
    start_line: int
    end_line: int


def parse_material_blocks(version_id: str, source: str) -> list[MaterialBlock]:
    """Split Markdown into introduction and heading blocks using parser tokens."""
    text = source.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.splitlines()
    md = MarkdownIt("commonmark")
    md.enable("table")
    tokens = md.parse(text)
    headings: list[tuple[int, int, str]] = []
    for index, token in enumerate(tokens):
        if token.type != "heading_open" or not token.map:
            continue
        inline = tokens[index + 1] if index + 1 < len(tokens) else None
        title = (inline.content if inline and inline.type == "inline" else "").strip()
        headings.append((int(token.tag[1:]), token.map[0], title))
    if not headings:
        if not text.strip():
            return []
        return [_make_block(version_id, None, (), text, 0, len(lines))]

    blocks: list[MaterialBlock] = []
    first_line = headings[0][1]
    if "\n".join(lines[:first_line]).strip():
        blocks.append(_make_block(version_id, "Introduction", (), "\n".join(lines[:first_line]), 0, first_line))

    for index, (level, start, title) in enumerate(headings):
        end = len(lines)
        for next_level, next_start, _ in headings[index + 1 :]:
            if next_level <= level:
                end = next_start
                break
        path = _heading_path(headings, index)
        body_start = _heading_body_start(tokens, start)
        markdown = "\n".join(lines[body_start:end])
        blocks.append(_make_block(version_id, title or None, path, markdown, start, end))
    return blocks


def _heading_body_start(tokens: list[Token], line: int) -> int:
    for token in tokens:
        if token.type == "heading_open" and token.map and token.map[0] == line:
            return token.map[1]
    return line + 1


def _heading_path(headings: list[tuple[int, int, str]], index: int) -> tuple[str, ...]:
    level, _, title = headings[index]
    path: list[str] = [title]
    cursor = index - 1
    while cursor >= 0:
        parent_level, _, parent_title = headings[cursor]
        if parent_level < level:
            path.insert(0, parent_title)
            level = parent_level
        cursor -= 1
    return tuple(path)


def _make_block(
    version_id: str,
    title: str | None,
    heading_path: tuple[str, ...],
    markdown: str,
    start: int,
    end: int,
) -> MaterialBlock:
    copy_text = _plain_text(markdown)
    digest = hashlib.sha256(f"{version_id}\0{start}\0{end}\0{markdown}".encode()).hexdigest()[:16]
    return MaterialBlock(
        key=f"{version_id}:{start}:{digest}",
        title=title,
        heading_path=heading_path,
        markdown=markdown,
        copy_text=copy_text,
        start_line=start,
        end_line=end,
    )


def _plain_text(markdown: str) -> str:
    md = MarkdownIt("commonmark")
    md.enable("table")
    tokens = md.parse(markdown)
    out: list[str] = []
    for token in tokens:
        if token.type in {"inline", "text", "code_inline", "code_block", "fence"}:
            if token.type == "inline" and token.children:
                out.append(_inline_text(token.children))
            else:
                out.append(token.content)
        elif token.type in {"softbreak", "hardbreak", "paragraph_close", "list_item_close", "heading_close"}:
            out.append("\n")
    return "\n".join(" ".join(line.split()) for line in "".join(out).splitlines()).strip()


def _inline_text(tokens: list[Token]) -> str:
    out: list[str] = []
    for token in tokens:
        if token.type in {"text", "code_inline", "html_inline"}:
            out.append(token.content)
        elif token.type == "image":
            out.append(token.content)
            if token.attrGet("src"):
                out.append(f" ({token.attrGet('src')})")
        elif token.type in {"softbreak", "hardbreak"}:
            out.append("\n")
    return "".join(out)

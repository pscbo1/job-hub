"""Pluggable official sponsor / accredited-employer registries."""

from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel, Field


class SponsorEmployer(BaseModel):
    """One employer row from an official public register."""

    country: str
    registry_id: str
    registry_name: str
    source_url: str
    employer_name: str
    employer_id: str = ""
    visa_route: str = ""
    downloaded_url: str = ""


class RegistrySyncMeta(BaseModel):
    registry_id: str
    country: str
    registry_name: str
    source_url: str
    downloaded_url: str = ""
    fetched_at: str = ""
    row_count: int = 0
    error: str = ""


class SponsorIndexEntry(BaseModel):
    country: str
    registry_id: str
    registry_name: str
    source_url: str
    employer_name: str
    employer_id: str = ""
    visa_route: str = ""
    ambiguous: bool = False


class SponsorRegistryProvider(ABC):
    """New countries subclass this and register the instance in ``catalog.py``."""

    country: str
    registry_id: str
    registry_name: str
    source_url: str

    @abstractmethod
    def fetch_employers(self) -> list[SponsorEmployer]:
        """Download and parse the official public list. Raises on hard failure."""


class RegistryMatch(BaseModel):
    country: str
    registry_id: str
    registry_name: str
    source_url: str
    matched_name: str
    matched_id: str = ""
    visa_route: str = ""
    keys: list[str] = Field(default_factory=list)

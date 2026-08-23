"""
documents/providers.py
───────────────────────
Multi-provider LLM backend abstraction.

This module is the single place that knows how to talk to different LLM
providers.  It defines two ``Protocol`` types (``ChatBackend``, ``EmbedBackend``)
and two factories that read the resolved settings and return the right
implementation:

- When ``provider == "ollama"`` the **native** Ollama API is used
  (``/api/chat`` with ``think:false``, ``/api/tags`` for model presence).
  This path preserves every behaviour the codebase had before this module
  was introduced — nothing changes for users running Ollama locally.

- For every other provider (``openai``, ``openrouter``, ``groq``, ``gemini``,
  ``custom``) an OpenAI-compatible REST client is used.  All these providers
  expose ``/chat/completions`` and ``/models`` at their respective base URLs,
  so a single implementation covers them all.

Graceful degradation:
  - ``available()`` / ``ready()`` return ``False`` on any network error — they
    never raise.
  - ``chat`` / ``embed`` let exceptions propagate so callers can log and fall
    back.  The callers in ``llm.py``, ``chat.py``, and ``semantic.py`` already
    do this.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

import httpx
from loguru import logger

if TYPE_CHECKING:
    from job_sentinel.config.settings import LLMSettings


# ─────────────────────────────────────────────────────────────────────────────
# Provider metadata table
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ProviderInfo:
    """Static metadata for a known provider."""

    base_url: str
    requires_key: bool
    supports_embeddings: bool
    label: str


PROVIDER_DEFAULTS: dict[str, ProviderInfo] = {
    "ollama": ProviderInfo(
        base_url="http://localhost:11434",
        requires_key=False,
        supports_embeddings=True,
        label="Ollama (local)",
    ),
    "openai": ProviderInfo(
        base_url="https://api.openai.com/v1",
        requires_key=True,
        supports_embeddings=True,
        label="OpenAI",
    ),
    "openrouter": ProviderInfo(
        base_url="https://openrouter.ai/api/v1",
        requires_key=True,
        supports_embeddings=True,
        label="OpenRouter",
    ),
    "groq": ProviderInfo(
        base_url="https://api.groq.com/openai/v1",
        requires_key=True,
        supports_embeddings=False,
        label="Groq",
    ),
    "gemini": ProviderInfo(
        base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        requires_key=True,
        supports_embeddings=True,
        label="Google Gemini",
    ),
    "custom": ProviderInfo(
        base_url="",
        requires_key=False,
        supports_embeddings=True,
        label="Custom (OpenAI-compatible)",
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# Backend protocols
# ─────────────────────────────────────────────────────────────────────────────


@runtime_checkable
class ChatBackend(Protocol):
    """Anything that can answer chat turns."""

    @property
    def model(self) -> str: ...

    def available(self) -> bool: ...

    def ready(self) -> bool: ...

    def chat(self, system: str, messages: list[dict[str, str]]) -> str: ...

    def chat_json(self, system: str, user: str) -> dict[str, Any]: ...


@runtime_checkable
class EmbedBackend(Protocol):
    """Anything that can embed a list of strings."""

    @property
    def model(self) -> str: ...

    def available(self) -> bool: ...

    def ready(self) -> bool: ...

    def embed(self, texts: list[str]) -> list[list[float]] | None: ...


# ─────────────────────────────────────────────────────────────────────────────
# Native Ollama client (preserved exactly — think:false matters)
# ─────────────────────────────────────────────────────────────────────────────


class OllamaBackend:
    """
    Native Ollama HTTP API client.

    Uses ``/api/tags`` for availability checks and ``/api/chat`` for
    inference — NOT the OpenAI-compat shim that Ollama also exposes.
    ``think:false`` disables chain-of-thought on reasoning-tuned models
    (Qwen3, DeepSeek-R1 etc.), keeping latency sane.
    """

    def __init__(self, base_url: str, model: str, timeout: float = 90.0) -> None:
        self._base = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout

    @property
    def model(self) -> str:
        return self._model

    def available(self) -> bool:
        """True if the Ollama server answers."""
        try:
            httpx.get(f"{self._base}/api/tags", timeout=3.0).raise_for_status()
        except Exception:
            return False
        return True

    def installed_models(self) -> list[str]:
        """Names of locally-pulled models (empty if the server is unreachable)."""
        try:
            resp = httpx.get(f"{self._base}/api/tags", timeout=3.0)
            resp.raise_for_status()
            return [m.get("name", "") for m in resp.json().get("models", [])]
        except Exception:
            return []

    def has_model(self) -> bool:
        """True if the configured model (or its base tag) is pulled."""
        base = self._model.split(":")[0]
        return any(
            name == self._model or name.split(":")[0] == base for name in self.installed_models()
        )

    def ready(self) -> bool:
        return self.available() and self.has_model()

    def chat(self, system: str, messages: list[dict[str, str]]) -> str:
        """
        Plain-text multi-turn chat.

        ``think:false`` keeps reasoning models from dumping their thought
        chain into the answer.
        """
        payload: dict[str, Any] = {
            "model": self._model,
            "stream": False,
            "think": False,
            "messages": [{"role": "system", "content": system}, *messages],
            "options": {"temperature": 0.4},
        }
        resp = httpx.post(f"{self._base}/api/chat", json=payload, timeout=self._timeout)
        resp.raise_for_status()
        content = resp.json().get("message", {}).get("content", "")
        return str(content).strip()

    def chat_json(self, system: str, user: str) -> dict[str, Any]:
        """Single non-streaming chat turn constrained to JSON output."""
        payload: dict[str, Any] = {
            "model": self._model,
            "stream": False,
            "format": "json",
            "think": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "options": {"temperature": 0.2},
        }
        resp = httpx.post(f"{self._base}/api/chat", json=payload, timeout=self._timeout)
        resp.raise_for_status()
        content = resp.json().get("message", {}).get("content", "{}")
        parsed: dict[str, Any] = json.loads(content)
        return parsed

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        """Embed texts via Ollama's native /api/embed endpoint."""
        if not texts:
            return []
        resp = httpx.post(
            f"{self._base}/api/embed",
            json={"model": self._model, "input": texts},
            timeout=self._timeout,
        )
        resp.raise_for_status()
        embeddings: list[list[float]] | None = resp.json().get("embeddings")
        if isinstance(embeddings, list) and len(embeddings) == len(texts):
            return embeddings
        logger.warning("Ollama embedder returned unexpected shape — skipping")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# OpenAI-compatible client (all non-Ollama providers)
# ─────────────────────────────────────────────────────────────────────────────

_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


class OpenAICompatClient:
    """
    OpenAI-compatible REST client for cloud providers.

    Covers OpenAI, OpenRouter, Groq, Gemini (via its openai-compat base URL),
    and any ``custom`` endpoint.  Uses httpx directly — no openai SDK.
    """

    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout: float = 90.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._model = model
        self._api_key = api_key
        self._timeout = timeout

    @property
    def model(self) -> str:
        return self._model

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            h["Authorization"] = f"Bearer {self._api_key}"
        return h

    def available(self) -> bool:
        """True if the /models endpoint responds with 2xx."""
        try:
            resp = httpx.get(
                f"{self._base}/models",
                headers=self._headers(),
                timeout=3.0,
            )
            return resp.is_success
        except Exception:
            return False

    def ready(self) -> bool:
        """
        True when available().

        Cloud providers don't always list the exact model id in /models,
        so we don't hard-fail on membership — if the endpoint is up and
        returns 2xx, we consider the client ready.
        """
        return self.available()

    def chat(self, system: str, messages: list[dict[str, str]]) -> str:
        """Multi-turn chat, plain text response."""
        body: dict[str, Any] = {
            "model": self._model,
            "messages": [{"role": "system", "content": system}, *messages],
            "temperature": 0.4,
            "stream": False,
        }
        resp = httpx.post(
            f"{self._base}/chat/completions",
            json=body,
            headers=self._headers(),
            timeout=self._timeout,
        )
        resp.raise_for_status()
        content: str = resp.json()["choices"][0]["message"]["content"]
        return content.strip()

    def chat_json(self, system: str, user: str) -> dict[str, Any]:
        """
        Single turn that must return JSON.

        Tries ``response_format: {type: json_object}`` first.  If the
        provider doesn't support that parameter, or the parse fails, retries
        without it and extracts the first ``{…}`` block from the raw content.
        Returns ``{}`` on total failure.
        """
        body: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
            "stream": False,
            "response_format": {"type": "json_object"},
        }
        try:
            resp = httpx.post(
                f"{self._base}/chat/completions",
                json=body,
                headers=self._headers(),
                timeout=self._timeout,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            result: dict[str, Any] = json.loads(content)
            return result
        except (json.JSONDecodeError, KeyError):
            pass
        except httpx.HTTPStatusError as exc:
            # Some providers (e.g. older Groq models) reject response_format.
            logger.debug(
                "chat_json: response_format rejected ({}); retrying without it",
                exc.response.status_code,
            )
        except httpx.RequestError as exc:
            # Network-level failure (timeout, connection refused, ...) — the
            # retry uses the same endpoint so it won't help here, but we still
            # fall through to the shared "return {} on total failure" path
            # below instead of letting this escape uncaught.
            logger.debug("chat_json: request failed ({}); retrying without response_format", exc)

        # Retry without response_format, best-effort extract first JSON block.
        body.pop("response_format", None)
        try:
            resp = httpx.post(
                f"{self._base}/chat/completions",
                json=body,
                headers=self._headers(),
                timeout=self._timeout,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
            m = _JSON_BLOCK_RE.search(raw)
            if m:
                extracted: dict[str, Any] = json.loads(m.group())
                return extracted
        except Exception as exc:
            logger.warning("chat_json retry also failed ({})", exc)
        return {}

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        """Embed via OpenAI-compatible /embeddings endpoint."""
        if not texts:
            return []
        resp = httpx.post(
            f"{self._base}/embeddings",
            json={"model": self._model, "input": texts},
            headers=self._headers(),
            timeout=self._timeout,
        )
        resp.raise_for_status()
        data: list[dict[str, Any]] = resp.json()["data"]
        return [d["embedding"] for d in data]


# ─────────────────────────────────────────────────────────────────────────────
# Factories
# ─────────────────────────────────────────────────────────────────────────────


def build_chat_backend(settings: LLMSettings) -> ChatBackend:
    """
    Return the appropriate chat backend for the current settings.

    - ``provider == "ollama"``  → native OllamaBackend (preserves think:false)
    - anything else             → OpenAICompatClient
    """
    provider = settings.chat_provider.lower()
    if provider == "ollama":
        return OllamaBackend(
            base_url=settings.chat_base_url_resolved,
            model=settings.chat_model_resolved,
            timeout=float(settings.llm_timeout),
        )
    base_url = (
        settings.chat_base_url_resolved
        or PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["custom"]).base_url
    )
    return OpenAICompatClient(
        base_url=base_url,
        model=settings.chat_model_resolved,
        api_key=settings.chat_api_key,
        timeout=float(settings.llm_timeout),
    )


def build_embed_backend(settings: LLMSettings) -> EmbedBackend:
    """
    Return the appropriate embedding backend for the current settings.

    - ``provider == "ollama"``  → native OllamaBackend (uses /api/embed)
    - anything else             → OpenAICompatClient (uses /embeddings)
    """
    provider = settings.embed_provider.lower()
    if provider == "ollama":
        return OllamaBackend(
            base_url=settings.embed_base_url_resolved,
            model=settings.embed_model_resolved,
            timeout=float(settings.llm_timeout),
        )
    base_url = (
        settings.embed_base_url_resolved
        or PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["custom"]).base_url
    )
    return OpenAICompatClient(
        base_url=base_url,
        model=settings.embed_model_resolved,
        api_key=settings.embed_api_key,
        timeout=float(settings.llm_timeout),
    )

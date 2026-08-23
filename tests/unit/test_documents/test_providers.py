"""Tests for the multi-provider LLM backend abstraction (documents/providers.py).

HTTP is mocked with respx; no live provider is contacted. Covers the parts
that had no dedicated tests before: the OpenAI-compatible client (chat,
chat_json's response_format fallback path, embed) and the build_chat_backend /
build_embed_backend factories.
"""

from __future__ import annotations

import httpx
import respx

from job_sentinel.config.settings import LLMSettings
from job_sentinel.documents.providers import (
    OllamaBackend,
    OpenAICompatClient,
    build_chat_backend,
    build_embed_backend,
)

_BASE = "https://api.example.com/v1"


class TestOpenAICompatAvailability:
    @respx.mock
    def test_available_true_on_2xx(self) -> None:
        respx.get(f"{_BASE}/models").mock(return_value=httpx.Response(200, json={}))
        assert OpenAICompatClient(_BASE, "gpt-test").available() is True

    @respx.mock
    def test_available_false_on_error_status(self) -> None:
        respx.get(f"{_BASE}/models").mock(return_value=httpx.Response(401))
        assert OpenAICompatClient(_BASE, "gpt-test").available() is False

    @respx.mock
    def test_available_false_on_network_error(self) -> None:
        respx.get(f"{_BASE}/models").mock(side_effect=httpx.ConnectError("down"))
        assert OpenAICompatClient(_BASE, "gpt-test").available() is False

    @respx.mock
    def test_ready_mirrors_available(self) -> None:
        respx.get(f"{_BASE}/models").mock(return_value=httpx.Response(200, json={}))
        assert OpenAICompatClient(_BASE, "gpt-test").ready() is True

    @respx.mock
    def test_headers_include_bearer_key(self) -> None:
        route = respx.get(f"{_BASE}/models").mock(return_value=httpx.Response(200, json={}))
        OpenAICompatClient(_BASE, "gpt-test", api_key="sk-abc").available()
        assert route.calls.last.request.headers["Authorization"] == "Bearer sk-abc"

    @respx.mock
    def test_no_auth_header_without_key(self) -> None:
        route = respx.get(f"{_BASE}/models").mock(return_value=httpx.Response(200, json={}))
        OpenAICompatClient(_BASE, "gpt-test").available()
        assert "Authorization" not in route.calls.last.request.headers


class TestOpenAICompatChat:
    @respx.mock
    def test_chat_returns_stripped_content(self) -> None:
        respx.post(f"{_BASE}/chat/completions").mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": "  hello there  "}}]}
            )
        )
        out = OpenAICompatClient(_BASE, "gpt-test").chat("sys", [{"role": "user", "content": "hi"}])
        assert out == "hello there"


class TestOpenAICompatChatJson:
    @respx.mock
    def test_chat_json_happy_path(self) -> None:
        respx.post(f"{_BASE}/chat/completions").mock(
            return_value=httpx.Response(
                200,
                json={"choices": [{"message": {"content": '{"bullets": ["a", "b"]}'}}]},
            )
        )
        out = OpenAICompatClient(_BASE, "gpt-test").chat_json("sys", "user")
        assert out == {"bullets": ["a", "b"]}

    @respx.mock
    def test_falls_back_when_response_format_rejected(self) -> None:
        route = respx.post(f"{_BASE}/chat/completions")
        route.side_effect = [
            httpx.Response(400, json={"error": "response_format not supported"}),
            httpx.Response(
                200,
                json={"choices": [{"message": {"content": 'sure, here: {"bullets": ["x"]}'}}]},
            ),
        ]
        out = OpenAICompatClient(_BASE, "gpt-test").chat_json("sys", "user")
        assert out == {"bullets": ["x"]}
        assert route.call_count == 2

    @respx.mock
    def test_falls_back_when_content_is_not_json(self) -> None:
        route = respx.post(f"{_BASE}/chat/completions")
        route.side_effect = [
            httpx.Response(200, json={"choices": [{"message": {"content": "not json at all"}}]}),
            httpx.Response(
                200, json={"choices": [{"message": {"content": '{"bullets": ["retry"]}'}}]}
            ),
        ]
        out = OpenAICompatClient(_BASE, "gpt-test").chat_json("sys", "user")
        assert out == {"bullets": ["retry"]}

    @respx.mock
    def test_returns_empty_dict_on_total_failure(self) -> None:
        respx.post(f"{_BASE}/chat/completions").mock(side_effect=httpx.ConnectError("down"))
        assert OpenAICompatClient(_BASE, "gpt-test").chat_json("sys", "user") == {}

    @respx.mock
    def test_returns_empty_dict_when_retry_has_no_json_block(self) -> None:
        route = respx.post(f"{_BASE}/chat/completions")
        route.side_effect = [
            httpx.Response(200, json={"choices": [{"message": {"content": "nope"}}]}),
            httpx.Response(200, json={"choices": [{"message": {"content": "still nothing"}}]}),
        ]
        assert OpenAICompatClient(_BASE, "gpt-test").chat_json("sys", "user") == {}


class TestOpenAICompatEmbed:
    @respx.mock
    def test_embed_returns_vectors(self) -> None:
        respx.post(f"{_BASE}/embeddings").mock(
            return_value=httpx.Response(
                200, json={"data": [{"embedding": [0.1, 0.2]}, {"embedding": [0.3, 0.4]}]}
            )
        )
        out = OpenAICompatClient(_BASE, "embed-test").embed(["a", "b"])
        assert out == [[0.1, 0.2], [0.3, 0.4]]

    def test_embed_empty_input_short_circuits(self) -> None:
        assert OpenAICompatClient(_BASE, "embed-test").embed([]) == []


class TestFactories:
    def test_build_chat_backend_ollama(self) -> None:
        settings = LLMSettings(CHAT_PROVIDER="ollama")
        backend = build_chat_backend(settings)
        assert isinstance(backend, OllamaBackend)

    def test_build_chat_backend_cloud_provider(self) -> None:
        settings = LLMSettings(CHAT_PROVIDER="groq", CHAT_MODEL="llama-3.1-70b")
        backend = build_chat_backend(settings)
        assert isinstance(backend, OpenAICompatClient)
        assert backend.model == "llama-3.1-70b"

    def test_build_embed_backend_ollama(self) -> None:
        settings = LLMSettings(EMBED_PROVIDER="ollama")
        backend = build_embed_backend(settings)
        assert isinstance(backend, OllamaBackend)

    def test_build_embed_backend_cloud_provider(self) -> None:
        settings = LLMSettings(EMBED_PROVIDER="openai", EMBED_MODEL="text-embedding-3-small")
        backend = build_embed_backend(settings)
        assert isinstance(backend, OpenAICompatClient)
        assert backend.model == "text-embedding-3-small"

    def test_build_chat_backend_unknown_provider_uses_custom_default(self) -> None:
        settings = LLMSettings(CHAT_PROVIDER="mystery-provider", CHAT_BASE_URL="")
        backend = build_chat_backend(settings)
        assert isinstance(backend, OpenAICompatClient)

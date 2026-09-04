"""Browser-only domestic platform manifests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.communication.platforms import platform_manifest


def test_platform_manifest_contains_all_domestic_channels() -> None:
    items = platform_manifest()
    assert [item["id"] for item in items] == ["boss", "liepin", "zhilian"]
    assert items[0]["mode"] == "browser_only"
    assert [item["mode"] for item in items[1:]] == ["manual_only", "manual_only"]
    assert all(item["requires_login"] is True for item in items)


def test_platform_chat_url_override_is_validated(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("COMM_BOSS_CHAT_URL", "https://www.zhipin.com/web/geek/chat")
    monkeypatch.setenv("COMM_LIEPIN_CHAT_URL", "javascript:bad")
    items = platform_manifest()
    assert items[0]["chat_configured"] is True
    assert items[0]["url"] == "https://www.zhipin.com/web/geek/chat"
    assert items[1]["chat_configured"] is False


def test_manual_record_preserves_platform_source_and_thread_url(tmp_path) -> None:
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "db.sqlite")
    )
    response = client.post(
        "/api/communication/conversations",
        json={
            "summary": "Recruiter asked for availability",
            "source": "zhilian",
            "channel": "browser",
            "external_thread_id": "https://example.com/chat/123",
            "job_id": "job-1",
            "application_id": "application-1",
            "company": "Example",
            "role": "Product Manager",
            "needs_action": True,
        },
    )
    assert response.status_code == 201, response.text
    item = response.json()
    assert item["source"] == "zhilian"
    assert item["external_thread_id"] == "https://example.com/chat/123"
    assert item["job_id"] == "job-1"
    assert item["application_id"] == "application-1"
    assert item["messages"][0]["source"] == "zhilian"
    searched = client.get("/api/communication/conversations", params={"q": "Product Manager"})
    assert searched.status_code == 200
    assert searched.json()["count"] == 1


def test_manual_record_accepts_liepin_source(tmp_path) -> None:
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "db.sqlite")
    )
    response = client.post(
        "/api/communication/conversations",
        json={"summary": "Follow up", "source": "liepin", "channel": "browser"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["source"] == "liepin"


def test_browser_capture_preview_is_read_only(tmp_path) -> None:
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "db.sqlite")
    )
    response = client.post(
        "/api/communication/platforms/boss/preview",
        json={
            "platform": "boss",
            "visible_text": "  Recruiter   asked for availability  ",
            "company": "Example",
            "role": "Product Manager",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["summary"] == "Recruiter asked for availability"
    assert response.json()["persisted"] is False
    assert client.get("/api/communication/conversations").json()["count"] == 0


def test_browser_tabs_requires_supported_platform(tmp_path) -> None:
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "db.sqlite")
    )
    response = client.get("/api/communication/platforms/unknown/browser/tabs")
    assert response.status_code == 409
    assert "Unsupported" in response.json()["detail"]


def test_browser_start_is_minimized_and_platform_scoped(tmp_path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "db.sqlite")
    )
    calls: list[list[str]] = []

    class FakeProcess:
        pass

    monkeypatch.setattr(
        "pathlib.Path.exists",
        lambda self: True,
    )
    monkeypatch.setattr(
        "subprocess.Popen", lambda args, **kwargs: calls.append(args) or FakeProcess()
    )
    response = client.post("/api/communication/platforms/liepin/browser/start")
    assert response.status_code == 200, response.text
    assert response.json()["platform"] == "liepin"
    assert "--start-minimized" in calls[0]
    assert "https://www.liepin.com/" in calls[0]

    unsupported = client.post("/api/communication/platforms/linkedin/browser/start")
    assert unsupported.status_code == 404


def test_browser_capture_quality_flags_noise_and_non_chat() -> None:
    from job_sentinel.communication.domestic import classify_capture

    noisy = classify_capture("兼职培训课程职位列表")
    assert noisy["quality"] == "low"
    assert noisy["is_actionable"] is False
    assert "noise:兼职,培训,课程" in noisy["filter_reasons"]
    useful = classify_capture("消息 招聘经理 回复了你的沟通")
    assert useful["quality"] == "review"
    assert useful["is_actionable"] is True


def test_browser_preview_rejects_low_quality_capture(tmp_path) -> None:
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "db.sqlite")
    )
    response = client.post(
        "/api/communication/platforms/boss/preview",
        json={"platform": "boss", "visible_text": "兼职培训课程职位列表"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == "Capture filtered"


def test_mobile_only_platform_capture_is_rejected(tmp_path) -> None:
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "db.sqlite")
    )
    response = client.post(
        "/api/communication/platforms/liepin/preview",
        json={"platform": "liepin", "visible_text": "Recruiter message"},
    )
    assert response.status_code == 409
    assert "Manual record" in response.json()["detail"]

    response = client.post("/api/communication/platforms/zhilian/browser/capture")
    assert response.status_code == 409
    assert "Manual record" in response.json()["detail"]


def test_chat_list_parser_splits_and_filters_at_entry_level() -> None:
    from job_sentinel.communication.domestic import parse_chat_list

    entries = parse_chat_list(
        "消息\n全部\n09月02日\n陈女士 畅读HRM\n方便沟通岗位详情吗?\n"
        "09月01日\n蔡女士 新东方hrbp\n诚聘一对一高中英语"
    )
    assert len(entries) == 2
    assert entries[0]["date"] == "09月02日"
    assert "岗位详情" in entries[0]["preview"]

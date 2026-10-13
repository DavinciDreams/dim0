"""Tests for running the API without the optional Mistral OCR service."""

from types import SimpleNamespace

import pytest

from fastapi import HTTPException, Request

import topix.api.app as app_module

from topix.api.router.documents import _require_parsing_pipeline


def _config_with_mistral_key(api_key):
    """Build the minimum config shape required by the parser initializer."""
    return SimpleNamespace(
        run=SimpleNamespace(
            apis=SimpleNamespace(
                mistral=SimpleNamespace(api_key=api_key),
            ),
        ),
    )


def test_parser_pipeline_is_disabled_without_mistral_key(monkeypatch, caplog):
    """A missing Mistral key must not prevent the rest of the API from starting."""
    config = _config_with_mistral_key(None)
    monkeypatch.setattr(app_module, "Config", SimpleNamespace(instance=lambda: config))
    monkeypatch.setattr(
        app_module,
        "ParsingPipeline",
        lambda: pytest.fail("ParsingPipeline should not be initialized"),
    )

    assert app_module._create_parser_pipeline() is None
    assert "MISTRAL_API_KEY is not configured" in caplog.text


def test_parser_pipeline_is_created_with_mistral_key(monkeypatch):
    """A configured Mistral key keeps PDF document import enabled."""
    config = _config_with_mistral_key(object())
    pipeline = object()
    monkeypatch.setattr(app_module, "Config", SimpleNamespace(instance=lambda: config))
    monkeypatch.setattr(app_module, "ParsingPipeline", lambda: pipeline)

    assert app_module._create_parser_pipeline() is pipeline


def test_document_import_returns_503_when_pipeline_is_disabled():
    """PDF import reports its missing optional dependency instead of failing startup."""
    request = Request({"type": "http", "app": SimpleNamespace(parser_pipeline=None)})

    with pytest.raises(HTTPException) as exc_info:
        _require_parsing_pipeline(request)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "PDF document import requires MISTRAL_API_KEY."


def test_document_import_uses_configured_pipeline():
    """PDF import receives the initialized pipeline when Mistral is configured."""
    pipeline = object()
    request = Request({"type": "http", "app": SimpleNamespace(parser_pipeline=pipeline)})

    assert _require_parsing_pipeline(request) is pipeline

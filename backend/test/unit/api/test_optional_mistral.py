"""Tests for running the API without the optional Mistral OCR service."""

from types import SimpleNamespace

import pytest

from fastapi import HTTPException, Request

import topix.api.app as app_module

from topix.api.router.documents import _require_parsing_pipeline


def test_parser_pipeline_is_disabled_without_mistral_key(monkeypatch, caplog):
    """Missing OCR providers must not prevent the rest of the API from starting."""
    monkeypatch.setattr(app_module, "create_pdf_parser", lambda: None)
    monkeypatch.setattr(
        app_module,
        "ParsingPipeline",
        lambda: pytest.fail("ParsingPipeline should not be initialized"),
    )

    assert app_module._create_parser_pipeline() is None
    assert "configure DOCLING_API_URL or MISTRAL_API_KEY" in caplog.text


def test_parser_pipeline_is_created_with_provider(monkeypatch):
    """Either configured OCR provider keeps PDF import enabled."""
    pipeline = object()
    parser = object()
    monkeypatch.setattr(app_module, "create_pdf_parser", lambda: parser)
    monkeypatch.setattr(app_module, "ParsingPipeline", lambda **kwargs: pipeline if kwargs["parser"] is parser else None)

    assert app_module._create_parser_pipeline() is pipeline


def test_document_import_returns_503_when_pipeline_is_disabled():
    """PDF import reports its missing optional dependency instead of failing startup."""
    request = Request({"type": "http", "app": SimpleNamespace(parser_pipeline=None)})

    with pytest.raises(HTTPException) as exc_info:
        _require_parsing_pipeline(request)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "PDF document import requires DOCLING_API_URL or MISTRAL_API_KEY."


def test_document_import_uses_configured_pipeline():
    """PDF import receives the initialized pipeline when Mistral is configured."""
    pipeline = object()
    request = Request({"type": "http", "app": SimpleNamespace(parser_pipeline=pipeline)})

    assert _require_parsing_pipeline(request) is pipeline

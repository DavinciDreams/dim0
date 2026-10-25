"""Exercise the Docling HTTP contract, page alignment, and optional hosted fallback."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from pypdf import PdfWriter

import topix.nlp.docling_parser as parser_module

from topix.nlp.docling_parser import DoclingParser, create_pdf_parser


@pytest.fixture
def pdf_path(tmp_path):
    """Create a real two-page PDF for input validation."""
    path = tmp_path / "example.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    writer.add_blank_page(width=300, height=300)
    writer.write(path)
    return str(path)


def mock_docling(monkeypatch, markdown=None, result_status="success", http_status=200):
    """Install an in-process Docling service transport and capture requests."""
    requests = []
    client_class = httpx.AsyncClient

    def handler(request):
        """Return Docling's task and result envelopes."""
        requests.append(request)
        if http_status != 200:
            return httpx.Response(http_status)
        if request.method == "POST":
            return httpx.Response(200, json={"task_id": "job-1", "task_status": "pending"})
        if "/poll/" in request.url.path:
            return httpx.Response(200, json={"task_id": "job-1", "task_status": "success"})
        text = markdown if markdown is not None else "# First\nPAGEBREAK\n| A | B |\n|---|---|\n| 1 | 2 |"
        text = text.replace("PAGEBREAK", "<!-- dim0-page-fixed -->")
        return httpx.Response(200, json={"status": result_status, "document": {"md_content": text}})

    monkeypatch.setattr(parser_module.secrets, "token_hex", lambda _: "fixed")
    monkeypatch.setattr(parser_module.httpx, "AsyncClient", lambda **kwargs: client_class(**kwargs, transport=httpx.MockTransport(handler)))
    return requests


@pytest.mark.asyncio
async def test_docling_preserves_pages_and_tables(monkeypatch, pdf_path):
    """Poll async jobs and retain page numbers and table Markdown."""
    requests = mock_docling(monkeypatch)
    pages = await DoclingParser("http://docling:5001").parse(pdf_path)
    assert [page["page"] for page in pages] == [0, 1]
    assert pages[0]["markdown"] == "# First"
    assert "| 1 | 2 |" in pages[1]["markdown"]
    assert requests[0].url.path == "/v1/convert/file/async"
    body = requests[0].content.decode("latin1")
    assert 'name="do_ocr"\r\n\r\ntrue' in body
    assert 'name="ocr_preset"\r\n\r\nrapidocr' in body
    assert 'name="files"; filename="document.pdf"' in body


@pytest.mark.asyncio
async def test_page_mismatch_retries_each_page(monkeypatch, pdf_path):
    """Missing blank page markers must not silently shift page citations."""
    requests = mock_docling(monkeypatch, markdown="one page")
    pages = await DoclingParser("http://docling:5001").parse(pdf_path)
    uploads = [r for r in requests if r.method == "POST"]
    assert len(uploads) == 3
    assert uploads[1].content.decode("latin1").count('name="page_range"\r\n\r\n1') == 2
    assert uploads[2].content.decode("latin1").count('name="page_range"\r\n\r\n2') == 2
    assert [page["page"] for page in pages] == [0, 1]


@pytest.mark.asyncio
@pytest.mark.parametrize("http_status,result_status", [(503, "success"), (200, "partial_success")])
async def test_provider_failure_uses_optional_fallback(monkeypatch, pdf_path, http_status, result_status):
    """Unavailability or incomplete output triggers only a configured hosted fallback."""
    mock_docling(monkeypatch, http_status=http_status, result_status=result_status)
    fallback = SimpleNamespace(parse=AsyncMock(return_value=[{"page": 0, "markdown": "fallback"}]))
    pages = await DoclingParser("http://docling:5001", fallback=fallback).parse(pdf_path)
    assert pages[0]["markdown"] == "fallback"
    fallback.parse.assert_awaited_once_with(pdf_path, max_pages=200)


@pytest.mark.asyncio
async def test_invalid_input_never_calls_hosted_fallback(pdf_path):
    """Reject page limits before either provider receives the document."""
    fallback = SimpleNamespace(parse=AsyncMock())
    with pytest.raises(ValueError, match="between 1 and 1"):
        await DoclingParser("http://docling:5001", fallback=fallback).parse(pdf_path, max_pages=1)
    fallback.parse.assert_not_awaited()


@pytest.mark.parametrize("url,has_key", [("", False), ("", True), ("http://docling:5001", False), ("http://docling:5001", True)])
def test_parser_selection(monkeypatch, url, has_key):
    """Prefer Docling while preserving keyless startup and Mistral-only installations."""
    monkeypatch.setenv("DOCLING_API_URL", url)
    config = SimpleNamespace(run=SimpleNamespace(apis=SimpleNamespace(mistral=SimpleNamespace(api_key=has_key))))
    monkeypatch.setattr(parser_module, "Config", SimpleNamespace(instance=lambda: config))
    fallback = object()
    monkeypatch.setattr(parser_module.MistralParser, "from_config", lambda: fallback)
    parser = create_pdf_parser()
    if url:
        assert isinstance(parser, DoclingParser)
        assert parser.fallback is (fallback if has_key else None)
    else:
        assert parser is (fallback if has_key else None)

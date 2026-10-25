"""Convert PDFs through a private Docling Serve instance with optional Mistral fallback."""

import asyncio
import logging
import os
import re
import secrets

from pathlib import Path
from urllib.parse import quote

import httpx

from pypdf import PdfReader

from topix.config.config import Config
from topix.nlp.parser import MistralParser

logger = logging.getLogger(__name__)
MAX_PDF_BYTES = 25 * 1024 * 1024


class DoclingParser:
    """Return zero-based page Markdown while keeping document bytes on the private service."""

    def __init__(self, base_url: str, fallback: MistralParser | None = None, timeout: float = 180):
        """Use a server-configured URL and an optional hosted fallback."""
        self.base_url = base_url.rstrip("/") + "/"
        self.fallback = fallback
        self.timeout = timeout

    async def _convert(self, client: httpx.AsyncClient, content: bytes, marker: str, page: int | None = None) -> str:
        """Submit one bounded async conversion and accept only complete, valid results."""
        fields: dict[str, str | list[str]] = {
            "from_formats": "pdf",
            "to_formats": "md",
            "do_ocr": "true",
            "ocr_preset": "rapidocr",
            "ocr_lang": "en",
            "do_table_structure": "true",
            "table_mode": "accurate",
            "do_pdf_heading_hierarchy": "true",
            "do_formula_enrichment": "false",
            "include_images": "false",
            "include_page_images": "false",
            "md_page_break_placeholder": marker,
            "document_timeout": "150",
            "abort_on_error": "true",
        }
        if page is not None:
            fields["page_range"] = [str(page), str(page)]
        response = await client.post(
            "v1/convert/file/async",
            data=fields,
            files={"files": ("document.pdf", content, "application/pdf")},
        )
        response.raise_for_status()
        task = response.json()
        task_id = task.get("task_id") if isinstance(task, dict) else None
        if not isinstance(task_id, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", task_id):
            raise ValueError("Docling returned an invalid task identifier")
        while True:
            if not isinstance(task, dict) or task.get("task_id") != task_id:
                raise ValueError("Docling returned an invalid task state")
            if task.get("task_status") not in {"pending", "started", "success", "failure"}:
                raise ValueError("Docling returned an invalid task state")
            if task["task_status"] == "failure":
                raise ValueError("Docling conversion failed")
            if task["task_status"] == "success":
                break
            await asyncio.sleep(1)
            response = await client.get(f"v1/status/poll/{quote(task_id, safe='')}")
            response.raise_for_status()
            task = response.json()
        response = await client.get(f"v1/result/{quote(task_id, safe='')}")
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict) or result.get("status") != "success" or result.get("errors"):
            raise ValueError("Docling returned an incomplete conversion")
        document = result.get("document")
        markdown = document.get("md_content") if isinstance(document, dict) else None
        if not isinstance(markdown, str):
            raise ValueError("Docling returned no Markdown")
        return markdown

    async def _parse_docling(self, filepath: str, page_count: int) -> list[dict[str, int | str]]:
        """Keep page boundaries, retrying individual pages when blank pages were omitted."""
        content = await asyncio.to_thread(Path(filepath).read_bytes)
        marker = f"<!-- dim0-page-{secrets.token_hex(16)} -->"
        async with asyncio.timeout(self.timeout):
            async with httpx.AsyncClient(base_url=self.base_url, timeout=30, follow_redirects=False, trust_env=False) as client:
                markdown = await self._convert(client, content, marker)
                pages = markdown.split(marker)
                if len(pages) != page_count:
                    # Docling may omit empty pages; never shift subsequent citations.
                    pages = [await self._convert(client, content, marker, page) for page in range(1, page_count + 1)]
        if not any(page.strip() for page in pages):
            raise ValueError("Docling extracted no text")
        return [{"markdown": markdown.strip(), "page": index} for index, markdown in enumerate(pages)]

    async def parse(self, filepath: str, max_pages: int = 200) -> list[dict[str, int | str]]:
        """Validate the input before OCR and use Mistral only for provider failures."""
        path = Path(filepath)
        if path.suffix.lower() != ".pdf" or path.stat().st_size > MAX_PDF_BYTES:
            raise ValueError("Expected a PDF no larger than 25 MiB")
        page_count = await asyncio.to_thread(lambda: len(PdfReader(filepath).pages))
        if not 1 <= page_count <= max_pages:
            raise ValueError(f"PDF must contain between 1 and {max_pages} pages")
        try:
            return await self._parse_docling(filepath, page_count)
        except (httpx.HTTPError, TimeoutError, ValueError):
            if self.fallback is None:
                raise
            logger.warning("Docling conversion failed; using the configured Mistral fallback.")
            return await self.fallback.parse(filepath, max_pages=max_pages)


def create_pdf_parser() -> DoclingParser | MistralParser | None:
    """Prefer configured Docling, preserving standalone Mistral and no-provider startup."""
    fallback = MistralParser.from_config() if Config.instance().run.apis.mistral.api_key else None
    base_url = os.getenv("DOCLING_API_URL", "").strip()
    return DoclingParser(base_url, fallback=fallback) if base_url else fallback

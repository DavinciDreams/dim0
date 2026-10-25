# Vercel web UI with a Coolify backend

This deployment keeps the stateful Dim0 services on Coolify and serves only the
Vite web UI from Vercel.

## Coolify

Create a Git-based Docker Compose application from this repository with:

- Base Directory: `/`
- Docker Compose Location: `/build/docker-compose.coolify.yml`
- Public service: `backend`
- Backend domain: an HTTPS URL routed to internal port `8081`, for example
  `https://api.dim0.net:8081`

Do not publish host ports for Postgres, Redis, or Qdrant. They communicate with
the backend over Coolify's resource-specific Compose network and persist through
the named volumes in the Compose file. The Compose file pins each dependency to
a versioned image and uses `SERVICE_PASSWORD_64_POSTGRES` for the database
password; Coolify generates and reuses that value for Postgres and the backend.

Set `APP_BASE_URL` to the final Vercel web origin and configure at least one of
`OPENAI_API_KEY` or `OPENROUTER_API_KEY`. Configure the optional provider,
email, Daytona, and Google variables only for features that need them. Coolify
generates `JWT_SECRET_KEY` from `SERVICE_REALBASE64_64_BACKEND`; do not replace
that variable with a committed secret.

### PDF import

The Coolify Compose deployment runs a separate private `docling` service, pinned
to Docling Serve CPU v1.35.0 by image digest. Only `backend` joins its internal
network and calls `DOCLING_API_URL=http://docling:5001`. Assign no public domain
or host port to Docling. The service has a 4 CPU / 8 GiB ceiling and one worker.

PDF import uses the image's bundled RapidOCR models, accurate table extraction, and heading
hierarchy. Formula enrichment is disabled for this CPU deployment. Input is
limited to 25 MiB and 200 pages, and conversion has a 180 second deadline.
Page Markdown retains the zero-based page numbers used by the existing chunker.
Browser chat attachments at `/ai/parse` use the same parser, retaining their
existing 5 MiB / 50 page limits. An explicit Mistral BYOK header selects Mistral.

`MISTRAL_API_KEY` remains optional. When present, a failed Docling conversion
falls back to Mistral and sends that PDF to Mistral's hosted API. Leave the key
unset to keep OCR entirely inside the private Docling service. Outside Compose,
set `DOCLING_API_URL` to your own Docling Serve URL; Mistral alone still works.
When neither provider is configured, the API starts and PDF import returns 503.

After deployment, check Docling's `/ready` healthcheck and import a scanned PDF
through Dim0. A successful readiness check alone does not verify OCR output.

## Vercel

Import the repository as a Services project. The root `vercel.json` exposes the
single `webui` service at the project domain.

Set `VITE_API_URL` for Production and Preview to the public Coolify backend URL,
without a trailing slash. This is a build-time variable, so redeploy the web UI
after changing it.

## Desktop

Set the GitHub repository variable `API_ORIGIN` to the same public Coolify
backend URL before running the desktop release workflow. The workflow bakes it
into `VITE_API_URL`, and the desktop HTTP and WebSocket clients use that one
base URL.

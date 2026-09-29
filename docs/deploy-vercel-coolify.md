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

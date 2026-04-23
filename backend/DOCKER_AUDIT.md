# Docker Audit Quickstart

This repo now includes a small Docker-first audit workflow for fast environment checks and smoke verification.

## 1. Prepare backend env

`backend/.env` should exist before local backend scripts are used.

Current local default:

```env
DATABASE_URL=postgres://catering:changeme123@localhost:5432/catering_ld
JWT_SECRET=superSecretKey2026changeMe!!CHANGE_IN_PROD
FRONTEND_URL=http://localhost:5173
```

Change `JWT_SECRET` before any real deployment.

## 2. Check environment

Run from `backend/`:

```bash
npm run doctor
```

The doctor script checks:

- `docker` and `docker compose` availability
- presence of `backend/.env`
- basic env sanity such as `JWT_SECRET`
- presence of local `node_modules`
- whether `http://localhost:4000/api/health` and `http://localhost/` are already reachable

If PowerShell blocks `npm.ps1`, use:

```bash
npm.cmd run doctor
```

## 3. Start the stack

Run from repo root:

```bash
docker compose up -d --build
```

Expected URLs:

- frontend: `http://localhost/`
- backend health: `http://localhost:4000/api/health`

## 4. Run smoke audit

Run from `backend/`:

```bash
npm run smoke
```

This combines:

- `npm run system-test`
- `npm run security-test`

Covered flows:

- backend health endpoint
- frontend HTML root
- login with seeded demo account
- `/api/auth/me` without and with token
- admin endpoint `/api/uzivatele`

## 5. Manual audit suggestions

After smoke passes, manually verify:

- dashboard load
- zakazky list, detail, create, status change
- klienti list, detail, create
- nabidky list and editor open
- faktury list and detail open
- degraded behavior of e-mail / Google / Tally pages when integrations are not configured

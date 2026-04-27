# Catering LD CRM

Interní CRM pro gastronomické provozy a cateringové firmy. Systém pokrývá obchod, zakázky, venue logistiku, personál, fakturaci, dokumenty, e-mail a provozní workflow.

## Stack

| Vrstva | Technologie |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Databáze | PostgreSQL |
| Auth | JWT, bcryptjs |
| E-mail | Nodemailer, IMAP |
| Deploy | Docker, Render |

## Hlavní moduly

- Dashboard a operativa
- Zakázky, workflow a checklisty
- Nabídky a klientský výběr menu
- Fakturace
- Venue Logistics Twin
- Personál a kapacity
- Dokumenty a přílohy
- E-mail, SMTP a IMAP
- Reporty
- Nastavení a onboarding wizard

## Rychlý start

### Docker

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
```

Po prvním startu:

- `DB_SEED_MODE=empty` vytvoří čistou instalaci bez demo dat
- super admin účet je řízený přes `SUPER_ADMIN_*` env proměnné
- po prvním přihlášení super admina se otevře setup wizard

### Lokální vývoj

Backend:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Pokud frontend běží samostatně na Vite dev serveru, nastavte `frontend/.env.local`:

```bash
VITE_API_URL=http://localhost:4000/api
```

## Migrace a inicializace databáze

Projekt nově používá verzované migrace přes `schema_migrations`.

- `backend/src/initDb.js` už neobsahuje celý runtime bootstrap logiky
- migrace běží z `backend/db/migrations`
- fresh install i upgrade existující DB používají stejný runner
- seed režimy jsou oddělené od migrací

Spuštění:

```bash
cd backend
npm run migrate
```

Seed režimy:

- `DB_SEED_MODE=empty` – čistá instalace bez demo dat
- `DB_SEED_MODE=super_admin_only` – pouze kanonický super admin
- `DB_SEED_MODE=demo` – demo data pro lokální testování

## Release a testy

Základní smoke:

```bash
cd backend
npm run system-test
npm run security-test
```

Širší regresní běh:

```bash
cd backend
npm run regression-test
```

Plný release check:

```bash
cd backend
npm run release-check
```

`release-check` provede:

- syntax check backendu
- frontend build
- `system-test`
- `security-test`
- `regression-test`

## Důležité env proměnné

Všechny backend env proměnné patří do `backend/.env`.

| Proměnná | Popis |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | tajný klíč pro JWT |
| `FRONTEND_URL` | URL frontendu pro CORS a odkazy |
| `DB_SEED_MODE` | `empty`, `super_admin_only`, `demo` |
| `SUPER_ADMIN_EMAIL` | kanonický super admin |
| `SUPER_ADMIN_PASSWORD` | heslo super admina |
| `MAX_FILE_SIZE_MB` | limit uploadu, default `15` |
| `SMTP_*` | SMTP konfigurace |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | service account pro Google Calendar |

## Produkční bootstrap

Produkční instalace má běžet:

- bez demo dat
- s jediným kanonickým super adminem `pomykal@aceit.cz`
- se setup wizardem po prvním přihlášení

Detaily jsou v:

- [PRODUCTION_SETUP.md](/E:/Dropbox/Work/catering%20Landa&Dvo%C5%99%C3%A1k/CRM/catering-ld-crm/catering-ld-crm/PRODUCTION_SETUP.md)
- [DEPLOY_HANDOVER_CHECKLIST.md](/E:/Dropbox/Work/catering%20Landa&Dvo%C5%99%C3%A1k/CRM/catering-ld-crm/catering-ld-crm/DEPLOY_HANDOVER_CHECKLIST.md)

## Health endpoint

`GET /api/health` vrací:

- verzi buildu
- režim prostředí
- readiness stav
- výsledek DB kontroly
- stav inicializace migrací a seedu

To je základní provozní zdroj pravdy po deployi.

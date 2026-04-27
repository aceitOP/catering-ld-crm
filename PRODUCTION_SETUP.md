# Production Setup

Tato verze umí naběhnout jako čistá instalace bez demo dat a pouze s kanonickým super admin účtem.

## 1. Povinné backend env

```env
DATABASE_URL=postgres://...
JWT_SECRET=...minimalne_32_znaku...
FRONTEND_URL=https://crm.vasedomena.cz
DB_SEED_MODE=empty

SUPER_ADMIN_EMAIL=pomykal@aceit.cz
SUPER_ADMIN_PASSWORD=...silne_heslo...
SUPER_ADMIN_FIRST_NAME=Super
SUPER_ADMIN_LAST_NAME=Admin

MAX_FILE_SIZE_MB=15
UPLOAD_DIR=./uploads
```

Volitelně:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

## 2. Co se stane při prvním startu

- proběhnou verzované DB migrace
- vytvoří se `schema_migrations`
- seed režim `empty` nevloží žádná demo data
- systém vytvoří nebo opraví kanonický super admin účet
- po prvním přihlášení se otevře setup wizard

## 3. Doporučený postup nasazení

1. Připravit prázdnou PostgreSQL databázi.
2. Nastavit env proměnné.
3. Nasadit backend.
4. Nasadit frontend.
5. Ověřit `GET /api/health`.
6. Přihlásit se jako `pomykal@aceit.cz`.
7. Dokončit setup wizard.

## 4. Co čekat od `/api/health`

Endpoint vrací minimálně:

- `status`
- `version`
- `environment`
- `ready`
- `db`
- `init`

Nasazená instance je považována za připravenou, pokud:

- `status = ok`
- `ready = true`
- `db.ok = true`
- `init.ok = true`

## 5. Doporučený smoke po deployi

```bash
cd backend
npm run system-test
npm run security-test
```

Pro širší běh:

```bash
cd backend
REGRESSION_TEST_API_URL=https://api.vasedomena.cz
REGRESSION_TEST_EMAIL=pomykal@aceit.cz
REGRESSION_TEST_PASSWORD=...
REGRESSION_TEST_MUTATIONS=true
npm run regression-test
```

Pro release gate:

```bash
cd backend
npm run release-check
```

## 6. Kdy použít demo režim

Pouze pro lokální nebo testovací prostředí:

```env
DB_SEED_MODE=demo
```

Na produkci používat jen:

```env
DB_SEED_MODE=empty
```

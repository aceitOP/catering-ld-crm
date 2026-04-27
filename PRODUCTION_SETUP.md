# Production Setup

Tento projekt umi bez demo dat nabehnout jako cista instalace jen s kanonickym super admin uctem.

## 1. Povinne backend env

```env
DATABASE_URL=postgres://...
JWT_SECRET=...minimalne_32_znaku...
FRONTEND_URL=https://crm.vasedomena.cz
DB_SEED_MODE=empty

SUPER_ADMIN_EMAIL=pomykal@aceit.cz
SUPER_ADMIN_PASSWORD=...silne_heslo...
SUPER_ADMIN_FIRST_NAME=Super
SUPER_ADMIN_LAST_NAME=Admin
```

Volitelne:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

IMAP_HOST=
IMAP_PORT=993
IMAP_USER=
IMAP_PASS=
```

## 2. Prvni start

- spustit Postgres
- spustit backend
- spustit frontend build
- otevrit aplikaci
- prihlasit se uctem `pomykal@aceit.cz`

Po prvnim prihlaseni se automaticky otevre setup wizard.

## 3. Co udela cista instalace

- vytvori schema databaze
- nevlozi zadna demo data
- vytvori nebo zaktivni jediny kanonicky `super_admin` ucet
- otevre setup wizard pro firmu, branding a e-mail

## 4. Kdy pouzit demo rezim

Pouze na lokalnim nebo testovacim prostredi:

```env
DB_SEED_MODE=demo
```

V demo rezimu se naplni ukazkova data a testovaci ucty.

## 5. Doporuceny smoke po nasazeni

```bash
cd backend
npm run system-test
npm run security-test
```

Pro sirsi API kontrolu:

```bash
cd backend
REGRESSION_TEST_API_URL=https://api.vasedomena.cz \
REGRESSION_TEST_EMAIL=pomykal@aceit.cz \
REGRESSION_TEST_PASSWORD=... \
REGRESSION_TEST_MUTATIONS=true \
npm run regression-test
```

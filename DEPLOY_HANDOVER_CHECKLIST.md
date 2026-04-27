# Deploy Handover Checklist

Checklist pro kolegu, který bude dělat produkční nasazení ze ZIPu nebo ze zdrojového kódu.

## 1. Cíl nasazení

Po deployi má být systém:

- bez demo dat
- s jediným super admin účtem `pomykal@aceit.cz`
- připravený na první produkční nastavení
- se setup wizardem po prvním přihlášení

## 2. Povinné env proměnné

- `NODE_ENV=production`
- `DATABASE_URL=...`
- `JWT_SECRET=...`
- `FRONTEND_URL=...`
- `DB_SEED_MODE=empty`
- `SUPER_ADMIN_EMAIL=pomykal@aceit.cz`
- `SUPER_ADMIN_PASSWORD=...`
- `SUPER_ADMIN_FIRST_NAME=Super`
- `SUPER_ADMIN_LAST_NAME=Admin`
- `MAX_FILE_SIZE_MB=15`
- `UPLOAD_DIR=./uploads`

## 3. Render varianta

1. Nahrát aktuální kód nebo pushnout do repa.
2. Ověřit [render.yaml](/E:/Dropbox/Work/catering%20Landa&Dvo%C5%99%C3%A1k/CRM/catering-ld-crm/catering-ld-crm/render.yaml).
3. V Render dashboardu doplnit `SUPER_ADMIN_PASSWORD` jako secret.
4. Ověřit, že backend běží s `DB_SEED_MODE=empty`.
5. Spustit backend i frontend deploy.

## 4. Docker / vlastní server

1. Rozbalit ZIP nebo clone repa.
2. Vyplnit produkční env.
3. Připravit prázdnou PostgreSQL DB.
4. Spustit build a start.
5. Ověřit, že proběhly migrace a nevložila se demo data.

## 5. První kontrola po deployi

Ověřit:

1. `GET /api/health` vrací `status: ok`
2. `ready` je `true`
3. frontend se načte bez chyby
4. login účtem `pomykal@aceit.cz` funguje
5. `/api/auth/me` vrací roli `super_admin`
6. otevře se setup wizard

## 6. Doporučený první setup

Ve wizardu nebo hned po prvním loginu nastavit:

1. název firmy
2. firemní e-mail
3. název aplikace
4. barevnou šablonu
5. prvního běžného admina
6. SMTP / IMAP
7. branding a podpisy

## 7. Doporučené testy po deployi

Ruční smoke:

- login / logout
- dashboard
- založení klienta
- založení zakázky
- detail zakázky
- venue list a venue detail
- upload dokumentu do 15 MB
- test SMTP

Automatizované testy:

```bash
cd backend
npm run system-test
npm run security-test
npm run regression-test
```

Případně jako jedna release gate:

```bash
cd backend
npm run release-check
```

## 8. Co nedělat

- nenasazovat na starou DB, pokud cílem má být čistá instalace
- nedávat `SUPER_ADMIN_PASSWORD` do repa
- nepoužívat demo účet jako super admin
- nezapomenout na `DB_SEED_MODE=empty`

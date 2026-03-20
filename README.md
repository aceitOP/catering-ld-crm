# Catering LD – CRM systém

Interní CRM pro správu zakázek, klientů, personálu, fakturace a dalších operací cateringové firmy.

## Technologický stack

| Vrstva | Technologie |
|--------|-------------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend  | Node.js 22 + Express.js |
| Databáze | PostgreSQL 16 |
| Auth     | JWT (jsonwebtoken + bcryptjs) |
| Deploy   | Docker Compose (lokál / VPS) + Render.com |
| E-mail   | Nodemailer (SMTP out) + ImapFlow (IMAP in) |
| Kalendář | Google Calendar API (service account) |

---

## Moduly

| Modul | Popis |
|-------|-------|
| Dashboard | Widgety: zakázky, úkoly, poptávky, quick-add |
| Poptávky | Poptávky z Tally.so formuláře → nová zakázka |
| Zakázky | CRUD, workflow stavů, follow-up úkoly, šablony |
| Nabídky | Tvorba nabídek, odeslání e-mailem |
| Klientský výběr menu | Proposals s tokenem – klient potvrdí menu online |
| Fakturace | Faktury navázané na zakázky, ARES autocomplete |
| Kalendář | Zakázky + Google Calendar events, Kapacity (vytíženost) |
| Klienti | Databáze klientů, ARES lookup, archiv |
| Personál | Správa personálu, přiřazení na zakázky |
| Dokumenty | Upload souborů k zakázkám, složkový systém |
| Ceník | Kategorie + položky ceníku |
| Reporty | Přehledy tržeb a zakázek |
| Error log | Přehled backendových chyb, stav vyřešení, audit detailů |
| Archiv | Archivované zakázky / klienti / personál |
| Šablony zakázek | Předvyplněné šablony pro opakující se akce |
| E-mail | IMAP inbox, odpovídání, vytvoření zakázky z e-mailu |
| Výrobní list | Suroviny + spotřeba na zakázku |
| Nastavení | Firma, uživatelé, SMTP/IMAP, Google Calendar, kapacity |

---

## Rychlý start (Docker – doporučeno)

### 1. Předpoklady
- Docker Desktop (nebo Docker Engine + Compose plugin) nainstalován a spuštěn

### 2. Konfigurace prostředí

```bash
cp backend/.env.example backend/.env
```

Otevřete `backend/.env` a vyplňte hodnoty (viz sekce [Proměnné prostředí](#proměnné-prostředí)).

> **Bezpečnost:** Hodnoty v `.env.example` jsou ukázkové. Před spuštěním **vždy** změňte
> `JWT_SECRET` (min. 32 znaků), `DB_PASSWORD`, `SMTP_PASS` a ostatní citlivé hodnoty.

### 3. Spuštění

```bash
docker compose up -d --build
```

Aplikace bude dostupná na:
- **Frontend + API:** http://localhost:80
- **Backend API (přímý):** http://localhost:4000
- **PostgreSQL:** localhost:5432

### 4. Demo přihlášení

| E-mail | Heslo | Role |
|--------|-------|------|
| l.dvorackova@catering-ld.cz | Demo1234! | Administrátor |
| j.novackova@catering-ld.cz  | Demo1234! | Obchodník |
| p.dostal@catering-ld.cz     | Demo1234! | Provoz |

---

## Lokální vývoj (bez Dockeru)

### Předpoklady
- Node.js 18+ a PostgreSQL spuštěny lokálně

### Backend

```bash
cd backend
cp .env.example .env   # upravte DATABASE_URL a ostatní proměnné
npm install
npm run dev            # spustí na http://localhost:4000
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # spustí na http://localhost:5173
```

> **Poznámka k VITE_API_URL:** Frontend v `src/api.js` defaultuje `baseURL` na `/api`.
> Při lokálním vývoji (Vite dev server na :5173, backend na :4000) je třeba buď:
> - nastavit `VITE_API_URL=http://localhost:4000/api` v `frontend/.env.local`, nebo
> - přidat Vite proxy v `vite.config.js` (`/api` → `http://localhost:4000`).
>
> V produkci (Docker / Render) backend servíruje frontend jako statické soubory a
> `/api` je dostupné na stejné doméně – proxy/env není potřeba.

### Migrace / inicializace DB

```bash
cd backend
npm run migrate   # node src/db/migrate.js – zavolá initDb a spustí všechny migrace
```

Migrace jsou idempotentní (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
a spustí se automaticky i při každém startu backendu (`initDb` v `src/initDb.js`).

> **Architektura schématu:** Projekt používá startup-time migraci místo klasického migračního
> frameworku. `src/initDb.js` obsahuje jak počáteční DDL, tak ALTER TABLE patche pro nové sloupce.
> To je pragmatické pro projekt tohoto rozsahu – při přechodu na formální migrace (např. db-migrate,
> Flyway) by bylo nutné extrahovat initDb do číslovaných migrací.

## Systémový test

Po spuštění backendu (a případně frontendu) lze ověřit základní provoz pomocí skriptu `npm run system-test`
v adresáři `backend`. Skript volá `/api/health` a podle potřeby i `/` na zadané front-end URL,
takže stačí zachovat původní běžící instanci a spustit:

```bash
cd backend
SYSTEM_TEST_API_URL=http://localhost:4000 \
SYSTEM_TEST_FRONTEND_URL=http://localhost:5173 \
npm run system-test
```

Pokud nechcete testovat frontend, stačí nastavit pouze `SYSTEM_TEST_API_URL`. Nastavení `SYSTEM_TEST_FRONTEND_URL`
je dobrovolné a spustí kontrolu root stránky (přes `SYSTEM_TEST_INCLUDE_FRONTEND=true`).

## Bezpečnostní test

`npm run security-test` v `backend` ověřuje důležité auth flowy: `/api/auth/me` bez tokenu
vrací `401`, validní `POST /api/auth/login` vydá token, stejný token funguje pro `/api/auth/me`
a `/api/uzivatele` (vyžaduje roli `admin`). Skript používá výchozí demo údaje, ale můžete je přepsat
pomocí proměnných `SECURITY_TEST_EMAIL`, `SECURITY_TEST_PASSWORD` a `SECURITY_TEST_API_URL`.

```bash
cd backend
SECURITY_TEST_API_URL=http://localhost:4000 \
SECURITY_TEST_EMAIL=l.dvorackova@catering-ld.cz \
SECURITY_TEST_PASSWORD=Demo1234! \
npm run security-test
```

Pokud nechcete měnit uživatelský pár, stačí zadat pouze `SECURITY_TEST_API_URL`.

---

## Proměnné prostředí

Všechny proměnné patří do `backend/.env`. Frontend nepoužívá žádné runtime env proměnné –
`VITE_API_URL` se bake-in při `vite build`.

| Proměnná | Povinná | Popis |
|----------|---------|-------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Tajný klíč pro JWT (min. 32 znaků) |
| `FRONTEND_URL` | ✅ | URL frontendu pro CORS (např. `https://crm.firma.cz`) |
| `PORT` | — | Port backendu (default: 4000) |
| `NODE_ENV` | — | `production` / `development` |
| `VITE_API_URL` | — | URL backendu pro build frontendu (default: `/api`) |
| `SMTP_HOST` | — | SMTP server pro odchozí e-maily |
| `SMTP_PORT` | — | SMTP port (default: 587) |
| `SMTP_USER` | — | SMTP přihlašovací e-mail |
| `SMTP_PASS` | — | SMTP heslo |
| `SMTP_FROM` | — | Odesílací adresa (default: SMTP_USER) |
| `SMTP_SECURE` | — | `true` pro port 465 (TLS), jinak `false` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | — | JSON service account pro Google Calendar |
| `TALLY_KEY` | — | Volitelný secret key pro Tally.so webhook |
| `MAX_FILE_SIZE_MB` | — | Maximální velikost nahrávaného souboru v MB (default: `25`) |

IMAP pro e-mail modul se konfiguruje přes UI v **Nastavení → E-mail (IMAP)** (uloženo v DB).

Reset hesla na login stránce používá stejné SMTP nastavení a odkaz vede na `FRONTEND_URL`
(pokud není nastaveno, backend použije origin aktuálního requestu).

---

## Produkční nasazení na VPS

```bash
# Na serveru nainstalujte Docker
curl -fsSL https://get.docker.com | sh

# Nahrajte projekt (git clone nebo rsync)
git clone https://github.com/aceitOP/catering-ld-crm.git /opt/catering-ld
cd /opt/catering-ld

# Vytvořte .env
cp backend/.env.example backend/.env
nano backend/.env   # vyplňte produkční hodnoty

# Spusťte
docker compose up -d --build
```

Pro HTTPS použijte Nginx reverse proxy + Let's Encrypt (`certbot`).

---

## Struktura projektu

```
catering-ld-crm/
├── docker-compose.yml
├── render.yaml                  # Render.com deploy config
├── backend/
│   ├── Dockerfile
│   ├── .env.example
│   ├── package.json
│   ├── db/
│   │   ├── schema.sql           # Počáteční DDL (referenční, spouští initDb)
│   │   └── seed.sql             # Demo data
│   └── src/
│       ├── index.js             # Express app, registrace routes
│       ├── db.js                # PostgreSQL pool + helpers
│       ├── initDb.js            # Startup schema init + ALTER TABLE migrace
│       ├── emailService.js      # Nodemailer – odchozí e-maily (notifikace, nabídky)
│       ├── emailImapService.js  # ImapFlow – příchozí e-maily
│       ├── googleCalendar.js    # Google Calendar API
│       ├── notifHelper.js       # Systémové notifikace
│       ├── proposalEmail.js     # E-maily pro klientský výběr menu
│       ├── middleware/
│       │   └── auth.js          # JWT middleware { auth, requireRole }
│       ├── db/
│       │   └── migrate.js       # CLI wrapper pro initDb (npm run migrate)
│       └── routes/
│           ├── auth.js          # POST /login, GET /me
│           ├── zakazky.js       # Zakázky (CRUD, stav, komando, dékujeme)
│           ├── klienti.js       # Klienti + ARES
│           ├── nabidky.js       # Nabídky
│           ├── kalkulace.js     # Kalkulace k zakázkám
│           ├── cenik.js         # Ceník + kategorie
│           ├── personal.js      # Personál + přiřazení
│           ├── dokumenty.js     # Upload souborů (multer)
│           ├── uzivatele.js     # Správa uživatelů (admin)
│           ├── nastaveni.js     # Key-value nastavení
│           ├── kalendar.js      # Kalendářová data
│           ├── reporty.js       # Reporty a statistiky
│           ├── notifikace.js    # Systémové notifikace
│           ├── faktury.js       # Fakturace
│           ├── tally.js         # Tally.so webhook
│           ├── google.js        # Google Calendar sync
│           ├── proposals.js     # Klientský výběr menu (auth)
│           ├── publicProposals.js # Klientský výběr menu (public token)
│           ├── production.js    # Výrobní listy
│           ├── archiv.js        # Archiv zakázek/klientů/personálu
│           ├── sablony.js       # Šablony zakázek
│           ├── followup.js      # Follow-up úkoly
│           ├── kapacity.js      # Kapacity – denní vytíženost
│           └── email.js         # E-mail modul (IMAP + SMTP)
└── frontend/
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── App.jsx              # Router + providers
        ├── api.js               # Axios API klient
        ├── data/
        │   └── changelog.js     # Verze + changelog
        ├── context/
        │   ├── AuthContext.jsx
        │   └── ThemeContext.jsx  # Dark mode (light/auto/dark)
        ├── components/
        │   ├── Layout.jsx        # Sidebar navigace + notifikace
        │   └── ui.jsx            # Sdílené komponenty (Modal, Btn, Badge…)
        └── pages/
            ├── _all.jsx          # Většina stránek (monorepo pattern)
            ├── DashboardPage.jsx
            ├── ZakazkaDetail.jsx
            ├── NabidkaEditor.jsx
            ├── NovaZakazka.jsx
            ├── FakturyPage.jsx / FakturaDetail.jsx / NovaFakturaPage.jsx
            ├── VyrobniListPage.jsx
            ├── ClientProposalPage.jsx  # Veřejná stránka (bez authu)
            ├── EmailPage.jsx
            └── … (barrel re-exports)
```

---

## API endpointy (přehled)

```
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/change-password

GET/POST       /api/zakazky
GET/PATCH/DEL  /api/zakazky/:id
PATCH          /api/zakazky/:id/stav
POST           /api/zakazky/:id/komando
POST           /api/zakazky/:id/dekujeme
PATCH          /api/zakazky/:id/archivovat|obnovit

GET/POST       /api/klienti
GET/PATCH/DEL  /api/klienti/:id
GET            /api/klienti/pravidelni
PATCH          /api/klienti/:id/archivovat|obnovit

GET/POST       /api/nabidky
GET/PATCH      /api/nabidky/:id
PATCH          /api/nabidky/:id/stav
POST           /api/nabidky/:id/odeslat

GET/POST       /api/faktury
GET/PATCH/DEL  /api/faktury/:id
PATCH          /api/faktury/:id/stav

GET/POST       /api/personal
GET/PATCH/DEL  /api/personal/:id
POST           /api/personal/:id/prirazeni
PATCH          /api/personal/:id/archivovat|obnovit

GET/POST       /api/dokumenty
POST           /api/dokumenty/upload
DEL            /api/dokumenty/:id
PATCH          /api/dokumenty/:id
GET/POST       /api/dokumenty/slozky
PATCH/DEL      /api/dokumenty/slozky/:id

GET            /api/kalendar
GET            /api/kapacity
GET            /api/reporty
GET            /api/archiv

GET/POST/PATCH /api/nastaveni

GET/POST       /api/followup
PATCH/DEL      /api/followup/:id

GET/POST/PATCH/DEL /api/sablony
GET/POST/PATCH/DEL /api/proposals
GET/POST/PATCH/DEL /api/proposals/:id/sekce
GET/POST           /api/pub/proposals/:token   (veřejné, bez JWT)

POST           /api/tally/webhook              (Tally.so)

GET            /api/google-calendar/events
GET            /api/google-calendar/status

GET            /api/email/status|folders|messages
GET/PATCH/DEL  /api/email/messages/:uid
POST           /api/email/messages/:uid/move|zakazka
POST           /api/email/send

GET            /api/production/calculate/:id
GET            /api/production/sheet/:id

GET            /api/health
```

---

## Bezpečnost

- Hesla hashována bcrypt (salt rounds: 12)
- JWT expirace: 7 dní
- Backend odmítne start pokud `JWT_SECRET` chybí nebo je kratší než 32 znaků
- CORS omezen na `FRONTEND_URL`
- Helmet middleware (HTTP security headers)
- Rate limiting na auth endpointech
- HTML e-maily v e-mail modulu renderovány v sandboxed `<iframe>`

## Linting

```bash
cd backend  && npm run lint
cd frontend && npm run lint
```

Backend: ESLint (CommonJS), Frontend: ESLint + eslint-plugin-react + eslint-plugin-react-hooks.
Instalace ESLint proběhne při `npm install` (přidáno jako devDependency).

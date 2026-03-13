# Catering LD – CRM systém

Interní CRM systém pro správu klientů, zakázek, nabídek, kalkulací, personálu a dokumentů.

## Technologie

| Vrstva | Technologie |
|--------|------------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend  | Node.js + Express.js |
| Databáze | PostgreSQL 16 |
| Auth     | JWT (jsonwebtoken + bcryptjs) |
| Deploy   | Docker + Docker Compose |

---

## Spuštění (Docker – doporučeno)

### 1. Předpoklady
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) nainstalován a spuštěn

### 2. Nastavení prostředí
```bash
cp backend/.env.example backend/.env
```
Otevřete `backend/.env` a změňte:
```
JWT_SECRET=VašePevnéHesloProJWT
```

### 3. Spuštění
```bash
docker compose up -d
```

Aplikace poběží na:
- **Frontend**: http://localhost:80
- **Backend API**: http://localhost:4000
- **PostgreSQL**: localhost:5432

### 4. Demo přihlášení
| E-mail | Heslo | Role |
|--------|-------|------|
| l.dvorackova@catering-ld.cz | Demo1234! | Administrátor |
| j.novackova@catering-ld.cz  | Demo1234! | Obchodník |
| p.dostal@catering-ld.cz     | Demo1234! | Provoz |

---

## Spuštění bez Dockeru (vývoj)

### Databáze (PostgreSQL musí běžet lokálně)
```bash
psql -U postgres -c "CREATE DATABASE catering_ld;"
psql -U postgres -c "CREATE USER catering WITH PASSWORD 'changeme123';"
psql -U postgres -c "GRANT ALL ON DATABASE catering_ld TO catering;"
psql -U catering -d catering_ld -f backend/db/schema.sql
psql -U catering -d catering_ld -f backend/db/seed.sql
```

### Backend
```bash
cd backend
cp .env.example .env   # upravte DATABASE_URL
npm install
npm run dev            # spustí na portu 4000
```

### Frontend
```bash
cd frontend
npm install
npm run dev            # spustí na portu 5173
```

---

## Produkční nasazení na server (VPS)

```bash
# Na serveru nainstalujte Docker
curl -fsSL https://get.docker.com | sh

# Nahrajte projekt
scp -r catering-ld-crm/ user@VAS_SERVER:/opt/catering-ld/

# Na serveru
cd /opt/catering-ld
# Upravte .env: FRONTEND_URL, VITE_API_URL, JWT_SECRET, DB_PASSWORD
docker compose -f docker-compose.yml up -d
```

Pro HTTPS doporučujeme Nginx reverse proxy + Let's Encrypt certbot.

---

## Struktura projektu

```
catering-ld-crm/
├── docker-compose.yml
├── backend/
│   ├── src/
│   │   ├── index.js          # Express app
│   │   ├── db.js             # PostgreSQL pool
│   │   ├── middleware/
│   │   │   └── auth.js       # JWT middleware
│   │   └── routes/
│   │       ├── auth.js       # Přihlášení
│   │       ├── zakazky.js    # Zakázky + workflow
│   │       ├── klienti.js    # Klienti
│   │       ├── nabidky.js    # Nabídky
│   │       ├── kalkulace.js  # Kalkulace
│   │       ├── cenik.js      # Ceník
│   │       ├── personal.js   # Personál
│   │       ├── dokumenty.js  # Soubory (upload)
│   │       ├── uzivatele.js  # Správa uživatelů
│   │       ├── nastaveni.js  # Systémové nastavení
│   │       └── kalendar.js   # Kalendář
│   └── db/
│       ├── schema.sql        # Databázové schéma
│       └── seed.sql          # Demo data
└── frontend/
    └── src/
        ├── App.jsx           # Routing
        ├── api.js            # API klient (axios)
        ├── context/
        │   └── AuthContext.jsx
        ├── components/
        │   ├── Layout.jsx    # Sidebar navigace
        │   └── ui.jsx        # Sdílené komponenty
        └── pages/
            ├── LoginPage.jsx
            ├── DashboardPage.jsx
            ├── ZakazkyPage.jsx
            ├── ZakazkaDetail.jsx
            ├── NovaZakazka.jsx
            ├── KlientiPage.jsx
            ├── NabidkyPage.jsx
            ├── NabidkaEditor.jsx
            ├── KalendarPage.jsx
            ├── PersonalPage.jsx
            ├── DokumentyPage.jsx
            ├── CenikPage.jsx
            └── NastaveniPage.jsx
```

---

## API Endpointy

```
POST   /api/auth/login
GET    /api/auth/me

GET    /api/zakazky          ?stav, typ, od, do, q, page
POST   /api/zakazky
GET    /api/zakazky/:id
PATCH  /api/zakazky/:id
PATCH  /api/zakazky/:id/stav

GET    /api/klienti          ?typ, q
POST   /api/klienti
GET    /api/klienti/:id
PATCH  /api/klienti/:id

GET    /api/nabidky          ?zakazka_id
POST   /api/nabidky
GET    /api/nabidky/:id
PATCH  /api/nabidky/:id/stav

GET    /api/kalkulace        ?zakazka_id
POST   /api/kalkulace
GET    /api/kalkulace/:id

GET    /api/cenik            ?kategorie, aktivni
POST   /api/cenik
PATCH  /api/cenik/:id

GET    /api/personal
POST   /api/personal
POST   /api/personal/:id/prirazeni

POST   /api/dokumenty/upload
GET    /api/dokumenty        ?zakazka_id
DELETE /api/dokumenty/:id

GET    /api/uzivatele        (admin only)
POST   /api/uzivatele        (admin only)
PATCH  /api/uzivatele/:id    (admin only)

GET    /api/nastaveni
PATCH  /api/nastaveni        (admin only)

GET    /api/kalendar         ?od, do
```

---

## Hesla a bezpečnost

- Hesla jsou hashována pomocí bcrypt (salt rounds: 12)
- JWT tokeny expirují po 7 dnech
- Soubory se nahrávají do složky `uploads/` na serveru
- CORS je omezen na URL frontendu

---

## Rozšíření (plánované)

- [ ] Google Calendar synchronizace (OAuth2)
- [ ] Generování PDF nabídek (Puppeteer / PDFKit)
- [ ] E-mail notifikace (Nodemailer)
- [ ] Export do XLSX / CSV
- [ ] Fakturoid API integrace

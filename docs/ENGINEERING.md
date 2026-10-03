# Engineering Guide — SPECTR

This document is the starting point for engineers who are new to the codebase. It explains **what** the system does, **how** it is built, and **where** to find things.

---

## 1. What is this system?

**SPECTR** (Secure Point-of-care Enrollment and Centralized Trial Randomization) is a web application for managing clinical trial metadata, configuring treatment arms, uploading or generating randomization sequences, onboarding site investigators, and assigning kit codes to participants at the point of care.

### Terminology: user-facing vs code

The UI uses clinical trial role names. Backend identifiers (routes, tables, models, API fields) retain shorter internal names.

| User-facing term | Frontend label (`frontend/src/labels.js`) | Backend identifier |
|------------------|----------------------------------------|--------------------|
| Central Trial Coordinator (CTC) | `ORGANIZER_LABEL` = `"CTC"` | `organizer` — table `organizer`, routes `/organizer/*` |
| Site Investigator | `INVESTIGATOR_LABEL` = `"Study Investigator"` | `investigator` — table `investigator`, routes `/investigator/*` |
| Participant | `PARTICIPANT_LABEL` = `"Participant"` | `patient` — API field `patient_id`, DB column `assigned_patient_id` |

Always use the label constants in frontend UI text. Do not hardcode role names in React components. Backend code, logs, and audit events use `organizer` / `investigator` / `patient`.

### User roles

| Role | Purpose | How they get access |
|------|---------|---------------------|
| **Admin** | Bootstrap the system; invite and enable/disable CTC accounts | First-run setup (`POST /setup`) with a setup token |
| **Central Trial Coordinator (CTC)** | Create and manage studies; configure arms and randomization; onboard site investigators | Invited by admin via email |
| **Site Investigator** | Randomize eligible participants at their assigned site | CTC adds them per site — credentials emailed automatically |

### High-level flows

```
First deploy
  └─ Admin runs setup (one time) → creates admin account

Admin
  └─ Logs in → invites CTCs by email → enables/disables them

CTC (organizer)
  └─ Logs in → creates studies
            → configures treatment arms
            → uploads CSV sequence OR generates in-app
            → adds site investigators per enrolling site

Site Investigator (investigator)
  └─ Receives email with username + temp password
  └─ Logs in at /investigator/login (username + password only)
  └─ Assigns kit codes to participants (stratum + participant ID)
  └─ Can change password; can perform emergency unblinding when allowed
```

### Study lifecycle

| Status | Meaning |
|--------|---------|
| `Draft` | Study created; arms and settings editable |
| `Generated` | CSV sequence uploaded; sites and stratas derived from CSV |
| `Active` | In-app generation sets this immediately; CSV path transitions here on first kit assignment |
| `Complete` | All randomization records have been assigned to participants |

---

## 2. Tech stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.12, FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL |
| Auth | bcrypt passwords, JWT in HttpOnly cookies |
| Frontend | React 19, Vite, React Router |
| Email | ZeptoMail HTTP API (preferred), Resend HTTP API, or SMTP via `smtplib` |
| Deploy | Docker (combined frontend + backend), Railway |

---

## 3. Repository layout

```
.
├── backend/
│   ├── app/
│   │   ├── main.py                  # App entry, middleware, router registration, SPA serving
│   │   ├── config.py                # Environment variables & cookie helpers
│   │   ├── database.py              # SQLAlchemy engine & get_db dependency
│   │   ├── models.py                # SQLAlchemy ORM models
│   │   ├── schemas.py               # Pydantic request/response models
│   │   ├── core/
│   │   │   ├── security.py          # JWT, auth dependencies, token revocation
│   │   │   ├── csrf.py              # CSRF middleware
│   │   │   ├── rate_limit.py        # slowapi rate limiter
│   │   │   ├── audit.py             # Structured audit logging
│   │   │   ├── email.py             # ZeptoMail/Resend/SMTP + credential & unblind emails
│   │   │   ├── investigators.py     # Username/password generation
│   │   │   ├── investigator_invite.py  # Single + bulk site investigator invites
│   │   │   ├── organizer_invite.py  # CTC invite + password reset
│   │   │   ├── randomization_engine.py  # In-app sequence generation
│   │   │   ├── randomization_csv.py # CSV parsing
│   │   │   ├── csv_randomization.py # Persist CSV rows with sites/stratas
│   │   │   ├── csv_limits.py        # Upload size limits
│   │   │   ├── blinding_type.py     # Blinding enum and helpers
│   │   │   ├── study_status.py      # Study lifecycle constants
│   │   │   ├── validators.py        # Email normalization
│   │   │   └── security_headers.py
│   │   └── routers/
│   │       ├── setup.py             # Health check + first-run admin setup
│   │       ├── admin.py             # Admin login/logout/session
│   │       ├── organizers.py        # Admin: invite/list/toggle CTCs
│   │       ├── organizer.py         # CTC auth, studies, randomization, investigators
│   │       └── investigator.py      # Site investigator auth, kit assignment, unblinding
│   ├── migrations/
│   ├── sample_randomization.csv     # Example CSV format
│   └── .env.example
│
├── frontend/
│   └── src/
│       ├── App.jsx                  # Route definitions
│       ├── api.js                   # apiFetch wrapper (cookies, CSRF, JSON)
│       ├── labels.js                # User-facing role and participant labels
│       ├── config.js                # VITE_API_URL
│       ├── components/              # Shared UI (Header, forms, modals)
│       └── pages/                   # One file per screen
│
├── Dockerfile                       # Combined frontend + backend image
├── docker-entrypoint.sh             # Migrations + Uvicorn
├── railway.toml
└── docs/
    └── ENGINEERING.md               # This file
```

---

## 4. Local development setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL running locally

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Linux/macOS
# .venv\Scripts\activate           # Windows
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

API: `http://localhost:8000`  
Docs: `http://localhost:8000/docs` (development only)

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

App: `http://localhost:5173`

### First admin account

1. Open `http://localhost:5173`
2. Click **Open setup form**
3. Enter setup token (from `SETUP_TOKEN` in `.env`, or leave blank in dev if unset)
4. Create admin username/password (min 12 characters)

---

## 5. Configuration

Copy `backend/.env.example` → `backend/.env`.

| Variable | Required | Description |
|----------|----------|-------------|
| `ENVIRONMENT` | No | `development` or `production` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SECRET_KEY` | Prod | JWT signing key |
| `SETUP_TOKEN` | Prod | Protects first-run admin setup |
| `CORS_ORIGINS` | No | Comma-separated frontend URLs |
| `FRONTEND_URL` | Yes* | Base URL in credential emails |
| `SMTP_FROM_EMAIL` | Prod** | Sender email address |
| `SMTP_FROM_NAME` | No | Sender display name (optional) |
| `SMTP_FROM` | No | Legacy fallback for sender email if `SMTP_FROM_EMAIL` is unset |
| `ZEPTOMAIL_API_KEY` | Prod** | ZeptoMail Send Mail Token (preferred on Railway) |
| `ZEPTOMAIL_REGION` | No | ZeptoMail datacenter: `com`, `in`, `eu`, etc. (default `com`) |
| `RESEND_API_KEY` | Alt** | Resend HTTP API |
| `SMTP_*` | Alt** | SMTP fallback when no HTTP API key is set |
| `COOKIE_SECURE` | Cross-domain | Set `true` with HTTPS |
| `COOKIE_SAMESITE` | Cross-domain | Set `none` for cross-domain cookies |

\* Required for correct login links in emails.  
\*\* In development without email configured, credentials are logged to the backend console. In production, email is required.

Frontend: `VITE_API_URL` in `frontend/.env` (default `http://localhost:8000`). Leave empty for same-origin Docker deploys.

---

## 6. Database schema

### Entity relationship (simplified)

```
Admin                              (standalone)

Organizer (CTC) ──< Study ──< TreatmentArm
                      │
                      ├──< Site ──< Strata
                      │     │
                      │     └──< Investigator (site investigator)
                      │
                      └──< RandomizationRecord ──> Site, Strata

RevokedToken                       (JWT blacklist on logout)
```

### Key tables

| Table | Purpose |
|-------|---------|
| `admin` | System administrators |
| `organizer` | Central Trial Coordinator accounts (username = email) |
| `studies` | Trial metadata (protocol code, blinding, randomization settings, I/E criteria) |
| `treatment_arms` | Arms per study with allocation ratios |
| `sites` | Enrolling sites per study (derived from CSV or future manual creation) |
| `stratas` | Strata per site (derived from CSV) |
| `investigator` | Per-site accounts (email, generated username, status) |
| `randomization_records` | Sequence rows with kit codes, assignments, blinding state |
| `revoked_tokens` | Invalidated JWT IDs after logout |

### Site investigator model

Each site investigator belongs to **one study** and **one site**:

| Column | Description |
|--------|-------------|
| `username` | Random 6-character alphanumeric code, globally unique (e.g. `K7M2P9`) |
| `site_id` | Required for kit assignment; set when CTC invites per site |
| `status` | `inactive` → `active` (first login) → `revoked` |
| Login key | `(username, password)` — no trial ID required at login |

### Randomization record model

| Column | Description |
|--------|-------------|
| `sequence_number` | Position in the concealed sequence |
| `kit_code` | Allocation identifier revealed to site investigator |
| `treatment_name` | Assigned arm (hidden when blinded) |
| `assigned_patient_id` | Participant ID once assigned (backend field name retains `patient`) |
| `site_id`, `strata_id` | Set for CSV-imported multicenter sequences |
| `blind` | Whether treatment arm is concealed from site investigator |

### Blinding types

Defined in `core/blinding_type.py`:

| Value | Name | Site investigator sees treatment? |
|-------|------|-----------------------------------|
| 0 | Open Label | Yes |
| 1 | PB (Participant blinding) | Yes |
| 2 | PIB | No (unless emergency unblinded) |
| 3 | PISB | No (unless emergency unblinded) |

### Migrations

```bash
cd backend
alembic upgrade head
```

Migration history (chronological):

| Revision | Description |
|----------|-------------|
| `937fc07f8529` | Create `admin` table |
| `53a123b51bd3` | Create `organizer` table |
| `8f1e2d3c4b5a` | Create `studies` table |
| `c7d8e9f0a1b2` | Create `treatment_arms` table |
| `a1b2c3d4e5f6` | Create `randomization_records` table |
| `b2c3d4e5f6a7` | Replace doctor/invitation tables with `investigator` |
| `d4e5f6a7b8c9` | Create `revoked_tokens` table |
| `b4c5d6e7f8a9` | Create `sites`, `stratas`, link records |
| `e5f6a7b8c9d0` | Add inclusion/exclusion criteria to studies |

---

## 7. Randomization workflows

SPECTR supports two paths to create a randomization sequence. They differ in how sites and stratas are handled.

### Path A: CSV upload (multicenter, stratified)

1. CTC uploads a pre-computed CSV at `POST /organizer/studies/{id}/upload-randomization-csv`
2. Required columns: `sequence_number`, `kit_code`, `site`, `strata`, `treatment_arm` (legacy header `strat` also accepted)
3. Backend creates `sites` and `stratas` from unique CSV values and links each record
4. Study status → `Generated`
5. Site investigators assign kits per stratum; first assignment → `Active`; last assignment → `Complete`

See `backend/sample_randomization.csv` for format.

### Path B: In-app generation (single-center, no stratification)

1. CTC configures arms and generation parameters
2. `POST /organizer/studies/{id}/generate-randomization` runs the engine (`Simple Random`, `Permuted Block`, or `Minimization`)
3. Records are created without `site_id` or `strata_id`
4. Study status → `Active` immediately

**Note:** Kit assignment (`POST /investigator/assign-kit`) requires a site-linked investigator and a valid stratum. The CSV path is the supported workflow for multicenter stratified trials. In-app generation is suitable for simpler trials or coordinator testing.

---

## 8. API reference

All routes are relative to the API base URL. See `/docs` in development for the full OpenAPI spec.

### Setup & health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/setup/status` | Whether admin account exists |
| POST | `/setup` | First-run admin creation |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/login` | Admin login |
| POST | `/admin/logout` | Admin logout |
| GET | `/admin/me` | Current admin info |
| POST | `/admin/organizers/` | Invite CTC by email |
| GET | `/admin/organizers/` | List CTCs |
| PATCH | `/admin/organizers/{id}/status` | Enable/disable CTC |

### CTC (organizer)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/organizer/login` | CTC login (email + password) |
| POST | `/organizer/forgot-password` | Email new password |
| POST | `/organizer/change-password` | Change password |
| POST | `/organizer/logout` | Logout |
| GET | `/organizer/me` | Current CTC info |
| POST | `/organizer/studies/` | Create study |
| GET | `/organizer/studies/` | List studies |
| GET/PATCH | `/organizer/studies/{id}` | Get/update study |
| POST | `/organizer/studies/{id}/arms` | Set treatment arms |
| POST | `/organizer/studies/{id}/generate-randomization` | In-app sequence generation |
| POST | `/organizer/studies/{id}/upload-randomization-csv` | CSV sequence upload |
| GET | `/organizer/studies/{id}/sites` | List sites with counts |
| GET | `/organizer/studies/{id}/randomization-records` | Paginated records (search, filter) |
| GET | `/organizer/studies/{id}/sites/{site_id}/investigators` | List site investigators |
| POST | `/organizer/studies/{id}/sites/{site_id}/investigators` | Invite site investigator |
| POST | `/organizer/studies/{id}/sites/{site_id}/investigators/bulk` | Bulk invite from CSV |
| PATCH | `.../investigators/{id}/revoke` | Revoke site investigator |
| PATCH | `.../investigators/{id}/restore` | Restore revoked investigator |

### Site investigator

| Method | Path | Description |
|--------|------|-------------|
| POST | `/investigator/login` | Login with `{ username, password }` |
| POST | `/investigator/forgot-password` | Email new password |
| POST | `/investigator/logout` | Logout |
| GET | `/investigator/me` | Current investigator + study info |
| POST | `/investigator/change-password` | Change password |
| GET | `/investigator/strata-availability` | Unassigned kit counts per stratum |
| POST | `/investigator/assign-kit` | Assign next kit to participant `{ patient_id, strata_id }` |
| GET | `/investigator/assignments` | List assignments at investigator's site |
| POST | `/investigator/records/{id}/unblind` | Emergency unblinding |

---

## 9. Authentication & security

### Cookies (one per role)

| Role | Cookie name |
|------|-------------|
| Admin | `access_token` |
| CTC (organizer) | `organizer_access_token` |
| Site investigator | `investigator_access_token` |

Site investigator JWT `sub` stores the **investigator database id** (not username), because usernames are globally unique but the token should reference a stable primary key.

### CSRF

Mutating requests require `X-CSRF-Token` header matching the `csrf_token` cookie.

**Exempt paths** (see `core/csrf.py`):

- `/admin/login`
- `/organizer/login`, `/organizer/forgot-password`
- `/investigator/login`, `/investigator/forgot-password`
- `/setup`, `/setup/status`

The frontend mirrors this list in `frontend/src/api.js` and stores CSRF in `sessionStorage` after login.

### Concurrency

Kit assignment uses `SELECT ... FOR UPDATE` to lock the next unassigned record and prevent race conditions during simultaneous enrollments at the same site/stratum.

### Rate limiting

Key endpoints are rate-limited via slowapi (login, invites, CSV uploads, kit assignment). See `@limiter.limit(...)` decorators in router files.

---

## 10. Frontend routes

| Path | Page | Role |
|------|------|------|
| `/` | `Home.jsx` | Public landing / first-run setup |
| `/admin/login` | `AdminLogin.jsx` | Admin |
| `/admin/home` | `AdminHome.jsx` | Admin — invite/manage CTCs |
| `/organizer/login` | `OrganizerLogin.jsx` | CTC |
| `/organizer/home` | `OrganizerHome.jsx` | CTC — study list |
| `/organizer/studies/new` | `CreateStudy.jsx` | CTC — create study |
| `/organizer/studies/:studyId/edit` | `CreateStudy.jsx` | CTC — edit study |
| `/organizer/studies/:studyId/home` | `StudyHome.jsx` | CTC — study hub, records, sites |
| `/organizer/studies/:studyId/arms` | `StudyArms.jsx` | CTC — treatment arms |
| `/organizer/studies/:studyId/randomization` | `StudyRandomization.jsx` | CTC — in-app generation |
| `/organizer/studies/:studyId/upload-csv` | `UploadCSV.jsx` | CTC — CSV upload |
| `/organizer/studies/:studyId/sites/:siteId/investigators` | `StudyInvestigators.jsx` | CTC — site investigators |
| `/investigator/login` | `InvestigatorLogin.jsx` | Site investigator |
| `/investigator/home` | `InvestigatorHome.jsx` | Site investigator — kit assignment |
| `/investigator/change-password` | `InvestigatorChangePassword.jsx` | Site investigator |

Always use `apiFetch` from `frontend/src/api.js` for API calls. Import role labels from `frontend/src/labels.js` for all user-facing text.

---

## 11. Onboarding flows

### CTC invite (admin → organizer)

```
Admin submits email
        ↓
POST /admin/organizers/
        ↓
Backend:
  1. Organizer.username = email
  2. generate_temp_password()
  3. send_organizer_credentials() via ZeptoMail/Resend/SMTP
        ↓
CTC logs in at /organizer/login with email + password
```

Implementation: `core/organizer_invite.py`, `core/email.py`, `routers/organizers.py`.

### Site investigator invite (CTC → investigator)

```
CTC submits email + optional name for a site
        ↓
POST /organizer/studies/{id}/sites/{site_id}/investigators
        ↓
Backend:
  1. generate_username()  → "K7M2P9", "R3H8WN", …
  2. generate_temp_password()
  3. INSERT investigator (status=inactive, site_id set)
  4. send_investigator_credentials() via ZeptoMail/Resend/SMTP
     (dev without email: credentials logged to console)
        ↓
Site investigator logs in with username + password
        ↓
status → active on first login
```

Bulk invite: `POST .../investigators/bulk` with a 2-column CSV (email, name), max 100 rows.

No signup page. No invitation tokens.

CTC can **revoke** a site investigator (invalidates sessions) or **restore** a revoked account.

---

## 12. Docker deployment

The `Dockerfile` builds the React frontend and serves it from FastAPI in a single container. PostgreSQL is external.

```bash
docker build -t spectr .
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/spectr \
  -e SECRET_KEY=... \
  -e SETUP_TOKEN=... \
  -e ENVIRONMENT=production \
  -e FRONTEND_URL=https://your-domain.example \
  -e CORS_ORIGINS=https://your-domain.example \
  spectr
```

`docker-entrypoint.sh` runs `alembic upgrade head` (with retries) then starts Uvicorn. Set `FRONTEND_DIST` automatically in the image. For same-origin deploys, build with empty `VITE_API_URL`.

Railway: see `railway.toml` — health check at `/health`.

---

## 13. What is NOT implemented yet

- Manual site/strata creation outside CSV upload
- In-app generation with site/strata assignment (multicenter in-app path)
- MFA
- HTML email templates

---

## 14. Quick file lookup

| I need to… | Look in… |
|------------|----------|
| Change user-facing role labels | `frontend/src/labels.js` |
| Add site investigator logic | `routers/organizer.py`, `core/investigator_invite.py` |
| Change site investigator auth | `routers/investigator.py`, `core/security.py` |
| Change credential emails | `core/email.py` |
| Change CSV parsing | `core/randomization_csv.py`, `core/csv_randomization.py` |
| Change in-app generation | `core/randomization_engine.py` |
| Change blinding behavior | `core/blinding_type.py`, `routers/investigator.py` |
| Change DB schema | `models.py` + Alembic migration |
| Add frontend page | `frontend/src/pages/` + `App.jsx` |

---

## 15. Troubleshooting

| Problem | Likely cause |
|---------|----------------|
| 403 CSRF on login | Login path must be CSRF-exempt (see `core/csrf.py`) |
| Site investigator login fails | Wrong username/password, or account revoked |
| Kit assignment fails | Investigator not linked to a site, invalid stratum, or no unassigned records remaining |
| Duplicate participant ID | `assigned_patient_id` must be unique per study (case-insensitive) |
| No email received | Email not configured — check backend logs for credentials (dev mode) |
| 401 on protected routes | Expired/revoked token — log in again |
| CSV upload rejected | Wrong columns, study status is `Active` or `Complete`, or file exceeds size limit |

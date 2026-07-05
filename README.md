# easyPET backend + panel

Next.js (App Router) + MongoDB backend for the easyPET veterinary biomarker
platform. One service hosts both the **device REST API** and the **web panel**
(clinic + admin). Deployed on Railway.

## Stack
- **Next.js 16** (TypeScript, App Router) — device API routes + panel UI
- **MongoDB + Mongoose**
- **Auth:** JWT (device tokens + panel sessions) + bcrypt. Clinic = name + 6-digit PIN, admin = email + password
- **Tailwind CSS** panel

## Concepts
- **Clinic** = the account. Username = clinic name, password = 6-digit PIN.
- **Device** = a CrowPanel unit, identified by its ESP32-S3 eFuse MAC (`uid`).
- **Credits** = test balance, controlled from the backend (admin grants / redeem codes).
- The device **Setup** screen registers the clinic (or logs in if it already exists) and links the device. PIN is also cached on-device (NVS) for offline fast-login.

## Environment (`.env.local`)
| var | purpose |
|-----|---------|
| `MONGODB_URI` | Mongo connection string |
| `JWT_SECRET` | long random string for signing tokens |
| `STARTER_CREDITS` | credits granted on first clinic registration (default 10) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seeded admin login |

Copy `.env.example` → `.env.local` and fill it in.

## Local development
Needs a MongoDB. Easiest is a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster; put its URI in `MONGODB_URI`.

```bash
npm install
npm run seed:admin      # create the admin account
npm run seed:demo       # (optional) demo clinic "Manisa Vet Lab" / PIN 123456 + sample tests
npm run dev             # http://localhost:3000
```

- `/login` — clinic (name + PIN) or admin (email + password)
- `/dashboard` — clinic view (own tests, credits, devices)
- `/admin` — admin (clinics, grant credits, redeem codes, all tests)

Run the API integration test (spins up an in-memory Mongo, no external DB):
```bash
node --import tsx scripts/e2e.ts
```

## Device API
All device endpoints are under `/api/device`. After `register`/`login` the device
holds a bearer **token** used for the rest.

| method | path | body | notes |
|--------|------|------|-------|
| POST | `/api/device/register` | `{uid, clinicName, pin, vets?, fw?}` | create clinic or link device (PIN-checked); returns `{token, clinic}` |
| POST | `/api/device/login` | `{uid, clinicName, pin, fw?}` | online login for an existing clinic |
| GET | `/api/device/sync` | — (Bearer) | refresh clinic name, vets, **credits** |
| POST | `/api/device/tests` | `{vet, patient, result, startedAt, finishedAt}` (Bearer) | record a test, consume 1 credit |
| POST | `/api/device/redeem` | `{code}` (Bearer) | "Add tests" — grant credits from a code |
| GET | `/api/health` | — | healthcheck |

## Deploy to Railway

1. **Push this folder to a GitHub repo.**
2. On [Railway](https://railway.app): **New Project → Deploy from GitHub repo** → pick this repo. Nixpacks auto-builds (`npm run build` / `npm run start`); `railway.json` sets the healthcheck to `/api/health`.
3. **Add MongoDB** — either:
   - Railway: **New → Database → Add MongoDB** (gives a `MONGO_URL`), or
   - **MongoDB Atlas** free cluster.
4. **Set variables** on the web service (Variables tab):
   - `MONGODB_URI` = the Mongo URL (append `/easypet` as the db name, e.g. `.../easypet`)
   - `JWT_SECRET` = a long random string
   - `STARTER_CREDITS` = `10`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
5. **Seed the admin** once (Railway shell or locally against the same `MONGODB_URI`):
   `npm run seed:admin` (and optionally `npm run seed:demo`).
6. Open the generated URL → `/login`. The device firmware points at this URL for the API.

> The device (Faz 3) talks to `https://<your-app>.up.railway.app/api/device/*` over TLS.

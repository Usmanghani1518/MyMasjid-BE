# MyMasjid Backend API

Node.js + Express + PostgreSQL backend for MyMasjid — multi-role registration (donors, volunteers, masjids), authentication with refresh tokens, OTP email verification, secure document uploads, and admin/compliance review.

## Tech Stack

- **Runtime:** Node.js + TypeScript (CommonJS)
- **Framework:** Express.js 5
- **ORM:** Prisma 7 (PostgreSQL via `@prisma/adapter-pg`)
- **Validation:** Zod 4 (field-level errors with stable codes) + zod-to-openapi
- **API Docs:** Scalar (interactive, at `/api/v1/docs`)
- **Auth:** JWT (access + short-lived registration tokens), revocable opaque refresh tokens, bcrypt (12 rounds)
- **Sensitive data:** AES-256-GCM encryption for ID/passport numbers
- **Logging:** Pino
- **Testing:** Vitest + Supertest

## Setup

```bash
npm install
cp .env.example .env        # then fill in values
npm run db:push             # apply the Prisma schema to the database
npm run db:generate         # generate the Prisma client
npm run db:seed             # optional: seed admin + demo records
npm run dev                 # http://localhost:3000
```

Interactive docs: `http://localhost:3000/api/v1/docs`

> **Note:** `prisma.config.ts` lives at the project **root** (Prisma 7 requirement). `db:push` is the recommended schema workflow on Neon (no shadow database needed).

## API Overview

All routes are under `/api/v1`. Every response uses the uniform envelope:

```json
{ "success": true, "message": "Success", "data": {}, "errors": [] }
```

Validation failures return field-level errors: `errors: [{ "field": "email", "code": "INVALID_EMAIL", "message": "..." }]`.

### Authentication & identity (`/api/v1/auth`)
All account creation, verification, and session endpoints live here. Each role's *account step* is `POST /register` with a `role` field.

- `POST /register` — step 1 for **all** roles: body `{ role: 'DONOR'|'VOLUNTEER'|'MASJID', ...accountFields }`. Creates the user + role draft and issues a **30-minute registration token** (also resumes an incomplete registration when the email/password match).
- `POST /send-otp` + `POST /verify-otp` — 6-digit email OTP (donor/volunteer; role + email come from the registration token).
- `POST /complete` — finalizes a donor/volunteer registration (role from the token) and returns the full token pair.
- `POST /login` — email + password → access token (7d) + refresh token (30d, revocable)
- `POST /refresh` — rotates the refresh token (old one is revoked)
- `POST /logout` — revokes the refresh token
- `GET /me` — current user (access token)

### Donor registration (`/api/v1/registration/donors`) — data steps
1. `POST /auth/register` with `role: 'DONOR'` (account + token)
2. `POST /profile` — personal details (ID number is AES-256-GCM encrypted)
3. `POST /interests`
4. `POST /auth/send-otp` + `POST /auth/verify-otp` — email verification
5. `POST /auth/complete` — activation + tokens

### Volunteer registration (`/api/v1/registration/volunteers`) — data steps
`POST /auth/register` (`role: 'VOLUNTEER'`), `POST /profile-skills`, `POST /interests-availability`, `POST /auth/send-otp`, `POST /auth/verify-otp`, `POST /auth/complete`

### Masjid registration (`/api/v1/registration/masjids`) — workflow steps
1. `POST /auth/register` with `role: 'MASJID'` — institutional identity + admin account (welcome email)
2. `POST /organization-profile`
3. `POST /services-compliance`
4. `POST /trustees` + document uploads via `POST /api/v1/uploads/document`
5. `POST /submit` — → `PENDING_REVIEW`
- `GET /me` — current draft (resume)
- `POST /resubmit` — reopen a denied application for editing

### Admin / Compliance (`/api/v1/admin/compliance`) — `ADMIN`/`SUPER_ADMIN` only
- `GET /applications` — list, filter by `status`, `search`, pagination + sorting
- `GET /applications/:id` — full detail (sensitive fields masked)
- `POST /applications/:id/approve`
- `POST /applications/:id/deny` — structured reasons `{ field, code, message }[]`

### Uploads (`/api/v1/uploads`)
- `POST /document` — multipart `file` + `purpose` + optional `masjidId`. Validated by MIME, size, and magic bytes (PDF/PNG/JPEG); randomized filenames.

## Security

- **Passwords:** bcrypt, 12 rounds; never returned.
- **Sensitive identity data:** AES-256-GCM encrypted at rest; never returned unmasked (responses include a masked form only).
- **Tokens:** access 7d, registration 30m, refresh 30d (opaque, hashed, rotated, revocable).
- **OTP:** 6 digits, 10-min expiry, 60s resend cooldown, max 5 resends, locked for 15 min after 5 failed attempts; stored as a hash.
- **Rate limiting:** OTP, upload, and auth endpoints.
- **File uploads:** MIME + size + magic-byte validation, randomized filenames, stored outside the web root.
- **CORS:** restricted to `CORS_ORIGIN` (comma-separated).
- **Errors:** generic messages; no stack traces or internal details leaked.
- **Audit log:** registration steps, OTP lifecycle, uploads, admin actions, encryption/decryption.
- **Soft deletes** on users/donors/volunteers/masjids.

## Environment Variables

See `.env.example`. Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signs access + registration tokens |
| `REFRESH_TOKEN_SECRET` | (optional) separate refresh signing key |
| `ENCRYPTION_KEY` | ≥16 chars; AES-256-GCM key derivation |
| `OTP_*` | OTP length / expiry / cooldown / resend / lockout |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB` | File storage |
| `SMTP_*` | Email transport (falls back to console logging in dev) |
| `TEST_DATABASE_URL` | Integration-test schema (see Testing) |

## Testing

```bash
npm run test:run   # runs all tests
npm test           # watch mode
```

- **Unit tests** (`tests/unit/`) run with no database — validation mapping, AES-GCM crypto, magic-byte detection, pagination, OTP edge cases (cooldown, resend limit, lockout).
- **Integration tests** (`tests/integration/`) exercise the full API via Supertest — every registration flow, OTP security, admin approve/deny/resubmit, RBAC, uploads, and token rotation.

Integration tests need a **test schema**. They are skipped automatically when `TEST_DATABASE_URL` is unset. To enable:

1. Set `TEST_DATABASE_URL` to the same database with `?schema=test` appended (e.g. `…?sslmode=require&schema=test`).
2. Run `npm run test:run` — the test setup applies the schema to the `test` schema via a **non-destructive** `prisma db push` (the `public` schema is untouched), then truncates tables between tests.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | `prisma generate` + compile TypeScript |
| `npm start` | Run production build |
| `npm run db:push` | Apply schema to the database |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Force-reset the database schema |
| `npm run db:studio` | Open Prisma Studio |
| `npm run test:run` | Run tests once |
| `npm run lint` | Lint source |
| `npm run format` | Format with Prettier |

## Project Structure

```
mymasjid-be/
├── prisma/
│   ├── schema.prisma         # Database schema (users, donors, volunteers, masjids,
│   │                         #   trustees, documents, otps, refresh_tokens, audit_logs)
│   └── seed.ts               # Seed data
├── prisma.config.ts          # Prisma 7 config (root-level; env-aware)
├── src/
│   ├── config/               # Env validation + Prisma client (schema-aware adapter)
│   ├── docs/                 # OpenAPI registry + Scalar
│   ├── middleware/           # auth (roles/registration), validate, errorHandler,
│   │                         #   rateLimit, upload (multer)
│   ├── modules/              # auth, donors, volunteers, masjids, admin, uploads
│   │   └── <module>/         #   schemas.ts · service.ts · routes.ts · docs.ts
│   ├── services/             # crypto, token, otp, email (+templates), upload, audit
│   ├── utils/                # helpers, response envelope, errorCodes, validation,
│   │                         #   pagination, time, constants, shared zod schemas
│   ├── app.ts                # Express app (CORS, routes, docs, error handling)
│   └── index.ts              # Server entry point
├── tests/                    # unit/ + integration/ + setup/helpers
├── vitest.config.ts
└── .env.example
```

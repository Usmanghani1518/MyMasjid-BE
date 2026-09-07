# MyMasjid Backend API

Node.js + Express + PostgreSQL backend for MyMasjid auth, registration, password reset, and admin compliance review.

## Setup

```bash
npm install
cp .env.example .env
npm run db:push
npm run db:generate
npm run dev
```

Docs: `http://localhost:3000/api/v1/docs`

## Current Auth Flow

Frontend-facing auth endpoints are available under `/api/auth`:

- `POST /api/auth/register/donor/start`
- `POST /api/auth/register/donor/verify-otp`
- `POST /api/auth/register/donor/resend-otp`
- `POST /api/auth/register/volunteer/start`
- `POST /api/auth/register/volunteer/verify-otp`
- `POST /api/auth/register/volunteer/resend-otp`
- `POST /api/auth/register/masjid`
- `POST /api/auth/login`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/verify-otp`
- `POST /api/auth/password/reset`
- `POST /api/auth/password/resend-otp`

`/api/v1/auth` is also mounted for compatibility.

## Email

Email uses SMTP when `SMTP_HOST` is set. For Gmail, use a Google App Password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM="MyMasjid <your-gmail-address@gmail.com>"
```

Without SMTP settings, development falls back to console email logging.

## Security

- Passwords are hashed with `bcrypt`.
- Access tokens are signed JWTs.
- Refresh tokens and password reset tokens are opaque random strings. Only SHA-256 hashes are stored.
- OTP codes are random 6-digit values. Only hashes are stored.
- Admin compliance responses mask sensitive trustee ID values.

`crypto.service.ts` is not replacing JWT or bcrypt. It only provides small helpers that JWT/bcrypt do not provide: secure random OTP/token generation, SHA-256 hashing for opaque tokens/OTPs, and masking.

## Services

- `audit.service.ts` writes non-blocking audit logs.
- `crypto.service.ts` has random/hash/masking helpers.
- `email.service.ts` sends rendered email templates.
- `email/templates.ts` contains donor, volunteer, password reset, and masjid review emails.
- `otp.service.ts` creates, sends, verifies, and rate-limits OTP codes.
- `token.service.ts` signs/verifies JWT access tokens and rotates refresh tokens.

## Environment

See `.env.example`. Main variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signs access tokens |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token lifetime |
| `OTP_*` | OTP length, expiry, cooldown, resend limit, lockout |
| `CORS_ORIGIN` | Allowed frontend origins |
| `SMTP_*` | Gmail or other SMTP transport |
| `TEST_DATABASE_URL` | Optional integration-test schema |

## Tests

```bash
npm run test:run
```

Integration tests are skipped when `TEST_DATABASE_URL` is unset.

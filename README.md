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

`db:push` is for a local development database. Use `npm run db:migrate:deploy` to apply committed migrations in production.

## Sensitive identifiers

Trustee ID numbers are encrypted with AES-256-GCM before storage. Generate a unique key with `openssl rand -hex 32`, set it as `ENCRYPTION_KEY` in each environment, and keep it stable so existing values can be decrypted for masking.

To encrypt existing plaintext IDs, take a database backup first, then run `CONFIRM_SENSITIVE_DATA_ENCRYPTION=true npm run db:encrypt-sensitive` against the intended database. The operation is idempotent and does not print identifier values.

Demo seed data deletes and recreates its sample accounts. Run it only against a local development database with `ALLOW_DEMO_SEED=true` and a unique `SEED_PASSWORD` of at least 16 characters. The seed command refuses to run when `NODE_ENV=production`.

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

When `RESEND_API_KEY` is set, email uses the Resend HTTPS API. Otherwise, the app
uses SMTP when `SMTP_HOST` is set. For Gmail SMTP, use a Google App Password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM="MyMasjid <your-gmail-address@gmail.com>"
```

On Render Free, use Resend's HTTPS API because outbound SMTP ports are blocked:

```env
RESEND_API_KEY=re_your_resend_api_key
SMTP_FROM="MyMasjid <no-reply@your-verified-domain.org>"
```

Create a Resend API key and verify the sending domain first. When `RESEND_API_KEY`
is set, the app uses Resend; otherwise it uses configured SMTP. Resend delivery
uses HTTPS and does not require SMTP credentials.

Without either provider configured, development falls back to console email logging.

## Security

- Passwords are hashed with `bcrypt`.
- Access tokens are signed JWTs.
- Refresh tokens and password reset tokens are opaque random strings. Only SHA-256 hashes are stored.
- OTP codes are random 6-digit values. Keyed HMAC hashes are stored.
- Trustee ID numbers are encrypted at rest and masked in admin responses.
- Admin compliance responses mask sensitive trustee ID values.

`crypto.service.ts` provides secure random token generation, token hashing, OTP HMAC hashing, sensitive-value encryption, and masking.

## Services

- `audit.service.ts` writes non-blocking audit logs.
- `crypto.service.ts` has random/hash/masking helpers.
- `email.service.ts` sends rendered email templates.
- `email/templates.ts` contains donor, volunteer, password reset, and masjid review emails.
- `otp.service.ts` creates, sends, verifies, and rate-limits OTP codes.
- `token.service.ts` signs/verifies JWT access tokens and rotates refresh tokens.

## Environment

See `.env.example`. Main variables:

| Variable                   | Purpose                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`             | PostgreSQL connection string                                          |
| `JWT_SECRET`               | Signs access tokens                                                   |
| `ENCRYPTION_KEY`           | Encrypts sensitive IDs; retain the same key to decrypt existing values |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token lifetime                                                |
| `OTP_*`                    | OTP length, expiry, cooldown, resend limit, lockout                   |
| `CORS_ORIGIN`              | Allowed frontend origins                                              |
| `SMTP_*`                   | Gmail or other SMTP transport                                         |
| `RESEND_API_KEY`           | Optional Resend HTTPS email API key; takes priority over SMTP          |
| `TEST_DATABASE_URL`        | Optional integration-test schema                                      |
| `LOG_LEVEL`                | Minimum JSON log level in production (`info` is recommended)          |
| `PRISMA_QUERY_LOGS`        | Enables verbose SQL query logs; keep `false` unless debugging briefly |

## Production logging (Render)

Production logs are JSON on standard output, so Render captures them automatically. Every request
has an `x-request-id` response header and a completion log containing its method, path, status, and
duration. Error responses also include the same value at `error.requestId`; search for that ID in
the Render **Logs** page to find the matching error and source-mapped stack trace.

Set `NODE_ENV=production` and `LOG_LEVEL=info` in Render. If more detail is temporarily needed, set
`LOG_LEVEL=debug` and redeploy. Avoid enabling `PRISMA_QUERY_LOGS` for normal operation because SQL
logs can be noisy and may reveal application data.

The production start command is `npm start`. It enables Node source maps, which makes stack traces
refer to the original TypeScript files instead of only `dist/*.js` files.

## Tests

```bash
npm run test:run
```

Integration tests are skipped when `TEST_DATABASE_URL` is unset.

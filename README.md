# MyMasjid Backend API

Node.js + Express + PostgreSQL backend with Prisma ORM.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **ORM:** Prisma (PostgreSQL)
- **Validation:** Zod + zod-to-openapi (auto-generated docs)
- **API Docs:** Scalar (interactive, at `/api/v1/docs`)
- **Auth:** JWT + bcrypt
- **Logging:** Pino
- **Testing:** Vitest + Supertest

## Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- npm

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Update `DATABASE_URL` with your PostgreSQL connection string.

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# (Optional) Open Prisma Studio
npm run db:studio
```

### 4. Run Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3000`

### 5. API Documentation

Interactive API docs powered by Scalar (versioned):

```
http://localhost:3000/api/v1/docs          # Scalar UI (v1)
http://localhost:3000/api/v1/openapi.json  # Raw OpenAPI 3.1 spec (v1)
http://localhost:3000/docs                 # Redirects to latest version
```

Set `ENABLE_API_DOCS=false` in `.env` to disable in production.

When introducing a new API version (e.g. v2), add `app.use('/api/v2', createDocsRouter('v2'))` in `src/app.ts` to get `/api/v2/docs` and `/api/v2/openapi.json` automatically.

### 6. Health Check

```bash
curl http://localhost:3000/api/v1/health
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run production build |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:migrate:deploy` | Deploy migrations (production) |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:seed` | Run seed script |
| `npm run db:reset` | Reset database |
| `npm test` | Run tests (watch mode) |
| `npm run test:run` | Run tests once |
| `npm run lint` | Lint source code |
| `npm run format` | Format code with Prettier |

## Project Structure

```
mymasjid-be/
├── prisma/
│   ├── schema.prisma         # Database schema
│   ├── migrations/           # Migration files
│   └── seed.ts               # Seed data
├── src/
│   ├── config/               # Env + Prisma config
│   ├── docs/                 # OpenAPI spec + Scalar config
│   ├── modules/              # Feature modules (auth, masjids, etc.)
│   ├── services/             # Shared services
│   ├── middleware/            # Auth, validation, error handling
│   ├── utils/                # Logger, helpers
│   ├── types/                # Global TypeScript types
│   ├── app.ts                # Express app setup
│   └── index.ts              # Server entry point
├── tests/                    # Test files
├── .env.example              # Environment template
├── tsconfig.json
└── package.json
```

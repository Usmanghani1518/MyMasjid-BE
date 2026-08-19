import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { Role } from '@/generated/prisma/enums';
import { setTestMailer, OutboundMail } from '@/services/email.service';
import { testDbAvailable } from './setup';

/** Skip helper for integration suites that require a real test database. */
export const describeIfDb = (name: string, fn: () => void) => {
  const describeFn = testDbAvailable ? describe : describe.skip;
  describeFn(name, fn);
};

/** Captures outbound emails in-memory so tests can assert on them. */
export const installEmailCapture = (): { sent: OutboundMail[]; getOtpCode: (i?: number) => string } => {
  const sent: OutboundMail[] = [];
  setTestMailer({
    sendMail: async (mail) => {
      sent.push(mail);
      return { messageId: `test-${sent.length}` };
    },
  });
  const getOtpCode = (i = sent.length - 1): string => {
    const text = sent[i]?.text ?? '';
    const match = text.match(/\b(\d{6})\b/);
    if (!match) throw new Error('No 6-digit OTP code found in captured email');
    return match[1];
  };
  return { sent, getOtpCode };
};

/** Wipes all tables. Uses the active (test) schema. */
export const truncateAll = async (): Promise<void> => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "users", "donors", "volunteers", "masjids", "trustees",
     "uploaded_documents", "otps", "refresh_tokens", "audit_logs" RESTART IDENTITY CASCADE`,
  );
};

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/** Creates a user directly in the DB (bcrypt hashed). */
export const createUser = async (email: string, opts: { role?: Role; password?: string } = {}): Promise<TestUser> => {
  const password = opts.password ?? 'Passw0rd123!';
  const user = await prisma.user.create({
    data: {
      email,
      password: await bcrypt.hash(password, 12),
      name: email.split('@')[0],
      role: opts.role ?? Role.USER,
    },
  });
  return { id: user.id, email: user.email, password };
};

/** Logs in via the API and returns the full token pair. */
export const login = async (email: string, password: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body.data as { accessToken: string; refreshToken: string; user: { id: string; role: string } };
};

/** Runs the full donor registration data steps (account via /auth/register). Returns the auth session. */
export const registerDonor = async (email: string) => {
  const password = 'Passw0rd123!';
  const donorBase = '/api/v1/registration/donors';

  const account = await request(app)
    .post('/api/v1/auth/register')
    .send({ role: 'DONOR', email, password, fullName: 'Test Donor' });
  const registrationToken = account.body.data.registrationToken as string;
  const auth = { Authorization: `Bearer ${registrationToken}` };

  await request(app).post(`${donorBase}/profile`).set(auth).send({
    fullName: 'Test Donor',
    phoneCountryCode: '+92',
    phoneNumber: '0300 1112223',
    address: '1 Test Street',
    city: 'Lahore',
    country: 'PK',
    dateOfBirth: '1992-01-15',
    idType: 'NATIONAL_ID',
    idNumber: '3520212345678',
  });
  await request(app).post(`${donorBase}/interests`).set(auth).send({ interests: ['ZAKAT', 'SADAQAH'] });

  return { email, password, registrationToken, auth };
};

/** Completes a donor registration including OTP verification. */
export const completeDonor = async (email: string) => {
  const { auth } = await registerDonor(email);
  await request(app).post('/api/v1/auth/send-otp').set(auth).send({});
  return auth;
};

export const PDF_BUFFER = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');

export interface MasjidSession {
  auth: { Authorization: string };
  masjidId: string;
  email: string;
}

/** Runs masjid registration steps 1–4 (identity via /auth/register, profile, services, trustees). */
export const setupMasjid = async (email: string): Promise<MasjidSession> => {
  const PASSWORD = 'Passw0rd123!';
  const BASE = '/api/v1/registration/masjids';

  const identity = await request(app).post('/api/v1/auth/register').send({
    role: 'MASJID',
    masjidName: 'Masjid Test',
    ownerName: 'Owner Test',
    email,
    password: PASSWORD,
    organizationType: 'MASJID',
    phoneCountryCode: '+92',
    phoneNumber: '0300 0000000',
    address: '10 Test Avenue',
    city: 'Lahore',
    country: 'PK',
    establishedYear: 2000,
  });
  if (identity.status !== 201) {
    throw new Error(`setupMasjid identity failed (${identity.status}): ${JSON.stringify(identity.body)}`);
  }
  const auth = { Authorization: `Bearer ${identity.body.data.registrationToken}` };
  const masjidId = identity.body.data.masjid.id;

  const profile = await request(app).post(`${BASE}/organization-profile`).set(auth).send({
    description: 'A community masjid serving the neighbourhood.',
    missionStatement: 'To serve and uplift the local community.',
    operatingHours: 'Open for all five daily prayers',
  });
  if (profile.status !== 200) throw new Error('setupMasjid profile failed');

  const services = await request(app).post(`${BASE}/services-compliance`).set(auth).send({
    services: ['FIVE_DAILY_PRAYERS', 'JUMMAH', 'QURAN_CLASSES'],
    handlesZakat: true,
    handlesGiftAid: false,
    hasCharityRegistration: true,
    acceptsOnlineDonations: true,
  });
  if (services.status !== 200) throw new Error('setupMasjid services failed');

  const trustees = await request(app).post(`${BASE}/trustees`).set(auth).send({
    trustees: [
      { fullName: 'Owner Test', email, role: 'CHAIR', idType: 'NATIONAL_ID', idNumber: '3520212222222' },
      { fullName: 'Second Trustee', email: 'second@example.com', role: 'TREASURER' },
    ],
  });
  if (trustees.status !== 200) throw new Error('setupMasjid trustees failed');

  return { auth, masjidId, email };
};

/** Adds a document to a masjid and submits it for review. */
export const submitMasjid = async (session: MasjidSession): Promise<void> => {
  const upload = await request(app)
    .post('/api/v1/uploads/document')
    .set(session.auth)
    .field('purpose', 'REGISTRATION_CERT')
    .field('masjidId', session.masjidId)
    .attach('file', PDF_BUFFER, { filename: 'cert.pdf', contentType: 'application/pdf' });
  if (upload.status !== 201) throw new Error(`submitMasjid upload failed (${upload.status})`);

  const submit = await request(app).post('/api/v1/registration/masjids/submit').set(session.auth).send({});
  if (submit.status !== 200) throw new Error(`submitMasjid submit failed (${submit.status})`);
};

export { app, prisma };

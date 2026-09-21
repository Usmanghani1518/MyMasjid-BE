import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { Role } from '@/generated/prisma/enums';
import { setTestMailer, OutboundMail } from '@/services/email.service';
import { testDbAvailable } from './setup';


export const describeIfDb = (name: string, fn: () => void) => {
  const describeFn = testDbAvailable ? describe : describe.skip;
  describeFn(name, fn);
};


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


export const truncateAll = async (): Promise<void> => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "users", "donors", "volunteers", "masjids", "trustees",
     "uploaded_documents", "campaigns", "projects", "project_milestones", "milestone_comments", "milestone_updates",
     "construction_logs", "construction_log_assets", "project_assets", "contractor_reports", "budget_allocations",
     "expenditures", "invoices", "budget_forecasts", "otps", "refresh_tokens", "password_resets", "audit_logs" RESTART IDENTITY CASCADE`,
  );
};

export interface TestUser {
  id: string;
  email: string;
  password: string;
}


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


export const login = async (email: string, password: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body.data.tokens as { accessToken: string; refreshToken: string };
};

export const PDF_BUFFER = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');

export { app, prisma };

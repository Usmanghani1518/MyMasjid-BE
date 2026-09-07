import nodemailer from 'nodemailer';
import { config } from '@/config';
import { AppError, logger } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { audit, AuditActions } from '@/services/audit.service';
import {
  renderDonorOtp,
  renderVolunteerOtp,
  renderPasswordResetOtp,
  renderApplicationSubmitted,
  renderApplicationApproved,
  renderApplicationDenied,
  RenderedEmail,
  DenialReasonView,
} from '@/services/email/templates';

export interface OutboundMail {
  from?: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

interface Mailer {
  sendMail: (mail: OutboundMail) => Promise<unknown>;
}

/** Test hook: replace the mailer (e.g. nodemailer jsonTransport) to capture sent emails. */
let testMailer: Mailer | null = null;

export const setTestMailer = (mailer: Mailer | null): void => {
  testMailer = mailer;
};

/** Dev/console mailer — logs the email so OTPs are visible locally without SMTP. */
const consoleMailer: Mailer = {
  sendMail: async (mail) => {
    logger.info(
      { to: mail.to, subject: mail.subject, html: mail.html },
      '📧 [dev] Email sent (SMTP not configured — logged for development)',
    );
    return { messageId: `dev-console-${Date.now()}` };
  },
};

let cachedSmtpMailer: Mailer | null = null;

const smtpMailer = (): Mailer => {
  if (cachedSmtpMailer) return cachedSmtpMailer;

  cachedSmtpMailer = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT ?? 587,
    secure: (config.SMTP_PORT ?? 587) === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    connectionTimeout: config.SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: config.SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: config.SMTP_SOCKET_TIMEOUT_MS,
  }) as unknown as Mailer;

  return cachedSmtpMailer;
};

const getMailer = (): Mailer => {
  if (testMailer) return testMailer;
  if (config.SMTP_HOST) return smtpMailer();
  return consoleMailer;
};

export const sendMail = async (mail: OutboundMail): Promise<void> => {
  try {
    await getMailer().sendMail({ from: config.SMTP_FROM, ...mail });
    void audit({ action: AuditActions.EMAIL_SENT, metadata: { to: mail.to, subject: mail.subject } });
  } catch (err) {
    logger.error({ err, to: mail.to }, 'Failed to send email');
    throw new AppError('Failed to send email', 500, true, ErrorCodes.INTERNAL_SERVER_ERROR);
  }
};

export const queueMail = (mail: OutboundMail): void => {
  void sendMail(mail).catch((err) => {
    logger.error({ err, to: mail.to, subject: mail.subject }, 'Queued email failed');
  });
};

const deliver = (to: string, rendered: RenderedEmail): Promise<void> =>
  sendMail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });

const queueDelivery = (to: string, rendered: RenderedEmail): void =>
  queueMail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });

// ==================== Convenience senders ====================

export const sendDonorOtpEmail = (
  to: string,
  props: { name: string; code: string; expiresInMinutes: number },
): Promise<void> => deliver(to, renderDonorOtp(props));

export const sendVolunteerOtpEmail = (
  to: string,
  props: { name: string; code: string; expiresInMinutes: number },
): Promise<void> => deliver(to, renderVolunteerOtp(props));

export const sendPasswordResetOtpEmail = (
  to: string,
  props: { name: string; code: string; expiresInMinutes: number },
): Promise<void> => deliver(to, renderPasswordResetOtp(props));

export const queueDonorOtpEmail = (
  to: string,
  props: { name: string; code: string; expiresInMinutes: number },
): void => queueDelivery(to, renderDonorOtp(props));

export const queueVolunteerOtpEmail = (
  to: string,
  props: { name: string; code: string; expiresInMinutes: number },
): void => queueDelivery(to, renderVolunteerOtp(props));

export const queuePasswordResetOtpEmail = (
  to: string,
  props: { name: string; code: string; expiresInMinutes: number },
): void => queueDelivery(to, renderPasswordResetOtp(props));

export const sendApplicationSubmittedEmail = (
  to: string,
  props: { masjidName: string; referenceId?: string },
): Promise<void> => deliver(to, renderApplicationSubmitted(props));

export const queueApplicationSubmittedEmail = (
  to: string,
  props: { masjidName: string; referenceId?: string },
): void => queueDelivery(to, renderApplicationSubmitted(props));

export const sendApplicationApprovedEmail = (
  to: string,
  props: { masjidName: string },
): Promise<void> => deliver(to, renderApplicationApproved(props));

export const sendApplicationDeniedEmail = (
  to: string,
  props: { masjidName: string; reasons: DenialReasonView[]; note?: string },
): Promise<void> => deliver(to, renderApplicationDenied(props));

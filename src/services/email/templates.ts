/**
 * Email templates for the registration flows. Each renderer returns a subject,
 * an HTML body, and a plain-text fallback. Branding: MyMasjid deep-green.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = 'MyMasjid';

/** Shared HTML shell with a simple responsive, dark-green design. */
const shell = (title: string, bodyHtml: string): string => `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0f0f0f;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f0f0f;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" style="max-width:520px;background:#1c201e;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <h1 style="margin:0 0 4px;color:#8bd6b4;font-size:20px;">${title}</h1>
                <p style="margin:0 0 16px;color:#6b7280;font-size:12px;">from the ${BRAND} team</p>
                <div style="color:#e5e7eb;font-size:14px;line-height:1.6;">${bodyHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px;color:#6b7280;font-size:11px;">
                You are receiving this email because of activity on your ${BRAND} account.
                If you did not request this, please ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

interface OtpProps {
  name: string;
  code: string;
  expiresInMinutes: number;
}

const renderOtp = (props: OtpProps, verb: string, reason: string): RenderedEmail => {
  const { name, code, expiresInMinutes } = props;
  const body = `
    <p>Assalamu alaikum ${escapeHtml(name)},</p>
    <p>${reason}</p>
    <div style="margin:24px 0;padding:20px;background:#0f0f0f;border:1px dashed #8bd6b4;border-radius:12px;text-align:center;">
      <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#8bd6b4;">${code}</span>
    </div>
    <p style="color:#9ca3af;font-size:13px;">This code expires in <strong>${expiresInMinutes} minutes</strong>. For your security, never share it with anyone.</p>
  `;
  return {
    subject: `${verb} — Your ${BRAND} verification code`,
    html: shell(`${verb}`, body),
    text: `Your ${BRAND} verification code is ${code}. It expires in ${expiresInMinutes} minutes.`,
  };
};

export const renderDonorOtp = (props: OtpProps): RenderedEmail =>
  renderOtp(props, 'Donor registration', 'Use the code below to verify your email and complete your donor registration.');

export const renderVolunteerOtp = (props: OtpProps): RenderedEmail =>
  renderOtp(props, 'Volunteer registration', 'Use the code below to verify your email and complete your volunteer registration.');

export const renderResendOtp = (props: OtpProps): RenderedEmail =>
  renderOtp(props, 'New verification code', 'You requested a new verification code. Use it to continue your registration.');

interface MasjidWelcomeProps {
  masjidName: string;
  ownerName: string;
  frontendUrl: string;
}

export const renderMasjidWelcome = (props: MasjidWelcomeProps): RenderedEmail => {
  const { masjidName, ownerName, frontendUrl } = props;
  const body = `
    <p>Assalamu alaikum ${escapeHtml(ownerName)},</p>
    <p>Welcome to ${BRAND}. Your registration for <strong>${escapeHtml(masjidName)}</strong> has been started.</p>
    <p>You can continue your registration at any time by returning to your account:</p>
    <p><a href="${frontendUrl}" style="color:#8bd6b4;">Continue registration →</a></p>
  `;
  return {
    subject: `Welcome to ${BRAND} — ${masjidName}`,
    html: shell('Welcome to MyMasjid', body),
    text: `Welcome to MyMasjid, ${ownerName}. Your registration for ${masjidName} has been started. Continue at ${frontendUrl}.`,
  };
};

interface ApplicationSubmittedProps {
  masjidName: string;
}

export const renderApplicationSubmitted = (props: ApplicationSubmittedProps): RenderedEmail => {
  const body = `
    <p>Your application for <strong>${escapeHtml(props.masjidName)}</strong> has been submitted successfully.</p>
    <p>Our compliance team will review it. You will receive an email once a decision has been made.</p>
  `;
  return {
    subject: `${props.masjidName} — application submitted`,
    html: shell('Application submitted', body),
    text: `Your application for ${props.masjidName} has been submitted. Our compliance team will review it.`,
  };
};

interface ApprovalProps {
  masjidName: string;
}

export const renderApplicationApproved = (props: ApprovalProps): RenderedEmail => {
  const body = `
    <p>Congratulations! Your application for <strong>${escapeHtml(props.masjidName)}</strong> has been <strong style="color:#8bd6b4;">approved</strong>.</p>
    <p>You can now log in and start managing your masjid on ${BRAND}.</p>
  `;
  return {
    subject: `${props.masjidName} — application approved 🎉`,
    html: shell('Application approved', body),
    text: `Your application for ${props.masjidName} has been approved. You can now log in and start managing your masjid.`,
  };
};

export interface DenialReasonView {
  field?: string;
  code: string;
  message: string;
}

interface DenialProps {
  masjidName: string;
  reasons: DenialReasonView[];
  note?: string;
}

export const renderApplicationDenied = (props: DenialProps): RenderedEmail => {
  const reasonsList = props.reasons.length
    ? `<ul style="margin:12px 0 0;padding-left:20px;color:#fca5a5;">${props.reasons
        .map((r) => `<li>${escapeHtml(r.field ? `${r.field}: ` : '')}${escapeHtml(r.message)}</li>`)
        .join('')}</ul>`
    : '<p style="color:#9ca3af;">No specific reasons were provided.</p>';

  const body = `
    <p>We're sorry, but your application for <strong>${escapeHtml(props.masjidName)}</strong> was not approved at this time.</p>
    <p>The following points need to be addressed before resubmission:</p>
    ${reasonsList}
    ${props.note ? `<p style="color:#9ca3af;font-size:13px;">Additional note: ${escapeHtml(props.note)}</p>` : ''}
    <p>You may update your application and resubmit it for another review.</p>
  `;
  return {
    subject: `${props.masjidName} — application requires changes`,
    html: shell('Application not approved', body),
    text: `Your application for ${props.masjidName} was not approved. Reasons: ${props.reasons.map((r) => r.message).join('; ')}${props.note ? ` Note: ${props.note}` : ''}. You may resubmit after addressing them.`,
  };
};

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface DenialReasonView {
  field?: string;
  code: string;
  message: string;
}

const BRAND = 'MyMasjid';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const layout = (title: string, content: string): string => `
<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f6f8f7;font-family:Arial,sans-serif;color:#17201b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe7e2;border-radius:10px;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 6px;color:#0f6b4f;font-size:13px;font-weight:700;">${BRAND}</p>
                <h1 style="margin:0;color:#17201b;font-size:22px;line-height:1.3;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 28px;font-size:15px;line-height:1.6;">${content}</td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #edf1ef;color:#66736d;font-size:12px;line-height:1.5;">
                If you did not request this email, you can safely ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

interface OtpProps {
  name: string;
  code: string;
  expiresInMinutes: number;
}

const otpEmail = (title: string, intro: string, props: OtpProps): RenderedEmail => {
  const name = escapeHtml(props.name);
  const content = `
    <p>Assalamu alaikum ${name},</p>
    <p>${intro}</p>
    <p style="margin:24px 0;padding:18px 12px;background:#edf8f3;border-radius:8px;text-align:center;">
      <span style="font-size:32px;letter-spacing:6px;font-weight:700;color:#0f6b4f;">${props.code}</span>
    </p>
    <p>This code expires in ${props.expiresInMinutes} minutes. Please do not share it with anyone.</p>
  `;

  return {
    subject: `${title} code`,
    html: layout(title, content),
    text: `${title} code: ${props.code}. It expires in ${props.expiresInMinutes} minutes.`,
  };
};

export const renderDonorOtp = (props: OtpProps): RenderedEmail =>
  otpEmail('Donor registration', 'Use this code to verify your email and complete donor registration.', props);

export const renderVolunteerOtp = (props: OtpProps): RenderedEmail =>
  otpEmail('Volunteer registration', 'Use this code to verify your email and complete volunteer registration.', props);

export const renderPasswordResetOtp = (props: OtpProps): RenderedEmail =>
  otpEmail('Password reset', 'Use this code to verify your password reset request.', props);

export const renderApplicationSubmitted = (props: { masjidName: string; referenceId?: string }): RenderedEmail => {
  const name = escapeHtml(props.masjidName);
  const reference = props.referenceId ? `<p>Reference ID: <strong>${escapeHtml(props.referenceId)}</strong></p>` : '';
  const content = `
    <p>Your masjid application for <strong>${name}</strong> has been submitted for review.</p>
    ${reference}
    <p>Our team will review it and email you when a decision is made.</p>
  `;

  return {
    subject: `${props.masjidName} application submitted`,
    html: layout('Application submitted', content),
    text: `Your masjid application for ${props.masjidName} has been submitted.${props.referenceId ? ` Reference ID: ${props.referenceId}.` : ''}`,
  };
};

export const renderApplicationApproved = (props: { masjidName: string }): RenderedEmail => {
  const content = `
    <p>Your application for <strong>${escapeHtml(props.masjidName)}</strong> has been approved.</p>
    <p>You can now continue with the approved masjid account flow in MyMasjid.</p>
  `;

  return {
    subject: `${props.masjidName} application approved`,
    html: layout('Application approved', content),
    text: `Your application for ${props.masjidName} has been approved.`,
  };
};

export const renderApplicationDenied = (props: {
  masjidName: string;
  reasons: DenialReasonView[];
  note?: string;
}): RenderedEmail => {
  const reasonItems = props.reasons
    .map((reason) => `<li>${escapeHtml(reason.field ? `${reason.field}: ` : '')}${escapeHtml(reason.message)}</li>`)
    .join('');
  const content = `
    <p>Your application for <strong>${escapeHtml(props.masjidName)}</strong> needs changes before it can be approved.</p>
    ${reasonItems ? `<ul>${reasonItems}</ul>` : '<p>No specific reasons were provided.</p>'}
    ${props.note ? `<p>Note: ${escapeHtml(props.note)}</p>` : ''}
  `;

  return {
    subject: `${props.masjidName} application needs changes`,
    html: layout('Application needs changes', content),
    text: `Your application for ${props.masjidName} needs changes. Reasons: ${props.reasons.map((r) => r.message).join('; ')}${props.note ? ` Note: ${props.note}` : ''}`,
  };
};

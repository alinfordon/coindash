import nodemailer from "nodemailer";

function mailConfig() {
  const user = process.env.EMAIL_USER?.replace(/^"|"$/g, "");
  const pass = process.env.EMAIL_PASS?.replace(/^"|"$/g, "");
  const from = (process.env.EMAIL_FROM || user)?.replace(/^"|"$/g, "");
  if (!user || !pass) {
    throw new Error("EMAIL_USER și EMAIL_PASS trebuie setate în .env.local");
  }
  return { user, pass, from: from || user };
}

export function isEmailConfigured(): boolean {
  const user = process.env.EMAIL_USER?.replace(/^"|"$/g, "");
  const pass = process.env.EMAIL_PASS?.replace(/^"|"$/g, "");
  return Boolean(user && pass);
}

export async function sendInviteEmail(opts: {
  to: string;
  name: string;
  inviteUrl: string;
  invitedByName: string;
}) {
  const { user, pass, from } = mailConfig();
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  const subject = "Invitație Nexus Trade — creează-ți contul";
  const text = [
    `Salut ${opts.name},`,
    ``,
    `${opts.invitedByName} te-a invitat pe Nexus Trade.`,
    `Deschide linkul pentru a seta parola și a activa contul:`,
    opts.inviteUrl,
    ``,
    `Linkul expiră în 7 zile.`,
    ``,
    `Dacă nu te așteptai la acest email, îl poți ignora.`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;color:#e2e8f0;background:#0f172a;padding:24px;border-radius:12px;">
      <h2 style="color:#22d3ee;margin:0 0 12px;">NEXUS.TRADE</h2>
      <p>Salut <strong>${escapeHtml(opts.name)}</strong>,</p>
      <p><strong>${escapeHtml(opts.invitedByName)}</strong> te-a invitat să folosești platforma.</p>
      <p style="margin:24px 0;">
        <a href="${opts.inviteUrl}" style="display:inline-block;background:#0891b2;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
          Activează contul
        </a>
      </p>
      <p style="font-size:12px;color:#94a3b8;">Link alternativ:<br/><a href="${opts.inviteUrl}" style="color:#67e8f9;">${opts.inviteUrl}</a></p>
      <p style="font-size:11px;color:#64748b;margin-top:24px;">Expiră în 7 zile. Dacă nu te așteptai la acest email, îl poți ignora.</p>
    </div>
  `;

  await transport.sendMail({
    from: `"Nexus Trade" <${from}>`,
    to: opts.to,
    subject,
    text,
    html,
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

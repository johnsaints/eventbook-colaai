import nodemailer, { type Transporter } from 'nodemailer';
import { AppError } from '../../shared/errors/AppError.js';

export type MagicLinkEmailPayload = {
  email: string;
  name: string;
  magicUrl: string;
  expiresAt: Date;
};

export type MagicLinkDeliveryResult = {
  previewUrl?: string;
};

/** Contrato de entrega de link mágico para aplicar inversão de dependência (DIP). */
export interface MagicLinkDelivery {
  readonly mode: 'resend' | 'smtp' | 'simulated';
  readonly canDeliver: boolean;
  send(payload: MagicLinkEmailPayload): Promise<MagicLinkDeliveryResult>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildMagicLinkMessage(payload: MagicLinkEmailPayload) {
  const safeName = escapeHtml(payload.name);
  const safeUrl = escapeHtml(payload.magicUrl);
  const subject = 'Seu link de acesso — ColaAí Eventos';
  const text = [
    `Olá, ${payload.name}!`,
    '',
    'Use o link único abaixo para entrar na sua conta do ColaAí (válido por 15 minutos):',
    payload.magicUrl,
    '',
    'Se você não solicitou este acesso, ignore este e-mail.',
  ].join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#07152b;color:#ffffff;border-radius:16px;border:1px solid #0b7bff;">
      <p style="margin:0 0 8px;color:#00d4ff;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">ColaAí Eventos</p>
      <h1 style="margin:0 0 12px;font-size:22px;">Acesso rápido à sua conta</h1>
      <p style="margin:0 0 20px;color:#b3c6e0;line-height:1.5;">Olá, <strong>${safeName}</strong>! Clique no botão abaixo para entrar sem senha. Este link expira em 15 minutos e funciona apenas uma vez.</p>
      <p style="margin:0 0 20px;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:linear-gradient(105deg,#00d4ff,#0b7bff 45%,#ff2e9e);color:#ffffff;font-weight:700;text-decoration:none;">Entrar no ColaAí</a>
      </p>
      <p style="margin:0;color:#8fa6c9;font-size:12px;word-break:break-all;">Se o botão não abrir, copie o link: ${safeUrl}</p>
    </div>
  `;

  return { subject, text, html };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

/** Entrega real via API HTTPS do Resend (recomendado para serviços gratuitos sem porta SMTP). */
export class ResendMagicLinkDelivery implements MagicLinkDelivery {
  readonly mode = 'resend' as const;
  readonly canDeliver = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(payload: MagicLinkEmailPayload): Promise<MagicLinkDeliveryResult> {
    const content = buildMagicLinkMessage(payload);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [payload.email],
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
    });

    if (!response.ok) {
      throw new AppError('EMAIL_DELIVERY_FAILED', 'Não foi possível enviar o link mágico neste momento.', 502);
    }

    return {};
  }
}

/** Entrega real via SMTP usando Nodemailer. */
export class SmtpMagicLinkDelivery implements MagicLinkDelivery {
  readonly mode = 'smtp' as const;
  readonly canDeliver = true;
  private readonly transporter: Transporter;

  constructor(options: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    from: string;
  }) {
    this.from = options.from;
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      ...(options.user && options.pass
        ? { auth: { user: options.user, pass: options.pass } }
        : {}),
    });
  }

  private readonly from: string;

  async send(payload: MagicLinkEmailPayload): Promise<MagicLinkDeliveryResult> {
    const content = buildMagicLinkMessage(payload);
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: payload.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
    } catch {
      throw new AppError('EMAIL_DELIVERY_FAILED', 'Não foi possível enviar o link mágico neste momento.', 502);
    }
    return {};
  }
}

/** Provedor simulado: ativo apenas em desenvolvimento e testes, nunca vaza link em produção. */
export class SimulatedMagicLinkDelivery implements MagicLinkDelivery {
  readonly mode = 'simulated' as const;
  readonly canDeliver: boolean;

  constructor(private readonly allowHttpPreview: boolean) {
    this.canDeliver = allowHttpPreview;
  }

  async send(payload: MagicLinkEmailPayload): Promise<MagicLinkDeliveryResult> {
    if (!this.allowHttpPreview) {
      throw new AppError(
        'MAGIC_LINK_UNAVAILABLE',
        'O envio de link mágico por e-mail não está configurado neste ambiente.',
        503,
      );
    }

    if (process.env.NODE_ENV !== 'test') {
      console.info(JSON.stringify({
        event: 'magic_link_simulated',
        recipient: maskEmail(payload.email),
        magicUrl: payload.magicUrl,
        expiresAt: payload.expiresAt.toISOString(),
      }));
    }

    return { previewUrl: payload.magicUrl };
  }
}

export type MagicLinkEnvConfig = {
  NODE_ENV: 'development' | 'test' | 'production';
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  EMAIL_FROM: string;
};

export function createMagicLinkDelivery(config: MagicLinkEnvConfig): MagicLinkDelivery {
  if (config.RESEND_API_KEY) {
    return new ResendMagicLinkDelivery(config.RESEND_API_KEY, config.EMAIL_FROM);
  }
  if (config.SMTP_HOST) {
    return new SmtpMagicLinkDelivery({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
      from: config.EMAIL_FROM,
    });
  }
  return new SimulatedMagicLinkDelivery(config.NODE_ENV !== 'production');
}

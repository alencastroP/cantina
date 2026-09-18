import { env, isProduction } from '../config/env';
import { logger } from '../shared/logger';

/**
 * E-mail transacional: recuperação de senha e convite de usuário.
 *
 * Resend por HTTP direto, sem SDK — a API é uma chamada só, e uma dependência
 * a menos numa imagem de produção é uma dependência a menos para atualizar.
 *
 * Sem `RESEND_API_KEY`, cai no adaptador de console. Isso é deliberado: em
 * desenvolvimento o link de convite aparece no terminal e o fluxo inteiro
 * pode ser testado sem conta em provedor nenhum.
 */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

const consoleProvider: MailProvider = {
  async send(message) {
    logger.info(
      { to: message.to, subject: message.subject, body: message.text ?? message.html },
      'E-mail (console)',
    );
  },
};

const resendProvider: MailProvider = {
  async send(message) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Resend respondeu ${response.status}: ${body}`);
    }
  },
};

export const mailProvider: MailProvider = env.RESEND_API_KEY ? resendProvider : consoleProvider;

if (!env.RESEND_API_KEY && isProduction) {
  logger.warn('RESEND_API_KEY ausente: e-mails vão para o log, não para o destinatário.');
}

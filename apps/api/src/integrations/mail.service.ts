import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env';

@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transport: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (this.env.NODE_ENV === 'test') return;
    await this.transport.sendMail({ from: this.env.MAIL_FROM, to, subject, text });
    this.logger.debug({ to, subject }, 'mail sent');
  }
}

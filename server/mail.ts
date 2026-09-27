export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Nơi gửi mail — đổi nhà cung cấp (Gmail → Resend/SMS) chỉ cần implementation khác (design D5). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Hộp thư trong bộ nhớ cho test/e2e: không gửi thật, đọc lại được mã OTP. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
  /** Mã OTP 6 số trong mail gần nhất gửi tới `to`. */
  lastOtp(to: string): string | undefined {
    const mail = [...this.sent].reverse().find((m) => m.to === to);
    return mail?.text.match(/\b(\d{6})\b/)?.[1];
  }
}

/** Gmail SMTP bằng App Password (cần bật xác minh 2 bước cho tài khoản Gmail). Khoảng 500 mail/ngày. */
export class GmailMailer implements Mailer {
  private transport: Promise<import("nodemailer").Transporter>;
  constructor(
    private user: string,
    pass: string,
  ) {
    this.transport = import("nodemailer").then((m) =>
      m.default.createTransport({ service: "gmail", auth: { user, pass } }),
    );
  }
  async send({ to, subject, text }: MailMessage) {
    await (await this.transport).sendMail({ from: `"Sổ Nợ" <${this.user}>`, to, subject, text });
  }
}

/** Máy dev chưa cấu hình Gmail: in mã ra terminal thay vì gửi. Không bao giờ dùng ở production. */
export class ConsoleMailer implements Mailer {
  async send({ to, subject, text }: MailMessage) {
    console.log(`[mail dev] tới ${to} — ${subject}\n${text}`);
  }
}

/**
 * Chọn nơi gửi theo môi trường:
 * E2E_TEST=1 → bộ nhớ; có GMAIL_USER + GMAIL_APP_PASSWORD → Gmail; production thiếu Gmail → lỗi; còn lại → in ra terminal.
 */
export function mailerFromEnv(env: Record<string, string | undefined>): Mailer {
  if (env.E2E_TEST === "1") return new MemoryMailer();
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) return new GmailMailer(env.GMAIL_USER, env.GMAIL_APP_PASSWORD);
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
    throw new Error("Thiếu GMAIL_USER / GMAIL_APP_PASSWORD");
  }
  return new ConsoleMailer();
}

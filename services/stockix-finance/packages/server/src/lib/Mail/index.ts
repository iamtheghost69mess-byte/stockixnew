import fs from 'fs';
import Mustache from 'mustache';
import path from 'path';
import { IMailable } from '@/interfaces';

const env = process.env as Record<string, string | undefined>;

interface IMailAttachment {
  filename: string;
  path: string;
  cid: string;
}

export default class Mail {
  view: string;
  subject: string;
  to: string;
  from: string = `${env.MAIL_FROM_NAME ?? ''} ${env.MAIL_FROM_ADDRESS ?? ''}`.trim();
  data: { [key: string]: string | number };
  attachments: IMailAttachment[];

  /**
   * Mail options.
   */
  private get mailOptions() {
    return {
      to: this.to,
      from: this.from,
      subject: this.subject,
      html: this.render(this.data),
      attachments: this.attachments,
    };
  }

  /**
   * Sends the given mail to the target address.
   */
  public send() {
    return Promise.reject(
      new Error('Legacy Mail.send() is deprecated — use Nest MailModule instead'),
    );
  }

  /**
   * Set send mail to address.
   * @param {string} to -
   */
  setTo(to: string) {
    this.to = to;
    return this;
  }

  /**
   * Sets from address to the mail.
   * @param {string} from
   * @return {}
   */
  private setFrom(from: string) {
    this.from = from;
    return this;
  }

  setAttachments(attachments: IMailAttachment[]) {
    this.attachments = attachments;
    return this;
  }

  /**
   * Set mail subject.
   * @param {string} subject
   */
  setSubject(subject: string) {
    this.subject = subject;
    return this;
  }

  /**
   * Set view directory.
   * @param {string} view
   */
  setView(view: string) {
    this.view = view;
    return this;
  }

  setData(data) {
    this.data = data;
    return this;
  }

  /**
   * Renders the view template with the given data.
   * @param  {object} data
   * @return {string}
   */
  render(data): string {
    const viewContent = this.getViewContent();
    return Mustache.render(viewContent, data);
  }

  /**
   * Retrieve view content from the view directory.
   */
  private getViewContent(): string {
    const filePath = path.join(global.__views_dir, `/${this.view}`);
    return fs.readFileSync(filePath, 'utf8');
  }
}

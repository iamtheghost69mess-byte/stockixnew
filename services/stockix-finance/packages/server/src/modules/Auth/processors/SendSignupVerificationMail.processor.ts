import { Scope } from '@nestjs/common';
import { Job } from 'bullmq';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { SendSignupVerificationMailQueue } from '../Auth.constants';
import { AuthenticationMailMesssages } from '../AuthMailMessages.esrvice';

@Processor({
  name: SendSignupVerificationMailQueue,
  scope: Scope.REQUEST,
})
export class SendSignupVerificationMailProcessor extends WorkerHost {
  constructor(
    private readonly authMailMesssages: AuthenticationMailMesssages,
  ) {
    super();
  }

  async process(job: Job<SendSignupVerificationMailJobPayload>) {
    try {
      await this.authMailMesssages.sendSignupVerificationMail(
        job.data.email,
        job.data.fullName,
        job.data.token,
      );
    } catch (error) {
      console.error('[MailProcessor] Failed to send signup verification email:', {
        jobId: job.id,
        jobName: job.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export interface SendSignupVerificationMailJobPayload {
  email: string;
  fullName: string;
  token: string;
}

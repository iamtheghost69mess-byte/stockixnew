import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { events } from '@/common/events/events';
import { OnEvent } from '@nestjs/event-emitter';
import {
  IAuthSendedResetPassword,
  IAuthSignedUpEventPayload,
  ISignUpConfigmResendedEventPayload,
} from '../Auth.interfaces';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { SendResetPasswordMailJobPayload } from '../processors/SendResetPasswordMail.processor';
import {
  SendResetPasswordMailJob,
  SendResetPasswordMailQueue,
  SendSignupVerificationMailJob,
  SendSignupVerificationMailQueue,
} from '../Auth.constants';
import { SendSignupVerificationMailJobPayload } from '../processors/SendSignupVerificationMail.processor';
import { MAIL_QUEUE_JOB_OPTIONS } from '@/modules/Mail/mail-queue.constants';

@Injectable()
export class AuthMailSubscriber {
  constructor(
    private readonly configService: ConfigService,

    @InjectQueue(SendResetPasswordMailQueue)
    private readonly sendResetPasswordMailQueue: Queue,

    @InjectQueue(SendSignupVerificationMailQueue)
    private readonly sendSignupVerificationMailQueue: Queue,
  ) {}

  @OnEvent(events.auth.signUp)
  async handleSignupSendVerificationMail(payload: IAuthSignedUpEventPayload) {
    const signupConfirmation = this.configService.get('signupConfirmation');
    if (!signupConfirmation?.enabled) {
      return;
    }
    if (!payload.user.verifyToken) {
      return;
    }
    await this.enqueueSignupVerificationMail(payload);
  }

  @OnEvent(events.auth.signUpConfirmResended)
  async handleSignupConfirmResendMail(
    payload: ISignUpConfigmResendedEventPayload,
  ) {
    if (!payload.user.verifyToken) {
      return;
    }
    await this.enqueueSignupVerificationMail(payload);
  }

  private async enqueueSignupVerificationMail(
    payload: IAuthSignedUpEventPayload | ISignUpConfigmResendedEventPayload,
  ) {
    try {
      await this.sendSignupVerificationMailQueue.add(
        SendSignupVerificationMailJob,
        {
          email: payload.user.email,
          fullName: payload.user.firstName,
          token: payload.user.verifyToken,
        } as SendSignupVerificationMailJobPayload,
        {
          delay: 0,
          ...MAIL_QUEUE_JOB_OPTIONS,
        },
      );
    } catch (error) {
      console.error('[AuthMailSubscriber] Failed to enqueue signup verification mail', error);
      throw error;
    }
  }

  @OnEvent(events.auth.sendResetPassword)
  async handleSendResetPasswordMail(payload: IAuthSendedResetPassword) {
    await this.sendResetPasswordMailQueue.add(
      SendResetPasswordMailJob,
      {
        user: payload.user,
        token: payload.token,
      } as SendResetPasswordMailJobPayload,
      {
        delay: 0,
        ...MAIL_QUEUE_JOB_OPTIONS,
      },
    );
  }
}

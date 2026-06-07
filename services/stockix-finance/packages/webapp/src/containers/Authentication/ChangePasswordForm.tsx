// @ts-nocheck
import React from 'react';
import { Intent } from '@blueprintjs/core';
import { Form } from 'formik';
import { FFormGroup, FInputGroup, FormattedMessage as T } from '@/components';
import { AuthSubmitButton } from './_components';

export default function ChangePasswordForm({ isSubmitting, isRequired, completed }) {
  return (
    <Form>
      <FFormGroup name={'password'} label={<T id={'new_password'} />}>
        <FInputGroup name={'password'} type={'password'} large={true} />
      </FFormGroup>

      <FFormGroup name={'confirm_password'} label={<T id={'confirm_password'} />}>
        <FInputGroup name={'confirm_password'} type={'password'} large={true} />
      </FFormGroup>

      <AuthSubmitButton
        fill={true}
        intent={Intent.PRIMARY}
        type="submit"
        loading={isSubmitting || completed}
        disabled={completed}
        large={true}
      >
        {isRequired ? (
          <T id={'change_password_save_and_continue'} />
        ) : (
          <T id={'submit'} />
        )}
      </AuthSubmitButton>
    </Form>
  );
}

// @ts-nocheck
import React, { useState } from 'react';
import intl from 'react-intl-universal';
import { Formik } from 'formik';
import { Intent, Position } from '@blueprintjs/core';
import { useLocation } from 'react-router-dom';

import { AppToaster, FormattedMessage as T } from '@/components';
import { useAuthChangePassword } from '@/hooks/query';
import AuthInsider from '@/containers/Authentication/AuthInsider';
import { clearMustChangePasswordCookie } from '@/utils';
import { AuthInsiderCard } from './_components';
import ChangePasswordForm from './ChangePasswordForm';
import { ResetPasswordSchema } from './utils';

const initialValues = {
  password: '',
  confirm_password: '',
};

/**
 * Required password change after bootstrap / provisioned login.
 */
export default function ChangePassword() {
  const location = useLocation();
  const { mutateAsync: changePasswordMutate } = useAuthChangePassword();
  const [completed, setCompleted] = useState(false);
  const isRequired = new URLSearchParams(location.search).get('required') === 'true';

  const handleSubmit = (values, { setSubmitting, resetForm }) => {
    if (completed) {
      return;
    }

    changePasswordMutate({ password: values.password })
      .then(() => {
        clearMustChangePasswordCookie();
        setCompleted(true);
        resetForm();
        AppToaster.show({
          message: intl.get('password_successfully_updated'),
          intent: Intent.SUCCESS,
          position: Position.BOTTOM,
        });
        // Hard navigation clears stale router/guard state after bootstrap login.
        window.setTimeout(() => {
          window.location.replace('/');
        }, 400);
      })
      .catch((error) => {
        const message =
          error?.response?.data?.message
          || intl.get('an_unexpected_error_occurred');
        AppToaster.show({
          message,
          intent: Intent.DANGER,
          position: Position.BOTTOM,
        });
        setSubmitting(false);
      });
  };

  return (
    <AuthInsider>
      <AuthInsiderCard>
        <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>
          {isRequired ? (
            <T id={'change_password_required_title'} />
          ) : (
            <T id={'choose_a_new_password'} />
          )}
        </h2>
        <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted, #8a9ba8)' }}>
          {isRequired ? (
            <T id={'change_password_required_hint'} />
          ) : (
            <T id={'choose_a_new_password'} />
          )}
        </p>
        <Formik
          initialValues={initialValues}
          validationSchema={ResetPasswordSchema}
          onSubmit={handleSubmit}
          component={ChangePasswordForm}
          isRequired={isRequired}
          completed={completed}
        />
      </AuthInsiderCard>
    </AuthInsider>
  );
}

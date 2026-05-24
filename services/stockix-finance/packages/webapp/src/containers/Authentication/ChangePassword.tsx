// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import { Formik } from 'formik';
import { Intent, Position } from '@blueprintjs/core';
import { useHistory } from 'react-router-dom';

import { AppToaster, FormattedMessage as T } from '@/components';
import { useAuthChangePassword } from '@/hooks/query';
import AuthInsider from '@/containers/Authentication/AuthInsider';
import { removeCookie } from '@/utils';
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
  const history = useHistory();
  const { mutateAsync: changePasswordMutate } = useAuthChangePassword();

  const handleSubmit = (values, { setSubmitting }) => {
    changePasswordMutate({ password: values.password })
      .then(() => {
        removeCookie('must_change_password');
        AppToaster.show({
          message: intl.get('password_successfully_updated'),
          intent: Intent.SUCCESS,
          position: Position.BOTTOM,
        });
        history.push('/');
        setSubmitting(false);
      })
      .catch(() => {
        setSubmitting(false);
      });
  };

  return (
    <AuthInsider>
      <AuthInsiderCard>
        <p style={{ marginBottom: '1rem' }}>
          <T id={'change_password_required_hint'} />
        </p>
        <Formik
          initialValues={initialValues}
          validationSchema={ResetPasswordSchema}
          onSubmit={handleSubmit}
          component={ChangePasswordForm}
        />
      </AuthInsiderCard>
    </AuthInsider>
  );
}

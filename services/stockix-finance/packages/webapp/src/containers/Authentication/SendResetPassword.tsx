// @ts-nocheck
import React, { useMemo } from 'react';
import intl from 'react-intl-universal';
import { Formik } from 'formik';
import { Link, useHistory } from 'react-router-dom';
import { Intent, Button } from '@blueprintjs/core';

import { AppToaster, FormattedMessage as T } from '@/components';
import { useAuthSendResetPassword } from '@/hooks/query';

import SendResetPasswordForm from './SendResetPasswordForm';
import {
  AuthFooterLink,
  AuthFooterLinks,
  AuthInsiderCard,
} from './_components';
import {
  SendResetPasswordSchema,
  transformSendResetPassErrorsToToasts,
} from './utils';
import AuthInsider from '@/containers/Authentication/AuthInsider';

const initialValues = {
  crediential: '',
};

/**
 * Send reset password page.
 */
export default function SendResetPassword() {
  const history = useHistory();
  const { mutateAsync: sendResetPasswordMutate } = useAuthSendResetPassword();

  // Handle form submitting.
  const handleSubmit = (values, { setSubmitting }) => {
    sendResetPasswordMutate({ email: values.crediential })
      .then(() => {
        AppToaster.show({
          message: intl.get('check_your_email_for_a_link_to_reset'),
          intent: Intent.SUCCESS,
        });
        history.push('/auth/login');
        setSubmitting(false);
      })
      .catch(() => {
        setSubmitting(false);
      });
  };

  return (
    <AuthInsider>
      <div style={{ marginBottom: '1rem' }}>
        <Button 
          icon="arrow-left" 
          minimal={true} 
          onClick={() => history.push('/auth/login')}
        >
          Back
        </Button>
      </div>
      <AuthInsiderCard>
        <Formik
          initialValues={initialValues}
          onSubmit={handleSubmit}
          validationSchema={SendResetPasswordSchema}
          component={SendResetPasswordForm}
        />
      </AuthInsiderCard>

      <SendResetPasswordFooterLinks />
    </AuthInsider>
  );
}

function SendResetPasswordFooterLinks() {
  return (
    <AuthFooterLinks>
      <AuthFooterLink>
        <T id={'return_to'} />{' '}
        <Link to={'/auth/login'}>
          <T id={'sign_in'} />
        </Link>
      </AuthFooterLink>
    </AuthFooterLinks>
  );
}

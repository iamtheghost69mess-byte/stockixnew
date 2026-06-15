// @ts-nocheck
import React from 'react';
import {
  Button,
  Classes,
  FormGroup,
  InputGroup,
  Intent,
} from '@blueprintjs/core';
import { Formik } from 'formik';
import { Dialog, FormattedMessage as T } from '@/components';
import withDialogRedux from '@/components/DialogReduxConnect';
import { compose } from '@/utils';
import { useAuthenticatedAccount, useUpdateProfile } from '@/hooks/query';
import { useDialogActions } from '@/hooks/state';

function UserProfileDialog({ dialogName, isOpen }) {
  const { data: user } = useAuthenticatedAccount();
  const { mutateAsync: updateProfile } = useUpdateProfile();
  const { closeDialog } = useDialogActions();

  const initialValues = {
    firstName: user?.first_name ?? '',
    lastName: user?.last_name ?? '',
  };

  const handleSubmit = async (values, { setSubmitting, setFieldError }) => {
    try {
      await updateProfile({
        firstName: values.firstName,
        lastName: values.lastName,
      });
      closeDialog(dialogName);
    } catch (err) {
      const msg = err?.response?.data?.message ?? 'Failed to update profile.';
      setFieldError('firstName', msg);
    }
    setSubmitting(false);
  };

  return (
    <Dialog
      name={dialogName}
      isOpen={isOpen}
      title={<T id={'edit_profile'} />}
    >
      <Formik
        initialValues={initialValues}
        enableReinitialize
        onSubmit={handleSubmit}
      >
        {({ values, handleChange, handleSubmit, isSubmitting, errors }) => (
          <form onSubmit={handleSubmit}>
            <div className={Classes.DIALOG_BODY}>
              <FormGroup
                label={<T id={'first_name'} />}
                intent={errors.firstName ? Intent.DANGER : Intent.NONE}
                helperText={errors.firstName}
              >
                <InputGroup
                  name="firstName"
                  value={values.firstName}
                  onChange={handleChange}
                  autoFocus
                />
              </FormGroup>
              <FormGroup label={<T id={'last_name'} />}>
                <InputGroup
                  name="lastName"
                  value={values.lastName}
                  onChange={handleChange}
                />
              </FormGroup>
            </div>
            <div className={Classes.DIALOG_FOOTER}>
              <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                <Button
                  onClick={() => closeDialog(dialogName)}
                  disabled={isSubmitting}
                >
                  <T id={'cancel'} />
                </Button>
                <Button
                  intent={Intent.PRIMARY}
                  type="submit"
                  loading={isSubmitting}
                >
                  <T id={'save'} />
                </Button>
              </div>
            </div>
          </form>
        )}
      </Formik>
    </Dialog>
  );
}

export default compose(withDialogRedux())(UserProfileDialog);

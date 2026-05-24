// @ts-nocheck
import React from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Button, Intent } from '@blueprintjs/core';
import { useHistory, Redirect } from 'react-router-dom';
import { omit } from 'lodash';
import { x } from '@xstyled/emotion';
import { getAllCountries } from '@stockix/utils';

import {
  AppToaster,
  FFormGroup,
  FInputGroup,
  FSelect,
  FormattedMessage as T,
  Group,
  Stack,
} from '@/components';
import { useUploadAttachments } from '@/hooks/query/attachments';
import {
  useCompleteOrganizationSetup,
  useCurrentOrganization,
  useUpdateOrganization,
} from '@/hooks/query/organization';
import { excludePrivateProps, transfromToSnakeCase } from '@/utils';
import { withOrganization } from '@/containers/Organization/withOrganization';
import { compose } from '@/utils';
import { useIsDarkMode } from '@/hooks/useDarkMode';

const countries = getAllCountries();

const validationSchema = Yup.object({
  tax_number: Yup.string().optional(),
  location: Yup.string().required(),
  address: Yup.object({
    address1: Yup.string().optional(),
    address2: Yup.string().optional(),
    city: Yup.string().optional(),
    postal_code: Yup.string().optional(),
    state_province: Yup.string().optional(),
  }),
});

function SetupCompleteProfileForm({
  isOrganizationSetupCompleted,
}) {
  const history = useHistory();
  const isDarkMode = useIsDarkMode();
  const { data: organization } = useCurrentOrganization();
  const { mutateAsync: updateOrganization } = useUpdateOrganization();
  const { mutateAsync: completeSetup } = useCompleteOrganizationSetup();
  const { mutateAsync: uploadAttachments } = useUploadAttachments({});

  if (isOrganizationSetupCompleted) {
    return <Redirect to="/" />;
  }

  const initialValues = {
    tax_number: organization?.metadata?.tax_number ?? '',
    location: organization?.metadata?.location ?? '',
    address: {
      address1: organization?.metadata?.address?.address1 ?? '',
      address2: organization?.metadata?.address?.address2 ?? '',
      city: organization?.metadata?.address?.city ?? '',
      postal_code: organization?.metadata?.address?.postalCode ?? '',
      state_province: organization?.metadata?.address?.stateProvince ?? '',
    },
    _logoFile: null,
    logoKey: organization?.metadata?.logo_key ?? '',
  };

  const handleSubmit = async (values, { setSubmitting }) => {
    const payload = { ...values };

    if (values._logoFile) {
      const formData = new FormData();
      formData.append('file', values._logoFile);
      formData.append('internalKey', Date.now().toString());

      try {
        const uploaded = await uploadAttachments(formData);
        payload.logoKey = uploaded?.key;
      } catch {
        AppToaster.show({
          intent: Intent.DANGER,
          message: 'Failed to upload logo.',
        });
        setSubmitting(false);
        return;
      }
    }

    const body = transfromToSnakeCase(
      omit(excludePrivateProps(payload), ['_logoFile']),
    );

    try {
      await updateOrganization(body);
      await completeSetup();
      history.push('/');
    } catch {
      AppToaster.show({
        intent: Intent.DANGER,
        message: 'Failed to save organization profile.',
      });
      setSubmitting(false);
    }
  };

  return (
    <x.div w="480px" mx="auto" pt="80px">
      <x.h3
        color={isDarkMode ? 'rgba(255, 255, 255, 0.85)' : '#2d2b43'}
        mb="1.5rem"
        fontWeight={600}
      >
        <T id={'setup.complete_profile.title'} />
      </x.h3>
      <x.p
        mb="2rem"
        opacity={0.85}
        color={isDarkMode ? 'rgba(255, 255, 255, 0.7)' : undefined}
      >
        <T id={'setup.complete_profile.description'} />
      </x.p>

      <Formik
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
        enableReinitialize
      >
        {({ isSubmitting, setFieldValue }) => (
          <Form>
            <FFormGroup name="tax_number" label={<T id={'organization_tax_number'} />}>
              <FInputGroup name="tax_number" large />
            </FFormGroup>

            <FFormGroup name="location" label={<T id={'business_location'} />}>
              <FSelect
                name="location"
                items={countries}
                valueAccessor="countryCode"
                textAccessor="name"
                buttonProps={{ large: true }}
              />
            </FFormGroup>

            <FFormGroup name="address" label="Address">
              <Stack>
                <FInputGroup name="address.address1" placeholder="Street" />
                <FInputGroup name="address.address2" placeholder="Address line 2" />
                <Group spacing={15}>
                  <FInputGroup name="address.city" placeholder="City" />
                  <FInputGroup name="address.postal_code" placeholder="Postal code" />
                </Group>
                <FInputGroup name="address.state_province" placeholder="State / Province" />
              </Stack>
            </FFormGroup>

            <FFormGroup name="_logoFile" label="Logo">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  setFieldValue('_logoFile', file);
                }}
              />
            </FFormGroup>

            <Button
              type="submit"
              intent={Intent.PRIMARY}
              large
              loading={isSubmitting}
            >
              <T id={'save_and_continue'} />
            </Button>
          </Form>
        )}
      </Formik>
    </x.div>
  );
}

export default compose(
  withOrganization(({ isOrganizationSetupCompleted }) => ({
    isOrganizationSetupCompleted,
  })),
)(SetupCompleteProfileForm);

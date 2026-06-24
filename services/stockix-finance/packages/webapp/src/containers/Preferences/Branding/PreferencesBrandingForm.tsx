import React, { CSSProperties } from 'react';
import { Formik, Form, FormikHelpers } from 'formik';
import * as Yup from 'yup';
import { omit } from 'lodash';
import { PreferencesBrandingFormValues } from './_types';
import { useUploadAttachments } from '@/hooks/query/attachments';
import { AppToaster } from '@/components';
import { Intent } from '@blueprintjs/core';
import {
  excludePrivateProps,
  transformToCamelCase,
  transformToForm,
} from '@/utils';
import { useUpdateOrganization } from '@/hooks/query';
import { usePreferencesBrandingBoot } from './PreferencesBrandingBoot';

const initialValues = {
  logoKey: '',
  logoUri: '',
  primaryColor: '',
};

const validationSchema = Yup.object({
  logoKey: Yup.string().optional(),
  logoUri: Yup.string().optional(),
  primaryColor: Yup.string()
    .optional()
    .matches(
      /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/,
      'Must be a valid hex color (e.g. #fff or #ffffff)',
    ),
});

interface PreferencesBrandingFormProps {
  children: React.ReactNode;
}

export const PreferencesBrandingForm = ({
  children,
}: PreferencesBrandingFormProps) => {
  // Uploads the attachments.
  const { mutateAsync: uploadAttachments } = useUploadAttachments({});
  // Mutate organization information.
  const { mutateAsync: updateOrganization } = useUpdateOrganization();

  const { organization } = usePreferencesBrandingBoot();

  const formInitialValues = {
    ...initialValues,
    ...transformToForm(
      transformToCamelCase(organization?.metadata),
      initialValues,
    ),
  } as PreferencesBrandingFormValues;

  // Handle the form submitting.
  const handleSubmit = async (
    values: PreferencesBrandingFormValues,
    { setSubmitting }: FormikHelpers<PreferencesBrandingFormValues>,
  ) => {
    const _values = { ...values };

    const handleError = (message: string) => {
      AppToaster.show({ intent: Intent.DANGER, message });
      setSubmitting(false);
    };
    // Start upload the company logo file if it is presented.
    if (values._logoFile) {
      const formData = new FormData();
      const key = Date.now().toString();

      formData.append('file', values._logoFile);
      formData.append('internalKey', key);

      try {
        // @ts-expect-error
        const uploadedAttachmentRes = await uploadAttachments(formData);
        setSubmitting(false);

        // Adds the attachment key to the values after finishing upload.
        _values['logoKey'] = uploadedAttachmentRes?.key;
      } catch {
        handleError('An error occurred while uploading company logo.');
        setSubmitting(false);
        return;
      }
    }
    // Exclude all the private props that starts with _.
    const excludedPrivateValues = excludePrivateProps(_values);

    const __values = omit(
      excludedPrivateValues,
      ['logoUri', ...(!excludedPrivateValues.primaryColor ? ['primaryColor'] : [])],
    );
    // Update organization branding.
    // @ts-expect-error
    await updateOrganization({ ...__values });

    AppToaster.show({
      message: 'Organization branding has been updated.',
      intent: Intent.SUCCESS,
    });
  };

  return (
    <Formik
      enableReinitialize
      initialValues={formInitialValues}
      validationSchema={validationSchema}
      onSubmit={handleSubmit}
    >
      <Form style={formStyle}>{children}</Form>
    </Formik>
  );
};

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
};

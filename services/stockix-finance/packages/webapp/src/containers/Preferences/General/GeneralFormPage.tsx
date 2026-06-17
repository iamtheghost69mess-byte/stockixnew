// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import { Formik } from 'formik';
import { Intent } from '@blueprintjs/core';
import '@/style/pages/Preferences/GeneralForm.scss';
import { AppToaster } from '@/components';
import GeneralForm from './GeneralForm';
import { PreferencesGeneralSchema } from './General.schema';
import { useGeneralFormContext } from './GeneralFormProvider';
import { transformToForm, transfromToSnakeCase, transformToCamelCase } from '@/utils';

const defaultValues = {
  name: '',
  industry: '',
  location: '',
  base_currency: '',
  language: '',
  fiscal_year: '',
  date_format: '',
  timezone: '',
  display_currencies: [],
  secondary_currency: '',
};

/**
 * Preferences - General form page.
 */
export default function GeneralFormPage() {
  const { updateOrganization, organization } = useGeneralFormContext();

  const initialValues = {
    ...defaultValues,
    ...transformToForm(transfromToSnakeCase(organization?.metadata), defaultValues),
  };

  const handleFormSubmit = (values, { setSubmitting }) => {
    const onSuccess = () => {
      AppToaster.show({
        message: intl.get('preferences.general.success_message'),
        intent: Intent.SUCCESS,
      });
      setSubmitting(false);

      if (organization?.metadata?.language !== values.language) {
        window.location.reload();
      }
    };

    const onError = () => {
      setSubmitting(false);
    };

    updateOrganization(transformToCamelCase(values)).then(onSuccess).catch(onError);
  };

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={PreferencesGeneralSchema}
      onSubmit={handleFormSubmit}
      component={GeneralForm}
      enableReinitialize
    />
  );
}

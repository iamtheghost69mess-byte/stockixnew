// @ts-nocheck
import React from 'react';
import { Formik } from 'formik';
import { FormattedMessage as T } from '@/components';
import { x } from '@xstyled/emotion';

import SetupOrganizationForm from './SetupOrganizationForm';

import { useOrganizationSetup } from '@/hooks/query';
import { withSettingsActions } from '@/containers/Settings/withSettingsActions';

import { getSetupOrganizationValidation } from './SetupOrganization.schema';
import { setCookie, compose, transfromToSnakeCase } from '@/utils';

// Detect browser timezone and locale for sensible defaults.
function detectBrowserDefaults() {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    const timezone = resolved.timeZone ?? '';
    // Derive country code and currency from locale subtag (e.g. "en-US" → "US" / "USD").
    const localeParts = (resolved.locale ?? navigator?.language ?? 'en').split('-');
    const countryCode = localeParts.length >= 2 ? localeParts[localeParts.length - 1].toUpperCase() : '';
    const COUNTRY_CURRENCY_MAP = {
      US: 'USD', GB: 'GBP', EU: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR',
      IT: 'EUR', NL: 'EUR', BE: 'EUR', PT: 'EUR', AT: 'EUR', FI: 'EUR',
      JP: 'JPY', CN: 'CNY', AU: 'AUD', CA: 'CAD', CH: 'CHF', SE: 'SEK',
      NO: 'NOK', DK: 'DKK', NZ: 'NZD', SG: 'SGD', HK: 'HKD', IN: 'INR',
      BR: 'BRL', MX: 'MXN', ZA: 'ZAR', AE: 'AED', SA: 'SAR', LB: 'LBP',
      EG: 'EGP', KW: 'KWD', QA: 'QAR', OM: 'OMR', JO: 'JOD', MA: 'MAD',
    };
    return {
      timezone,
      location: countryCode,
      baseCurrency: COUNTRY_CURRENCY_MAP[countryCode] ?? '',
    };
  } catch {
    return { timezone: '', location: '', baseCurrency: '' };
  }
}

const browserDefaults = detectBrowserDefaults();

// Initial values.
const defaultValues = {
  name: '',
  industry: '',
  location: browserDefaults.location,
  baseCurrency: browserDefaults.baseCurrency,
  language: 'en',
  fiscalYear: '',
  timezone: browserDefaults.timezone,
  dateFormat: 'DD MMM YYYY',
};

/**
 * Setup organization form.
 */
function SetupOrganizationPage({ wizard }) {
  const { mutateAsync: organizationSetupMutate } = useOrganizationSetup();

  // Validation schema.
  const validationSchema = getSetupOrganizationValidation();

  // Initialize values.
  const initialValues = {
    ...defaultValues,
  };

  // Handle the form submit.
  const handleSubmit = (values, { setSubmitting, setErrors }) => {
    organizationSetupMutate({ ...transfromToSnakeCase(values) })
      .then((response) => {
        setSubmitting(false);

        // Sets locale cookie to next boot cycle.
        setCookie('locale', values.language);
        wizard.next();
      })
      .catch((erros) => {
        setSubmitting(false);
      });
  };

  return (
    <x.div
      maxWidth={'600px'}
      w="100%"
      mx="auto"
      pt={'45px'}
      pb={'20px'}
      px={'25px'}
    >
      <Formik
        validationSchema={validationSchema}
        initialValues={initialValues}
        component={SetupOrganizationForm}
        onSubmit={handleSubmit}
      />
    </x.div>
  );
}

export default compose(withSettingsActions)(SetupOrganizationPage);

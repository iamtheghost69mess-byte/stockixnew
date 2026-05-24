// @ts-nocheck
import React, { useMemo } from 'react';
import intl from 'react-intl-universal';
import moment from 'moment';
import { Intent } from '@blueprintjs/core';
import { Formik } from 'formik';
import { AppToaster } from '@/components';
import {
  CreateExchangeRateFormSchema,
  EditExchangeRateFormSchema,
} from './ExchangeRateForm.schema';
import ExchangeRateFormContent from './ExchangeRateFormContent';
import { useExchangeRateFromContext } from './ExchangeRateFormProvider';
import { useExchangeRateLookup } from '@/hooks/query/exchangeRates';
import withDialogActions from '@/containers/Dialog/withDialogActions';
import { compose, transformToForm } from '@/utils';

const defaultInitialValues = {
  exchange_rate: '',
  currency_code: '',
  date: moment(new Date()).format('YYYY-MM-DD'),
};

function ExchangeRateForm({ closeDialog }) {
  const {
    createExchangeRateMutate,
    editExchangeRateMutate,
    isNewMode,
    dialogName,
    exchangeRate,
    currencyCode,
    switchToEditMode,
  } = useExchangeRateFromContext();

  const { mutateAsync: lookupMutate } = useExchangeRateLookup();

  const validationSchema = isNewMode
    ? CreateExchangeRateFormSchema
    : EditExchangeRateFormSchema;

  const initialValues = useMemo(
    () => ({
      ...defaultInitialValues,
      ...(currencyCode ? { currency_code: currencyCode } : {}),
      ...transformToForm(exchangeRate, defaultInitialValues),
    }),
    // Re-compute when mode flips or the pre-filled currency changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exchangeRate, currencyCode],
  );

  const handleFormSubmit = (values, { setSubmitting, setErrors }) => {
    setSubmitting(true);

    const afterSubmit = () => closeDialog(dialogName);

    const onSuccess = () => {
      AppToaster.show({
        message: intl.get(
          isNewMode
            ? 'the_exchange_rate_has_been_created_successfully'
            : 'the_exchange_rate_has_been_edited_successfully',
        ),
        intent: Intent.SUCCESS,
      });
      afterSubmit();
    };

    const onError = (error) => {
      const errors = error?.response?.data?.errors ?? [];

      // A rate for this currency+date already exists — auto-switch to edit mode.
      if (errors.find((e) => e.type === 'EXCHANGE.RATE.PERIOD.EXISTS')) {
        lookupMutate({ currencyCode: values.currency_code, date: values.date })
          .then(({ data }) => {
            if (data?.exchange_rate) {
              switchToEditMode(data.exchange_rate);
              AppToaster.show({
                message: intl.get('exchange_rate_period_exists_editing'),
                intent: Intent.PRIMARY,
              });
            }
          })
          .catch(() => {
            setErrors({
              exchange_rate: intl.get(
                'there_is_exchange_rate_in_this_date_with_the_same_currency',
              ),
            });
          });
        setSubmitting(false);
        return;
      }

      setErrors({
        exchange_rate: intl.get(
          'there_is_exchange_rate_in_this_date_with_the_same_currency',
        ),
      });
      setSubmitting(false);
    };

    if (isNewMode) {
      createExchangeRateMutate(values).then(onSuccess).catch(onError);
    } else {
      editExchangeRateMutate([exchangeRate.id, values])
        .then(onSuccess)
        .catch(onError);
    }
  };

  return (
    <Formik
      validationSchema={validationSchema}
      initialValues={initialValues}
      onSubmit={handleFormSubmit}
      enableReinitialize
    >
      <ExchangeRateFormContent />
    </Formik>
  );
}

export default compose(withDialogActions)(ExchangeRateForm);

// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import styled from 'styled-components';
import classNames from 'classnames';
import { Form } from 'formik';
import { Button, FormGroup, Intent } from '@blueprintjs/core';
import { TimezonePicker } from '@blueprintjs/timezone';
import { ErrorMessage, FastField } from 'formik';
import { useHistory } from 'react-router-dom';

import {
  FieldRequiredHint,
  FormattedMessage as T,
  FFormGroup,
  FInputGroup,
  FSelect,
} from '@/components';
import { MenuItem } from '@blueprintjs/core';
import { FMultiSelect } from '@/components/Forms/BlueprintFormik';
import { inputIntent } from '@/utils';
import { CLASSES } from '@/constants/classes';
import { getAllCurrenciesOptions } from '@/constants/currencies';
import { getFiscalYear } from '@/constants/fiscalYearOptions';
import { getLanguages } from '@/constants/languagesOptions';
import { useGeneralFormContext } from './GeneralFormProvider';
import { getAllCountries } from '@stockix/utils';

import { shouldBaseCurrencyUpdate } from './utils';

const Countries = getAllCountries();

const getCurrencyCode = (item) => {
  if (typeof item === 'string') return item;
  return item?.currency_code || item?.key || '';
};

/**
 * Preferences general form.
 */
export default function PreferencesGeneralForm({ isSubmitting, values, setFieldValue }) {
  const history = useHistory();

  const FiscalYear = getFiscalYear();
  const Languages = getLanguages();
  const Currencies = getAllCurrenciesOptions();

  const { dateFormats, baseCurrencyMutateAbility, currencies } = useGeneralFormContext();
  
  // Format global currencies as items compatible with our accessors
  const globalCurrencies = Currencies.map((c) => ({
    currency_code: c.key,
    currency_name: c.name,
  })).filter((c) => c.currency_code !== values.base_currency);

  const baseCurrencyDisabled = (Array.isArray(baseCurrencyMutateAbility) ? baseCurrencyMutateAbility : []).length > 0;

  // Sync display_currencies to always be an array to prevent Blueprint's MultiSelect crash.
  React.useEffect(() => {
    if (!Array.isArray(values.display_currencies)) {
      setFieldValue('display_currencies', []);
    }
  }, [values.display_currencies, setFieldValue]);

  // Handle close click.
  const handleCloseClick = () => {
    history.go(-1);
  };

  return (
    <Form>
      {/* ---------- Organization name ----------  */}
      <FFormGroup
        name={'name'}
        label={<T id={'organization_name'} />}
        labelInfo={<FieldRequiredHint />}
        inline={true}
        helperText={<T id={'shown_on_sales_forms_and_purchase_orders'} />}
        fastField={true}
      >
        <FInputGroup medium={'true'} name={'name'} fastField={true} />
      </FFormGroup>

      {/* ---------- Industry ----------  */}
      <FFormGroup
        name={'industry'}
        label={<T id={'organization_industry'} />}
        inline={true}
        fastField={true}
      >
        <FInputGroup name={'industry'} medium={'true'} fastField={true} />
      </FFormGroup>

      {/* ---------- Location ---------- */}
      <FFormGroup
        name={'location'}
        label={<T id={'business_location'} />}
        inline={true}
        fastField={true}
      >
        <FSelect
          name={'location'}
          items={Countries}
          valueAccessor={'countryCode'}
          labelAccessor={'countryCode'}
          textAccessor={'name'}
          placeholder={<T id={'select_business_location'} />}
          popoverProps={{ minimal: true }}
          fastField={true}
        />
      </FFormGroup>

      {/* ----------  Base currency ----------  */}
      <FFormGroup
        name={'base_currency'}
        baseCurrencyDisabled={baseCurrencyDisabled}
        label={<T id={'base_currency'} />}
        labelInfo={<FieldRequiredHint />}
        inline={true}
        helperText={
          <T
            id={'you_can_t_change_the_base_currency_as_there_are_transactions'}
          />
        }
        fastField={true}
        shouldUpdate={shouldBaseCurrencyUpdate}
      >
        <FSelect
          name={'base_currency'}
          items={Currencies}
          valueAccessor={'key'}
          textAccessor={'name'}
          labelAccessor={'key'}
          placeholder={<T id={'select_base_currency'} />}
          popoverProps={{ minimal: true }}
          disabled={baseCurrencyDisabled}
          fastField={true}
          shouldUpdate={shouldBaseCurrencyUpdate}
          baseCurrencyDisabled={baseCurrencyDisabled}
        />
      </FFormGroup>

      {/* ----------  Secondary currency ----------  */}
      <FFormGroup
        name={'secondary_currency'}
        label={<T id={'secondary_currency'} />}
        inline={true}
        helperText={<T id={'secondary_currency_helper'} />}
      >
        <SecondaryCurrencyRow>
          <SecondaryCurrencySelectWrap>
            <FSelect
              name={'secondary_currency'}
              items={globalCurrencies}
              valueAccessor={(item) => item?.currency_code}
              labelAccessor={(item) => item?.currency_code}
              textAccessor={(item) =>
                item ? `${item.currency_name} (${item.currency_code})` : ''
              }
              placeholder={<T id={'select_secondary_currency'} />}
              popoverProps={{ minimal: true }}
              filterable={true}
              disabled={!globalCurrencies.length}
            />
          </SecondaryCurrencySelectWrap>
          {values.secondary_currency ? (
            <Button
              minimal
              small
              icon="cross"
              onClick={() => setFieldValue('secondary_currency', '')}
              title={intl.get('clear')}
            />
          ) : null}
        </SecondaryCurrencyRow>
      </FFormGroup>

      {/* ---------- Display Currencies (moved here for prominence, near secondary currency) ---------- */}
      {globalCurrencies.length > 0 && Array.isArray(values.display_currencies) && (
        <FFormGroup
          name={'display_currencies'}
          label={'Display Currencies'}
          inline={true}
          helperText={'Currencies shown as extra columns on reports and transaction forms. Enter exchange rates manually via Preferences → Currencies.'}
          fastField={false}
        >
          <FMultiSelect
            name={'display_currencies'}
            items={globalCurrencies}
            valueAccessor={(item) => item.currency_code}
            labelAccessor={(item) => item.currency_code}
            tagRenderer={getCurrencyCode}
            itemRenderer={(item, { handleClick, modifiers }, { isSelected }) => (
              <MenuItem
                key={item.currency_code}
                active={modifiers.active}
                icon={isSelected ? 'tick' : 'blank'}
                text={item.currency_name}
                label={item.currency_code}
                onClick={handleClick}
              />
            )}
            itemPredicate={(query, item) => {
              const q = query.toLowerCase();
              return (
                item.currency_code.toLowerCase().includes(q) ||
                item.currency_name.toLowerCase().includes(q)
              );
            }}
            popoverProps={{ minimal: true }}
            placeholder={intl.get('select_display_currencies')}
          />
        </FFormGroup>
      )}

      {/* --------- Fiscal Year ----------- */}
      <FFormGroup
        name={'fiscal_year'}
        label={<T id={'fiscal_year'} />}
        labelInfo={<FieldRequiredHint />}
        inline={true}
        helperText={<T id={'for_reporting_you_can_specify_any_month'} />}
        fastField={true}
      >
        <FSelect
          name={'fiscal_year'}
          items={FiscalYear}
          valueAccessor={'key'}
          textAccessor={'name'}
          placeholder={<T id={'select_fiscal_year'} />}
          popoverProps={{ minimal: true }}
          fastField={true}
        />
      </FFormGroup>

      {/* ---------- Language ---------- */}
      <FormGroup
        name={'language'}
        label={<T id={'language'} />}
        labelInfo={<FieldRequiredHint />}
        inline={true}
        fastField={true}
      >
        <FSelect
          name={'language'}
          items={Languages}
          valueAccessor={'value'}
          textAccessor={'name'}
          placeholder={<T id={'select_language'} />}
          popoverProps={{ minimal: true }}
          fastField={true}
        />
      </FormGroup>

      {/* ----------  Time zone ----------  */}
      <FastField name={'timezone'}>
        {({ form, field: { value }, meta: { error, touched } }) => (
          <FormGroup
            label={<T id={'time_zone'} />}
            labelInfo={<FieldRequiredHint />}
            inline={true}
            className={classNames(
              'form-group--time-zone',
              CLASSES.FORM_GROUP_LIST_SELECT,
              CLASSES.FILL,
            )}
            intent={inputIntent({ error, touched })}
            helperText={<ErrorMessage name="timezone" />}
          >
            <TimezonePicker
              value={value}
              onChange={(timezone) => {
                form.setFieldValue('timezone', timezone);
              }}
              valueDisplayFormat="composite"
              placeholder={<T id={'select_time_zone'} />}
            />
          </FormGroup>
        )}
      </FastField>

      {/* --------- Data format ----------- */}
      <FFormGroup
        name={'date_format'}
        label={<T id={'date_format'} />}
        labelInfo={<FieldRequiredHint />}
        inline={true}
        helperText={<ErrorMessage name="date_format" />}
        fastField={true}
      >
        <FSelect
          name={'date_format'}
          items={dateFormats}
          valueAccessor={'key'}
          textAccessor={'label'}
          placeholder={<T id={'select_date_format'} />}
          popoverProps={{ minimal: true }}
          fastField={true}
        />
      </FFormGroup>

      <CardFooterActions>
        <Button loading={isSubmitting} intent={Intent.PRIMARY} type="submit">
          <T id={'save'} />
        </Button>
        <Button onClick={handleCloseClick}>
          <T id={'close'} />
        </Button>
      </CardFooterActions>
    </Form>
  );
}

const CardFooterActions = styled.div`
  padding-top: 16px;
  border-top: 1px solid #e0e7ea;
  margin-top: 30px;

  .bp3-button {
    min-width: 70px;

    + .bp3-button {
      margin-left: 10px;
    }
  }
`;

const SecondaryCurrencyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const SecondaryCurrencySelectWrap = styled.div`
  flex: 1;
`;

// @ts-nocheck
import * as Yup from 'yup';
import intl from 'react-intl-universal';

const Schema = Yup.object().shape({
  name: Yup.string()
    .required()
    .label(intl.get('organization_name_')),
  industry: Yup.string()
    .nullable()
    .label(intl.get('organization_industry_')),
  location: Yup.string()
    .nullable()
    .label(intl.get('location')),
  base_currency: Yup.string()
    .required()
    .label(intl.get('base_currency_')),
  fiscal_year: Yup.string()
    .required()
    .label(intl.get('fiscal_year_')),
  language: Yup.string()
    .required()
    .label(intl.get('language')),
  timezone: Yup.string()
    .required()
    .label(intl.get('time_zone_')),
  date_format: Yup.string()
    .required()
    .label(intl.get('date_format_')),
  display_currencies: Yup.array().of(Yup.string()).nullable(),
  secondary_currency: Yup.string()
    .nullable()
    .notOneOf(
      [Yup.ref('base_currency')],
      intl.get('secondary_currency_must_differ_from_base'),
    ),
});

export const PreferencesGeneralSchema = Schema;

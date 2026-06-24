// @ts-nocheck
import * as Yup from 'yup';

export const CreateExchangeRateFormSchema = Yup.object().shape({
  date: Yup.date().required().label('date'),
  currency_code: Yup.string().required().label('currency_code'),
  exchange_rate: Yup.number().required().min(0).label('exchange_rate'),
});

export const EditExchangeRateFormSchema = Yup.object().shape({
  exchange_rate: Yup.number().required().min(0).label('exchange_rate'),
});

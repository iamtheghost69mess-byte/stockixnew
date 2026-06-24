// @ts-nocheck
import * as Yup from 'yup';
import intl from 'react-intl-universal';
import { DATATYPES_LENGTH } from '@/constants/dataTypes';

const Schema = Yup.object().shape({
  date: Yup.date().required().label(intl.get('date')),
  type: Yup.string().required(),
  adjustment_account_id: Yup.string()
    .required()
    .label(intl.get('adjustment_account')),
  item_id: Yup.number().required(),
  reason: Yup.string()
    .required()
    .min(3)
    .max(DATATYPES_LENGTH.TEXT)
    .label(intl.get('reason')),
  quantity_on_hand: Yup.number().required().label(intl.get('qty')),
  quantity: Yup.number().integer().min(1).required(),
  cost: Yup.number().when(['type'], {
    is: (type) => type === 'increment',
    then: Yup.number().required(),
  }),
  reference_no: Yup.string(),
  new_quantity: Yup.number().required(),
  publish: Yup.boolean(),
  branch_id: Yup.string(),
  warehouse_id: Yup.string(),
  currency_code: Yup.string(),
  exchange_rate: Yup.number()
    .when('currency_code', {
      is: (val) => val && val.length > 0,
      then: Yup.number()
        .positive('Exchange rate must be greater than zero.')
        .required('Exchange rate is required for foreign currency adjustments.'),
      otherwise: Yup.number().min(0),
    }),
});

export const CreateInventoryAdjustmentFormSchema = Schema;

// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import styled from 'styled-components';
import classNames from 'classnames';
import { useFormikContext } from 'formik';
import { Classes, FormGroup, Position } from '@blueprintjs/core';
import {
  FFormGroup,
  FormattedMessage as T,
  FDateInput,
  FInputGroup,
  FTextArea,
  FSelect,
  ExchangeRateInputGroup,
} from '@/components';
import { useAutofocus } from '@/hooks';
import {
  FieldRequiredHint,
  Col,
  Row,
  FeatureCan,
  BranchSelect,
  WarehouseSelect,
  FAccountsSuggestField,
} from '@/components';
import { momentFormatter, toSafeNumber } from '@/utils';
import { Features, CLASSES } from '@/constants';

import { useInventoryAdjContext } from './InventoryAdjustmentFormProvider';
import { useFeatureCan } from '@/hooks/state';
import { useCurrentOrganization, useCurrencies } from '@/hooks/state';

import InventoryAdjustmentQuantityFields from './InventoryAdjustmentQuantityFields';
import {
  diffQuantity,
  useSetPrimaryBranchToForm,
  useSetPrimaryWarehouseToForm,
  useGetAdjustmentTypeOptions,
} from './utils';

/**
 * Inventory adjustment form dialogs fields.
 */
export default function InventoryAdjustmentFormDialogFields() {
  // Features guard.
  const { featureCan } = useFeatureCan();

  // Retrieves memorized adjustment types options.
  const adjustmentTypes = useGetAdjustmentTypeOptions();

  const dateFieldRef = useAutofocus();

  // Inventory adjustment dialog context.
  const { accounts, branches, warehouses } = useInventoryAdjContext();
  const { values, setFieldValue } = useFormikContext();

  // Currency support.
  const currentOrg = useCurrentOrganization();
  const { data: currencies } = useCurrencies();
  const baseCurrency = currentOrg?.base_currency ?? '';
  const isForeignCurrency = values.currency_code && values.currency_code !== baseCurrency;

  // Sets the primary warehouse to form.
  useSetPrimaryWarehouseToForm();

  // Sets the primary branch to form.
  useSetPrimaryBranchToForm();

  // Handle adjustment type change.
  const handleAdjustmentTypeChange = (type) => {
    const result = diffQuantity(
      toSafeNumber(values.quantity),
      toSafeNumber(values.quantity_on_hand),
      type.value,
    );
    setFieldValue('type', type.value);
    setFieldValue('new_quantity', result);
  };

  return (
    <div className={Classes.DIALOG_BODY}>
      <Row>
        <FeatureCan feature={Features.Branches}>
          <Col xs={5}>
            <FormGroup
              label={<T id={'branch'} />}
              fill
            >
              <BranchSelect
                name={'branch_id'}
                branches={branches}
                popoverProps={{ minimal: true }}
              />
            </FormGroup>
          </Col>
        </FeatureCan>
        <FeatureCan feature={Features.Warehouses}>
          <Col xs={5}>
            <FormGroup
              label={<T id={'warehouse'} />}
              fill
            >
              <WarehouseSelect
                name={'warehouse_id'}
                warehouses={warehouses}
                popoverProps={{ minimal: true }}
              />
            </FormGroup>
          </Col>
        </FeatureCan>
      </Row>

      {featureCan(Features.Warehouses) && featureCan(Features.Branches) && (
        <FeatureRowDivider />
      )}

      <Row>
        <Col xs={5}>
          {/*------------ Date -----------*/}
          <FFormGroup
            name={'date'}
            label={<T id={'date'} />}
            labelInfo={<FieldRequiredHint />}
            fill
            fastField
          >
            <FDateInput
              name={'date'}
              {...momentFormatter('YYYY/MM/DD')}
              popoverProps={{
                position: Position.BOTTOM,
                minimal: true,
              }}
              inputRef={(ref) => (dateFieldRef.current = ref)}
              fastField
            />
          </FFormGroup>
        </Col>

        <Col xs={5}>
          {/*------------ Adjustment type -----------*/}
          <FFormGroup
            name={'type'}
            label={<T id={'adjustment_type'} />}
            labelInfo={<FieldRequiredHint />}
            fill
            fastField
          >
            <FSelect
              name={'type'}
              items={adjustmentTypes}
              onItemChange={handleAdjustmentTypeChange}
              filterable={false}
              valueAccessor={'value'}
              textAccessor={'name'}
              popoverProps={{ minimal: true }}
              fastField
            />
          </FFormGroup>
        </Col>
      </Row>

      <InventoryAdjustmentQuantityFields />

      {/*------------ Adjustment account -----------*/}
      <FFormGroup
        name={'adjustment_account_id'}
        label={<T id={'adjustment_account'} />}
        labelInfo={<FieldRequiredHint />}
        fill
      >
        <FAccountsSuggestField
          name={'adjustment_account_id'}
          items={accounts}
          inputProps={{
            placeholder: intl.get('select_adjustment_account'),
          }}
          fill
          fastField
        />
      </FFormGroup>

      {/*------------ Reference -----------*/}
      <FFormGroup
        name={'reference_no'}
        label={<T id={'reference_no'} />}
        fastField
      >
        <FInputGroup name={'reference_no'} fastField />
      </FFormGroup>

      {/*------------ Currency -----------*/}
      <Row>
        <Col xs={5}>
          <FFormGroup
            name={'currency_code'}
            label={<T id={'currency'} />}
            fill
            fastField
          >
            <FSelect
              name={'currency_code'}
              items={currencies || []}
              valueAccessor={'currency_code'}
              textAccessor={'currency_code'}
              labelAccessor={'currency_code'}
              popoverProps={{ minimal: true }}
              fill
              fastField
            />
          </FFormGroup>
        </Col>

        {isForeignCurrency && (
          <Col xs={5}>
            <FFormGroup
              name={'exchange_rate'}
              label={<T id={'exchange_rate'} />}
              fill
              fastField
            >
              <ExchangeRateInputGroup
                name={'exchange_rate'}
                fromCurrency={values.currency_code}
                toCurrency={baseCurrency}
                formGroupProps={{ label: ' ', inline: false }}
              />
            </FFormGroup>
          </Col>
        )}
      </Row>

      {/*------------ Adjustment reasons -----------*/}
      <FFormGroup
        name={'reason'}
        label={<T id={'adjustment_reasons'} />}
        labelInfo={<FieldRequiredHint />}
        fill
        fastField
      >
        <FTextArea name={'reason'} growVertically large fastField fill />
      </FFormGroup>
    </div>
  );
}

export const FeatureRowDivider = styled.div`
  --x-color-background: #e9e9e9;
  .bp4-dark & {
    --x-color-background: rgba(255, 255, 255, 0.1);
  }
  height: 2px;
  background: var(--x-color-background);
  margin-bottom: 15px;
`;

// @ts-nocheck
import React from 'react';
import styled from 'styled-components';
import { ControlGroup } from '@blueprintjs/core';

import { FlagIcon } from '../Tags';
import { FFormGroup } from '../Forms';
import { InverseExchangeRateInput } from './InverseExchangeRateInput';

export function ExchangeRateInputGroup({
  fromCurrency,
  toCurrency,
  inputGroupProps,
  formGroupProps,
  name,
}) {
  const displayFrom = toCurrency; 
  const displayTo = fromCurrency;

  return (
    <FFormGroup inline={true} {...formGroupProps} name={name}>
      <ControlGroup>
        <ExchangeRatePrepend>
          <ExchangeFlagIcon currencyCode={displayFrom} /> 1 {displayFrom} =
        </ExchangeRatePrepend>
        <ExchangeRateField
          allowDecimals={true}
          allowNegativeValue={false}
          decimalsLimit={8}
          {...inputGroupProps}
          name={name}
        />
        <ExchangeRateAppend>
          <ExchangeFlagIcon currencyCode={displayTo} /> {displayTo}
        </ExchangeRateAppend>
      </ControlGroup>
    </FFormGroup>
  );
}

const ExchangeRateField = styled(InverseExchangeRateInput)`
  max-width: 110px;
  .bp3-input {
    text-align: right;
  }
`;

const ExchangeRateSideIcon = styled.div`
  display: flex;
  align-items: center;
  font-size: 12px;
  line-height: 1;
`;

const ExchangeRatePrepend = styled(ExchangeRateSideIcon)`
  padding-right: 8px;
`;

const ExchangeRateAppend = styled(ExchangeRateSideIcon)`
  padding-left: 8px;
`;

const ExchangeFlagIcon = styled(FlagIcon)`
  margin-right: 5px;
  margin-left: 5px;
  display: inline-block;
`;

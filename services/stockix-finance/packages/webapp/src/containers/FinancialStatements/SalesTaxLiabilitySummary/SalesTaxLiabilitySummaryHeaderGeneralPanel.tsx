// @ts-nocheck
import React from 'react';
import { Row, Col, FFormGroup, FCheckbox } from '@/components';
import FinancialStatementDateRange from '../FinancialStatementDateRange';
import RadiosAccountingBasis from '../RadiosAccountingBasis';

export function SalesTaxLiabilitySummaryHeaderGeneral() {
  return (
    <div>
      <FinancialStatementDateRange />
      <RadiosAccountingBasis key={'basis'} />

      <Row>
        <Col xs={5}>
          <FFormGroup label={' '} name={'groupByCurrency'} inline fastField>
            <FCheckbox
              name={'groupByCurrency'}
              label={'Show Per-Currency Breakdown'}
              fastField
            />
          </FFormGroup>
        </Col>
      </Row>
    </div>
  );
}

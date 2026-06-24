import React from 'react';
import { InputGroup } from '@blueprintjs/core';
import { useField } from 'formik';

/**
 * A standard input for transaction-level exchange rates (Direct Quote convention).
 * Convention: "1 foreign = X base" — e.g. if foreign=EUR and base=USD, rate=1.08 means 1 EUR = 1.08 USD.
 * localAmount = foreignAmount * exchangeRate
 *
 * Do NOT confuse with the exchange_rates table, which uses Indirect Quote ("1 base = X foreign").
 * The two conventions are used in completely separate code paths and must not be mixed.
 */
export function InverseExchangeRateInput({ name, ...props }: { name: string, [key: string]: any }) {
  const [field, meta, helpers] = useField(name);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    helpers.setValue(val);
  };

  return (
    <InputGroup
      {...props}
      name={name}
      value={field.value || ''}
      onChange={handleChange}
      onBlur={() => helpers.setTouched(true)}
    />
  );
}

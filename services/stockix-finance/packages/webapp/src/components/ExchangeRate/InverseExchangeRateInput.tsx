import React from 'react';
import { InputGroup } from '@blueprintjs/core';
import { useField } from 'formik';

/**
 * A standard input for exchange rates that binds directly to the formik field.
 * Since the system now uses the Indirect Quote standard (1 Base = X Foreign) natively
 * in both frontend and backend, no inversion logic is needed.
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

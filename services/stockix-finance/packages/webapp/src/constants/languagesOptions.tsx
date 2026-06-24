// @ts-nocheck
import intl from 'react-intl-universal';

export const getLanguages = () => [
  { name: intl.get('english'), value: 'en' },
  { name: intl.get('arabic'), value: 'ar' },
  { name: intl.get('spanish'), value: 'es' },
  { name: intl.get('swedish'), value: 'sv' },
];

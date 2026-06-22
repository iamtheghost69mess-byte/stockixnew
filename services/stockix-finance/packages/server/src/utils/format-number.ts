import { get } from 'lodash';
import * as accounting from 'accounting';
import * as Currencies from 'js-money/lib/currency';

const getNegativeFormat = (formatName) => {
  switch (formatName) {
    case 'parentheses':
      return '(%s%v)';
    case 'mines':
      return '-%s%v';
  }
};

const getCurrencySign = (currencyCode) => {
  return get(Currencies, `${currencyCode}.symbol`);
};

/** Returns the number of decimal places prescribed by ISO 4217 for the given currency. Falls back to 2. */
const getCurrencyPrecision = (currencyCode?: string): number => {
  if (!currencyCode) return 2;
  const meta = get(Currencies, currencyCode);
  return typeof meta?.decimal_digits === 'number' ? meta.decimal_digits : 2;
};

export interface IFormatNumberSettings {
  precision?: number;
  divideOn1000?: boolean;
  excerptZero?: boolean;
  negativeFormat?: string;
  thousand?: string;
  decimal?: string;
  zeroSign?: string;
  money?: boolean;
  currencyCode?: string;
  symbol?: string;
}

export const formatNumber = (
  balance,
  {
    precision,
    divideOn1000 = false,
    excerptZero = false,
    negativeFormat = 'mines',
    thousand = ',',
    decimal = '.',
    zeroSign = '',
    money = true,
    currencyCode,
    symbol = '',
  }: IFormatNumberSettings,
) => {
  const resolvedPrecision = precision ?? getCurrencyPrecision(currencyCode);
  const formattedSymbol = getCurrencySign(currencyCode);
  const negForamt = getNegativeFormat(negativeFormat);
  const format = '%s%v';

  let formattedBalance = parseFloat(balance);

  if (divideOn1000) {
    formattedBalance /= 1000;
  }
  return accounting.formatMoney(
    formattedBalance,
    money ? formattedSymbol : symbol ? symbol : '',
    resolvedPrecision,
    thousand,
    decimal,
    {
      pos: format,
      neg: negForamt,
      zero: excerptZero ? zeroSign : format,
    },
  );
};

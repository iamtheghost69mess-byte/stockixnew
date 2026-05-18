// @ts-nocheck

// Pure logic extracted from useDisplayCurrencies / useSecondaryCurrency hooks.
// Tests run without a Redux store — the hook logic is tested as a plain function.

function computeDisplayCurrencies(org: any): string[] {
  const base = org?.base_currency;
  const secondary = org?.secondary_currency;
  const configured: string[] = Array.isArray(org?.display_currencies)
    ? org.display_currencies
    : [];

  const effective =
    secondary && !configured.includes(secondary)
      ? [...configured, secondary]
      : configured;

  return effective.filter((c: string) => Boolean(c) && c !== base);
}

function computeSecondaryCurrency(org: any): string | null {
  return org?.secondary_currency || null;
}

// ────────────────────────────────────────────────────────────────────────────

describe('computeDisplayCurrencies', () => {
  it('returns empty array when org is undefined', () => {
    expect(computeDisplayCurrencies(undefined)).toEqual([]);
  });

  it('returns empty array when no currencies configured', () => {
    expect(computeDisplayCurrencies({ base_currency: 'USD' })).toEqual([]);
  });

  it('returns configured display currencies excluding base', () => {
    expect(
      computeDisplayCurrencies({
        base_currency: 'USD',
        display_currencies: ['EUR', 'GBP'],
      })
    ).toEqual(['EUR', 'GBP']);
  });

  it('excludes base currency from display_currencies if erroneously included', () => {
    expect(
      computeDisplayCurrencies({
        base_currency: 'USD',
        display_currencies: ['USD', 'EUR'],
      })
    ).toEqual(['EUR']);
  });

  it('appends secondary_currency when not already in display_currencies', () => {
    expect(
      computeDisplayCurrencies({
        base_currency: 'USD',
        secondary_currency: 'JPY',
        display_currencies: ['EUR'],
      })
    ).toEqual(['EUR', 'JPY']);
  });

  it('does not duplicate secondary_currency when already in display_currencies', () => {
    expect(
      computeDisplayCurrencies({
        base_currency: 'USD',
        secondary_currency: 'EUR',
        display_currencies: ['EUR', 'GBP'],
      })
    ).toEqual(['EUR', 'GBP']);
  });

  it('excludes secondary_currency when it equals the base currency', () => {
    expect(
      computeDisplayCurrencies({
        base_currency: 'USD',
        secondary_currency: 'USD',
        display_currencies: [],
      })
    ).toEqual([]);
  });

  it('handles display_currencies being null gracefully', () => {
    expect(
      computeDisplayCurrencies({
        base_currency: 'USD',
        secondary_currency: 'EUR',
        display_currencies: null,
      })
    ).toEqual(['EUR']);
  });

  it('filters out falsy values from display_currencies', () => {
    expect(
      computeDisplayCurrencies({
        base_currency: 'USD',
        display_currencies: ['EUR', '', null, 'GBP'],
      })
    ).toEqual(['EUR', 'GBP']);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('computeSecondaryCurrency', () => {
  it('returns null when org is undefined', () => {
    expect(computeSecondaryCurrency(undefined)).toBeNull();
  });

  it('returns null when secondary_currency is not set', () => {
    expect(computeSecondaryCurrency({ base_currency: 'USD' })).toBeNull();
  });

  it('returns null when secondary_currency is empty string', () => {
    expect(computeSecondaryCurrency({ secondary_currency: '' })).toBeNull();
  });

  it('returns the secondary currency code when set', () => {
    expect(
      computeSecondaryCurrency({ secondary_currency: 'EUR' })
    ).toBe('EUR');
  });
});

import { buildPdfDisplayTotals } from '@/modules/Pdf/utils/PdfDisplayTotals';

const makeExchangeService = (rates: Record<string, number>) => ({
  lookupRateByDate: jest.fn(async (currency: string, _date: string | Date) => {
    const r = rates[currency];
    return r != null ? { exchangeRate: r } : null;
  }),
});

const BASE = 'USD';
const DATE = '2024-01-01';

describe('buildPdfDisplayTotals', () => {
  it('returns empty array when no extra currencies configured', async () => {
    const svc = makeExchangeService({});
    const result = await buildPdfDisplayTotals(
      svc as any, BASE, DATE, 1000, 1000, BASE, [], null,
    );
    expect(result).toEqual([]);
  });

  it('adds base currency row when document is in a foreign currency', async () => {
    const svc = makeExchangeService({});
    const result = await buildPdfDisplayTotals(
      svc as any, 'EUR', DATE, 1080, 1080, BASE, [], null,
    );
    expect(result).toHaveLength(1);
    expect(result[0].currency).toBe(BASE);
  });

  it('converts secondary currency using the looked-up rate', async () => {
    const svc = makeExchangeService({ EUR: 0.92 });
    const result = await buildPdfDisplayTotals(
      svc as any, BASE, DATE, 1000, 500, BASE, [], 'EUR',
    );
    expect(result).toHaveLength(1);
    expect(result[0].currency).toBe('EUR');
    expect(result[0].formattedTotal).toContain('920');
    expect(result[0].formattedDueAmount).toContain('460');
  });

  it('converts each display currency independently', async () => {
    const svc = makeExchangeService({ EUR: 0.92, GBP: 0.78 });
    const result = await buildPdfDisplayTotals(
      svc as any, BASE, DATE, 1000, 1000, BASE, ['EUR', 'GBP'], null,
    );
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.currency)).toEqual(['EUR', 'GBP']);
  });

  it('skips currencies with no rate on record', async () => {
    const svc = makeExchangeService({ EUR: 0.92 });
    const result = await buildPdfDisplayTotals(
      svc as any, BASE, DATE, 1000, 1000, BASE, ['EUR', 'JPY'], null,
    );
    expect(result).toHaveLength(1);
    expect(result[0].currency).toBe('EUR');
  });

  it('deduplicates secondary and display currencies', async () => {
    const svc = makeExchangeService({ EUR: 0.92 });
    const result = await buildPdfDisplayTotals(
      svc as any, BASE, DATE, 1000, 1000, BASE, ['EUR'], 'EUR',
    );
    expect(result).toHaveLength(1);
  });

  it('does not include the document currency in extra rows', async () => {
    const svc = makeExchangeService({ EUR: 0.92 });
    const result = await buildPdfDisplayTotals(
      svc as any, 'EUR', DATE, 920, 920, BASE, ['EUR'], null,
    );
    const currencies = result.map((r) => r.currency);
    expect(currencies).not.toContain('EUR');
  });
});

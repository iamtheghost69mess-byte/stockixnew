import { buildPdfDisplayTotals } from '@/services/PDF/PdfDisplayTotals';

const makeExchangeService = (rates: Record<string, number>) => ({
  lookupRateByDate: jest.fn(async (_tenantId, currency, _date) => {
    const r = rates[currency];
    return r != null ? { exchangeRate: r } : null;
  }),
});

const BASE = 'USD';
const TENANT = 1;
const DATE = '2024-01-01';

describe('buildPdfDisplayTotals', () => {
  it('returns empty array when no extra currencies configured', async () => {
    const svc = makeExchangeService({});
    const result = await buildPdfDisplayTotals(
      svc as any, TENANT, BASE, DATE, 1000, 1000, BASE, [], null
    );
    expect(result).toEqual([]);
  });

  it('adds base currency row when document is in a foreign currency', async () => {
    const svc = makeExchangeService({});
    const result = await buildPdfDisplayTotals(
      svc as any, TENANT, 'EUR', DATE, 1080, 1080, BASE, [], null
    );
    expect(result).toHaveLength(1);
    expect(result[0].currency).toBe(BASE);
  });

  it('converts secondary currency using the looked-up rate', async () => {
    const svc = makeExchangeService({ EUR: 0.92 });
    const result = await buildPdfDisplayTotals(
      svc as any, TENANT, BASE, DATE, 1000, 500, BASE, [], 'EUR'
    );
    expect(result).toHaveLength(1);
    expect(result[0].currency).toBe('EUR');
    // 1000 * 0.92 = 920
    expect(result[0].formattedTotal).toContain('920');
    // 500 * 0.92 = 460
    expect(result[0].formattedDueAmount).toContain('460');
  });

  it('converts each display currency independently', async () => {
    const svc = makeExchangeService({ EUR: 0.92, GBP: 0.78 });
    const result = await buildPdfDisplayTotals(
      svc as any, TENANT, BASE, DATE, 1000, 1000, BASE, ['EUR', 'GBP'], null
    );
    expect(result).toHaveLength(2);
    expect(result.map((r: any) => r.currency)).toEqual(['EUR', 'GBP']);
  });

  it('skips currencies with no rate on record', async () => {
    const svc = makeExchangeService({ EUR: 0.92 });
    const result = await buildPdfDisplayTotals(
      svc as any, TENANT, BASE, DATE, 1000, 1000, BASE, ['EUR', 'JPY'], null
    );
    expect(result).toHaveLength(1);
    expect(result[0].currency).toBe('EUR');
  });

  it('deduplicates secondary and display currencies', async () => {
    const svc = makeExchangeService({ EUR: 0.92 });
    const result = await buildPdfDisplayTotals(
      svc as any, TENANT, BASE, DATE, 1000, 1000, BASE, ['EUR'], 'EUR'
    );
    // EUR appears in both secondary and display — should only render once
    expect(result).toHaveLength(1);
  });

  it('does not include the document currency in extra rows', async () => {
    const svc = makeExchangeService({ EUR: 0.92 });
    const result = await buildPdfDisplayTotals(
      svc as any, TENANT, 'EUR', DATE, 920, 920, BASE, ['EUR'], null
    );
    // EUR is the doc currency — should not appear as an extra row
    const currencies = result.map((r: any) => r.currency);
    expect(currencies).not.toContain('EUR');
  });
});

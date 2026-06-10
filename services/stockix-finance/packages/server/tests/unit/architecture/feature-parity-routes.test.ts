import { existsSync } from 'node:fs';
import path from 'node:path';

const serverSrc = path.resolve(__dirname, '../../../src');

const CRITICAL_DOMAIN_FILES = [
  'modules/Bills/Bills.controller.ts',
  'modules/Expenses/Expenses.controller.ts',
  'modules/Accounts/Accounts.controller.ts',
  'modules/BillLandedCosts/LandedCost.controller.ts',
  'modules/PdfTemplate/PdfTemplates.controller.ts',
  'modules/System/SystemDB/Ping.controller.ts',
  'constants/Accounts/constants.ts',
  'constants/Expenses/constants.ts',
  'constants/Purchases/constants.ts',
];

describe('feature parity — critical finance domains', () => {
  it.each(CRITICAL_DOMAIN_FILES)('keeps %s after legacy removal', (rel) => {
    expect(existsSync(path.join(serverSrc, rel))).toBe(true);
  });

  it('does not restore deleted legacy trees', () => {
    expect(existsSync(path.join(serverSrc, 'api'))).toBe(false);
    expect(existsSync(path.join(serverSrc, 'services'))).toBe(false);
    expect(existsSync(path.join(serverSrc, 'server.ts'))).toBe(false);
  });
});

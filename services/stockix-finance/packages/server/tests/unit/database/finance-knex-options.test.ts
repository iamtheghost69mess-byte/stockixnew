import { buildFinanceMysqlKnexOptions, parseMysqlPort } from '@/database/finance-knex-options';

describe('finance-knex-options', () => {
  describe('parseMysqlPort', () => {
    it('defaults to 6033', () => {
      expect(parseMysqlPort(undefined)).toBe(6033);
      expect(parseMysqlPort('')).toBe(6033);
    });

    it('parses valid ports', () => {
      expect(parseMysqlPort('6033')).toBe(6033);
      expect(parseMysqlPort(3306)).toBe(3306);
    });
  });

  describe('buildFinanceMysqlKnexOptions', () => {
    it('uses mysql2 client and uppercases table identifiers', () => {
      const options = buildFinanceMysqlKnexOptions({
        host: 'stockix-mysql-proxy',
        port: 6033,
        user: 'tenant_test',
        password: 'secret',
        database: 'stockix_test_system',
      });

      expect(options.client).toBe('mysql2');
      expect(options.connection).toMatchObject({
        host: 'stockix-mysql-proxy',
        port: 6033,
        database: 'stockix_test_system',
      });

      const wrapIdentifier = options.wrapIdentifier as (
        identifier: string,
        origWrap: (id: string) => string,
      ) => string;
      expect(wrapIdentifier('tenants', (id) => `\`${id}\``)).toBe('`TENANTS`');
    });
  });
});

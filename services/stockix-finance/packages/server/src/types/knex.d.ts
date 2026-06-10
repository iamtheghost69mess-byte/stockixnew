import 'knex';

declare module 'knex' {
  namespace Knex {
    interface Transaction {
      commit(): Promise<void>;
      rollback(): Promise<void>;
    }
  }
}

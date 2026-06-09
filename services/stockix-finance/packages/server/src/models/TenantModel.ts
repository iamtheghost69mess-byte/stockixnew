import { Container } from 'typedi';
import { BaseModel } from '@/models/Model';

export default class TenantModel extends BaseModel {
  /**
   * Logging all tenant databases queries.
   * @param  {...any} args 
   */
  static query(...args) {
    const Logger = Container.get('logger') as any;

    return super.query(...args).onBuildKnex((knexQueryBuilder) => {
      const userParams = (knexQueryBuilder.client.config as { userParams?: { tenantId?: number } })
        ?.userParams;

      if (!userParams?.tenantId) {
        return;
      }

      knexQueryBuilder.on('query', (queryData: { sql: string; bindings: unknown[] }) => {
        Logger.info(`[query][tenant] ${queryData.sql}`, {
          bindings: queryData.bindings,
          tenantId: userParams.tenantId,
        });
      });
    });
  }
}

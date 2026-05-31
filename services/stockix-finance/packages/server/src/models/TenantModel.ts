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
      const { userParams: { tenantId } } = (knexQueryBuilder.client.config as any);

      knexQueryBuilder.on('query', (queryData: any) => {
        Logger.info(`[query][tenant] ${queryData.sql}`, {
          bindings: queryData.bindings, tenantId
        });
      });
    });
  }
}

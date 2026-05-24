import { Knex } from 'knex';
import { Model } from 'objection';
import { Global, Module } from '@nestjs/common';
import { PlanSubscription } from '@/modules/Subscription/models/PlanSubscription';
import { TenantModel } from '@/modules/System/models/TenantModel';
import { SystemKnexConnection } from '../SystemDB/SystemDB.constants';
import { SystemModelsConnection } from './SystemModels.constants';
import { SystemUser } from '../models/SystemUser';
import UserTenant from '../models/UserTenant';
import { TenantMetadata } from '../models/TenantMetadataModel';
import { TenantLicense } from '../models/TenantLicense';
import { TenantRepository } from '../repositories/Tenant.repository';

const models = [
  SystemUser,
  UserTenant,
  PlanSubscription,
  TenantModel,
  TenantMetadata,
  TenantLicense,
];

const modelProviders = models.map((model) => {
  return {
    provide: model.name,
    useValue: model,
  };
});

export const InjectSystemModel = (model: typeof Model) => ({
  useValue: model,
  provide: model.name,
});

const providers = [
  ...modelProviders,
  {
    provide: SystemModelsConnection,
    inject: [SystemKnexConnection],
    useFactory: async (systemKnex: Knex) => {
      Model.knex(systemKnex);
    },
  },
];

@Global()
@Module({
  providers: [...providers, TenantRepository],
  exports: [...providers, TenantRepository],
})
export class SystemModelsModule {}

import Knex from 'knex';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SystemKnexConnection,
  SystemKnexConnectionConfigure,
} from './SystemDB.constants';
import { buildSystemKnexOptionsFromConfig } from '@/database/finance-knex-options';
import { SystemDatabaseController } from './SystemDB.controller';
import { PingController } from './Ping.controller';

const providers = [
  {
    provide: SystemKnexConnectionConfigure,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      buildSystemKnexOptionsFromConfig(configService, {
        pool: {
          min: 0,
          max: 7,
          acquireTimeoutMillis: 30_000,
          createTimeoutMillis: 10_000,
          idleTimeoutMillis: 30_000,
        },
        migrations: {
          directory: configService.get('systemDatabase.migrationDir'),
          loadExtensions: ['.js'],
        },
        seeds: {
          directory: configService.get('systemDatabase.seedsDir'),
        },
      }),
  },
  {
    provide: SystemKnexConnection,
    inject: [SystemKnexConnectionConfigure],
    useFactory: (knexConfig) => {
      return Knex(knexConfig);
    },
  },
];

@Global()
@Module({
  controllers: [SystemDatabaseController, PingController],
  providers: [...providers],
  exports: [...providers],
})
export class SystemDatabaseModule {}

import { Command } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseCommand } from './BaseCommand';

@Injectable()
@Command({
  name: 'system:migrate:unlock',
  description: 'Force-release a stuck knex migration lock on the system database.',
})
export class SystemMigrateUnlockCommand extends BaseCommand {
  constructor(configService: ConfigService) {
    super(configService);
  }

  async run(): Promise<void> {
    const sysKnex = this.initSystemKnex();
    try {
      await sysKnex.raw(
        'UPDATE `knex_migrations_lock` SET `is_locked` = 0 WHERE `index` = 1'
      );
      await sysKnex.destroy();
      this.success('Migration lock released.');
    } catch (error) {
      await sysKnex.destroy().catch(() => {});
      this.exit(error);
    }
  }
}

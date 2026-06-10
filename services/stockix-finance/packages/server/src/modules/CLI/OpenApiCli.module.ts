import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommandRunnerModule } from 'nest-commander';
import { config } from '../../common/config';
import { OpenApiExportCommand } from './commands/OpenApiExport.command';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: config,
      isGlobal: true,
    }),
    CommandRunnerModule,
  ],
  providers: [OpenApiExportCommand],
})
export class OpenApiCliModule {}

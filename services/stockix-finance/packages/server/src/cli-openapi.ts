/// <reference path="./common/types/Objection.d.ts" />
import { CommandFactory } from 'nest-commander';
import { OpenApiCliModule } from './modules/CLI/OpenApiCli.module';

async function bootstrap() {
  await CommandFactory.run(OpenApiCliModule);
}

bootstrap();

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InternalController } from './Internal.controller';
import { AttachUserToTenantService } from './commands/AttachUserToTenant.service';
import { InternalSecretGuard } from './guards/InternalSecret.guard';

@Module({
  imports: [ConfigModule],
  controllers: [InternalController],
  providers: [AttachUserToTenantService, InternalSecretGuard],
})
export class InternalModule {}

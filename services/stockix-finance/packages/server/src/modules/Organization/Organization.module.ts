import { Module } from '@nestjs/common';
import { GetCurrentOrganizationService } from './queries/GetCurrentOrganization.service';
import { BuildOrganizationService } from './commands/BuildOrganization.service';
import { UpdateOrganizationService } from './commands/UpdateOrganization.service';
import { OrganizationController } from './Organization.controller';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullModule } from '@nestjs/bullmq';
import { OrganizationBuildQueue } from './Organization.types';
import { OrganizationBuildProcessor } from './processors/OrganizationBuild.processor';
import { CommandOrganizationValidators } from './commands/CommandOrganizationValidators.service';
import { TenancyContext } from '../Tenancy/TenancyContext.service';
import { TenantDBManagerModule } from '../TenantDBManager/TenantDBManager.module';
import { OrganizationBaseCurrencyLocking } from './Organization/OrganizationBaseCurrencyLocking.service';
import { SyncSystemUserToTenantService } from './commands/SyncSystemUserToTenant.service';
import { SyncSystemUserToTenantSubscriber } from './subscribers/SyncSystemUserToTenant.subscriber';
import { SeedTenantLicenseOnBuiltSubscriber } from './subscribers/SeedTenantLicenseOnBuilt.subscriber';
import { GetBuildOrganizationBuildJob } from './commands/GetBuildOrganizationJob.service';
import { CompleteOrganizationSetupService } from './commands/CompleteOrganizationSetup.service';
import { GetAllOrganizationsService } from './GetAllOrganizations.service';
import { CopyParentTenantSettingsService } from './CopyParentTenantSettings.service';
import { TenantKnexFactory } from '@/modules/Tenancy/TenantKnexFactory';
import { AttachmentsModule } from '../Attachments/Attachment.module';
import { TransformerModule } from '../Transformer/Transformer.module';

@Module({
  providers: [
    TenancyContext,
    GetCurrentOrganizationService,
    BuildOrganizationService,
    UpdateOrganizationService,
    OrganizationBuildProcessor,
    CommandOrganizationValidators,
    OrganizationBaseCurrencyLocking,
    SyncSystemUserToTenantService,
    SyncSystemUserToTenantSubscriber,
    SeedTenantLicenseOnBuiltSubscriber,
    GetBuildOrganizationBuildJob,
    CompleteOrganizationSetupService,
    GetAllOrganizationsService,
    CopyParentTenantSettingsService,
    TenantKnexFactory,
  ],
  imports: [
    BullModule.registerQueue({ name: OrganizationBuildQueue }),
    BullBoardModule.forFeature({
      name: OrganizationBuildQueue,
      adapter: BullMQAdapter,
    }),
    TenantDBManagerModule,
    AttachmentsModule,
    TransformerModule,
  ],
  controllers: [OrganizationController],
})
export class OrganizationModule {}

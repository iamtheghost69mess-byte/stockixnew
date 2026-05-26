import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InternalController } from './Internal.controller';
import { InternalProvisionController } from './InternalProvision.controller';
import { InternalLicenseController } from './InternalLicense.controller';
import { InternalUsersController } from './InternalUsers.controller';
import { InternalOrgController } from './InternalOrg.controller';
import { InternalOrganizationController } from './InternalOrganization.controller';
import { InternalSyncOrganizationBrandingService } from './commands/InternalSyncOrganizationBranding.service';
import { InternalResolveController } from './InternalResolve.controller';
import { InternalResolveTenantService } from './commands/InternalResolveTenant.service';
import { InternalPosController } from './InternalPos.controller';
import { InternalPosReceiptsService } from './commands/InternalPosReceipts.service';
import { InternalPosInventoryService } from './commands/InternalPosInventory.service';
import { SaleReceiptsModule } from '@/modules/SaleReceipts/SaleReceipts.module';
import { BillsModule } from '@/modules/Bills/Bills.module';
import { VendorsModule } from '@/modules/Vendors/Vendors.module';
import { CreditNotesModule } from '@/modules/CreditNotes/CreditNotes.module';
import { ManualJournalsModule } from '@/modules/ManualJournals/ManualJournals.module';
import { WarehousesModule } from '@/modules/Warehouses/Warehouses.module';
import { CustomersModule } from '@/modules/Customers/Customers.module';
import { AccountsModule } from '@/modules/Accounts/Accounts.module';
import { ItemsModule } from '@/modules/Items/Items.module';
import { AttachUserToTenantService } from './commands/AttachUserToTenant.service';
import { InternalActivateWarehousesService } from './commands/InternalActivateWarehouses.service';
import { InternalSeedPosDefaultsService } from './commands/InternalSeedPosDefaults.service';
import { ProvisionUserService } from './commands/ProvisionUser.service';
import { InternalCompleteOrganizationSetupService } from './commands/InternalCompleteOrganizationSetup.service';
import { SyncLicenseService } from './commands/SyncLicense.service';
import { InternalUsersService } from './commands/InternalUsers.service';
import { InternalSecretGuard } from './guards/InternalSecret.guard';
import { SystemModelsModule } from '@/modules/System/SystemModels/SystemModels.module';
import { TenantDBManagerModule } from '@/modules/TenantDBManager/TenantDBManager.module';
import { TenantKnexFactory } from '@/modules/Tenancy/TenantKnexFactory';
import { CopyParentTenantSettingsService } from '@/modules/Organization/CopyParentTenantSettings.service';
import { UsersModule } from '@/modules/UsersModule/Users.module';

@Module({
  imports: [
    ConfigModule,
    SystemModelsModule,
    TenantDBManagerModule,
    UsersModule,
    SaleReceiptsModule,
    CreditNotesModule,
    ManualJournalsModule,
    BillsModule,
    VendorsModule,
    WarehousesModule,
    CustomersModule,
    AccountsModule,
    ItemsModule,
  ],
  controllers: [
    InternalController,
    InternalProvisionController,
    InternalLicenseController,
    InternalUsersController,
    InternalOrgController,
    InternalOrganizationController,
    InternalResolveController,
    InternalPosController,
  ],
  providers: [
    InternalResolveTenantService,
    AttachUserToTenantService,
    ProvisionUserService,
    InternalCompleteOrganizationSetupService,
    SyncLicenseService,
    InternalUsersService,
    InternalPosReceiptsService,
    InternalPosInventoryService,
    InternalActivateWarehousesService,
    InternalSeedPosDefaultsService,
    InternalSyncOrganizationBrandingService,
    InternalSecretGuard,
    TenantKnexFactory,
    CopyParentTenantSettingsService,
  ],
  exports: [SyncLicenseService],
})
export class InternalModule {}

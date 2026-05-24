import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InternalController } from './Internal.controller';
import { InternalProvisionController } from './InternalProvision.controller';
import { InternalLicenseController } from './InternalLicense.controller';
import { InternalUsersController } from './InternalUsers.controller';
import { InternalOrgController } from './InternalOrg.controller';
import { InternalResolveController } from './InternalResolve.controller';
import { InternalResolveTenantService } from './commands/InternalResolveTenant.service';
import { InternalPosController } from './InternalPos.controller';
import { InternalPosReceiptsService } from './commands/InternalPosReceipts.service';
import { SaleReceiptsModule } from '@/modules/SaleReceipts/SaleReceipts.module';
import { WarehousesModule } from '@/modules/Warehouses/Warehouses.module';
import { CustomersModule } from '@/modules/Customers/Customers.module';
import { AccountsModule } from '@/modules/Accounts/Accounts.module';
import { AttachUserToTenantService } from './commands/AttachUserToTenant.service';
import { InternalActivateWarehousesService } from './commands/InternalActivateWarehouses.service';
import { InternalSeedPosDefaultsService } from './commands/InternalSeedPosDefaults.service';
import { ProvisionUserService } from './commands/ProvisionUser.service';
import { SyncLicenseService } from './commands/SyncLicense.service';
import { InternalUsersService } from './commands/InternalUsers.service';
import { InternalSecretGuard } from './guards/InternalSecret.guard';
import { TenantDBManagerModule } from '@/modules/TenantDBManager/TenantDBManager.module';
import { TenantKnexFactory } from '@/modules/Tenancy/TenantKnexFactory';
import { CopyParentTenantSettingsService } from '@/modules/Organization/CopyParentTenantSettings.service';
import { UsersModule } from '@/modules/UsersModule/Users.module';

@Module({
  imports: [
    ConfigModule,
    TenantDBManagerModule,
    UsersModule,
    SaleReceiptsModule,
    WarehousesModule,
    CustomersModule,
    AccountsModule,
  ],
  controllers: [
    InternalController,
    InternalProvisionController,
    InternalLicenseController,
    InternalUsersController,
    InternalOrgController,
    InternalResolveController,
    InternalPosController,
  ],
  providers: [
    InternalResolveTenantService,
    AttachUserToTenantService,
    ProvisionUserService,
    SyncLicenseService,
    InternalUsersService,
    InternalPosReceiptsService,
    InternalActivateWarehousesService,
    InternalSeedPosDefaultsService,
    InternalSecretGuard,
    TenantKnexFactory,
    CopyParentTenantSettingsService,
  ],
  exports: [SyncLicenseService],
})
export class InternalModule {}

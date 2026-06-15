import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantModel } from '@/modules/System/models/TenantModel';
import UserTenant from '@/modules/System/models/UserTenant';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { Warehouse } from '@/modules/Warehouses/models/Warehouse.model';
import { WarehousesApplication } from '@/modules/Warehouses/WarehousesApplication.service';
import { WarehousesSettings } from '@/modules/Warehouses/WarehousesSettings';
import { ServiceError } from '@/modules/Items/ServiceError';
import { ERRORS } from '@/modules/Warehouses/contants';

@Injectable()
export class InternalActivateWarehousesService {
  constructor(
    private readonly cls: ClsService,
    private readonly warehousesApplication: WarehousesApplication,
    private readonly warehousesSettings: WarehousesSettings,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,

    @Inject(Warehouse.name)
    private readonly warehouseModel: TenantModelProxy<typeof Warehouse>,
  ) {}

  private async resolveTenantContext(tenantId: number) {
    const tenant = await this.tenantModel.query().findById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`No tenant found with id: ${tenantId}`);
    }

    const membership = await this.userTenantModel
      .query()
      .where({ tenantId })
      .where({ isActive: true })
      .first();

    if (!membership?.userId) {
      throw new BadRequestException(
        `No active system user membership for tenant ${tenantId}`,
      );
    }

    this.cls.set('tenantId', tenantId);
    this.cls.set('organizationId', tenant.organizationId);
    this.cls.set('userId', membership.userId);

    return tenant;
  }

  private async findPrimaryWarehouseId(): Promise<number | null> {
    const primary = await this.warehouseModel()
      .query()
      .findOne({ primary: true });
    if (primary?.id) {
      return Number(primary.id);
    }
    const byCode = await this.warehouseModel()
      .query()
      .findOne({ code: '10001' });
    return byCode?.id ? Number(byCode.id) : null;
  }

  /**
   * Activates multi-warehouse for a tenant (idempotent) and returns the primary warehouse id.
   */
  async activateForTenant(tenantId: number): Promise<{
    success: true;
    primaryWarehouseId: number;
    alreadyActivated: boolean;
  }> {
    await this.resolveTenantContext(tenantId);

    const wasActive = await this.warehousesSettings.isMultiWarehousesActive();
    if (!wasActive) {
      try {
        await this.warehousesApplication.activateWarehouses();
      } catch (error) {
        if (
          !(
            error instanceof ServiceError
            && error.errorType === ERRORS.MUTLI_WAREHOUSES_ALREADY_ACTIVATED
          )
        ) {
          throw error;
        }
      }
    }

    const primaryWarehouseId = await this.findPrimaryWarehouseId();
    if (!primaryWarehouseId) {
      throw new BadRequestException(
        'Primary warehouse not found after warehouse activation',
      );
    }

    return {
      success: true,
      primaryWarehouseId,
      alreadyActivated: wasActive,
    };
  }
}

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantModel } from '@/modules/System/models/TenantModel';
import UserTenant from '@/modules/System/models/UserTenant';
import { SaleReceiptApplication } from '@/modules/SaleReceipts/SaleReceiptApplication.service';
import { CreateSaleReceiptDto } from '@/modules/SaleReceipts/dtos/SaleReceipt.dto';
import { SaleReceipt } from '@/modules/SaleReceipts/models/SaleReceipt';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { DeleteSaleReceipt } from '@/modules/SaleReceipts/commands/DeleteSaleReceipt.service';
import {
  InternalPosReceiptPayloadDto,
} from '../dtos/InternalPosReceipt.dto';

@Injectable()
export class InternalPosReceiptsService {
  constructor(
    private readonly cls: ClsService,
    private readonly saleReceiptApplication: SaleReceiptApplication,
    private readonly deleteSaleReceiptService: DeleteSaleReceipt,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,

    @Inject(SaleReceipt.name)
    private readonly saleReceiptModel: TenantModelProxy<typeof SaleReceipt>,
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

  private mapPayloadToDto(
    payload: InternalPosReceiptPayloadDto,
  ): CreateSaleReceiptDto {
    const dto = new CreateSaleReceiptDto();
    dto.customerId = payload.customerId;
    dto.receiptDate = payload.receiptDate as unknown as Date;
    dto.referenceNo = payload.referenceNo;
    dto.depositAccountId = payload.depositAccountId;
    dto.closed = payload.closed ?? true;
    dto.statement = payload.statement;
    if (payload.branchId != null) dto.branchId = payload.branchId;
    if (payload.warehouseId != null) dto.warehouseId = payload.warehouseId;
    dto.entries = payload.entries.map((entry, idx) => ({
      index: idx + 1,
      itemId: entry.itemId,
      rate: entry.rate,
      quantity: entry.quantity,
      discount: entry.discount ?? 0,
      description: entry.description,
    }));
    return dto;
  }

  async checkDuplicate(tenantId: number, referenceNo: string) {
    await this.resolveTenantContext(tenantId);
    const existing = await this.saleReceiptModel()
      .query()
      .where('referenceNo', referenceNo)
      .first();
    return { exists: Boolean(existing), id: existing?.id ?? null };
  }

  async createReceipt(tenantId: number, payload: InternalPosReceiptPayloadDto) {
    await this.resolveTenantContext(tenantId);

    const referenceNo = String(payload.referenceNo || "").trim();
    if (!referenceNo) {
      throw new BadRequestException("referenceNo is required");
    }

    const existing = await this.saleReceiptModel()
      .query()
      .where("referenceNo", referenceNo)
      .first();

    if (existing) {
      return { success: true, data: existing, idempotent: true };
    }

    const dto = this.mapPayloadToDto(payload);
    const receipt = await this.saleReceiptApplication.createSaleReceipt(dto);
    return { success: true, data: receipt, idempotent: false };
  }

  async voidByReference(tenantId: number, referenceNo: string) {
    await this.resolveTenantContext(tenantId);

    const receipt = await this.saleReceiptModel()
      .query()
      .where("referenceNo", referenceNo)
      .first();

    if (!receipt) {
      throw new NotFoundException(
        `No sale receipt with referenceNo ${referenceNo}`,
      );
    }

    await this.deleteSaleReceiptService.deleteSaleReceipt(receipt.id);
    return { success: true, deletedId: receipt.id };
  }
}

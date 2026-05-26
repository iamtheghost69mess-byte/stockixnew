import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ACCOUNT_TYPE } from '@/constants/accounts';
import { TenantModel } from '@/modules/System/models/TenantModel';
import UserTenant from '@/modules/System/models/UserTenant';
import { Account } from '@/modules/Accounts/models/Account.model';
import { Bill } from '@/modules/Bills/models/Bill';
import { BillsApplication } from '@/modules/Bills/Bills.application';
import { CreateBillDto } from '@/modules/Bills/dtos/Bill.dto';
import { ManualJournalsApplication } from '@/modules/ManualJournals/ManualJournalsApplication.service';
import { CreateManualJournalDto } from '@/modules/ManualJournals/dtos/ManualJournal.dto';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import {
  InternalPosGrnBillPayloadDto,
  InternalPosInventoryVariancePayloadDto,
} from '../dtos/InternalPosInventory.dto';

@Injectable()
export class InternalPosInventoryService {
  constructor(
    private readonly cls: ClsService,
    private readonly billsApplication: BillsApplication,
    private readonly manualJournalsApplication: ManualJournalsApplication,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,

    @Inject(Bill.name)
    private readonly billModel: TenantModelProxy<typeof Bill>,

    @Inject(Account.name)
    private readonly accountModel: TenantModelProxy<typeof Account>,
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

  private async resolveInventoryAccounts(
    inventoryAccountId?: number,
    varianceAccountId?: number,
  ): Promise<{ inventoryAccountId: number; varianceAccountId: number }> {
    let invId = inventoryAccountId;
    let varId = varianceAccountId;

    if (!invId) {
      const inv = await this.accountModel()
        .query()
        .where('accountType', ACCOUNT_TYPE.INVENTORY)
        .where('active', true)
        .orderBy('id', 'asc')
        .first();
      invId = inv?.id ? Number(inv.id) : undefined;
    }

    if (!varId) {
      const exp = await this.accountModel()
        .query()
        .where('accountType', ACCOUNT_TYPE.EXPENSE)
        .where('active', true)
        .orderBy('id', 'asc')
        .first();
      varId = exp?.id ? Number(exp.id) : undefined;
    }

    if (!invId || !varId) {
      throw new BadRequestException(
        'Inventory and variance accounts are required (configure on POS integration or chart of accounts)',
      );
    }

    return {
      inventoryAccountId: invId,
      varianceAccountId: varId,
    };
  }

  async createGrnBill(tenantId: number, payload: InternalPosGrnBillPayloadDto) {
    await this.resolveTenantContext(tenantId);

    const referenceNo = String(payload.referenceNo || '').trim();
    if (!referenceNo) {
      throw new BadRequestException('referenceNo is required');
    }

    const existing = await this.billModel()
      .query()
      .where('referenceNo', referenceNo)
      .first();

    if (existing) {
      return { success: true, data: existing, idempotent: true };
    }

    const entries = (payload.entries || []).filter(
      (e) => e.itemId && Number(e.quantity) > 0 && Number(e.rate) >= 0,
    );
    if (!entries.length) {
      throw new BadRequestException('At least one bill line is required');
    }

    const dto = new CreateBillDto();
    dto.vendorId = payload.vendorId;
    dto.billDate = payload.billDate as unknown as Date;
    dto.referenceNo = referenceNo;
    dto.note = payload.note || `POS GRN ${referenceNo}`;
    dto.open = false;
    if (payload.warehouseId != null) dto.warehouseId = payload.warehouseId;
    if (payload.branchId != null) dto.branchId = payload.branchId;
    dto.entries = entries.map((entry, idx) => ({
      index: idx + 1,
      itemId: entry.itemId,
      quantity: entry.quantity,
      rate: entry.rate,
      description: entry.description,
    }));

    const bill = await this.billsApplication.createBill(dto);
    return { success: true, data: bill, idempotent: false };
  }

  async postInventoryVariance(
    tenantId: number,
    payload: InternalPosInventoryVariancePayloadDto,
  ) {
    await this.resolveTenantContext(tenantId);

    const referenceNo = String(payload.referenceNo || '').trim();
    if (!referenceNo) {
      throw new BadRequestException('referenceNo is required');
    }

    const lines = (payload.lines || []).filter(
      (l) => l.itemId && Number(l.quantity) !== 0 && Number(l.unitCost) >= 0,
    );
    if (!lines.length) {
      return { success: true, skipped: true, reason: 'no_variance_lines' };
    }

    const { inventoryAccountId, varianceAccountId } =
      await this.resolveInventoryAccounts(
        payload.inventoryAccountId,
        payload.varianceAccountId,
      );

    let netDebitInventory = 0;
    const detailNotes: string[] = [];

    for (const line of lines) {
      const qty = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      const amount = Math.round(qty * unitCost * 100) / 100;
      if (Math.abs(amount) < 0.005) continue;
      netDebitInventory += amount;
      detailNotes.push(
        `${line.description || `item ${line.itemId}`}: ${qty} × ${unitCost}`,
      );
    }

    netDebitInventory = Math.round(netDebitInventory * 100) / 100;
    if (Math.abs(netDebitInventory) < 0.005) {
      return { success: true, skipped: true, reason: 'zero_net' };
    }

    const absAmt = Math.abs(netDebitInventory);
    const journalDto = new CreateManualJournalDto();
    journalDto.date = payload.journalDate as unknown as Date;
    journalDto.publish = true;
    journalDto.reference = referenceNo;
    journalDto.description =
      payload.description ||
      `POS inventory variance · ${detailNotes.slice(0, 3).join('; ')}`;

    if (netDebitInventory > 0) {
      journalDto.entries = [
        {
          index: 1,
          debit: absAmt,
          accountId: inventoryAccountId,
          note: 'POS stock increase',
        },
        {
          index: 2,
          credit: absAmt,
          accountId: varianceAccountId,
          note: 'POS stock increase offset',
        },
      ];
    } else {
      journalDto.entries = [
        {
          index: 1,
          debit: absAmt,
          accountId: varianceAccountId,
          note: 'POS stock decrease / waste',
        },
        {
          index: 2,
          credit: absAmt,
          accountId: inventoryAccountId,
          note: 'POS stock decrease offset',
        },
      ];
    }

    const journal =
      await this.manualJournalsApplication.createManualJournal(journalDto);

    return {
      success: true,
      data: journal,
      netAmount: netDebitInventory,
      idempotent: false,
    };
  }
}

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
import { CreditNoteApplication } from '@/modules/CreditNotes/CreditNoteApplication.service';
import { CreateCreditNoteDto } from '@/modules/CreditNotes/dtos/CreditNote.dto';
import { CreditNote } from '@/modules/CreditNotes/models/CreditNote';
import { ManualJournalsApplication } from '@/modules/ManualJournals/ManualJournalsApplication.service';
import { CreateManualJournalDto } from '@/modules/ManualJournals/dtos/ManualJournal.dto';
import { ItemsApplicationService } from '@/modules/Items/ItemsApplication.service';
import { EditItemDto } from '@/modules/Items/dtos/Item.dto';
import {
  InternalPosPartialRefundDto,
  InternalPosReceiptPayloadDto,
} from '../dtos/InternalPosReceipt.dto';

@Injectable()
export class InternalPosReceiptsService {
  constructor(
    private readonly cls: ClsService,
    private readonly saleReceiptApplication: SaleReceiptApplication,
    private readonly deleteSaleReceiptService: DeleteSaleReceipt,
    private readonly creditNoteApplication: CreditNoteApplication,
    private readonly manualJournalsApplication: ManualJournalsApplication,
    private readonly itemsApplication: ItemsApplicationService,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,

    @Inject(SaleReceipt.name)
    private readonly saleReceiptModel: TenantModelProxy<typeof SaleReceipt>,

    @Inject(CreditNote.name)
    private readonly creditNoteModel: TenantModelProxy<typeof CreditNote>,
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
    if (payload.exchangeRate != null && Number(payload.exchangeRate) > 0) {
      dto.exchangeRate = Number(payload.exchangeRate);
    }
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

  private async applyRecipeUnitCosts(
    entries: InternalPosReceiptPayloadDto['entries'],
  ) {
    for (const entry of entries || []) {
      const unitCost = entry.unitCost;
      if (unitCost == null || !Number.isFinite(Number(unitCost))) continue;
      const cost = Math.max(0, Number(unitCost));
      const editDto = new EditItemDto();
      editDto.costPrice = cost;
      await this.itemsApplication.editItem(entry.itemId, editDto);
    }
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

    await this.applyRecipeUnitCosts(payload.entries);

    const dto = this.mapPayloadToDto(payload);
    const receipt = await this.saleReceiptApplication.createSaleReceipt(dto);

    if (payload.depositPayments?.length) {
      await this.applyDepositPaymentSplits(
        payload,
        receipt.receiptDate as unknown as string,
        referenceNo,
      );
    }

    return { success: true, data: receipt, idempotent: false };
  }

  private async applyDepositPaymentSplits(
    payload: InternalPosReceiptPayloadDto,
    receiptDate: string,
    referenceNo: string,
  ) {
    const payments = (payload.depositPayments || []).filter(
      (p) => p.depositAccountId && Number(p.amount) > 0,
    );
    if (payments.length < 2) return;

    const primaryId = payload.depositAccountId;
    const others = payments.filter((p) => p.depositAccountId !== primaryId);
    if (!others.length) return;

    let index = 0;
    for (const payment of others) {
      const amount = Number(payment.amount);
      if (amount <= 0) continue;
      index += 1;
      const journalDto = new CreateManualJournalDto();
      journalDto.date = receiptDate as unknown as Date;
      journalDto.publish = true;
      journalDto.reference = `pos-deposit-split-${referenceNo}-${index}`;
      journalDto.description = `POS multi-tender reallocation for ${referenceNo}`;
      journalDto.entries = [
        {
          index: 1,
          credit: amount,
          accountId: primaryId,
          note: 'POS tender split',
        },
        {
          index: 2,
          debit: amount,
          accountId: payment.depositAccountId,
          note: 'POS tender split',
        },
      ];
      await this.manualJournalsApplication.createManualJournal(journalDto);
    }
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

  async partialRefundByReference(
    tenantId: number,
    referenceNo: string,
    body: InternalPosPartialRefundDto,
  ) {
    await this.resolveTenantContext(tenantId);

    const receipt = await this.saleReceiptModel()
      .query()
      .where('referenceNo', referenceNo)
      .first();

    if (!receipt) {
      throw new NotFoundException(
        `No sale receipt with referenceNo ${referenceNo}`,
      );
    }

    const idemKey = String(
      body.idempotencyKey || `pos-partial-refund-${referenceNo}-${body.amount}`,
    ).trim();
    const creditRef = `pos-partial-refund-${referenceNo}-${idemKey}`;

    const existingNote = await this.creditNoteModel()
      .query()
      .where('referenceNo', creditRef)
      .first();

    if (existingNote) {
      return {
        success: true,
        data: existingNote,
        idempotent: true,
        saleReceiptId: receipt.id,
      };
    }

    const creditNoteDto = new CreateCreditNoteDto();
    creditNoteDto.customerId = receipt.customerId;
    creditNoteDto.creditNoteDate = (body.creditNoteDate ||
      new Date().toISOString().split('T')[0]) as unknown as Date;
    creditNoteDto.referenceNo = creditRef;
    creditNoteDto.note = `POS partial refund for order ${referenceNo}`;
    creditNoteDto.open = false;
    if (receipt.branchId) creditNoteDto.branchId = receipt.branchId;
    if (receipt.warehouseId) creditNoteDto.warehouseId = receipt.warehouseId;
    creditNoteDto.entries = [
      {
        index: 1,
        itemId: body.refundItemId,
        quantity: 1,
        rate: Number(body.amount),
        description: `Partial refund — POS ${referenceNo}`,
      },
    ];

    const creditNote =
      await this.creditNoteApplication.createCreditNote(creditNoteDto);

    return {
      success: true,
      data: creditNote,
      idempotent: false,
      saleReceiptId: receipt.id,
    };
  }
}

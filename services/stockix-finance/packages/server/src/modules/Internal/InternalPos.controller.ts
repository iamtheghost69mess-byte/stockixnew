import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '@/modules/Auth/guards/jwt.guard';
import { TenantAgnosticRoute } from '@/modules/Tenancy/TenancyGlobal.guard';
import { InternalSecretGuard } from './guards/InternalSecret.guard';
import { InternalPosReceiptsService } from './commands/InternalPosReceipts.service';
import {
  CreateInternalPosReceiptDto,
  InternalPosCheckDuplicateDto,
  InternalPosPartialRefundDto,
  InternalPosTenantBodyDto,
} from './dtos/InternalPosReceipt.dto';

@ApiTags('Internal POS')
@Controller('internal/pos')
@PublicRoute()
@TenantAgnosticRoute()
@UseGuards(InternalSecretGuard)
export class InternalPosController {
  constructor(
    private readonly internalPosReceipts: InternalPosReceiptsService,
  ) {}

  @Post('receipts')
  @HttpCode(HttpStatus.CREATED)
  async createReceipt(@Body() body: CreateInternalPosReceiptDto) {
    return this.internalPosReceipts.createReceipt(body.tenantId, body.payload);
  }

  @Post('receipts/check-duplicate')
  @HttpCode(HttpStatus.OK)
  async checkDuplicate(@Body() body: InternalPosCheckDuplicateDto) {
    return this.internalPosReceipts.checkDuplicate(
      body.tenantId,
      body.referenceNo,
    );
  }

  @Delete('receipts/by-reference/:referenceNo')
  @HttpCode(HttpStatus.OK)
  async voidReceiptByReference(
    @Param('referenceNo') referenceNo: string,
    @Body() body: InternalPosTenantBodyDto,
  ) {
    return this.internalPosReceipts.voidByReference(body.tenantId, referenceNo);
  }

  @Patch('receipts/by-reference/:referenceNo/partial-refund')
  @HttpCode(HttpStatus.OK)
  async partialRefundByReference(
    @Param('referenceNo') referenceNo: string,
    @Body() body: InternalPosPartialRefundDto,
  ) {
    return this.internalPosReceipts.partialRefundByReference(
      body.tenantId,
      referenceNo,
      body,
    );
  }
}

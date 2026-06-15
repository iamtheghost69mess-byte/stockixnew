import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InternalPosTenantBodyDto } from './InternalPosReceipt.dto';

export class InternalPosGrnBillEntryDto {
  @IsInt()
  itemId: number;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  rate: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class InternalPosGrnBillPayloadDto {
  @IsString()
  @IsNotEmpty()
  referenceNo: string;

  @IsString()
  @IsNotEmpty()
  billDate: string;

  @IsInt()
  vendorId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternalPosGrnBillEntryDto)
  entries: InternalPosGrnBillEntryDto[];

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsInt()
  warehouseId?: number;

  @IsOptional()
  @IsInt()
  branchId?: number;
}

export class CreateInternalPosGrnBillDto extends InternalPosTenantBodyDto {
  @ValidateNested()
  @Type(() => InternalPosGrnBillPayloadDto)
  payload: InternalPosGrnBillPayloadDto;
}

export class InternalPosVarianceLineDto {
  @IsInt()
  itemId: number;

  @IsNumber()
  quantity: number;

  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class InternalPosInventoryVariancePayloadDto {
  @IsString()
  @IsNotEmpty()
  referenceNo: string;

  @IsString()
  @IsNotEmpty()
  journalDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternalPosVarianceLineDto)
  lines: InternalPosVarianceLineDto[];

  @IsOptional()
  @IsInt()
  inventoryAccountId?: number;

  @IsOptional()
  @IsInt()
  varianceAccountId?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateInternalPosInventoryVarianceDto extends InternalPosTenantBodyDto {
  @ValidateNested()
  @Type(() => InternalPosInventoryVariancePayloadDto)
  payload: InternalPosInventoryVariancePayloadDto;
}

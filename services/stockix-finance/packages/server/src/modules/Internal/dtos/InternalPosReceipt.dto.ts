import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InternalPosReceiptEntryDto {
  @IsInt()
  itemId: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  rate: number;

  @IsOptional()
  @IsNumber()
  discount?: number;
}

export class InternalPosReceiptPayloadDto {
  @IsInt()
  customerId: number;

  @IsString()
  @IsNotEmpty()
  receiptDate: string;

  @IsString()
  @IsNotEmpty()
  referenceNo: string;

  @IsInt()
  depositAccountId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternalPosReceiptEntryDto)
  entries: InternalPosReceiptEntryDto[];

  @IsBoolean()
  closed: boolean;

  @IsOptional()
  @IsString()
  statement?: string;

  @IsOptional()
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsInt()
  warehouseId?: number;
}

export class CreateInternalPosReceiptDto {
  @IsInt()
  tenantId: number;

  @ValidateNested()
  @Type(() => InternalPosReceiptPayloadDto)
  payload: InternalPosReceiptPayloadDto;
}

export class InternalPosTenantBodyDto {
  @IsInt()
  tenantId: number;
}

export class InternalPosCheckDuplicateDto extends InternalPosTenantBodyDto {
  @IsString()
  @IsNotEmpty()
  referenceNo: string;
}

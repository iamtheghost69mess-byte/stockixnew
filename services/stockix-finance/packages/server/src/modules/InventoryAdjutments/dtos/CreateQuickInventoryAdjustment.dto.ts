import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsISO4217CurrencyCode,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsOptional, ToNumber } from '@/common/decorators/Validators';
import { parseBoolean } from '@/utils/parse-boolean';

enum IAdjustmentTypes {
  INCREMENT = 'increment',
  DECREMENT = 'decrement',
}

export class CreateQuickInventoryAdjustmentDto {
  @ApiProperty({ description: 'Date of the inventory adjustment' })
  @IsNotEmpty()
  @IsDateString()
  date: Date;

  @ApiProperty({ description: 'Type of adjustment', enum: IAdjustmentTypes })
  @IsNotEmpty()
  @IsEnum(IAdjustmentTypes)
  type: 'increment' | 'decrement';

  @ApiProperty({ description: 'ID of the adjustment account' })
  @IsNotEmpty()
  @ToNumber()
  @IsInt()
  @IsPositive()
  adjustmentAccountId: number;

  @ApiProperty({ description: 'Reason for the adjustment' })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @ApiProperty({ description: 'Description of the adjustment' })
  @IsOptional()
  @IsString()
  description: string;

  @ApiProperty({ description: 'Reference number' })
  @IsOptional()
  @IsString()
  referenceNo: string;

  @ApiProperty({ description: 'ID of the item being adjusted' })
  @IsNotEmpty()
  @ToNumber()
  @IsNumber()
  @IsPositive()
  itemId: number;

  @ApiProperty({ description: 'Quantity to adjust' })
  @IsNotEmpty()
  @ToNumber()
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ description: 'Cost of the item' })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  cost: number;

  @ApiProperty({ description: 'Whether to publish the adjustment immediately' })
  @IsNotEmpty()
  @Transform((param) => parseBoolean(param.value, false))
  @IsBoolean()
  publish: boolean;

  @ApiPropertyOptional({ description: 'ID of the warehouse (optional)' })
  @IsOptional()
  @ToNumber()
  @IsInt()
  @IsPositive()
  warehouseId?: number;

  @ApiPropertyOptional({ description: 'ID of the branch (optional)' })
  @IsOptional()
  @ToNumber()
  @IsInt()
  @IsPositive()
  branchId?: number;

  @ApiPropertyOptional({ description: 'Currency code (ISO 4217). Defaults to org base currency.' })
  @IsOptional()
  @IsString()
  @IsISO4217CurrencyCode()
  currencyCode?: string;

  @ApiPropertyOptional({ description: 'Exchange rate: 1 unit of currencyCode = X units of base currency. Required when currencyCode differs from base.' })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;
}

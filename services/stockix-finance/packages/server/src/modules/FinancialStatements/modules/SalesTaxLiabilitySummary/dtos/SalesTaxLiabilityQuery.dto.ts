import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { parseBoolean } from '@/utils/parse-boolean';

export class SalesTaxLiabilitySummaryQueryDto {
  @ApiProperty({
    description: 'Start date for the sales tax liability summary',
    example: '2024-01-01',
  })
  @IsDateString()
  @IsOptional()
  fromDate: Date;

  @ApiProperty({
    description: 'End date for the sales tax liability summary',
    example: '2024-01-31',
  })
  @IsDateString()
  @IsOptional()
  toDate: Date;

  @ApiProperty({
    description: 'Accounting basis for the summary',
    enum: ['cash', 'accrual'],
    example: 'accrual',
  })
  @IsEnum(['cash', 'accrual'])
  @IsNotEmpty()
  basis: 'cash' | 'accrual';

  @Transform(({ value }) => parseBoolean(value, false))
  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Show per-currency breakdown of tax totals',
    example: false,
  })
  groupByCurrency: boolean;
}

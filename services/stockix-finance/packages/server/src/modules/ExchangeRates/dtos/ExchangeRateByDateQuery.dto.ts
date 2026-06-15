import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString } from 'class-validator';

export class ExchangeRateByDateQueryDto {
  @IsString()
  @ApiProperty({
    description: 'Currency code (ISO 4217)',
    example: 'EUR',
  })
  currency_code: string;

  @IsISO8601()
  @ApiProperty({
    description: 'Date to look up the exchange rate (ISO 8601)',
    example: '2024-01-15',
  })
  date: string;
}

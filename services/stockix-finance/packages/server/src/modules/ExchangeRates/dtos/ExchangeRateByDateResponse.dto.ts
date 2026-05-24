import { ApiProperty } from '@nestjs/swagger';

export class ExchangeRateByDateResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'EUR' })
  currencyCode: string;

  @ApiProperty({ example: 0.92 })
  exchangeRate: number;

  @ApiProperty({ example: '2024-01-15' })
  date: string;
}

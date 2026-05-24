import { IsOptional, IsISO8601 } from 'class-validator';

export class RealizedGainLossQueryDto {
  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @IsOptional()
  @IsISO8601()
  toDate?: string;
}

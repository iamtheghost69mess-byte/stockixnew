import { IsOptional, IsISO8601 } from 'class-validator';

export class UnrealizedGainLossQueryDto {
  @IsOptional()
  @IsISO8601()
  asOfDate?: string;
}

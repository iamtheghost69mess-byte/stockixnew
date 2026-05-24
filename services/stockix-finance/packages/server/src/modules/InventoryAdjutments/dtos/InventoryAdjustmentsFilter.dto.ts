import { ToNumber } from '@/common/decorators/Validators';
import { DynamicFilterQueryDto } from '@/modules/DynamicListing/dtos/DynamicFilterQuery.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';

export class InventoryAdjustmentsFilterDto extends DynamicFilterQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @ToNumber()
  page?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @ToNumber()
  pageSize?: number;
}

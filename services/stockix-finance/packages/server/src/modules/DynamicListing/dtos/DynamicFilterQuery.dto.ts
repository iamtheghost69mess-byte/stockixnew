import { ToNumber } from '@/common/decorators/Validators';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { IFilterRole, ISortOrder } from '../DynamicFilter/DynamicFilter.types';

export class DynamicFilterQueryDto {
  @ApiPropertyOptional({ description: 'Custom view ID', type: Number })
  @IsOptional()
  @ToNumber()
  customViewId?: number;

  @ApiPropertyOptional({ description: 'Filter roles', type: Array })
  @IsArray()
  @IsOptional()
  filterRoles?: IFilterRole[];

  @ApiPropertyOptional({ description: 'Column to sort by', type: String })
  @IsOptional()
  @IsString()
  columnSortBy: string;

  @ApiPropertyOptional({ description: 'Sort order (asc/desc)', type: String })
  @IsString()
  @IsOptional()
  sortOrder: ISortOrder;

  @ApiPropertyOptional({
    description: 'Stringified filter roles',
    type: String,
  })
  @IsString()
  @IsOptional()
  stringifiedFilterRoles?: string;

  @ApiPropertyOptional({ description: 'Search keyword', type: String })
  @IsString()
  @IsOptional()
  searchKeyword?: string;

  @ApiPropertyOptional({ description: 'View slug', type: String })
  @IsString()
  @IsOptional()
  viewSlug?: string;

  filterQuery?: (query: any) => void;
}

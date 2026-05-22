import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TenantLicenseStatus } from '@/modules/System/models/TenantLicense';

export class SyncLicenseDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  tenantId: number;

  @ApiProperty({ example: 'starter' })
  @IsString()
  @IsNotEmpty()
  planSlug: string;

  @ApiProperty({ enum: ['active', 'expired', 'suspended', 'grace', 'revoked'] })
  @IsEnum(['active', 'expired', 'suspended', 'grace', 'revoked'])
  status: TenantLicenseStatus;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  validFrom: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  expiresAt: string | null;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(0)
  gracePeriodDays: number;

  @ApiProperty({ example: 999, description: 'Staff user limit in the finance app' })
  @IsInt()
  @Min(1)
  maxUsers: number;

  @ApiProperty({ example: 3, description: 'POS device activation limit (reference only in finance)' })
  @IsInt()
  @Min(1)
  maxActivations: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  maxOrganizations: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  isPerpetual: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsObject()
  featureFlags: Record<string, boolean> | null;
}

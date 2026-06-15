import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
// organizationNumber uses IsString above

export enum ProvisionUserRole {
  Admin = 'admin',
  Accountant = 'accountant',
  Viewer = 'viewer',
}

export class ProvisionUserDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'secure-password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    description:
      'Existing tenant id. Omit on first bootstrap to create a new tenant.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  tenantId?: number;

  @ApiProperty({
    enum: ProvisionUserRole,
    example: ProvisionUserRole.Admin,
  })
  @IsEnum(ProvisionUserRole)
  role: ProvisionUserRole;

  @ApiPropertyOptional({ example: 'ORG-00042' })
  @IsOptional()
  @IsString()
  organizationNumber?: string;
}

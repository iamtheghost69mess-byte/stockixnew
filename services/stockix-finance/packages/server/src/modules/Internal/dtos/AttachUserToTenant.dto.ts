import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AttachUserToTenantDto {
  @ApiProperty({ example: 'ahmad@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'org_abc123' })
  @IsString()
  @IsNotEmpty()
  organizationId: string;
}

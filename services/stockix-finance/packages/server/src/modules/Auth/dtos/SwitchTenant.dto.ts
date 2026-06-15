import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwitchTenantDto {
  @ApiProperty({ example: 'org_abc123' })
  @IsString()
  @IsNotEmpty()
  organizationId: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AuthChangePasswordDto {
  @ApiProperty({ description: 'New password' })
  @IsString()
  @MinLength(6)
  password: string;
}

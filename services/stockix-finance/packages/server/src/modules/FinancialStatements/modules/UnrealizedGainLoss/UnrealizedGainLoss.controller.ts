import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonHeaders } from '@/common/decorators/ApiCommonHeaders';
import { AuthorizationGuard } from '@/modules/Roles/Authorization.guard';
import { PermissionGuard } from '@/modules/Roles/Permission.guard';
import { RequirePermission } from '@/modules/Roles/RequirePermission.decorator';
import { AbilitySubject } from '@/modules/Roles/Roles.types';
import { ReportsAction } from '../../types/Report.types';
import { UnrealizedGainLossService } from './UnrealizedGainLoss.service';
import { UnrealizedGainLossQueryDto } from './UnrealizedGainLossQuery.dto';

@Controller('reports/unrealized-gain-loss')
@ApiTags('Reports')
@ApiCommonHeaders()
@UseGuards(AuthorizationGuard, PermissionGuard)
export class UnrealizedGainLossController {
  constructor(
    private readonly unrealizedGainLossService: UnrealizedGainLossService,
  ) {}

  @Get()
  @RequirePermission(
    ReportsAction.READ_UNREALIZED_GAIN_LOSS,
    AbilitySubject.Report,
  )
  @ApiOperation({ summary: 'Get unrealized gain or loss report' })
  public async unrealizedGainLoss(@Query() query: UnrealizedGainLossQueryDto) {
    return this.unrealizedGainLossService.unrealizedGainLoss(query);
  }
}

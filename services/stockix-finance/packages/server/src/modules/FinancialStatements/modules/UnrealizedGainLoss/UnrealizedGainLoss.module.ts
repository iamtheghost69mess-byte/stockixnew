import { Module } from '@nestjs/common';
import { FinancialSheetCommonModule } from '../../common/FinancialSheetCommon.module';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { UnrealizedGainLossController } from './UnrealizedGainLoss.controller';
import { UnrealizedGainLossService } from './UnrealizedGainLoss.service';

@Module({
  imports: [FinancialSheetCommonModule],
  controllers: [UnrealizedGainLossController],
  providers: [UnrealizedGainLossService, TenancyContext],
})
export class UnrealizedGainLossModule {}

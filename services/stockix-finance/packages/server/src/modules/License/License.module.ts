import { Global, Module } from '@nestjs/common';
import { LicenseService } from './License.service';
import { LicenseGuardMiddleware } from './LicenseGuard.middleware';
import { LicenseCacheService } from './LicenseCacheService';

@Global()
@Module({
  providers: [LicenseCacheService, LicenseService, LicenseGuardMiddleware],
  exports: [LicenseCacheService, LicenseService, LicenseGuardMiddleware],
})
export class LicenseModule {}

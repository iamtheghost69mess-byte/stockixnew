import { Global, Module } from '@nestjs/common';
import { LicenseService } from './License.service';
import { LicenseGuardMiddleware } from './LicenseGuard.middleware';

@Global()
@Module({
  providers: [LicenseService, LicenseGuardMiddleware],
  exports: [LicenseService, LicenseGuardMiddleware],
})
export class LicenseModule {}

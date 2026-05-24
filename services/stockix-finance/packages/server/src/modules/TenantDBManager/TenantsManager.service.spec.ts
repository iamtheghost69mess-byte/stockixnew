import { HttpStatus } from '@nestjs/common';
import { ServiceError } from '@/modules/Items/ServiceError';
import { TenantsManagerService } from './TenantsManager';

describe('TenantsManagerService.createTenant', () => {
  it('propagates ORGANIZATION_LIMIT_REACHED from license service', async () => {
    const licenseService = {
      assertCanCreateOrganization: jest.fn().mockRejectedValue(
        new ServiceError(
          'ORGANIZATION_LIMIT_REACHED',
          'Organization limit reached for current plan',
          undefined,
          HttpStatus.PAYMENT_REQUIRED,
        ),
      ),
    };
    const service = new TenantsManagerService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      licenseService as never,
      {} as never,
    );

    await expect(service.createTenant()).rejects.toMatchObject({
      errorType: 'ORGANIZATION_LIMIT_REACHED',
    });
    expect(licenseService.assertCanCreateOrganization).toHaveBeenCalled();
  });
});

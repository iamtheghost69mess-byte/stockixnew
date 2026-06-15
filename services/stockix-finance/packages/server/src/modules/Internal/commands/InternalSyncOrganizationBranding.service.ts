import { Inject, Injectable } from '@nestjs/common';
import { TenantRepository } from '@/modules/System/repositories/Tenant.repository';
import { TenantModel } from '@/modules/System/models/TenantModel';

export type SyncOrganizationBrandingDto = {
  tenantId: number;
  name?: string;
  primaryColor?: string | null;
  logoUrl?: string | null;
};

@Injectable()
export class InternalSyncOrganizationBrandingService {
  constructor(
    @Inject(TenantRepository)
    private readonly tenantRepository: TenantRepository,
    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
  ) {}

  async sync(dto: SyncOrganizationBrandingDto) {
    const tenant = await this.tenantModel
      .query()
      .findById(dto.tenantId)
      .withGraphFetched('metadata');
    if (!tenant) {
      throw new Error(`tenant_not_found:${dto.tenantId}`);
    }

    const existing = tenant.metadata ?? {};
    const patch: Record<string, unknown> = { ...existing };

    if (dto.name?.trim()) {
      patch.name = dto.name.trim();
    }
    if (dto.primaryColor !== undefined) {
      patch.primaryColor = dto.primaryColor;
    }
    if (dto.logoUrl !== undefined) {
      patch.logoUri = dto.logoUrl;
    }

    await this.tenantRepository.saveMetadata(dto.tenantId, patch);

    return { success: true, tenantId: dto.tenantId };
  }
}

import { defaultTo } from 'lodash';
import { BuildOrganizationDto, UpdateOrganizationDto } from './dtos/Organization.dto';

type OrganizationMetadataInput = BuildOrganizationDto | UpdateOrganizationDto;

/**
 * Normalizes organization metadata before persisting to tenants_metadata.
 */
export const normalizeOrganizationMetadataForSave = (
  organizationDTO: OrganizationMetadataInput,
  existingBaseCurrency?: string,
): Record<string, any> => {
  const payload: Record<string, any> = { ...organizationDTO };

  if (Array.isArray(organizationDTO.displayCurrencies)) {
    payload.displayCurrencies = JSON.stringify(organizationDTO.displayCurrencies);
  }

  if (Object.prototype.hasOwnProperty.call(organizationDTO, 'secondaryCurrency')) {
    payload.secondaryCurrency = organizationDTO.secondaryCurrency
      ? organizationDTO.secondaryCurrency
      : null;
  }

  const baseCurrency =
    organizationDTO.baseCurrency ?? existingBaseCurrency ?? null;

  if (
    payload.secondaryCurrency &&
    baseCurrency &&
    payload.secondaryCurrency === baseCurrency
  ) {
    payload.secondaryCurrency = null;
  }

  return payload;
};

/**
 * Transformes build DTO object.
 */
export const transformBuildDto = (
  buildDTO: BuildOrganizationDto,
): Record<string, any> => {
  return normalizeOrganizationMetadataForSave({
    ...buildDTO,
    dateFormat: defaultTo(buildDTO.dateFormat, 'DD MMM YYYY'),
  });
};

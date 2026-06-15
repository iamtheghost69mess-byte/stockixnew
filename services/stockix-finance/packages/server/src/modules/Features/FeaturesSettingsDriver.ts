import { FeaturesConfigureManager } from './FeaturesConfigureManager';
import { Inject, Injectable } from '@nestjs/common';
import { SETTINGS_PROVIDER } from '../Settings/Settings.types';
import { SettingsStore } from '../Settings/SettingsStore';
import { IFeatureAllItem } from '@/common/types/Features';
import { FeaturesConfigure } from './FeaturesConfigure';
import { LicenseService } from '../License/License.service';
import { ClsService } from 'nestjs-cls';
import { TenantModel } from '../System/models/TenantModel';

@Injectable()
export class FeaturesSettingsDriver {
  constructor(
    private readonly configure: FeaturesConfigureManager,
    private readonly featuresConfigure: FeaturesConfigure,
    private readonly licenseService: LicenseService,
    private readonly clsService: ClsService,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(SETTINGS_PROVIDER)
    private readonly settings: () => SettingsStore,
  ) {}

  /**
   * Turns-on the given feature name.
   * @param {string} feature - The feature name.
   * @returns {Promise<void>}
   */
  async turnOn(feature: string) {
    const settingsStore = await this.settings();

    settingsStore.set({ group: 'features', key: feature, value: true });
  }

  /**
   * Turns-off the given feature name.
   * @param {string} feature - The feature name.
   * @returns {Promise<void>}
   */
  async turnOff(feature: string) {
    const settingsStore = await this.settings();

    settingsStore.set({ group: 'features', key: feature, value: false });
  }

  /**
   * Determines the given feature name is accessible.
   * @param {string} feature - The feature name.
   * @returns {Promise<boolean|null|undefined>}
   */
  async accessible(feature: string) {
    const settingsStore = await this.settings();

    const defaultValue = this.configure.getFeatureConfigure(
      feature,
      'defaultValue',
    );
    const settingsValue = settingsStore.get(
      { group: 'features', key: feature },
      defaultValue,
    );

    try {
      const organizationId = this.clsService.get('organizationId') as
        | string
        | undefined;
      if (!organizationId) {
        return settingsValue;
      }

      const tenant = await this.tenantModel
        .query()
        .findOne({ organizationId });
      if (!tenant) {
        return settingsValue;
      }

      const license = await this.licenseService.findByTenantId(tenant.id);
      if (!license?.featureFlags || typeof license.featureFlags !== 'object') {
        return settingsValue;
      }

      if (Object.prototype.hasOwnProperty.call(license.featureFlags, feature)) {
        return Boolean(license.featureFlags[feature]);
      }
    } catch {
      return settingsValue;
    }

    return settingsValue;
  }

  /**
   * Retrieves the all features and their accessible value and default value.
   * @returns {Promise<IFeatureAllItem>}
   */
  async all(): Promise<IFeatureAllItem[]> {
    const mappedOpers = this.featuresConfigure
      .getConfigure()
      .map(async (featureConfigure) => {
        const { name, defaultValue } = featureConfigure;
        const isAccessible = await this.accessible(featureConfigure.name);
        return { name, isAccessible, defaultAccessible: defaultValue };
      });
    return Promise.all(mappedOpers);
  }
}

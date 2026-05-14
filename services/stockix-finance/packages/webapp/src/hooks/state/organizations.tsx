// @ts-nocheck
import { useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setOrganizations } from '@/store/organizations/organizations.actions';
import { getCurrentOrganizationFactory } from '@/store/authentication/authentication.selectors';

export const useSetOrganizations = () => {
  const dispatch = useDispatch();

  return useCallback((organizations) => {
    dispatch(setOrganizations(organizations))    
  }, [dispatch]);
};

export const useCurrentOrganization = () => {
  return useSelector(getCurrentOrganizationFactory());
};

export const useDisplayCurrencies = (): string[] => {
  const org = useCurrentOrganization();
  return org?.display_currencies ?? [];
};

/**
 * Returns the tenant's optional secondary currency code (or null if not set).
 * When set, every currency output across the app shows a converted secondary
 * value below the primary one.
 */
export const useSecondaryCurrency = (): string | null => {
  const org = useCurrentOrganization();
  const code = org?.secondary_currency;
  return code ? code : null;
};
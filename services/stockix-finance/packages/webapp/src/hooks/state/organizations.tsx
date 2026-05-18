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

/**
 * Returns the tenant's optional secondary currency (null if not configured).
 * Use this when you need exactly the secondary currency — e.g. financial
 * report secondary columns where you want one currency, not the full list.
 */
export const useSecondaryCurrency = (): string | null => {
  const org = useCurrentOrganization();
  return org?.secondary_currency || null;
};

/**
 * Returns the effective set of display currencies for the tenant:
 * - Configured display_currencies from org settings
 * - Plus secondary_currency (if set and not already included)
 * - Base currency is always excluded (amounts in base need no conversion)
 */
export const useDisplayCurrencies = (): string[] => {
  const org = useCurrentOrganization();
  const base = org?.base_currency;
  const secondary = org?.secondary_currency;
  const configured: string[] = Array.isArray(org?.display_currencies)
    ? org.display_currencies
    : [];

  const effective =
    secondary && !configured.includes(secondary)
      ? [...configured, secondary]
      : configured;

  return effective.filter((c) => Boolean(c) && c !== base);
};
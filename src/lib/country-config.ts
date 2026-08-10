import { db } from '@/lib/db';

export interface CountryConfig {
  code: string;
  name: string;
  nameAr: string;
  currency: string;
  phonePrefix: string;
  timezone: string;
  languages: string[];
  taxRules: Record<string, unknown> | null;
}

/**
 * Country behavior is data, not compile-time constants — nothing about phone format,
 * currency, or tax rules is hard-coded to Jordan. See ARCHITECTURE.md "Country
 * configuration."
 */
export async function getCountryConfig(countryId: string): Promise<CountryConfig | null> {
  const country = await db.country.findUnique({ where: { id: countryId } });
  if (!country) return null;
  return {
    code: country.code,
    name: country.name,
    nameAr: country.nameAr,
    currency: country.currency,
    phonePrefix: country.phonePrefix,
    timezone: country.timezone,
    languages: country.languages,
    taxRules: (country.taxRules as Record<string, unknown> | null) ?? null,
  };
}

export function isValidLocalPhone(phonePrefix: string, phone: string): boolean {
  // Jordan (+962): 9 digits after the prefix, starting with 7 (mobile) — e.g. 7XXXXXXXX.
  // Extend this map as GCC countries are onboarded rather than special-casing in callers.
  const rules: Record<string, RegExp> = {
    '+962': /^7[789]\d{7}$/,
  };
  const rule = rules[phonePrefix];
  if (!rule) return phone.length > 0; // unknown country: don't block, just require non-empty
  return rule.test(phone.replace(/^0/, ''));
}

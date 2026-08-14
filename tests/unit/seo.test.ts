import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { physicianJsonLd, serializeJsonLd, breadcrumbJsonLd } from '@/lib/seo/json-ld';
import { alternatesFor, absoluteUrl } from '@/lib/seo/site';

const ORIGIN = 'https://example.test';

const baseDoctor = {
  id: 'doc-1',
  locale: 'ar' as const,
  name: 'د. ليلى حداد',
  specialty: 'طب عام',
  priceMinor: 2000,
  currency: 'JOD',
  clinicName: 'عيادة عمّان',
  branches: [{ name: 'Main', city: 'عمان' }],
};

describe('SEO structured data', () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGIN;
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = original;
  });

  it('omits aggregateRating entirely when nobody has rated the doctor', () => {
    const withNone = physicianJsonLd({ ...baseDoctor, ratingCount: 0, ratingAverage: 0 });
    expect(withNone.aggregateRating).toBeUndefined();

    const withMissing = physicianJsonLd(baseDoctor);
    expect(withMissing.aggregateRating).toBeUndefined();
  });

  it('publishes aggregateRating only once real ratings exist', () => {
    const rated = physicianJsonLd({ ...baseDoctor, ratingCount: 12, ratingAverage: 4.5 });
    expect(rated.aggregateRating).toMatchObject({ ratingValue: 4.5, reviewCount: 12 });
  });

  it('converts minor units to a decimal price rather than publishing fils as dinars', () => {
    const jsonLd = physicianJsonLd({ ...baseDoctor, priceMinor: 2000 });
    expect((jsonLd.offers as Record<string, unknown>).price).toBe('20.00');
    expect((jsonLd.offers as Record<string, unknown>).priceCurrency).toBe('JOD');
  });

  it('escapes < so a bio containing markup cannot close the script tag', () => {
    const jsonLd = physicianJsonLd({ ...baseDoctor, bio: 'hello </script><img src=x onerror=alert(1)>' });
    const serialized = serializeJsonLd(jsonLd);
    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c');
  });

  it('drops empty optional fields instead of emitting nulls', () => {
    const jsonLd = physicianJsonLd({ ...baseDoctor, bio: null, gender: null, languages: [] });
    expect(jsonLd).not.toHaveProperty('description');
    expect(jsonLd).not.toHaveProperty('gender');
    expect(jsonLd).not.toHaveProperty('knowsLanguage');
  });

  it('builds absolute breadcrumb URLs', () => {
    const crumbs = breadcrumbJsonLd([{ name: 'Home', path: '/ar' }]);
    const first = (crumbs.itemListElement as Array<Record<string, unknown>>)[0];
    expect(first?.item).toBe(`${ORIGIN}/ar`);
    expect(first?.position).toBe(1);
  });
});

describe('canonical and hreflang', () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = `${ORIGIN}/`;
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = original;
  });

  it('strips a trailing slash so URLs never double up', () => {
    expect(absoluteUrl('/ar')).toBe(`${ORIGIN}/ar`);
  });

  it('points each locale at itself and x-default at Arabic', () => {
    const alt = alternatesFor('en', '/doctors/doc-1');
    expect(alt.canonical).toBe(`${ORIGIN}/en/doctors/doc-1`);
    expect(alt.languages.ar).toBe(`${ORIGIN}/ar/doctors/doc-1`);
    expect(alt.languages.en).toBe(`${ORIGIN}/en/doctors/doc-1`);
    expect(alt.languages['x-default']).toBe(`${ORIGIN}/ar/doctors/doc-1`);
  });

  it('does not emit a bare trailing slash for the home path', () => {
    expect(alternatesFor('ar', '/').canonical).toBe(`${ORIGIN}/ar`);
  });
});

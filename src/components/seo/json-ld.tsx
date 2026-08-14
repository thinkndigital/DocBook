import { serializeJsonLd } from '@/lib/seo/json-ld';

/**
 * Renders structured data. Server component — this never ships JavaScript to the client
 * and never runs; the browser treats `application/ld+json` as inert data.
 */
export function JsonLd({ data }: { data: Parameters<typeof serializeJsonLd>[0] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

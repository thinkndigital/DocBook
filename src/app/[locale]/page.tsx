import Link from 'next/link';
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';

export default function MarketplaceHomePage({ params }: { params: { locale: Locale } }) {
  const dict = getDictionary(params.locale);

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-3xl font-bold text-neutral-900">{dict.home.title}</h1>
      <p className="max-w-md text-neutral-600">{dict.home.subtitle}</p>
      <Link
        href={`/${params.locale}/doctors`}
        className="rounded-md bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        {dict.home.searchCta}
      </Link>
    </div>
  );
}

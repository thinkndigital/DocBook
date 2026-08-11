import { Suspense } from 'react';
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { MarketplaceLoginForm } from './login-form';

export default function MarketplaceLoginPage({ params }: { params: { locale: Locale } }) {
  const dict = getDictionary(params.locale);
  return (
    <Suspense>
      <MarketplaceLoginForm locale={params.locale} dict={dict} />
    </Suspense>
  );
}

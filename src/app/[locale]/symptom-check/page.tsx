import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { SymptomForm } from './symptom-form';
import type { Metadata } from 'next';
import { alternatesFor } from '@/lib/seo/site';
import { getDictionary as getSeoDictionary } from '@/lib/i18n/dictionaries';

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const dict = getSeoDictionary(params.locale);
  return {
    title: dict.seo.symptomCheckTitle,
    description: dict.seo.symptomCheckDescription,
    alternates: alternatesFor(params.locale as 'ar' | 'en', '/symptom-check'),
  };
}

export const dynamic = 'force-dynamic';

export default function SymptomCheckPage({ params }: { params: { locale: Locale } }) {
  const dict = getDictionary(params.locale);
  return <SymptomForm locale={params.locale} dict={dict} />;
}

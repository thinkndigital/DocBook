import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { SymptomForm } from './symptom-form';

export const dynamic = 'force-dynamic';

export default function SymptomCheckPage({ params }: { params: { locale: Locale } }) {
  const dict = getDictionary(params.locale);
  return <SymptomForm locale={params.locale} dict={dict} />;
}

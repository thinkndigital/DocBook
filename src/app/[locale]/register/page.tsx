import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { RegisterForm } from './register-form';

export default function RegisterPage({ params }: { params: { locale: Locale } }) {
  const dict = getDictionary(params.locale);
  return <RegisterForm locale={params.locale} dict={dict} />;
}

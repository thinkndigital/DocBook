import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

/**
 * There is no self-service password reset. `EMAIL_PROVIDER=dev` only logs — it delivers
 * nothing to a real inbox — and a reset flow that promises a link that will never arrive is
 * worse than admitting the limit and saying exactly who can help.
 *
 * The admin-side fix is real: every doctor/staff/representative/tenant-admin list page has
 * a "reset password" action (src/components/admin/reset-password-button.tsx), and a patient
 * who forgot theirs is registered with their own chosen password, so the desk/clinic that
 * registered them has no record of it either — they'd re-register or the platform admin
 * resets via /admin.
 */
export default function ForgotPasswordPage() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-4 text-xl font-bold text-neutral-900">نسيت كلمة السر؟</h1>
        <p className="mb-4 text-sm text-neutral-700">
          لا يوجد حالياً استرجاع تلقائي عبر البريد الإلكتروني. لإعادة تعيين كلمة السر، تواصل
          مع الجهة التي أنشأت حسابك:
        </p>
        <ul className="mb-4 flex flex-col gap-2 text-sm text-neutral-700">
          <li>
            <strong>طبيب أو موظف استقبال:</strong> تواصل مع إدارة عيادتك — لديها زر
            &ldquo;إعادة تعيين كلمة السر&rdquo; في لوحة الإدارة.
          </li>
          <li>
            <strong>مدير جهة صحية أو مندوب:</strong> تواصل مع إدارة المنصّة.
          </li>
          <li>
            <strong>مريض:</strong> إذا كنت سجّلت حسابك بنفسك، لا يملك أحد كلمة سرّك — تواصل مع
            إدارة المنصّة لإعادة التعيين.
          </li>
        </ul>
        <Link href="/login" className="text-sm text-brand-700 hover:underline">
          الرجوع لتسجيل الدخول
        </Link>
      </Card>
    </div>
  );
}

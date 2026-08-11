import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { ensureCalendarFeedToken } from '@/lib/services/calendar';
import { CalendarFeedPanel } from './feed-panel';

export const dynamic = 'force-dynamic';

export default async function DoctorCalendarPage() {
  const session = await getServerSession(authOptions);
  const token = await ensureCalendarFeedToken(session!.user.id, session!.user);

  if (!token) return <p className="text-neutral-600">لا يوجد ملف طبيب مرتبط بهذا الحساب.</p>;

  const url = `${process.env.NEXTAUTH_URL ?? ''}/api/v1/calendar/${token}.ics`;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">مزامنة التقويم</h1>
      <p className="mb-6 text-sm text-neutral-600">
        اشترك بهذا الرابط من Google Calendar أو Apple Calendar أو Outlook لتظهر مواعيدك تلقائياً في تقويمك.
      </p>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold text-neutral-900">رابط الاشتراك الخاص بك</h2>
        <p className="mb-3 text-sm text-amber-700">
          هذا الرابط سري ويمنح الاطلاع على جدول مواعيدك — لا تشاركه. لا يتضمن أي بيانات طبية.
        </p>
        <CalendarFeedPanel initialUrl={url} />
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-neutral-900">كيفية الإضافة</h2>
        <ul className="flex flex-col gap-2 text-sm text-neutral-700">
          <li>
            <strong>Google Calendar:</strong> Other calendars → From URL → ألصق الرابط
          </li>
          <li>
            <strong>Apple Calendar:</strong> File → New Calendar Subscription → ألصق الرابط
          </li>
          <li>
            <strong>Outlook:</strong> Add calendar → Subscribe from web → ألصق الرابط
          </li>
        </ul>
        <p className="mt-4 text-xs text-neutral-500">
          المزامنة باتجاه واحد: تظهر مواعيد DocBook في تقويمك، ولا تُقرأ التزاماتك الخارجية لحجب أوقات الحجز.
        </p>
      </Card>
    </div>
  );
}

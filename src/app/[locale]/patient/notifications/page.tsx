import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { Locale } from '@/lib/i18n/dictionaries';
import { listUserNotifications } from '@/lib/services/notifications';
import { NotificationList } from './notification-list';

export const dynamic = 'force-dynamic';

const T = {
  ar: { title: 'الإشعارات', markAllRead: 'تعليم الكل كمقروء', none: 'لا توجد إشعارات.', unread: 'غير مقروء' },
  en: { title: 'Notifications', markAllRead: 'Mark all read', none: 'No notifications.', unread: 'unread' },
} as const;

export default async function PatientNotificationsPage({ params }: { params: { locale: Locale } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${params.locale}/login?callbackUrl=/${params.locale}/patient/notifications`);

  const t = T[params.locale === 'en' ? 'en' : 'ar'];
  const notifications = await listUserNotifications(session.user.id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t.title}</h1>
      <NotificationList
        initial={notifications.map((n) => ({
          id: n.id,
          type: n.type,
          createdAt: n.createdAt.toISOString(),
          readAt: n.readAt ? n.readAt.toISOString() : null,
          payload: n.payload as { subject?: string; body?: string } | null,
        }))}
        labels={t}
      />
    </div>
  );
}

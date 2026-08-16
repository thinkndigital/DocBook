import { Badge } from '@/components/ui/badge';
import { searchUsersAdmin } from '@/lib/services/admin-ops';
import type { UserStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<UserStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  SUSPENDED: 'danger',
  DEACTIVATED: 'neutral',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'نشط',
  INVITED: 'مدعو',
  SUSPENDED: 'موقوف',
  DEACTIVATED: 'معطّل',
};

export default async function AdminUsersPage({ searchParams }: { searchParams: { query?: string } }) {
  const query = searchParams.query ?? '';
  const results = query ? await searchUsersAdmin(query) : [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">بحث المستخدمين</h1>
      <p className="mb-6 text-sm text-neutral-500">
        بحث عبر كل الجهات الصحية لمعرفة الجهة والدور المرتبطين بحساب ما. لا يعرض كلمة المرور ولا رموز التحقق بخطوتين.
      </p>

      <form className="mb-6 flex flex-wrap gap-3" method="get">
        <input
          type="text"
          name="query"
          defaultValue={query}
          placeholder="الاسم أو البريد الإلكتروني"
          className="min-w-[20rem] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
          بحث
        </button>
      </form>

      {query && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-4 py-3 font-medium">الاسم</th>
                <th className="px-4 py-3 font-medium">البريد الإلكتروني</th>
                <th className="px-4 py-3 font-medium">الدور</th>
                <th className="px-4 py-3 font-medium">الجهة</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium">آخر دخول</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                    لا توجد نتائج مطابقة.
                  </td>
                </tr>
              )}
              {results.map((u) => (
                <tr key={u.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3 font-medium text-neutral-900">{u.name}</td>
                  <td className="px-4 py-3 text-neutral-600">{u.email}</td>
                  <td className="px-4 py-3 text-neutral-600">{u.role}</td>
                  <td className="px-4 py-3 text-neutral-600">{u.tenant?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                    {u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

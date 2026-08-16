import { listAuditLogs, listAuditLogFacets } from '@/lib/services/admin-ops';

export const dynamic = 'force-dynamic';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: { action?: string; entityType?: string; cursor?: string };
}) {
  const [{ items: logs, nextCursor }, facets] = await Promise.all([
    listAuditLogs({
      action: searchParams.action || undefined,
      entityType: searchParams.entityType || undefined,
      cursor: searchParams.cursor,
      limit: 50,
    }),
    listAuditLogFacets(),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">سجل التدقيق</h1>
      <p className="mb-6 text-sm text-neutral-500">
        سجل بكل عملية إنشاء/تعديل/اطلاع مسجَّلة في المنصة. للقراءة فقط — لا يمكن تعديل أو حذف أي سجل.
      </p>

      <form className="mb-4 flex flex-wrap gap-3" method="get">
        <select name="entityType" defaultValue={searchParams.entityType ?? ''} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">كل الأنواع</option>
          {facets.entityTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={searchParams.action ?? ''} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">كل الإجراءات</option>
          {facets.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm text-white">
          تصفية
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">الوقت</th>
              <th className="px-4 py-3 font-medium">الإجراء</th>
              <th className="px-4 py-3 font-medium">النوع</th>
              <th className="px-4 py-3 font-medium">الفاعل</th>
              <th className="px-4 py-3 font-medium">الجهة</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  لا توجد سجلات مطابقة.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-neutral-100">
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{formatDate(log.createdAt)}</td>
                <td className="px-4 py-3 font-medium text-neutral-900">{log.action}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {log.entityType}
                  {log.entityId && <span className="text-neutral-400"> · {log.entityId.slice(0, 8)}</span>}
                </td>
                <td className="px-4 py-3 text-neutral-600">{log.actor ? `${log.actor.name} (${log.actor.role})` : '—'}</td>
                <td className="px-4 py-3 text-neutral-600">{log.tenant?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="mt-4 text-center">
          <a
            href={`?${new URLSearchParams({
              ...(searchParams.action ? { action: searchParams.action } : {}),
              ...(searchParams.entityType ? { entityType: searchParams.entityType } : {}),
              cursor: nextCursor,
            }).toString()}`}
            className="inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            المزيد
          </a>
        </div>
      )}
    </div>
  );
}

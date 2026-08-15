'use client';

import { useRouter } from 'next/navigation';
import { CallRoom } from './call-room';

export function CallPageClient({ appointmentId, backHref }: { appointmentId: string; backHref: string }) {
  const router = useRouter();
  return <CallRoom appointmentId={appointmentId} onEnded={() => router.push(backHref)} />;
}

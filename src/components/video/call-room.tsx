'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type Phase = 'REQUESTING_MEDIA' | 'WAITING' | 'CONNECTING' | 'CONNECTED' | 'ENDED' | 'ERROR';

interface Props {
  appointmentId: string;
  onEnded: () => void;
}

/**
 * Self-hosted 1:1 WebRTC call — no video vendor is configured (see CLAUDE.md
 * "telemedicine"). Signaling is short-poll against /api/v1/video/{id}/signals rather than a
 * push channel: Cloud Run may run several instances, so an in-memory pub/sub would only
 * reach clients polling the same instance. STUN-only by default (no TURN server); this
 * works on most home/office networks but can fail behind strict symmetric NAT — a TURN URL
 * can be added via STUN_SERVER_URLS without touching this component.
 *
 * The doctor always creates the offer, the patient always answers — an arbitrary but fixed
 * convention so both sides don't race to offer.
 */
export function CallRoom({ appointmentId, onEnded }: Props) {
  const [phase, setPhase] = useState<Phase>('REQUESTING_MEDIA');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const lastSeqRef = useRef(0);
  const roleRef = useRef<'DOCTOR' | 'PATIENT' | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function postSignal(kind: 'offer' | 'answer' | 'ice-candidate', payload: unknown) {
      await fetch(`/api/v1/video/${appointmentId}/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, payload }),
      });
    }

    async function start() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        setError('تعذّر الوصول للكاميرا أو الميكروفون. تحقق من أذونات المتصفح.');
        setPhase('ERROR');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const joinRes = await fetch(`/api/v1/video/${appointmentId}/join`, { method: 'POST' });
      if (!joinRes.ok) {
        const body = await joinRes.json().catch(() => null);
        setError(body?.error?.message ?? 'تعذّر بدء المكالمة.');
        setPhase('ERROR');
        return;
      }
      const { data } = await joinRes.json();
      if (cancelled) return;
      roleRef.current = data.participant;
      setPhase(data.status === 'IN_PROGRESS' ? 'CONNECTING' : 'WAITING');

      const pc = new RTCPeerConnection({ iceServers: data.iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0] ?? null;
        setPhase('CONNECTED');
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) postSignal('ice-candidate', event.candidate.toJSON());
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setPhase('CONNECTED');
        if (pc.connectionState === 'failed') {
          setError('انقطع الاتصال. حاول إعادة تحميل الصفحة.');
          setPhase('ERROR');
        }
      };

      if (data.participant === 'DOCTOR') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await postSignal('offer', offer);
      }

      pollSignals();
    }

    async function pollSignals() {
      if (cancelled || endedRef.current) return;
      try {
        const res = await fetch(`/api/v1/video/${appointmentId}/signals?after=${lastSeqRef.current}`);
        if (res.ok) {
          const { data } = await res.json();
          for (const signal of data as Array<{ seq: number; kind: string; payload: unknown }>) {
            lastSeqRef.current = Math.max(lastSeqRef.current, signal.seq);
            await handleSignal(signal.kind, signal.payload);
          }
        }
      } catch {
        /* transient network error — next poll retries */
      }
      if (!cancelled && !endedRef.current) {
        pollTimerRef.current = setTimeout(pollSignals, 1500);
      }
    }

    async function handleSignal(kind: string, payload: unknown) {
      const pc = pcRef.current;
      if (!pc) return;

      if (kind === 'offer' && roleRef.current === 'PATIENT') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
        remoteDescSetRef.current = true;
        await flushPendingCandidates(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await postSignal('answer', answer);
      } else if (kind === 'answer' && roleRef.current === 'DOCTOR') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
        remoteDescSetRef.current = true;
        await flushPendingCandidates(pc);
      } else if (kind === 'ice-candidate') {
        if (remoteDescSetRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
        } else {
          pendingCandidatesRef.current.push(payload as RTCIceCandidateInit);
        }
      }
    }

    async function flushPendingCandidates(pc: RTCPeerConnection) {
      const queued = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
      for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
    }

    start();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [appointmentId]);

  function toggleMute() {
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  }

  function toggleVideo() {
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = videoOff));
    setVideoOff(!videoOff);
  }

  async function endCall() {
    endedRef.current = true;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    await fetch(`/api/v1/video/${appointmentId}/end`, { method: 'POST' }).catch(() => {});
    setPhase('ENDED');
    onEnded();
  }

  const PHASE_LABEL: Record<Phase, string> = {
    REQUESTING_MEDIA: 'جارٍ طلب إذن الكاميرا والميكروفون…',
    WAITING: 'بانتظار انضمام الطرف الآخر…',
    CONNECTING: 'جارٍ الاتصال…',
    CONNECTED: 'متصل',
    ENDED: 'انتهت المكالمة',
    ERROR: 'حدث خطأ',
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-neutral-900">
        <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-3 left-3 h-28 w-40 rounded-md border-2 border-white object-cover shadow-lg"
        />
        <div className="absolute top-3 right-3 rounded-md bg-black/60 px-3 py-1 text-xs text-white">
          {PHASE_LABEL[phase]}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-center gap-3">
        <Button type="button" variant="secondary" onClick={toggleMute}>
          {muted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
        </Button>
        <Button type="button" variant="secondary" onClick={toggleVideo}>
          {videoOff ? 'تشغيل الكاميرا' : 'إيقاف الكاميرا'}
        </Button>
        <Button type="button" variant="danger" onClick={endCall}>
          إنهاء المكالمة
        </Button>
      </div>
    </div>
  );
}

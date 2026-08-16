'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Dictionary } from '@/lib/i18n/dictionaries';

interface Props {
  appointmentId: string;
  dict: Dictionary;
}

const SCALE = [1, 2, 3, 4, 5];

function RatingSelect({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  required?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm text-neutral-700">
      <span>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
      >
        <option value="">—</option>
        {SCALE.map((n) => (
          <option key={n} value={n}>
            {n} / 5
          </option>
        ))}
      </select>
    </label>
  );
}

export function ReviewButton({ appointmentId, dict }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingOverall, setRatingOverall] = useState<number | ''>('');
  const [ratingDoctor, setRatingDoctor] = useState<number | ''>('');
  const [ratingStaff, setRatingStaff] = useState<number | ''>('');
  const [ratingWaitTime, setRatingWaitTime] = useState<number | ''>('');
  const [ratingClinic, setRatingClinic] = useState<number | ''>('');
  const [comment, setComment] = useState('');

  async function submit() {
    if (!ratingOverall || !ratingDoctor) {
      setError(dict.patientDashboard.reviewMissingRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/v1/patient/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId,
        ratingOverall,
        ratingDoctor,
        ratingStaff: ratingStaff || undefined,
        ratingWaitTime: ratingWaitTime || undefined,
        ratingClinic: ratingClinic || undefined,
        comment: comment || undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(dict.patientDashboard.reviewFailed);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
      >
        {dict.patientDashboard.leaveReview}
      </button>
    );
  }

  return (
    <div className="absolute inset-x-0 top-full z-10 mt-2 w-80 rounded-lg border border-neutral-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-900">{dict.patientDashboard.reviewTitle}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-500 hover:underline">
          {dict.patientDashboard.rescheduleClose}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <RatingSelect label={dict.patientDashboard.reviewOverall} value={ratingOverall} onChange={setRatingOverall} required />
        <RatingSelect label={dict.patientDashboard.reviewDoctor} value={ratingDoctor} onChange={setRatingDoctor} required />
        <RatingSelect label={dict.patientDashboard.reviewStaff} value={ratingStaff} onChange={setRatingStaff} />
        <RatingSelect label={dict.patientDashboard.reviewWaitTime} value={ratingWaitTime} onChange={setRatingWaitTime} />
        <RatingSelect label={dict.patientDashboard.reviewClinic} value={ratingClinic} onChange={setRatingClinic} />
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={dict.patientDashboard.reviewCommentPlaceholder}
          rows={3}
          maxLength={1000}
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={submitting}
        onClick={submit}
        className="mt-3 w-full rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting ? dict.common.loading : dict.patientDashboard.reviewSubmit}
      </button>
    </div>
  );
}

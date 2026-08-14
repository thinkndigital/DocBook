'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary: a failure in the root layout itself, which `error.tsx` cannot
 * catch because it renders *inside* that layout. It therefore supplies its own
 * `<html>`/`<body>`.
 *
 * Next gives the client only `error.digest` — a hash that correlates with the real message
 * in the server log. That is the correct trade (the message can contain anything, including
 * clinical text) but it means the user sees an unactionable page unless the digest is
 * surfaced, so it is shown deliberately: it is the only thing that lets support connect a
 * report to a log line, and it reveals nothing on its own.
 *
 * Reporting happens server-side. Posting from here would need an unauthenticated ingest
 * endpoint — an open write channel into the error stream, callable by anyone, at exactly
 * the moment the app is known to be unhealthy.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Console only: this is the browser, and the same failure is already recorded on the
    // server with its full (redacted) message.
    console.error('Root layout error', error.digest ?? '');
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>حدث خطأ غير متوقّع</h1>
        <p style={{ color: '#525252', marginTop: '0.5rem' }}>
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p style={{ color: '#a3a3a3', fontSize: '0.75rem', marginTop: '1rem' }}>
            Reference: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '1.5rem',
            padding: '0.5rem 1.25rem',
            borderRadius: '0.375rem',
            border: 'none',
            background: '#0d9488',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          إعادة المحاولة / Retry
        </button>
      </body>
    </html>
  );
}

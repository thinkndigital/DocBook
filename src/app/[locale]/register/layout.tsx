import type { Metadata } from 'next';

/**
 * Authenticated surface: never indexed.
 *
 * A crawler that follows a link here is served the login page, and without this it would
 * index *that* under a patient-data URL — publishing the address of a private route and
 * turning any future auth mistake on it into something discovered by search. robots.ts
 * disallows the same paths; this is the layer that survives a crawler ignoring robots.txt.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

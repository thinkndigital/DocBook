/**
 * Password assigned to accounts an admin creates on someone else's behalf (tenant admin
 * onboarding, staff invites). The account holder is expected to change it on first login
 * (Phase 3+ — first-login password reset isn't built yet, so this is a real, usable
 * default in the meantime, not a placeholder).
 */
export const DEFAULT_ASSIGNED_PASSWORD = 'DocBook@2026';

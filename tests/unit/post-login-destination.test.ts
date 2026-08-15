import { describe, it, expect } from 'vitest';
import { postLoginDestination } from '@/lib/auth/post-login-destination';

describe('post-login destination', () => {
  it('sends each staff role to its own portal, not the patient dashboard', () => {
    expect(postLoginDestination('SUPER_ADMIN')).toBe('/admin');
    expect(postLoginDestination('TENANT_ADMIN')).toBe('/tenant');
    expect(postLoginDestination('RECEPTIONIST')).toBe('/tenant');
    expect(postLoginDestination('DOCTOR')).toBe('/doctor');
    expect(postLoginDestination('REPRESENTATIVE')).toBe('/rep');
    expect(postLoginDestination('SUPPLIER')).toBe('/supplier');
  });

  it('keeps patients inside their locale', () => {
    expect(postLoginDestination('PATIENT', 'ar')).toBe('/ar/patient');
    expect(postLoginDestination('PATIENT', 'en')).toBe('/en/patient');
  });

  it('never returns a portal for an unresolved session', () => {
    // The bug this replaces: an admin signing in through the marketplace form landed on
    // /ar/patient. Falling back to a portal would reintroduce the same class of problem
    // for whichever role guessed wrong.
    expect(postLoginDestination(undefined, 'ar')).toBe('/ar');
  });
});

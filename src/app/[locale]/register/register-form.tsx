'use client';

import { useState } from 'react';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';
import { Card } from '@/components/ui/card';
import { PatientRegisterForm } from './patient-register-form';
import { DoctorRegisterForm } from './doctor-register-form';
import { ClinicRegisterForm } from './clinic-register-form';
import { SupplierRegisterForm } from './supplier-register-form';

type Role = 'PATIENT' | 'DOCTOR' | 'CLINIC' | 'SUPPLIER';

interface Props {
  locale: Locale;
  dict: Dictionary;
  countries: Array<{ id: string; name: string; nameAr: string }>;
  cities: Array<{ id: string; name: string; nameAr: string; countryId: string }>;
  specialties: Array<{ id: string; name: string; nameAr: string }>;
}

export function RegisterForm({ locale, dict, countries, cities, specialties }: Props) {
  const [role, setRole] = useState<Role>('PATIENT');
  const nameKey: 'name' | 'nameAr' = locale === 'ar' ? 'nameAr' : 'name';

  const tabs: Array<{ id: Role; label: string }> = [
    { id: 'PATIENT', label: dict.registerRoles.patientTab },
    { id: 'DOCTOR', label: dict.registerRoles.doctorTab },
    { id: 'CLINIC', label: dict.registerRoles.clinicTab },
    { id: 'SUPPLIER', label: dict.registerRoles.supplierTab },
  ];

  return (
    <Card className={`mx-auto w-full ${role === 'PATIENT' ? 'max-w-sm' : 'max-w-xl'}`}>
      <h1 className="mb-4 text-xl font-bold text-neutral-900">{dict.auth.registerTitle}</h1>

      <div className="mb-6 flex gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setRole(tab.id)}
            className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${
              role === tab.id ? 'bg-white text-brand-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {role === 'PATIENT' && <PatientRegisterForm locale={locale} dict={dict} />}
      {role === 'DOCTOR' && (
        <DoctorRegisterForm dict={dict} nameKey={nameKey} countries={countries} cities={cities} specialties={specialties} />
      )}
      {role === 'CLINIC' && <ClinicRegisterForm dict={dict} nameKey={nameKey} countries={countries} cities={cities} />}
      {role === 'SUPPLIER' && <SupplierRegisterForm dict={dict} nameKey={nameKey} countries={countries} />}

      <p className="mt-4 text-center text-sm text-neutral-600">
        {dict.auth.alreadyHaveAccount}{' '}
        <a href={`/${locale}/login`} className="text-brand-700 hover:underline">
          {dict.auth.loginCta}
        </a>
      </p>
    </Card>
  );
}

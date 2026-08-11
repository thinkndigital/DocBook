export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';

export interface Dictionary {
  common: {
    search: string;
    bookNow: string;
    cancel: string;
    save: string;
    loading: string;
    back: string;
  };
  nav: {
    doctors: string;
    login: string;
    register: string;
    myAppointments: string;
    logout: string;
    home: string;
  };
  home: {
    title: string;
    subtitle: string;
    searchCta: string;
  };
  doctors: {
    title: string;
    filterSpecialty: string;
    filterCity: string;
    filterGender: string;
    allSpecialties: string;
    allCities: string;
    anyGender: string;
    male: string;
    female: string;
    noResults: string;
    verified: string;
    consultationFee: string;
    viewProfile: string;
    yearsExperience: string;
  };
  doctorProfile: {
    about: string;
    branches: string;
    bookAppointment: string;
    selectBranch: string;
    selectService: string;
    selectDate: string;
    availableSlots: string;
    noSlots: string;
    loginToBook: string;
    confirmBooking: string;
    bookingConfirmed: string;
    bookingFailed: string;
  };
  auth: {
    loginTitle: string;
    registerTitle: string;
    email: string;
    password: string;
    name: string;
    phone: string;
    alreadyHaveAccount: string;
    dontHaveAccount: string;
    loginCta: string;
    registerCta: string;
    invalidCredentials: string;
    registrationFailed: string;
  };
  patientDashboard: {
    title: string;
    upcoming: string;
    past: string;
    noAppointments: string;
    cancelAppointment: string;
    status: Record<string, string>;
  };
}

const ar: Dictionary = {
  common: { search: 'بحث', bookNow: 'احجز الآن', cancel: 'إلغاء', save: 'حفظ', loading: '...جارٍ التحميل', back: 'رجوع' },
  nav: { doctors: 'الأطباء', login: 'تسجيل الدخول', register: 'إنشاء حساب', myAppointments: 'مواعيدي', logout: 'خروج', home: 'الرئيسية' },
  home: {
    title: 'ابحث واحجز موعدك مع أفضل الأطباء',
    subtitle: 'منصة موثوقة لحجز مواعيد الأطباء والعيادات في الأردن',
    searchCta: 'ابحث عن طبيب',
  },
  doctors: {
    title: 'الأطباء',
    filterSpecialty: 'التخصص',
    filterCity: 'المدينة',
    filterGender: 'الجنس',
    allSpecialties: 'كل التخصصات',
    allCities: 'كل المدن',
    anyGender: 'الكل',
    male: 'ذكر',
    female: 'أنثى',
    noResults: 'لا توجد نتائج مطابقة.',
    verified: 'موثّق',
    consultationFee: 'رسوم الكشف',
    viewProfile: 'عرض الملف',
    yearsExperience: 'سنوات خبرة',
  },
  doctorProfile: {
    about: 'نبذة',
    branches: 'الفروع',
    bookAppointment: 'حجز موعد',
    selectBranch: 'اختر الفرع',
    selectService: 'اختر الخدمة',
    selectDate: 'اختر التاريخ',
    availableSlots: 'الأوقات المتاحة',
    noSlots: 'لا توجد أوقات متاحة في هذا اليوم.',
    loginToBook: 'سجّل الدخول لحجز موعد',
    confirmBooking: 'تأكيد الحجز',
    bookingConfirmed: 'تم تأكيد حجزك بنجاح.',
    bookingFailed: 'تعذر إتمام الحجز.',
  },
  auth: {
    loginTitle: 'تسجيل الدخول',
    registerTitle: 'إنشاء حساب جديد',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    name: 'الاسم الكامل',
    phone: 'رقم الهاتف',
    alreadyHaveAccount: 'لديك حساب بالفعل؟',
    dontHaveAccount: 'ليس لديك حساب؟',
    loginCta: 'دخول',
    registerCta: 'إنشاء الحساب',
    invalidCredentials: 'بيانات الدخول غير صحيحة.',
    registrationFailed: 'تعذر إنشاء الحساب.',
  },
  patientDashboard: {
    title: 'مواعيدي',
    upcoming: 'القادمة',
    past: 'السابقة',
    noAppointments: 'لا توجد مواعيد.',
    cancelAppointment: 'إلغاء الموعد',
    status: {
      PENDING: 'قيد الانتظار',
      CONFIRMED: 'مؤكد',
      CHECKED_IN: 'تم الوصول',
      IN_QUEUE: 'في الطابور',
      CALLED: 'تم الاستدعاء',
      IN_CONSULTATION: 'قيد الكشف',
      COMPLETED: 'مكتمل',
      CANCELLED: 'ملغى',
      NO_SHOW: 'لم يحضر',
      RESCHEDULED: 'تم التأجيل',
    },
  },
};

const en: Dictionary = {
  common: { search: 'Search', bookNow: 'Book now', cancel: 'Cancel', save: 'Save', loading: 'Loading...', back: 'Back' },
  nav: { doctors: 'Doctors', login: 'Log in', register: 'Sign up', myAppointments: 'My appointments', logout: 'Log out', home: 'Home' },
  home: {
    title: 'Find and book your appointment with top doctors',
    subtitle: 'A trusted platform for booking doctors and clinics in Jordan',
    searchCta: 'Find a doctor',
  },
  doctors: {
    title: 'Doctors',
    filterSpecialty: 'Specialty',
    filterCity: 'City',
    filterGender: 'Gender',
    allSpecialties: 'All specialties',
    allCities: 'All cities',
    anyGender: 'Any',
    male: 'Male',
    female: 'Female',
    noResults: 'No matching results.',
    verified: 'Verified',
    consultationFee: 'Consultation fee',
    viewProfile: 'View profile',
    yearsExperience: 'years of experience',
  },
  doctorProfile: {
    about: 'About',
    branches: 'Branches',
    bookAppointment: 'Book appointment',
    selectBranch: 'Select branch',
    selectService: 'Select service',
    selectDate: 'Select date',
    availableSlots: 'Available times',
    noSlots: 'No available times on this day.',
    loginToBook: 'Log in to book an appointment',
    confirmBooking: 'Confirm booking',
    bookingConfirmed: 'Your booking is confirmed.',
    bookingFailed: 'Could not complete the booking.',
  },
  auth: {
    loginTitle: 'Log in',
    registerTitle: 'Create an account',
    email: 'Email',
    password: 'Password',
    name: 'Full name',
    phone: 'Phone number',
    alreadyHaveAccount: 'Already have an account?',
    dontHaveAccount: "Don't have an account?",
    loginCta: 'Log in',
    registerCta: 'Create account',
    invalidCredentials: 'Invalid login credentials.',
    registrationFailed: 'Could not create the account.',
  },
  patientDashboard: {
    title: 'My appointments',
    upcoming: 'Upcoming',
    past: 'Past',
    noAppointments: 'No appointments.',
    cancelAppointment: 'Cancel appointment',
    status: {
      PENDING: 'Pending',
      CONFIRMED: 'Confirmed',
      CHECKED_IN: 'Checked in',
      IN_QUEUE: 'In queue',
      CALLED: 'Called',
      IN_CONSULTATION: 'In consultation',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
      NO_SHOW: 'No-show',
      RESCHEDULED: 'Rescheduled',
    },
  },
};

const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: string): Dictionary {
  return dictionaries[locale as Locale] ?? dictionaries[defaultLocale];
}

export function isValidLocale(locale: string): locale is Locale {
  return (locales as readonly string[]).includes(locale);
}

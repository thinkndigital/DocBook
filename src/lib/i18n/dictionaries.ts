export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';

export interface Dictionary {
  /** Copy that appears in <title>, meta descriptions and share cards — never on the page. */
  seo: {
    siteName: string;
    siteDescription: string;
    homeTitle: string;
    doctorsTitle: string;
    doctorsDescription: string;
    symptomCheckTitle: string;
    symptomCheckDescription: string;
    /** {name} and {specialty} are substituted; kept as tokens so word order stays translatable. */
    doctorTitleTemplate: string;
    doctorDescriptionTemplate: string;
    breadcrumbHome: string;
    breadcrumbDoctors: string;
  };
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
    searchPlaceholder: string;
    browseSpecialties: string;
    browseCities: string;
    viewAllDoctors: string;
    howItWorksTitle: string;
    step1Title: string;
    step1Body: string;
    step2Title: string;
    step2Body: string;
    step3Title: string;
    step3Body: string;
    trustTitle: string;
    trustVerified: string;
    trustVerifiedBody: string;
    trustPricing: string;
    trustPricingBody: string;
    trustRecords: string;
    trustRecordsBody: string;
    symptomTitle: string;
    symptomBody: string;
    symptomCta: string;
    symptomDisclaimer: string;
    clinicsTitle: string;
    clinicsBody: string;
    clinicsCta: string;
    joinTitle: string;
    joinBody: string;
    joinAsDoctor: string;
    joinAsClinic: string;
    joinAsHospital: string;
    joinAsSupplier: string;
  };
  partner: {
    title: string;
    intro: string;
    orgName: string;
    type: string;
    clinic: string;
    hospital: string;
    country: string;
    city: string;
    cityOptional: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    doctorCount: string;
    notes: string;
    submit: string;
    submitting: string;
    successTitle: string;
    successBody: string;
    error: string;
    rateLimited: string;
    privacyNote: string;
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
  registerRoles: {
    patientTab: string;
    doctorTab: string;
    clinicTab: string;
    supplierTab: string;
    contactPersonName: string;
    successSupplier: string;
    clinicType: string;
    clinic: string;
    hospital: string;
    medicalCenter: string;
    orgName: string;
    orgNameAr: string;
    adminName: string;
    adminEmail: string;
    branchName: string;
    branchAddress: string;
    branchPhone: string;
    country: string;
    city: string;
    joinExisting: string;
    createOwn: string;
    inviteCode: string;
    inviteCodeHint: string;
    checkCode: string;
    checkingCode: string;
    invalidCode: string;
    codeResolvedTo: string;
    selectBranch: string;
    specialty: string;
    licenseNumber: string;
    yearsExperience: string;
    consultationPrice: string;
    bio: string;
    languages: string;
    newClinicName: string;
    newClinicNameAr: string;
    submit: string;
    submitting: string;
    successDoctor: string;
    successClinic: string;
    error: string;
    rateLimited: string;
    emailTaken: string;
  };
  patientDashboard: {
    title: string;
    upcoming: string;
    past: string;
    noAppointments: string;
    noAppointmentsCta: string;
    cancelAppointment: string;
    rescheduleAppointment: string;
    rescheduleTitle: string;
    rescheduleClose: string;
    rescheduleNoSlots: string;
    rescheduleConfirm: string;
    rescheduleFailed: string;
    status: Record<string, string>;
  };
  symptomCheck: {
    navLabel: string;
    title: string;
    subtitle: string;
    placeholder: string;
    submit: string;
    thinking: string;
    resultsTitle: string;
    noResults: string;
    urgentTitle: string;
    whyThis: string;
    confidence: string;
    degradedNotice: string;
    rateLimited: string;
    failed: string;
    tooShort: string;
  };
}

const ar: Dictionary = {
  seo: {
    siteName: 'DocBook',
    siteDescription: 'احجز موعدك مع أطباء وعيادات ومستشفيات موثّقة في الأردن.',
    homeTitle: 'حجز مواعيد الأطباء والعيادات',
    doctorsTitle: 'ابحث عن طبيب',
    doctorsDescription: 'ابحث عن أطباء موثّقين حسب التخصص والمدينة، واطّلع على أسعار الكشف واحجز موعدك مباشرة.',
    symptomCheckTitle: 'دليل الأعراض',
    symptomCheckDescription: 'صف أعراضك لمعرفة التخصص الأنسب. ليس تشخيصاً طبياً ولا بديلاً عن استشارة طبيب.',
    doctorTitleTemplate: '{name} — {specialty}',
    doctorDescriptionTemplate: 'احجز موعداً مع {name}، {specialty}. اطّلع على المواعيد المتاحة وسعر الكشف واحجز مباشرة.',
    breadcrumbHome: 'الرئيسية',
    breadcrumbDoctors: 'الأطباء',
  },
  common: { search: 'بحث', bookNow: 'احجز الآن', cancel: 'إلغاء', save: 'حفظ', loading: '...جارٍ التحميل', back: 'رجوع' },
  nav: { doctors: 'الأطباء', login: 'تسجيل الدخول', register: 'إنشاء حساب', myAppointments: 'مواعيدي', logout: 'خروج', home: 'الرئيسية' },
  home: {
    title: 'احجز موعدك مع طبيب موثّق',
    subtitle: 'ابحث حسب التخصص أو المدينة، واطّلع على سعر الكشف والمواعيد المتاحة، واحجز في أقل من دقيقة.',
    searchCta: 'ابحث',
    searchPlaceholder: 'اسم الطبيب أو التخصص',
    browseSpecialties: 'تصفّح حسب التخصص',
    browseCities: 'تصفّح حسب المدينة',
    viewAllDoctors: 'عرض كل الأطباء',
    howItWorksTitle: 'كيف تحجز',
    step1Title: 'ابحث',
    step1Body: 'حدّد التخصص والمدينة، أو اكتب اسم الطبيب مباشرة.',
    step2Title: 'اختر موعداً',
    step2Body: 'المواعيد المعروضة متاحة فعلاً في تلك اللحظة — لا انتظار لتأكيد.',
    step3Title: 'أكّد الحجز',
    step3Body: 'يصلك تأكيد فوري، وتقدر تلغي أو تعدّل من حسابك.',
    trustTitle: 'لماذا DocBook',
    trustVerified: 'أطباء موثّقون',
    trustVerifiedBody: 'لا يظهر الطبيب في البحث قبل توثيق ترخيصه من فريق المنصّة.',
    trustPricing: 'سعر معلن مسبقاً',
    trustPricingBody: 'سعر الكشف ظاهر قبل الحجز، بلا مفاجآت عند العيادة.',
    trustRecords: 'ملفك الصحي محميّ',
    trustRecordsBody: 'التشخيصات والوصفات مشفّرة، ولا يصل إليها إلا طبيبك المعالج وأنت.',
    symptomTitle: 'لست متأكداً من التخصص المناسب؟',
    symptomBody: 'صِف ما تشعر به بكلماتك، ونقترح عليك التخصص الأقرب وأطباءه.',
    symptomCta: 'جرّب دليل الأعراض',
    symptomDisclaimer: 'إرشاد للتخصص فقط — ليس تشخيصاً طبياً ولا بديلاً عن استشارة طبيب. في الحالات الطارئة اتصل بالإسعاف فوراً.',
    clinicsTitle: 'عيادة أو مستشفى؟',
    clinicsBody: 'DocBook يدير المواعيد والطابور والفوترة والسجلات الطبية لفريقك.',
    clinicsCta: 'قدّم طلب انضمام',
    joinTitle: 'انضم إلى DocBook',
    joinBody: 'أنشئ حسابك الآن — بدون انتظار موافقة إدارية.',
    joinAsDoctor: 'انضم كطبيب',
    joinAsClinic: 'سجّل عيادتك',
    joinAsHospital: 'سجّل مستشفاك',
    joinAsSupplier: 'انضم كمورد تجهيزات',
  },
  partner: {
    title: 'انضمّ إلى DocBook كجهة صحية',
    intro: 'املأ البيانات وسيتواصل معك فريقنا. لا يُنشأ أي حساب الآن — الانضمام يتم بعد المراجعة.',
    orgName: 'اسم الجهة',
    type: 'النوع',
    clinic: 'عيادة',
    hospital: 'مستشفى',
    country: 'الدولة',
    city: 'المدينة',
    cityOptional: 'اختياري',
    contactName: 'اسم المسؤول',
    contactEmail: 'البريد الإلكتروني',
    contactPhone: 'رقم الهاتف',
    doctorCount: 'عدد الأطباء تقريباً',
    notes: 'ملاحظات',
    submit: 'إرسال الطلب',
    submitting: 'جارٍ الإرسال…',
    successTitle: 'وصلنا طلبك',
    successBody: 'سيتواصل معك فريقنا على البريد أو الهاتف الذي أدخلته. لا حاجة لإرسال الطلب مرة أخرى.',
    error: 'تعذّر إرسال الطلب. راجع الحقول وحاول مرة أخرى.',
    rateLimited: 'وصلتنا طلبات كثيرة من هذا الاتصال. حاول لاحقاً.',
    privacyNote: 'نستخدم هذه البيانات للتواصل بخصوص طلبك فقط.',
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
  registerRoles: {
    patientTab: 'مريض',
    doctorTab: 'طبيب',
    clinicTab: 'عيادة أو مستشفى',
    supplierTab: 'مورد تجهيزات طبية',
    contactPersonName: 'اسم المسؤول',
    successSupplier: 'تم إنشاء حساب الشركة. يمكنك الآن الدخول وإضافة منتجاتك.',
    clinicType: 'نوع الجهة',
    clinic: 'عيادة',
    hospital: 'مستشفى',
    medicalCenter: 'مركز طبي',
    orgName: 'اسم الجهة (إنجليزي)',
    orgNameAr: 'اسم الجهة (عربي)',
    adminName: 'اسم المدير المسؤول',
    adminEmail: 'البريد الإلكتروني للمدير',
    branchName: 'اسم الفرع',
    branchAddress: 'عنوان الفرع',
    branchPhone: 'هاتف الفرع (اختياري)',
    country: 'الدولة',
    city: 'المدينة',
    joinExisting: 'لدي عيادة مسجّلة بالفعل',
    createOwn: 'أنشئ عيادتي الخاصة (طبيب مستقل)',
    inviteCode: 'كود دعوة العيادة',
    inviteCodeHint: 'احصل عليه من إدارة العيادة التي تعمل بها.',
    checkCode: 'تحقق من الكود',
    checkingCode: 'جارٍ التحقق…',
    invalidCode: 'الكود غير صحيح أو منتهي.',
    codeResolvedTo: 'العيادة:',
    selectBranch: 'اختر الفرع',
    specialty: 'التخصص',
    licenseNumber: 'رقم الترخيص المهني',
    yearsExperience: 'سنوات الخبرة',
    consultationPrice: 'رسوم الكشف (دينار)',
    bio: 'نبذة تعريفية (اختياري)',
    languages: 'اللغات (مفصولة بفاصلة، اختياري)',
    newClinicName: 'اسم العيادة (إنجليزي)',
    newClinicNameAr: 'اسم العيادة (عربي)',
    submit: 'إنشاء الحساب',
    submitting: 'جارٍ الإنشاء…',
    successDoctor: 'تم إنشاء حسابك. يمكنك الآن الدخول ومتابعة مواعيدك من لوحة الطبيب.',
    successClinic: 'تم إنشاء حساب الجهة. يمكنك الآن الدخول وإدارة عيادتك.',
    error: 'تعذر إنشاء الحساب. راجع الحقول وحاول مرة أخرى.',
    rateLimited: 'محاولات كثيرة من هذا الاتصال. حاول لاحقاً.',
    emailTaken: 'هذا البريد الإلكتروني مستخدم بالفعل.',
  },
  patientDashboard: {
    title: 'مواعيدي',
    upcoming: 'القادمة',
    past: 'السابقة',
    noAppointments: 'لا توجد مواعيد.',
    noAppointmentsCta: 'ابحث عن طبيب',
    cancelAppointment: 'إلغاء الموعد',
    rescheduleAppointment: 'إعادة جدولة',
    rescheduleTitle: 'اختر موعداً جديداً',
    rescheduleClose: 'إغلاق',
    rescheduleNoSlots: 'لا مواعيد متاحة في هذا اليوم.',
    rescheduleConfirm: 'تأكيد الموعد الجديد',
    rescheduleFailed: 'تعذر تغيير الموعد. جرّب وقتاً آخر.',
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
  symptomCheck: {
    navLabel: 'دليل الأعراض',
    title: 'ما الذي تشعر به؟',
    subtitle: 'صِف أعراضك بكلماتك، ونقترح عليك التخصص المناسب وأطباء متاحين للحجز. هذه ليست خدمة تشخيص.',
    placeholder: 'مثال: أعاني من وجع في الضرس منذ ثلاثة أيام ويزداد مع الأكل البارد.',
    submit: 'اقترح لي تخصصًا',
    thinking: 'جارٍ تحليل الوصف...',
    resultsTitle: 'التخصصات المقترحة',
    noResults: 'لم نتمكن من اقتراح تخصص من هذا الوصف. جرّب وصفًا أوضح أو تصفّح الأطباء مباشرة.',
    urgentTitle: 'قد تحتاج رعاية عاجلة',
    whyThis: 'لماذا هذا التخصص',
    confidence: 'درجة التطابق',
    degradedNotice: 'الخدمة الذكية غير متاحة حاليًا، وهذه النتائج مبنية على مطابقة الكلمات المفتاحية.',
    rateLimited: 'عدد المحاولات كبير. انتظر قليلًا ثم أعد المحاولة.',
    failed: 'تعذّر تحليل الوصف. حاول مرة أخرى.',
    tooShort: 'اكتب وصفًا من ٨ أحرف على الأقل.',
  },
};

const en: Dictionary = {
  seo: {
    siteName: 'DocBook',
    siteDescription: 'Book appointments with verified doctors, clinics and hospitals in Jordan.',
    homeTitle: 'Book doctors and clinics',
    doctorsTitle: 'Find a doctor',
    doctorsDescription: 'Search verified doctors by specialty and city, see consultation fees, and book directly.',
    symptomCheckTitle: 'Symptom guide',
    symptomCheckDescription: 'Describe your symptoms to find the right specialty. Not a diagnosis and not a substitute for seeing a doctor.',
    doctorTitleTemplate: '{name} — {specialty}',
    doctorDescriptionTemplate: 'Book an appointment with {name}, {specialty}. See available times and the consultation fee, and book directly.',
    breadcrumbHome: 'Home',
    breadcrumbDoctors: 'Doctors',
  },
  common: { search: 'Search', bookNow: 'Book now', cancel: 'Cancel', save: 'Save', loading: 'Loading...', back: 'Back' },
  nav: { doctors: 'Doctors', login: 'Log in', register: 'Sign up', myAppointments: 'My appointments', logout: 'Log out', home: 'Home' },
  home: {
    title: 'Book a verified doctor',
    subtitle: 'Search by specialty or city, see the consultation fee and real availability, and book in under a minute.',
    searchCta: 'Search',
    searchPlaceholder: 'Doctor name or specialty',
    browseSpecialties: 'Browse by specialty',
    browseCities: 'Browse by city',
    viewAllDoctors: 'See all doctors',
    howItWorksTitle: 'How booking works',
    step1Title: 'Search',
    step1Body: 'Pick a specialty and city, or type a doctor’s name.',
    step2Title: 'Choose a time',
    step2Body: 'Every slot shown is genuinely free at that moment — no waiting for confirmation.',
    step3Title: 'Confirm',
    step3Body: 'You get an immediate confirmation, and can reschedule or cancel from your account.',
    trustTitle: 'Why DocBook',
    trustVerified: 'Verified doctors',
    trustVerifiedBody: 'A doctor does not appear in search until their licence has been verified by the platform.',
    trustPricing: 'Fees shown upfront',
    trustPricingBody: 'The consultation fee is visible before you book — nothing new at the desk.',
    trustRecords: 'Your record stays yours',
    trustRecordsBody: 'Diagnoses and prescriptions are encrypted, and reachable only by you and your treating doctor.',
    symptomTitle: 'Not sure which specialty you need?',
    symptomBody: 'Describe what you are feeling in your own words and we will suggest the closest specialty and its doctors.',
    symptomCta: 'Try the symptom guide',
    symptomDisclaimer: 'Specialty guidance only — not a diagnosis and not a substitute for seeing a doctor. In an emergency call the ambulance immediately.',
    clinicsTitle: 'Run a clinic or hospital?',
    clinicsBody: 'DocBook handles appointments, the waiting queue, billing and medical records for your team.',
    clinicsCta: 'Apply to join',
    joinTitle: 'Join DocBook',
    joinBody: 'Create your account now — no admin approval to wait for.',
    joinAsDoctor: 'Join as a doctor',
    joinAsClinic: 'Register your clinic',
    joinAsHospital: 'Register your hospital',
    joinAsSupplier: 'Join as a medical supplier',
  },
  partner: {
    title: 'Join DocBook as a healthcare provider',
    intro: 'Fill in your details and our team will get in touch. No account is created now — joining happens after review.',
    orgName: 'Organisation name',
    type: 'Type',
    clinic: 'Clinic',
    hospital: 'Hospital',
    country: 'Country',
    city: 'City',
    cityOptional: 'optional',
    contactName: 'Contact name',
    contactEmail: 'Email',
    contactPhone: 'Phone',
    doctorCount: 'Approximate number of doctors',
    notes: 'Notes',
    submit: 'Send application',
    submitting: 'Sending…',
    successTitle: 'We have your application',
    successBody: 'Our team will contact you on the email or phone you gave. There is no need to send it again.',
    error: 'Could not send the application. Check the fields and try again.',
    rateLimited: 'Too many submissions from this connection. Please try later.',
    privacyNote: 'We use these details only to contact you about this application.',
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
  registerRoles: {
    patientTab: 'Patient',
    doctorTab: 'Doctor',
    clinicTab: 'Clinic or hospital',
    supplierTab: 'Medical equipment supplier',
    contactPersonName: 'Contact person name',
    successSupplier: 'Your company account is ready. Log in to add your products.',
    clinicType: 'Organisation type',
    clinic: 'Clinic',
    hospital: 'Hospital',
    medicalCenter: 'Medical center',
    orgName: 'Organisation name (English)',
    orgNameAr: 'Organisation name (Arabic)',
    adminName: "Admin's full name",
    adminEmail: "Admin's email",
    branchName: 'Branch name',
    branchAddress: 'Branch address',
    branchPhone: 'Branch phone (optional)',
    country: 'Country',
    city: 'City',
    joinExisting: 'I already work at a registered clinic',
    createOwn: 'Set up my own practice (independent doctor)',
    inviteCode: "Clinic's invite code",
    inviteCodeHint: 'Get this from your clinic administrator.',
    checkCode: 'Check code',
    checkingCode: 'Checking…',
    invalidCode: 'That code is invalid or expired.',
    codeResolvedTo: 'Clinic:',
    selectBranch: 'Select branch',
    specialty: 'Specialty',
    licenseNumber: 'Medical license number',
    yearsExperience: 'Years of experience',
    consultationPrice: 'Consultation fee (JOD)',
    bio: 'Short bio (optional)',
    languages: 'Languages (comma-separated, optional)',
    newClinicName: 'Clinic name (English)',
    newClinicNameAr: 'Clinic name (Arabic)',
    submit: 'Create account',
    submitting: 'Creating…',
    successDoctor: 'Your account is ready. Log in to see your schedule from the doctor dashboard.',
    successClinic: 'Your organisation account is ready. Log in to manage your clinic.',
    error: 'Could not create the account. Check the fields and try again.',
    rateLimited: 'Too many attempts from this connection. Please try later.',
    emailTaken: 'This email is already in use.',
  },
  patientDashboard: {
    title: 'My appointments',
    upcoming: 'Upcoming',
    past: 'Past',
    noAppointments: 'No appointments.',
    noAppointmentsCta: 'Find a doctor',
    cancelAppointment: 'Cancel appointment',
    rescheduleAppointment: 'Reschedule',
    rescheduleTitle: 'Choose a new time',
    rescheduleClose: 'Close',
    rescheduleNoSlots: 'No slots available on this day.',
    rescheduleConfirm: 'Confirm new time',
    rescheduleFailed: 'Could not change the appointment. Try another time.',
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
  symptomCheck: {
    navLabel: 'Symptom guide',
    title: 'What are you experiencing?',
    subtitle:
      'Describe your symptoms in your own words and we will suggest the right specialty and doctors you can book. This is not a diagnostic service.',
    placeholder: 'For example: I have had a toothache for three days and it gets worse with cold food.',
    submit: 'Suggest a specialty',
    thinking: 'Analysing your description...',
    resultsTitle: 'Suggested specialties',
    noResults: 'We could not suggest a specialty from that description. Try describing it differently, or browse doctors directly.',
    urgentTitle: 'You may need urgent care',
    whyThis: 'Why this specialty',
    confidence: 'Match strength',
    degradedNotice: 'The AI service is unavailable right now — these results come from keyword matching.',
    rateLimited: 'Too many attempts. Please wait a moment and try again.',
    failed: 'We could not analyse that description. Please try again.',
    tooShort: 'Please write at least 8 characters.',
  },
};

const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: string): Dictionary {
  return dictionaries[locale as Locale] ?? dictionaries[defaultLocale];
}

export function isValidLocale(locale: string): locale is Locale {
  return (locales as readonly string[]).includes(locale);
}

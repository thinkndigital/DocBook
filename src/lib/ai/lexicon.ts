/**
 * Bilingual symptom → specialty lexicon.
 *
 * Used two ways:
 * - It *is* the matcher in `RuleBasedAssistant` (the no-API-key adapter).
 * - It seeds `LocalSpecialtyMatcher`, which the Claude adapter's output is cross-checked
 *   against, so a model suggestion that no keyword supports gets down-ranked rather than
 *   trusted blindly.
 *
 * Entries are keyed by a `slugPattern` rather than a literal slug on purpose: specialties
 * are database rows a platform admin can add, rename, or localize (brief §26 — nothing
 * Jordan- or seed-specific hard-coded in application code). A deployment that names its
 * cardiology row `heart-vascular` still matches `/cardio|heart|قلب/`, and a specialty with
 * no lexicon entry simply never scores from keywords — it degrades to "not suggested",
 * never to a crash or a wrong suggestion.
 */

export interface LexiconEntry {
  /** Matched against the Specialty slug, English name, and Arabic name. */
  slugPattern: RegExp;
  /** Phrases in either language. Matched against normalized text (see safety.ts). */
  keywords: string[];
}

export const SYMPTOM_LEXICON: LexiconEntry[] = [
  {
    slugPattern: /cardio|heart|قلب/i,
    keywords: [
      'palpitations', 'heart', 'blood pressure', 'hypertension', 'cholesterol', 'irregular heartbeat',
      'خفقان', 'قلب', 'ضغط الدم', 'كوليسترول', 'نبض غير منتظم', 'ضغط مرتفع',
    ],
  },
  {
    slugPattern: /dent|tooth|teeth|اسنان|أسنان/i,
    keywords: [
      'tooth', 'teeth', 'toothache', 'gum', 'gums', 'cavity', 'wisdom tooth', 'filling', 'braces', 'jaw pain',
      'سن', 'اسنان', 'ضرس', 'لثه', 'تسوس', 'حشوه', 'تقويم', 'الم في الاسنان', 'وجع ضرس',
    ],
  },
  {
    slugPattern: /derma|skin|جلد/i,
    keywords: [
      'skin', 'rash', 'acne', 'eczema', 'psoriasis', 'mole', 'hair loss', 'itching', 'itchy', 'hives',
      'جلد', 'طفح', 'حبوب', 'اكزيما', 'صدفيه', 'حكه', 'تساقط الشعر', 'شامه', 'بقع',
    ],
  },
  {
    slugPattern: /pediatr|child|اطفال|أطفال/i,
    keywords: [
      'my child', 'my son', 'my daughter', 'baby', 'infant', 'toddler', 'newborn', 'vaccination', 'growth',
      'طفلي', 'ابني', 'ابنتي', 'رضيع', 'مولود', 'تطعيم', 'نمو الطفل',
    ],
  },
  {
    slugPattern: /obstetr|gyneco|نساي|نسائ|توليد/i,
    keywords: [
      'pregnant', 'pregnancy', 'period', 'menstrual', 'ovarian', 'uterus', 'fertility', 'contraception', 'menopause',
      'حامل', 'حمل', 'دوره شهريه', 'طمث', 'رحم', 'مبيض', 'خصوبه', 'انقطاع الطمث', 'منع الحمل',
    ],
  },
  {
    slugPattern: /ortho|bone|عظام|عظم/i,
    keywords: [
      'bone', 'fracture', 'knee', 'back pain', 'shoulder', 'joint', 'sprain', 'spine', 'hip', 'ankle',
      'عظام', 'كسر', 'ركبه', 'الم الظهر', 'كتف', 'مفصل', 'التوا', 'عمود فقري', 'كاحل', 'ورك',
    ],
  },
  {
    slugPattern: /psychiatr|mental|نفسي|نفسيه/i,
    keywords: [
      'anxiety', 'depression', 'panic', 'insomnia', 'stress', 'mood', 'obsessive', 'cannot sleep',
      'قلق', 'اكتئاب', 'هلع', 'ارق', 'توتر', 'وسواس', 'لا استطيع النوم', 'حاله نفسيه',
    ],
  },
  {
    slugPattern: /ophthal|eye|عيون|عين/i,
    keywords: [
      'eye', 'eyes', 'vision', 'blurry', 'blurred', 'red eye', 'glasses', 'watery eyes',
      'عين', 'عيون', 'نظر', 'رؤيه', 'ضبابيه', 'احمرار العين', 'نظارات',
    ],
  },
  {
    slugPattern: /ent|otolaryn|ear.*nose|انف|أذن|حنجره/i,
    keywords: [
      'ear', 'ears', 'nose', 'throat', 'sinus', 'hearing', 'tonsil', 'sore throat', 'blocked nose', 'snoring',
      'اذن', 'انف', 'حنجره', 'جيوب انفيه', 'سمع', 'لوزتين', 'التهاب الحلق', 'انسداد الانف', 'شخير',
    ],
  },
  {
    slugPattern: /gastro|digest|هضم|معده/i,
    keywords: [
      'stomach', 'abdominal', 'nausea', 'diarrhea', 'constipation', 'liver', 'ulcer', 'heartburn', 'bloating',
      'معده', 'بطن', 'غثيان', 'اسهال', 'امساك', 'كبد', 'قرحه', 'حرقه', 'انتفاخ',
    ],
  },
  {
    slugPattern: /neuro|اعصاب|أعصاب|عصبيه/i,
    keywords: [
      'migraine', 'numbness', 'tremor', 'dizziness', 'epilepsy', 'memory loss', 'tingling',
      'صداع نصفي', 'شقيقه', 'تنميل', 'رعشه', 'دوخه', 'صرع', 'فقدان الذاكره', 'وخز',
    ],
  },
  {
    slugPattern: /urolog|بوليه|مسالك/i,
    keywords: [
      'urine', 'urinary', 'burning when i urinate', 'kidney stone', 'bladder', 'prostate', 'frequent urination',
      'بول', 'حرقان بالبول', 'حصى الكلى', 'مثانه', 'بروستات', 'تبول متكرر', 'مسالك بوليه',
    ],
  },
  {
    slugPattern: /endocrin|diabet|غدد|سكري/i,
    keywords: [
      'diabetes', 'thyroid', 'hormone', 'blood sugar', 'weight gain', 'weight loss',
      'سكري', 'غده درقيه', 'هرمون', 'سكر الدم', 'زياده الوزن', 'نقص الوزن',
    ],
  },
  {
    slugPattern: /pulmo|respirat|chest.*med|صدريه|رئه/i,
    keywords: [
      'asthma', 'wheezing', 'chronic cough', 'lung', 'bronchitis', 'smoker cough',
      'ربو', 'ازيز', 'سعال مزمن', 'رئه', 'التهاب شعبي', 'كحه مستمره',
    ],
  },
  {
    slugPattern: /nephro|kidney|كلى|كليه/i,
    keywords: ['kidney', 'dialysis', 'creatinine', 'كلى', 'غسيل كلى', 'كرياتينين'],
  },
  {
    slugPattern: /rheumat|روماتيزم|مفاصل/i,
    keywords: [
      'arthritis', 'lupus', 'joint swelling', 'morning stiffness', 'gout',
      'التهاب المفاصل', 'ذئبه', 'تورم المفاصل', 'تيبس صباحي', 'نقرس',
    ],
  },
  {
    slugPattern: /allerg|immun|حساسيه|مناعه/i,
    keywords: [
      'allergy', 'allergic', 'sneezing', 'hay fever', 'food allergy',
      'حساسيه', 'عطس', 'حمى القش', 'حساسيه طعام',
    ],
  },
  {
    // Intentionally last: the fallback. Its keywords are the genuinely non-specific
    // presentations, and `matchSpecialties` also falls back here when nothing else scores.
    slugPattern: /general|family|internal|عام|باطن/i,
    keywords: [
      'fever', 'cold', 'flu', 'cough', 'fatigue', 'tired', 'headache', 'checkup', 'check up', 'sore body',
      'حراره', 'حمى', 'زكام', 'انفلونزا', 'سعال', 'تعب', 'ارهاق', 'صداع', 'فحص عام', 'كحه',
    ],
  },
];

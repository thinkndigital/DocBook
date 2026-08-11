/**
 * Notification event catalogue (brief §22) and bilingual copy.
 *
 * Hard rule, inherited from Phase 8: a notification NEVER carries clinical content. It
 * travels over SMS/WhatsApp/email — channels we do not control and cannot audit — so a
 * "prescription issued" message says who issued it and where to read it, never the
 * diagnosis or the medications. Anything clinical stays behind an authenticated,
 * access-controlled, audited read.
 */
export type NotificationEvent =
  | 'BOOKING_CREATED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_RESCHEDULED'
  | 'APPOINTMENT_REMINDER'
  | 'QUEUE_APPROACHING'
  | 'PATIENT_CALLED'
  | 'APPOINTMENT_DELAYED'
  | 'PAYMENT_COMPLETED'
  | 'PAYMENT_REFUNDED'
  | 'PRESCRIPTION_ISSUED'
  | 'REVIEW_REQUEST'
  | 'SUBSCRIPTION_RENEWAL';

export interface TemplateVars {
  patientName?: string;
  doctorName?: string;
  clinicName?: string;
  branchName?: string;
  /** Pre-formatted, human-readable date/time — formatting is the caller's job. */
  when?: string;
  queueToken?: number | string;
  amount?: string;
  minutes?: number | string;
}

interface Template {
  subject: string;
  body: string;
}

type Catalogue = Record<NotificationEvent, { ar: Template; en: Template }>;

const TEMPLATES: Catalogue = {
  BOOKING_CREATED: {
    ar: { subject: 'تم تأكيد حجزك', body: 'تم تأكيد موعدك مع {doctorName} في {branchName} بتاريخ {when}. رقم الدور: {queueToken}.' },
    en: { subject: 'Your booking is confirmed', body: 'Your appointment with {doctorName} at {branchName} on {when} is confirmed. Queue number: {queueToken}.' },
  },
  BOOKING_CANCELLED: {
    ar: { subject: 'تم إلغاء الموعد', body: 'تم إلغاء موعدك مع {doctorName} بتاريخ {when}.' },
    en: { subject: 'Appointment cancelled', body: 'Your appointment with {doctorName} on {when} has been cancelled.' },
  },
  BOOKING_RESCHEDULED: {
    ar: { subject: 'تم تغيير موعدك', body: 'تم نقل موعدك مع {doctorName} إلى {when} في {branchName}.' },
    en: { subject: 'Appointment rescheduled', body: 'Your appointment with {doctorName} has moved to {when} at {branchName}.' },
  },
  APPOINTMENT_REMINDER: {
    ar: { subject: 'تذكير بموعدك', body: 'تذكير: لديك موعد مع {doctorName} في {branchName} بتاريخ {when}.' },
    en: { subject: 'Appointment reminder', body: 'Reminder: you have an appointment with {doctorName} at {branchName} on {when}.' },
  },
  QUEUE_APPROACHING: {
    ar: { subject: 'اقترب دورك', body: 'اقترب دورك عند {doctorName}. رقم دورك {queueToken} — يُرجى التوجه إلى {branchName}.' },
    en: { subject: 'Your turn is approaching', body: 'Your turn with {doctorName} is approaching. Queue number {queueToken} — please head to {branchName}.' },
  },
  PATIENT_CALLED: {
    ar: { subject: 'حان دورك', body: 'حان دورك الآن عند {doctorName}. رقم الدور {queueToken}.' },
    en: { subject: "It's your turn", body: 'You are being called now by {doctorName}. Queue number {queueToken}.' },
  },
  APPOINTMENT_DELAYED: {
    ar: { subject: 'تأخير في الموعد', body: 'نعتذر، موعدك مع {doctorName} متأخر بنحو {minutes} دقيقة.' },
    en: { subject: 'Appointment delayed', body: 'Apologies — your appointment with {doctorName} is running about {minutes} minutes late.' },
  },
  PAYMENT_COMPLETED: {
    ar: { subject: 'تم استلام الدفعة', body: 'تم استلام مبلغ {amount} مقابل موعدك مع {doctorName}.' },
    en: { subject: 'Payment received', body: 'We received {amount} for your appointment with {doctorName}.' },
  },
  PAYMENT_REFUNDED: {
    ar: { subject: 'تم رد المبلغ', body: 'تم رد مبلغ {amount} الخاص بموعدك مع {doctorName}.' },
    en: { subject: 'Payment refunded', body: '{amount} has been refunded for your appointment with {doctorName}.' },
  },
  PRESCRIPTION_ISSUED: {
    // Deliberately says nothing about what was prescribed.
    ar: { subject: 'وصفة طبية جديدة', body: 'أصدر {doctorName} وصفة طبية جديدة لك. يمكنك الاطلاع عليها في ملفك الصحي.' },
    en: { subject: 'New prescription', body: '{doctorName} issued a new prescription for you. You can view it in your health record.' },
  },
  REVIEW_REQUEST: {
    ar: { subject: 'كيف كانت زيارتك؟', body: 'نودّ معرفة رأيك بزيارتك إلى {doctorName} في {branchName}.' },
    en: { subject: 'How was your visit?', body: "We'd love your feedback on your visit to {doctorName} at {branchName}." },
  },
  SUBSCRIPTION_RENEWAL: {
    ar: { subject: 'تجديد الاشتراك', body: 'سيتم تجديد اشتراك {clinicName} قريباً.' },
    en: { subject: 'Subscription renewal', body: 'The subscription for {clinicName} is due for renewal soon.' },
  },
};

function interpolate(text: string, vars: TemplateVars): string {
  return text.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = (vars as Record<string, unknown>)[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function renderTemplate(event: NotificationEvent, locale: string, vars: TemplateVars): Template {
  const entry = TEMPLATES[event];
  const template = locale === 'en' ? entry.en : entry.ar;
  return {
    subject: interpolate(template.subject, vars),
    body: interpolate(template.body, vars).replace(/\s{2,}/g, ' ').trim(),
  };
}

/** Which channels each event goes out on by default; user preferences narrow this further. */
export const DEFAULT_CHANNELS: Record<NotificationEvent, Array<'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH'>> = {
  BOOKING_CREATED: ['IN_APP', 'EMAIL', 'WHATSAPP'],
  BOOKING_CANCELLED: ['IN_APP', 'EMAIL', 'WHATSAPP'],
  BOOKING_RESCHEDULED: ['IN_APP', 'EMAIL', 'WHATSAPP'],
  APPOINTMENT_REMINDER: ['IN_APP', 'SMS', 'WHATSAPP'],
  // Time-critical and the patient is physically present — push/SMS, not email.
  QUEUE_APPROACHING: ['IN_APP', 'PUSH', 'SMS'],
  PATIENT_CALLED: ['IN_APP', 'PUSH'],
  APPOINTMENT_DELAYED: ['IN_APP', 'PUSH', 'SMS'],
  PAYMENT_COMPLETED: ['IN_APP', 'EMAIL'],
  PAYMENT_REFUNDED: ['IN_APP', 'EMAIL'],
  PRESCRIPTION_ISSUED: ['IN_APP', 'EMAIL'],
  REVIEW_REQUEST: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_RENEWAL: ['IN_APP', 'EMAIL'],
};

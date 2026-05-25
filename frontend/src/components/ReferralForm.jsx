import { useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const T = {
  en: {
    welcome: {
      title: 'Join Our Referral Network',
      subtitle: 'Partner with Sonic Marketing and earn commissions on every successful deal you refer.',
      start: 'Apply Now',
    },
    form: {
      title: 'Your Information',
      subtitle: 'Fill in your details so we can get in touch.',
      nameLabel: 'Full Name',
      namePlaceholder: 'Your full name',
      phoneLabel: 'WhatsApp Number',
      emailLabel: 'Email Address',
      jobLabel: 'Job / Profession',
      jobPlaceholder: 'e.g. Real Estate Broker, Consultant...',
      nationalityLabel: 'Nationality',
      nationalityPlaceholder: 'Select nationality',
    },
    agreement: {
      title: 'Partnership Agreement',
      subtitle: 'Please read and agree to the following terms.',
      terms: [
        'I agree to refer clients exclusively to Sonic Marketing for the duration of our partnership.',
        'I understand that commission is paid only upon a successfully closed deal.',
        'I confirm that all referred client information is shared with consent.',
        'I agree to maintain professionalism and confidentiality at all times.',
      ],
      checkLabel: 'I have read and agree to the above terms and conditions.',
    },
    thankYou: {
      title: 'Application Received!',
      body: 'Thank you for applying to join our referral network. Our team will review your application and contact you within 24–48 hours.',
    },
    next: 'Continue',
    back: 'Back',
    submit: 'Submit Application',
    required: 'Required field',
    step: (s, t) => `Step ${s} of ${t}`,
  },
  ar: {
    welcome: {
      title: 'انضم إلى شبكة الإحالة لدينا',
      subtitle: 'تعاون مع بنتا العقارية واكسب عمولات على كل صفقة ناجحة تحيلها إلينا.',
      start: 'تقدم الآن',
    },
    form: {
      title: 'معلوماتك الشخصية',
      subtitle: 'أدخل بياناتك حتى نتمكن من التواصل معك.',
      nameLabel: 'الاسم الكامل',
      namePlaceholder: 'اسمك الكامل',
      phoneLabel: 'رقم واتساب',
      emailLabel: 'البريد الإلكتروني',
      jobLabel: 'المهنة / الوظيفة',
      jobPlaceholder: 'مثال: وسيط عقاري، مستشار...',
      nationalityLabel: 'الجنسية',
      nationalityPlaceholder: 'اختر الجنسية',
    },
    agreement: {
      title: 'اتفاقية الشراكة',
      subtitle: 'يرجى قراءة الشروط التالية والموافقة عليها.',
      terms: [
        'أوافق على إحالة العملاء حصريًا إلى بنتا العقارية طوال فترة شراكتنا.',
        'أفهم أن العمولة تُدفع فقط عند إتمام الصفقة بنجاح.',
        'أؤكد أن جميع معلومات العملاء المُحالين مشاركة بموافقتهم.',
        'أوافق على الحفاظ على الاحترافية والسرية في جميع الأوقات.',
      ],
      checkLabel: 'لقد قرأت الشروط والأحكام أعلاه وأوافق عليها.',
    },
    thankYou: {
      title: 'تم استلام طلبك!',
      body: 'شكرًا لتقدمك للانضمام إلى شبكة الإحالة لدينا. سيراجع فريقنا طلبك ويتواصل معك خلال 24 إلى 48 ساعة.',
    },
    next: 'متابعة',
    back: 'رجوع',
    submit: 'إرسال الطلب',
    required: 'حقل مطلوب',
    step: (s, t) => `الخطوة ${s} من ${t}`,
  },
};

const NATIONALITIES = [
  { value: 'AE', label: '🇦🇪 United Arab Emirates' },
  { value: 'SA', label: '🇸🇦 Saudi Arabia' },
  { value: 'KW', label: '🇰🇼 Kuwait' },
  { value: 'QA', label: '🇶🇦 Qatar' },
  { value: 'BH', label: '🇧🇭 Bahrain' },
  { value: 'OM', label: '🇴🇲 Oman' },
  { value: 'EG', label: '🇪🇬 Egypt' },
  { value: 'LB', label: '🇱🇧 Lebanon' },
  { value: 'JO', label: '🇯🇴 Jordan' },
  { value: 'SY', label: '🇸🇾 Syria' },
  { value: 'IQ', label: '🇮🇶 Iraq' },
  { value: 'PS', label: '🇵🇸 Palestine' },
  { value: 'IN', label: '🇮🇳 India' },
  { value: 'PK', label: '🇵🇰 Pakistan' },
  { value: 'BD', label: '🇧🇩 Bangladesh' },
  { value: 'PH', label: '🇵🇭 Philippines' },
  { value: 'ID', label: '🇮🇩 Indonesia' },
  { value: 'CN', label: '🇨🇳 China' },
  { value: 'TR', label: '🇹🇷 Turkey' },
  { value: 'IR', label: '🇮🇷 Iran' },
  { value: 'KZ', label: '🇰🇿 Kazakhstan' },
  { value: 'UZ', label: '🇺🇿 Uzbekistan' },
  { value: 'RU', label: '🇷🇺 Russia' },
  { value: 'UA', label: '🇺🇦 Ukraine' },
  { value: 'GB', label: '🇬🇧 United Kingdom' },
  { value: 'FR', label: '🇫🇷 France' },
  { value: 'DE', label: '🇩🇪 Germany' },
  { value: 'IT', label: '🇮🇹 Italy' },
  { value: 'US', label: '🇺🇸 United States' },
  { value: 'CA', label: '🇨🇦 Canada' },
  { value: 'AU', label: '🇦🇺 Australia' },
  { value: 'NG', label: '🇳🇬 Nigeria' },
  { value: 'GH', label: '🇬🇭 Ghana' },
  { value: 'ZA', label: '🇿🇦 South Africa' },
  { value: 'OTHER', label: '🌍 Other' },
];

export default function ReferralForm() {
  const [language, setLanguage] = useState('en');
  const [step, setStep] = useState(0); // 0=welcome, 1=form, 2=agreement
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [agreed, setAgreed] = useState(false);

  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', job: '', nationality: '',
  });

  const lang = T[language];
  const isAr = language === 'ar';
  // State-driven font (Arabic Cairo vs Latin) — kept inline as an allowed
  // data/state-driven exception (no Tailwind utility for conditional font stack).
  const fontFamily = isAr ? "'Cairo', sans-serif" : '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canProceedForm = form.full_name.trim() && form.phone.trim();

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/referral/form/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, language, agreed_to_terms: agreed }),
      });
      if (!res.ok) throw new Error('Submission failed — please try again');
      setSubmitted(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const progressPct = step === 0 ? 0 : step === 1 ? 50 : 100;

  if (submitted) {
    return (
      <div dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily }} className="flex min-h-screen items-center justify-center bg-white px-6 py-10">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap'); @keyframes checkPop { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.2)} 100%{transform:scale(1);opacity:1} } @keyframes pulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }`}</style>
        <div className="max-w-[480px] text-center">
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-light shadow-pop [animation:checkPop_0.5s_ease_forwards]">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M7 18 L15 26 L29 10" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h2 className="mb-4 text-[28px] font-extrabold text-primary">{lang.thankYou.title}</h2>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2 [animation:pulse_2s_ease_infinite]">
            <span>🤝</span>
            <span className="text-[13px] font-bold text-success">{isAr ? 'سيتواصل معك فريقنا قريبًا' : 'Our team will contact you soon'}</span>
          </div>
          <p className="text-[15px] leading-[1.75] text-muted">{lang.thankYou.body}</p>
        </div>
      </div>
    );
  }

  if (step === 0) {
    return (
      <div style={{ fontFamily }} className="flex min-h-screen items-center justify-center bg-white px-6 py-10">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');`}</style>
        <div className="w-full max-w-[480px] text-center">
          <img src="/sonic-logo.svg" alt="Sonic Marketing" className="mb-8 h-[120px] w-auto" />
          <h1 className="mb-4 text-[30px] font-extrabold leading-tight text-primary">{lang.welcome.title}</h1>
          <p className="mb-9 text-base leading-[1.7] text-muted">{lang.welcome.subtitle}</p>
          <button onClick={() => setStep(1)} className="mb-5 block w-full rounded-xl bg-gradient-to-br from-primary to-secondary py-4 text-base font-bold text-white transition hover:opacity-95">
            {lang.welcome.start}
          </button>
          <div className="flex justify-center gap-2.5">
            {['en', 'ar'].map(l => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`rounded-[10px] border-[1.5px] px-[22px] py-2 text-sm font-bold transition ${language === l ? 'border-primary bg-primary text-white' : 'border-[var(--border)] bg-white text-muted hover:border-primary'}`}
              >
                {l === 'en' ? 'English' : 'عربي'}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily }} className="flex min-h-screen flex-col bg-white">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap'); @keyframes fadeSlide { from{opacity:0;transform:translateX(${isAr ? '-' : ''}18px)} to{opacity:1;transform:translateX(0)} }`}</style>

      {/* Progress */}
      <div className="border-b border-[var(--border)] px-8 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted">{lang.step(step, 2)}</span>
          <span className="text-xs font-bold text-accent">{progressPct}%</span>
        </div>
        <div className="mb-4 h-1 rounded-sm bg-[var(--surface-2)]">
          <div className="h-full rounded-sm bg-gradient-to-r from-accent to-accent-light transition-[width] duration-[400ms] ease-out" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 py-8">
        <div key={step} className="mx-auto max-w-[560px] [animation:fadeSlide_0.3s_ease]">

          {step === 1 && (
            <>
              <h2 className="mb-2 text-2xl font-extrabold text-primary">{lang.form.title}</h2>
              <p className="mb-7 text-sm text-muted">{lang.form.subtitle}</p>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink">{lang.form.nameLabel} *</label>
                  <input className="input" value={form.full_name} onChange={e => update('full_name', e.target.value)} placeholder={lang.form.namePlaceholder} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink">{lang.form.phoneLabel} *</label>
                  <input className="input" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+971 50 123 4567" type="tel" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink">{lang.form.emailLabel}</label>
                  <input className="input" value={form.email} onChange={e => update('email', e.target.value)} placeholder="your@email.com" type="email" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink">{lang.form.jobLabel}</label>
                  <input className="input" value={form.job} onChange={e => update('job', e.target.value)} placeholder={lang.form.jobPlaceholder} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink">{lang.form.nationalityLabel}</label>
                  <select className="input" value={form.nationality} onChange={e => update('nationality', e.target.value)}>
                    <option value="">{lang.form.nationalityPlaceholder}</option>
                    {NATIONALITIES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                  </select>
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!canProceedForm}
                className={`mt-8 block w-full rounded-xl py-4 text-[15px] font-bold transition ${canProceedForm ? 'cursor-pointer bg-gradient-to-br from-primary to-secondary text-white hover:opacity-95' : 'cursor-not-allowed bg-[var(--surface-2)] text-muted'}`}
              >
                {lang.next} →
              </button>
              <button onClick={() => setStep(0)} className="mt-2.5 block w-full py-3 text-sm text-muted">
                ← {lang.back}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="mb-2 text-2xl font-extrabold text-primary">{lang.agreement.title}</h2>
              <p className="mb-6 text-sm text-muted">{lang.agreement.subtitle}</p>

              <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-6 py-5">
                {lang.agreement.terms.map((term, i) => (
                  <div key={i} className={`flex items-start gap-3 ${i < lang.agreement.terms.length - 1 ? 'mb-4' : ''}`}>
                    <span className="mt-px flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md border-[1.5px] border-accent bg-accent/15">
                      <span className="text-[11px] font-extrabold text-accent">{i + 1}</span>
                    </span>
                    <p className="m-0 text-sm leading-[1.6] text-ink">{term}</p>
                  </div>
                ))}
              </div>

              <label className="mb-7 flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 cursor-pointer accent-primary" />
                <span className="text-sm font-semibold leading-[1.5] text-ink">{lang.agreement.checkLabel}</span>
              </label>

              {error && (
                <div className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-error">{error}</div>
              )}

              <button
                onClick={submit}
                disabled={!agreed || submitting}
                className={`block w-full rounded-xl py-4 text-[15px] font-bold transition ${agreed ? 'cursor-pointer bg-gradient-to-br from-primary to-secondary text-white hover:opacity-95' : 'cursor-not-allowed bg-[var(--surface-2)] text-muted'}`}
              >
                {submitting ? (isAr ? 'جارٍ الإرسال...' : 'Submitting...') : lang.submit}
              </button>
              <button onClick={() => setStep(1)} className="mt-2.5 block w-full py-3 text-sm text-muted">
                ← {lang.back}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

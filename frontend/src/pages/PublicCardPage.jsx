import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.09 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .99h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/>
      <circle cx="4" cy="4" r="2"/>
    </svg>
  );
}

function downloadVCard(card) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${card.full_name}`,
    card.job_title ? `TITLE:${card.job_title}` : '',
    card.phone ? `TEL;TYPE=CELL:${card.phone}` : '',
    card.whatsapp && card.whatsapp !== card.phone ? `TEL;TYPE=WORK:${card.whatsapp}` : '',
    card.email ? `EMAIL:${card.email}` : '',
    card.website ? `URL:${card.website}` : '',
    'ORG:Sonic Real Estate',
    card.photo_url ? `PHOTO;VALUE=URL:${card.photo_url}` : '',
    'END:VCARD',
  ].filter(Boolean).join('\n');

  const blob = new Blob([lines], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${card.full_name.replace(/\s+/g, '_')}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}

function shareCard(cardUrl) {
  if (navigator.share) {
    navigator.share({ title: 'Sonic Real Estate', url: cardUrl }).catch(() => {});
  } else {
    navigator.clipboard.writeText(cardUrl).then(() => alert('Link copied!'));
  }
}

export default function PublicCardPage() {
  const { slug } = useParams();
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const cardUrl = window.location.href;

  useEffect(() => {
    fetch(`${BASE}/api/ecards/public/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setCard)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen bg-page flex items-center justify-center">
      <div className="text-sm text-muted">Loading…</div>
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center gap-3">
      <div className="text-5xl">🔍</div>
      <div className="text-lg font-bold text-primary">Card not found</div>
      <div className="text-sm text-muted">This card may have been removed or the link is incorrect.</div>
    </div>
  );

  const initials = card.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-[400px]">

        {/* Card */}
        <div className="bg-white rounded-[20px] overflow-hidden shadow-pop">

          {/* Banner */}
          <div className="relative h-[110px] overflow-hidden bg-gradient-to-br from-primary via-secondary to-primary-dark">
            <div className="absolute -top-8 -right-8 h-[180px] w-[180px] rounded-full bg-accent-light/15" />
            <div className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-accent-light to-transparent" />

            {/* Logo */}
            <div className="absolute top-[18px] left-[22px] flex items-center gap-2.5">
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-white text-base font-black text-primary">S</div>
              <div>
                <div className="text-xs font-extrabold text-white">Sonic Marketing</div>
                <div className="text-[8px] uppercase tracking-[2px] text-accent-light/90">Dubai · UAE</div>
              </div>
            </div>

            {/* Avatar */}
            <div className="absolute -bottom-[38px] left-[22px]">
              {card.photo_url ? (
                <img src={card.photo_url} alt={card.full_name} className="h-[76px] w-[76px] rounded-full border-[3px] border-white object-cover shadow-pop" />
              ) : (
                <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-br from-primary to-secondary text-[26px] font-black text-accent-light shadow-pop">
                  {initials}
                </div>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="px-6 pt-[52px] pb-[22px]">
            <div className="text-[22px] font-black tracking-[-0.5px] text-primary">{card.full_name}</div>
            {card.job_title && (
              <div className="mt-[5px] mb-5 text-[10px] font-bold uppercase tracking-[1.8px] text-accent">{card.job_title}</div>
            )}

            <div className="mb-[18px] h-px bg-[var(--border)]" />

            {/* Contact rows */}
            <div className="mb-[22px] flex flex-col gap-[13px]">
              {card.phone && (
                <a href={`tel:${card.phone}`} className="flex items-center gap-3 no-underline">
                  <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-accent-soft text-primary">
                    <PhoneIcon />
                  </div>
                  <span className="text-[13px] font-medium text-ink">{card.phone}</span>
                </a>
              )}
              {card.email && (
                <a href={`mailto:${card.email}`} className="flex items-center gap-3 no-underline">
                  <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-accent-soft text-primary">
                    <MailIcon />
                  </div>
                  <span className="text-[13px] font-medium text-ink">{card.email}</span>
                </a>
              )}
              {card.whatsapp && (
                <a href={`https://wa.me/${card.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 no-underline">
                  <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-emerald-50 text-[#25D366]">
                    <WhatsAppIcon />
                  </div>
                  <span className="text-[13px] font-medium text-ink">{card.whatsapp}</span>
                </a>
              )}
              {card.website && (
                <a href={card.website.startsWith('http') ? card.website : `https://${card.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 no-underline">
                  <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-accent-soft text-primary">
                    <GlobeIcon />
                  </div>
                  <span className="text-[13px] font-medium text-ink">{card.website}</span>
                </a>
              )}
              {card.linkedin && (
                <a href={card.linkedin.startsWith('http') ? card.linkedin : `https://${card.linkedin}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 no-underline">
                  <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-blue-50 text-[#0077b5]">
                    <LinkedInIcon />
                  </div>
                  <span className="text-[13px] font-medium text-ink">LinkedIn</span>
                </a>
              )}
            </div>
          </div>

          {/* Footer: buttons + QR */}
          <div className="flex items-center justify-between border-t border-[var(--border)] bg-page px-6 py-3.5">
            <div className="flex gap-2">
              <button onClick={() => downloadVCard(card)} className="flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2.5 text-xs font-bold text-white">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Save Contact
              </button>
              <button onClick={() => shareCard(cardUrl)} className="flex items-center gap-1.5 rounded-[10px] border-[1.5px] border-[var(--border)] bg-white px-3.5 py-2.5 text-xs font-bold text-primary">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share
              </button>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white p-1.5">
              <QRCodeSVG value={cardUrl} size={60} fgColor="#111111" bgColor="#ffffff" level="M" />
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-[11px] text-muted">
          Powered by Sonic System
        </div>
      </div>
    </div>
  );
}

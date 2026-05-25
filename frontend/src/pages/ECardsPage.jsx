import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import api from '../api';

// Brand hex for the QR foreground (QRCodeSVG needs a literal colour).
const BRAND_GREEN = '#111111';

function downloadVCard(card) {
  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `FN:${card.full_name}`,
    card.job_title ? `TITLE:${card.job_title}` : '',
    card.phone ? `TEL;TYPE=CELL:${card.phone}` : '',
    card.whatsapp && card.whatsapp !== card.phone ? `TEL;TYPE=WORK:${card.whatsapp}` : '',
    card.email ? `EMAIL:${card.email}` : '',
    card.website ? `URL:${card.website}` : '',
    'ORG:Sonic Real Estate',
    'END:VCARD',
  ].filter(Boolean).join('\n');
  const blob = new Blob([lines], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${card.full_name.replace(/\s+/g, '_')}.vcf`; a.click();
  URL.revokeObjectURL(url);
}

function shareCard(url) {
  if (navigator.share) {
    navigator.share({ title: 'Sonic Real Estate', url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => alert('Link copied!'));
  }
}

function PhoneIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.09 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .99h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>;
}
function MailIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
}
function WAIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
}

function CardFull({ card }) {
  const cardUrl = `${window.location.origin}/card/${card.slug}`;
  const initials = card.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="overflow-hidden rounded-[20px] bg-white shadow-pop">
      {/* Banner */}
      <div className="relative h-[110px] overflow-hidden bg-gradient-to-br from-primary via-secondary to-primary-dark">
        <div className="absolute -top-[30px] -right-[30px] h-[180px] w-[180px] rounded-full bg-accent/15" />
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent-light to-transparent" />
        <div className="absolute top-[18px] left-[22px] flex items-center gap-2.5">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-light text-base font-black text-white">P</div>
          <div>
            <div className="text-xs font-extrabold text-white">Sonic Real Estate</div>
            <div className="text-[8px] uppercase tracking-[2px] text-accent-light/90">Dubai · UAE</div>
          </div>
        </div>
        <div className="absolute -bottom-[38px] left-[22px]">
          {card.photo_url ? (
            <img src={card.photo_url} alt="" className="h-[76px] w-[76px] rounded-full border-[3px] border-white object-cover shadow-pop" />
          ) : (
            <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-br from-primary to-secondary text-[26px] font-black text-accent-light shadow-pop">{initials}</div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-6 pb-5 pt-[52px]">
        <div className="text-[22px] font-black tracking-[-0.5px] text-primary">{card.full_name}</div>
        {card.job_title && <div className="mb-[18px] mt-[5px] text-[10px] font-bold uppercase tracking-[1.8px] text-accent">{card.job_title}</div>}
        <div className="mb-4 h-px bg-gray-100" />
        <div className="flex flex-col gap-3">
          {card.phone && (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-primary"><PhoneIcon /></div>
              <span className="text-[13px] font-medium text-gray-700">{card.phone}</span>
            </div>
          )}
          {card.email && (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-primary"><MailIcon /></div>
              <span className="text-[13px] font-medium text-gray-700">{card.email}</span>
            </div>
          )}
          {card.whatsapp && (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-[#25D366]"><WAIcon /></div>
              <span className="text-[13px] font-medium text-gray-700">{card.whatsapp}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-[22px] py-3.5">
        <div className="flex gap-2">
          <button onClick={() => downloadVCard(card)} className="rounded-[9px] bg-primary px-3.5 py-2.5 text-xs font-bold text-white hover:bg-primary-dark">💾 Save Contact</button>
          <button onClick={() => shareCard(cardUrl)} className="rounded-[9px] border-[1.5px] border-gray-200 bg-white px-3.5 py-2.5 text-xs font-bold text-primary hover:bg-accent-soft">↗ Share</button>
        </div>
        <a href={cardUrl} target="_blank" rel="noreferrer" className="block rounded-lg border border-gray-100 bg-white p-[5px]">
          <QRCodeSVG value={cardUrl} size={56} fgColor={BRAND_GREEN} bgColor="#ffffff" level="M" />
        </a>
      </div>
    </div>
  );
}

function CardMini({ card }) {
  const cardUrl = `${window.location.origin}/card/${card.slug}`;
  const initials = card.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div
      className="cursor-pointer overflow-hidden rounded-[14px] bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-card"
      onClick={() => window.open(cardUrl, '_blank')}
    >
      <div className="h-[5px] bg-gradient-to-r from-primary to-accent" />
      <div className="px-[18px] py-4">
        <div className="mb-2.5 flex items-center gap-3">
          {card.photo_url ? (
            <img src={card.photo_url} alt="" className="h-12 w-12 flex-shrink-0 rounded-full border-2 border-accent/30 object-cover" />
          ) : (
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-base font-black text-accent-light">{initials}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-extrabold text-primary">{card.full_name}</div>
            {card.job_title && <div className="mt-0.5 text-[10px] font-bold tracking-[0.5px] text-accent">{card.job_title}</div>}
          </div>
        </div>
        {card.phone && <div className="mb-[3px] text-[11px] text-gray-600">📱 {card.phone}</div>}
        {card.email && <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-gray-600">✉️ {card.email}</div>}
        <div className="mt-3 flex gap-1.5">
          <button onClick={e => { e.stopPropagation(); downloadVCard(card); }} className="flex-1 rounded-[7px] bg-accent-soft py-1.5 text-[11px] font-bold text-primary hover:opacity-90">💾 Save</button>
          <button onClick={e => { e.stopPropagation(); shareCard(cardUrl); }} className="flex-1 rounded-[7px] bg-accent-soft py-1.5 text-[11px] font-bold text-gray-600 hover:opacity-90">↗ Share</button>
        </div>
      </div>
    </div>
  );
}

export default function ECardsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/ecards').then(r => setCards(r.data)).finally(() => setLoading(false));
  }, []);

  const myCard = cards.find(c => c.is_mine);
  const teamCards = cards.filter(c => !c.is_mine && c.is_active);

  return (
    <div className="min-h-screen bg-page dark:bg-surface-dark">
      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center gap-3.5 bg-primary px-6 py-3.5">
        <button onClick={() => navigate('/')} className="rounded-lg border border-white/20 bg-white/10 px-3.5 py-1.5 text-[13px] text-white/70 hover:bg-white/20">← Home</button>
        <div className="text-base font-extrabold text-white">E-Business Cards</div>
        <div className="ml-auto text-xs text-white/50">Sonic Real Estate</div>
      </div>

      <div className="mx-auto max-w-[1100px] px-6 py-9">

        {loading ? (
          <div className="p-20 text-center text-[var(--text-muted)]">Loading cards…</div>
        ) : (
          <>
            {/* My Card */}
            {myCard ? (
              <div className="mb-12">
                <div className="mb-4 text-[11px] font-bold uppercase tracking-[2px] text-[var(--text-muted)]">Your Card</div>
                <div className="max-w-[420px]">
                  <CardFull card={myCard} />
                </div>
              </div>
            ) : (
              <div className="card mb-12 max-w-[420px] p-6">
                <div className="mb-2.5 text-[32px]">💳</div>
                <div className="text-[15px] font-bold text-[var(--text)]">No card yet</div>
                <div className="mt-1 text-[13px] text-[var(--text-muted)]">Contact HR to create your E-business card.</div>
              </div>
            )}

            {/* Team Cards */}
            {teamCards.length > 0 && (
              <div>
                <div className="mb-4 text-[11px] font-bold uppercase tracking-[2px] text-[var(--text-muted)]">Team Cards</div>
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                  {teamCards.map(card => <CardMini key={card.id} card={card} />)}
                </div>
              </div>
            )}

            {cards.length === 0 && (
              <div className="py-20 text-center">
                <div className="mb-3 text-5xl">💳</div>
                <div className="text-lg font-bold text-[var(--text)]">No E-cards yet</div>
                <div className="mt-1.5 text-sm text-[var(--text-muted)]">HR admin will create digital cards for the team.</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

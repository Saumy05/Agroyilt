import React, { useEffect, useState } from 'react';
import { FiHeadphones, FiPhone, FiMail, FiMessageCircle, FiChevronDown } from 'react-icons/fi';
import api from '../../services/api';

// Same fallbacks as the Help & Support page, used until the admin fills in the settings
const FALLBACK = { phone: '+91 91177 04450', whatsapp: '+91 91177 04450', email: 'agroyilt@gmail.com' };

let cachedInfo = null;

// Digits with country code, e.g. "98765 43210" -> "919876543210"
const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '').replace(/^0+/, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

/**
 * "Need help?" contact options for signed-out screens (welcome / login), shared by farmers,
 * vendors and workers. Contact details come from the admin settings.
 * @param {'light'|'dark'} variant - light for white screens, dark for the green welcome screen
 */
const SupportContact = ({ variant = 'light' }) => {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(cachedInfo || FALLBACK);

  useEffect(() => {
    if (cachedInfo) return undefined;
    let cancelled = false;
    api.get('/public/config')
      .then((res) => {
        const s = res.data?.settings;
        if (!res.data?.success || !s) return;
        cachedInfo = {
          phone: s.supportPhone || FALLBACK.phone,
          whatsapp: s.supportWhatsapp || s.supportPhone || FALLBACK.whatsapp,
          email: s.supportEmail || FALLBACK.email
        };
        if (!cancelled) setInfo(cachedInfo);
      })
      .catch(() => { /* keep the fallback contacts */ });
    return () => { cancelled = true; };
  }, []);

  const dark = variant === 'dark';
  const textColor = dark ? 'rgba(255,255,255,0.9)' : '#2E7D32';
  const panelBg = dark ? 'rgba(255,255,255,0.14)' : '#fff';
  const panelBorder = dark ? '1px solid rgba(255,255,255,0.3)' : '1px solid #C8E6C9';
  const rowColor = dark ? '#fff' : '#263238';

  const options = [
    { id: 'call', icon: FiPhone, label: 'Call us', value: info.phone, href: `tel:+${normalizePhone(info.phone)}` },
    { id: 'whatsapp', icon: FiMessageCircle, label: 'WhatsApp', value: info.whatsapp, href: `https://wa.me/${normalizePhone(info.whatsapp)}` },
    { id: 'email', icon: FiMail, label: 'Email', value: info.email, href: `mailto:${info.email}` }
  ];

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif" }}>
      <button
        type="button"
        id="support-contact-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px',
          color: textColor, fontSize: '0.85rem', fontWeight: 700
        }}
      >
        <FiHeadphones size={16} />
        <span>Need help? Contact Customer Support</span>
        <FiChevronDown size={16} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div style={{ width: '100%', maxWidth: '420px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {options.map(({ id, icon: Icon, label, value, href }) => (
            <a
              key={id}
              id={`support-contact-${id}`}
              href={href}
              target={id === 'whatsapp' ? '_blank' : undefined}
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                background: panelBg, border: panelBorder, borderRadius: '14px',
                textDecoration: 'none', color: rowColor, backdropFilter: dark ? 'blur(8px)' : 'none'
              }}
            >
              <Icon size={18} color={dark ? '#fff' : '#2E7D32'} />
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{label}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', fontWeight: 500, opacity: 0.85, wordBreak: 'break-all', textAlign: 'right' }}>{value}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupportContact;

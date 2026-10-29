import React, { useEffect } from 'react';
import { X, Command, Sparkles, ShieldCheck } from 'lucide-react';
import { useAppearance } from '../Appearance';
import './animated-chat-overlay.css';

export type AnimatedChatOverlayProps = {
  onClose: () => void;
  /** Mount Wayfinder's EXISTING chat component here. Do not create a second agent/chat backend. */
  chatContent: React.ReactNode;
  greeting?: string;
};

function EntranceCompanion() {
  return (
    <div className="wfa-entrance-companion" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="wfa-companion-glyph" role="presentation">
        <defs>
          <linearGradient id="wfa-companion-shell" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3DE3F1" />
            <stop offset="1" stopColor="#4D78FF" />
          </linearGradient>
        </defs>
        <path d="M22 32 L17 12 L39 24 Q50 19 61 24 L83 12 L78 34 Q86 45 82 62 Q76 82 50 84 Q24 82 18 62 Q14 45 22 32Z" fill="url(#wfa-companion-shell)" stroke="#9AF4FA" strokeWidth="2" />
        <path d="M27 43 Q50 33 73 43 L70 62 Q50 76 30 62Z" fill="#0B1424" stroke="#1B3652" strokeWidth="2" />
        <ellipse cx="39" cy="52" rx="4.5" ry="6" fill="#BDFBFF" />
        <ellipse cx="61" cy="52" rx="4.5" ry="6" fill="#BDFBFF" />
        <path d="M43 64 Q50 69 57 64" fill="none" stroke="#65E8ED" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="wfa-sparkle"><Sparkles size={17} /></span>
      <div className="wfa-greeting-bubble">Hey, I'm here.</div>
    </div>
  );
}

/**
 * Visual layer only. The host Electron app must create/show the overlay window
 * and invoke this component in its renderer route. The component does not
 * register global shortcuts or call backend APIs.
 */
export function AnimatedChatOverlay({ onClose, chatContent, greeting = 'Ready when you are.' }: AnimatedChatOverlayProps) {
  const {theme} = useAppearance();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="wfa-root"
      data-theme={theme.kind}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="wfa-backdrop" />
      <div className="wfa-entrance-stage" aria-hidden="true">
        <EntranceCompanion />
        <div className="wfa-entrance-caption">
          <span className="wfa-eyebrow">WAYFINDER // COMPANION</span>
          <strong>{greeting}</strong>
          <small>Your existing Wayfinder workspace</small>
        </div>
      </div>
      <aside className="wfa-chat-dock" role="dialog" aria-modal="true" aria-label="Wayfinder chat overlay">
        <header className="wfa-chat-header">
          <div className="wfa-brand">
            <span className="wfa-brand-mark"><Sparkles size={18} /></span>
            <span className="wfa-brand-copy"><strong>WAYFINDER</strong><small>DESKTOP COMPANION</small></span>
          </div>
          <div className="wfa-header-actions">
            <span className="wfa-local-label"><ShieldCheck size={12} /> Existing workspace</span>
            <button className="wfa-close" type="button" onClick={onClose} aria-label="Close chat overlay"><X size={18} /></button>
          </div>
        </header>
        <div className="wfa-chat-meta"><span><Command size={13} /> Global shortcut</span><span>Press Esc to close</span></div>
        <div className="wfa-chat-content">{chatContent}</div>
        <footer className="wfa-chat-footer">
          <span>Uses Wayfinder's existing conversation and permissions.</span>
          <button type="button" onClick={onClose}>Close overlay</button>
        </footer>
      </aside>
    </div>
  );
}

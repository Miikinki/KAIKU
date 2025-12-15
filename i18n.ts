import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Inline translations to avoid JSON module resolution issues in browser ESM
const resources = {
  en: {
    translation: {
      "feed": {
        "signals_detected": "Signals Detected",
        "regional_intercept": "REGIONAL INTERCEPT",
        "local_signals": "LOCAL SIGNALS",
        "filtering": "Filtering",
        "trending_header": "TRENDING NOW (24H)",
        "no_signals": "Scanning sector...",
        "clear_tag_hint": "Try clearing the tag filter.",
        "move_radar_hint": "Move the radar to a new location.",
        "replies": "Replies",
        "delete_confirm": "Are you sure you want to delete this signal?",
        "visitor_remote": "Remote signal from {{country}}",
        "visitor_global": "Global signal from {{country}}"
      },
      "input": {
        "broadcast_signal": "Broadcast Signal",
        "to": "To:",
        "locating": "Locating...",
        "rate_limit_exceeded": "Rate Limit Exceeded",
        "wait_message": "Please wait {{time}} before broadcasting again.",
        "placeholder": "What's happening nearby?",
        "broadcast_btn": "BROADCAST",
        "error_transmission": "Transmission failed.",
        "mask_coordinates": "MASK COORDINATES",
        "mask_description": "Randomizes location by ~1km for privacy.",
        "status_masked": "> ENCRYPTION: ACTIVE [LOCATION SCRAMBLED]",
        "status_precise": "> TARGETING: PRECISE [EXACT LOCATION VISIBLE]"
      },
      "thread": {
        "title": "THREAD",
        "replies_label": "Replies",
        "loading": "Loading...",
        "no_replies": "No replies yet. Be the first to respond.",
        "post_reply_placeholder": "Post a reply...",
        "delete_signal_tooltip": "Delete your signal",
        "error_send_reply": "Failed to send reply. Please try again."
      },
      "map": {
        "sector_scan_active": "Sector Scan Active",
        "signal_locked": "SIGNAL LOCKED",
        "zoom_limit": "SECURITY PROTOCOL: PRECISE LOCATION ENCRYPTED"
      }
    }
  },
  fi: {
    translation: {
      "feed": {
        "signals_detected": "Signaalia Havaittu",
        "regional_intercept": "ALUEELLINEN SIEPPAUS",
        "local_signals": "PAIKALLISET SIGNAALIT",
        "filtering": "Suodatus",
        "trending_header": "JUURI NYT (24H)",
        "no_signals": "Etsitään signaalia...",
        "clear_tag_hint": "Siirrä sektoria löytääksesi lähetyksiä.",
        "move_radar_hint": "Siirrä tutkaa uudelle alueelle.",
        "replies": "Vastausta",
        "delete_confirm": "Haluatko varmasti poistaa tämän signaalin?",
        "visitor_remote": "Etäsignaali maasta: {{country}}",
        "visitor_global": "Globaali signaali maasta: {{country}}"
      },
      "input": {
        "broadcast_signal": "Lähetä Signaali",
        "to": "Kohde:",
        "locating": "Paikannetaan...",
        "rate_limit_exceeded": "Lähetysraja Ylittyi",
        "wait_message": "Odota {{time}} ennen seuraavaa lähetystä.",
        "placeholder": "Mitä lähistöllä tapahtuu?",
        "broadcast_btn": "LÄHETÄ",
        "error_transmission": "Lähetys epäonnistui.",
        "mask_coordinates": "NAAMIOI SIJAINTI",
        "mask_description": "Satunnaistaa sijainnin n. 1km yksityisyyden vuoksi.",
        "status_masked": "> SALAUS: AKTIIVINEN [SIJAINTI HÄIRITTY]",
        "status_precise": "> KOHDISTUS: TARKKA [TARKKA SIJAINTI NÄKYY]"
      },
      "thread": {
        "title": "KETJU",
        "replies_label": "Vastaukset",
        "loading": "Ladataan...",
        "no_replies": "Ei vastauksia. Ole ensimmäinen.",
        "post_reply_placeholder": "Kirjoita vastaus...",
        "delete_signal_tooltip": "Poista signaali",
        "error_send_reply": "Vastauksen lähetys epäonnistui. Yritä uudelleen."
      },
      "map": {
        "sector_scan_active": "SEKTORISKANNAUS AKTIIVINEN",
        "signal_locked": "SIGNAALI LUKITTU",
        "zoom_limit": "TURVALLISUUSPROTOKOLLA: TARKKA SIJAINTI SALATTU"
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['navigator', 'htmlTag', 'path', 'subdomain'],
    }
  });

export default i18n;
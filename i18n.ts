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
        "visitor_global": "Global signal from {{country}}",
        "scanning": "SCANNING...",
        "signal_locked": "SIGNAL LOCKED"
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
        "error_send_reply": "Failed to send reply. Please try again.",
        "image_attached": "Image attached"
      },
      "map": {
        "sector_scan_active": "Sector Scan Active",
        "signal_locked": "SIGNAL LOCKED",
        "zoom_limit": "SECURITY PROTOCOL: PRECISE LOCATION ENCRYPTED",
        "masked": "MASKED",
        "exact": "EXACT",
        "content_hidden": "** CONTENT HIDDEN **",
        "open_channel": "OPEN CHANNEL"
      },
      "welcome": {
        "subtitle": "Hyperlocal Signal Grid",
        "feature_scan_title": "SECTOR SCAN",
        "feature_scan_desc": "Visible only to those within 140km.",
        "feature_ghost_title": "GHOST PROTOCOL",
        "feature_ghost_desc": "No names. No accounts. Total anonymity.",
        "feature_decay_title": "SIGNAL DECAY",
        "feature_decay_desc": "Messages fade and vanish automatically.",
        "status_standby": "SYSTEM STANDBY",
        "status_init_gps": "INITIALIZING GPS (PRECISION)...",
        "status_retry": "RETRYING (STANDARD SIGNAL)...",
        "status_using_last": "USING LAST KNOWN VECTOR...",
        "status_triangulating": "TRIANGULATING VIA NETWORK NODE...",
        "status_failed": "CONNECTION FAILED",
        "error_signal_lost": "SIGNAL LOST. CHECK GPS/NETWORK.",
        "error_permission": "LOCATION PERMISSION REQUIRED",
        "btn_initialize": "INITIALIZE UPLINK",
        "footer_version": "v2.0 • ENCRYPTED CONNECTION"
      },
      "boot": {
        "step1": "> SEARCHING LOCAL FREQUENCIES...",
        "step2": "> TRIANGULATING SIGNAL SOURCE... [LOCKED]",
        "step3": "> HANDSHAKE PROTOCOL... [SECURE]",
        "step4": "> UPLINK ESTABLISHED."
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
        "visitor_global": "Globaali signaali maasta: {{country}}",
        "scanning": "SKANNATAAN...",
        "signal_locked": "SIGNAALI LUKITTU"
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
        "error_send_reply": "Vastauksen lähetys epäonnistui. Yritä uudelleen.",
        "image_attached": "Kuvaliite"
      },
      "map": {
        "sector_scan_active": "SEKTORISKANNAUS AKTIIVINEN",
        "signal_locked": "SIGNAALI LUKITTU",
        "zoom_limit": "TURVALLISUUSPROTOKOLLA: TARKKA SIJAINTI SALATTU",
        "masked": "MASKATTU",
        "exact": "TARKKA",
        "content_hidden": "** SISÄLTÖ PIILOTETTU **",
        "open_channel": "AVAA KANAVA"
      },
      "welcome": {
        "subtitle": "Hyperlokaali Signaaliverkko",
        "feature_scan_title": "SEKTORISKANNAUS",
        "feature_scan_desc": "Näkyy vain 140km säteellä oleville.",
        "feature_ghost_title": "GHOST PROTOKOLLA",
        "feature_ghost_desc": "Ei nimiä. Ei tilejä. Täysi anonymiteetti.",
        "feature_decay_title": "SIGNAALIN HÄIPYMINEN",
        "feature_decay_desc": "Viestit katoavat automaattisesti.",
        "status_standby": "JÄRJESTELMÄ VALMIUSTILASSA",
        "status_init_gps": "ALUSTETAAN GPS (TARKKUUS)...",
        "status_retry": "Y RITETÄÄN UUDELLEEN (NORMAALI SIGNAALI)...",
        "status_using_last": "KÄYTETÄÄN VIIMEISINTÄ VEKTORIA...",
        "status_triangulating": "KOLMIOIDAAN VERKKOSOLMUN KAUTTA...",
        "status_failed": "YHTEYS EPÄONNISTUI",
        "error_signal_lost": "SIGNAALI KATKESI. TARKISTA GPS/VERKKO.",
        "error_permission": "SIJAINTILUPA VAADITAAN",
        "btn_initialize": "ALUSTA YHTEYS",
        "footer_version": "v2.0 • SALATTU YHTEYS"
      },
      "boot": {
        "step1": "> ETSITÄÄN PAIKALLISIA TAAJUUKSIA...",
        "step2": "> KOLMIOIDAAN SIGNAALILÄHDETTÄ... [LUKITTU]",
        "step3": "> KÄTTELYPROTOKOLLA... [TURVATTU]",
        "step4": "> YHTEYS MUODOSTETTU."
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
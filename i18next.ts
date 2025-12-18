// Fix: Renamed import alias to 'i18nextInstance' to resolve circular definition issues with the filename i18next.ts.
import i18nextInstance from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Unified translation resource for major global languages
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
        "scanning": "SCANNING SECTOR...",
        "signal_locked": "SIGNAL LOCKED",
        "translate": "Translate",
        "show_original": "Show Original",
        "translated_by_ai": "Translated by AI"
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
        "open_channel": "OPEN CHANNEL",
        "search_placeholder": "Search coordinates...",
        "search_not_found": "TARGET NOT FOUND",
        "search_this_area": "SEARCH THIS AREA"
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
        "status_acquiring": "Acquiring signal...",
        "status_target": "Target: {{city}}",
        "status_scanning_freq": "Scanning local frequencies...",
        "status_downloading": "Downloading feed...",
        "status_failed": "CONNECTION FAILED",
        "error_signal_lost": "SIGNAL LOST. CHECK GPS/NETWORK.",
        "error_permission": "LOCATION PERMISSION REQUIRED",
        "btn_initialize": "INITIALIZE UPLINK",
        "footer_version": "v2.0 • ENCRYPTED CONNECTION"
      },
      "boot": {
        "step1": "> SCANNING LOCAL FREQUENCIES...",
        "step2": "> TRIANGULATING SIGNAL SOURCE... [LOCKED]",
        "step3": "> HANDSHAKE PROTOCOL... [SECURE]",
        "step4": "> UPLINK ESTABLISHED."
      },
      "news": {
        "read_original": "Read original ({{source}}) →"
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
        "no_signals": "Skannataan sektoria...",
        "clear_tag_hint": "Siirrä sektoria löytääksesi lähetyksiä.",
        "move_radar_hint": "Siirrä tutkaa uudelle alueelle.",
        "replies": "Vastausta",
        "delete_confirm": "Haluatko varmasti poistaa tämän signaalin?",
        "visitor_remote": "Etäsignaali maasta: {{country}}",
        "visitor_global": "Globaali signaali maasta: {{country}}",
        "scanning": "SKANNATAAN SEKTORIA...",
        "signal_locked": "SIGNAALI LUKITTU",
        "translate": "Käännä",
        "show_original": "Näytä alkuperäinen",
        "translated_by_ai": "Tekoälyn kääntämä"
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
        "title": "THREAD",
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
        "open_channel": "AVAA KANAVA",
        "search_placeholder": "Etsi koordinaatteja...",
        "search_not_found": "KOHDETTA EI LÖYDY",
        "search_this_area": "HAE TÄLTÄ ALUEELTA"
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
        "status_acquiring": "Haetaan signaalia...",
        "status_target": "Kohde: {{city}}",
        "status_scanning_freq": "Skannataan paikallisia taajuuksia...",
        "status_downloading": "Ladataan syötettä...",
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
      },
      "news": {
        "read_original": "Lue alkuperäinen ({{source}}) →"
      }
    }
  },
  es: {
    translation: {
      "feed": {
        "signals_detected": "Señales Detectadas",
        "regional_intercept": "INTERCEPCIÓN REGIONAL",
        "local_signals": "SEÑALES LOCALES",
        "scanning": "ESCANEANDO SECTOR...",
        "signal_locked": "SEÑAL BLOQUEADA",
        "translate": "Traducir",
        "show_original": "Mostrar Original",
        "translated_by_ai": "Traducido por IA"
      },
      "input": {
        "broadcast_signal": "Transmitir Señal",
        "to": "Para:",
        "locating": "Localizando...",
        "broadcast_btn": "TRANSMITIR",
        "mask_coordinates": "ENMASCARAR COORDENADAS"
      },
      "map": {
        "search_this_area": "BUSCAR EN ESTA ÁREA"
      },
      "welcome": {
        "subtitle": "Red de Señal Hiperlocal",
        "status_acquiring": "Adquiriendo señal...",
        "status_target": "Objetivo: {{city}}",
        "status_scanning_freq": "Escaneando frecuencias locales...",
        "btn_initialize": "INICIALIZAR ENLACE"
      },
      "news": {
        "read_original": "Leer original ({{source}}) →"
      }
    }
  },
  fr: {
    translation: {
      "feed": {
        "signals_detected": "Signaux Détectés",
        "regional_intercept": "INTERCEPTION RÉGIONALE",
        "local_signals": "SIGNAUX LOCAUX",
        "scanning": "BALAYAGE DU SECTEUR...",
        "signal_locked": "SIGNAL VERROUILLÉ",
        "translate": "Traduire",
        "show_original": "Voir l'Original",
        "translated_by_ai": "Traduit par l'IA"
      },
      "input": {
        "broadcast_signal": "Diffuser le Signal",
        "broadcast_btn": "DIFFUSER",
        "mask_coordinates": "MASQUER LES COORDONNÉES"
      },
      "map": {
        "search_this_area": "CHERCHER DANS CETTE ZONE"
      },
      "welcome": {
        "subtitle": "Grille de Signal Hyperlocale",
        "status_acquiring": "Acquisition du signal...",
        "status_target": "Cible: {{city}}",
        "status_scanning_freq": "Balayage des fréquences locales...",
        "btn_initialize": "INITIALISER LA LIAISON"
      },
      "news": {
        "read_original": "Lire l'original ({{source}}) →"
      }
    }
  },
  de: {
    translation: {
      "feed": {
        "signals_detected": "Signale Erkannt",
        "regional_intercept": "REGIONALE ABFANGUNG",
        "local_signals": "LOKALE SIGNALE",
        "scanning": "SCANNE SEKTOR...",
        "signal_locked": "SIGNAL FIXIERT",
        "translate": "Übersetzen",
        "show_original": "Original zeigen",
        "translated_by_ai": "KI-übersetzt"
      },
      "input": {
        "broadcast_signal": "Signal Senden",
        "broadcast_btn": "SENDEN",
        "mask_coordinates": "KOORDINATEN MASKIERT"
      },
      "map": {
        "search_this_area": "DIESEN BEREICH DURCHSUCHEN"
      },
      "welcome": {
        "subtitle": "Hyperlokales Signalnetz",
        "status_acquiring": "Signal wird erfasst...",
        "status_target": "Ziel: {{city}}",
        "status_scanning_freq": "Scanne lokale Frequenzen...",
        "btn_initialize": "UPLINK INITIALISIEREN"
      },
      "news": {
        "read_original": "Original lesen ({{source}}) →"
      }
    }
  },
  pt: {
    translation: {
      "feed": {
        "signals_detected": "Sinais Detectados",
        "regional_intercept": "INTERCEPTAÇÃO REGIONAL",
        "local_signals": "SINAIS LOCAIS",
        "scanning": "ESCANEANDO SETOR...",
        "signal_locked": "SINAL BLOQUEADO",
        "translate": "Traduzir",
        "show_original": "Mostrar Original",
        "translated_by_ai": "Traduzido por IA"
      },
      "input": {
        "broadcast_signal": "Transmitir Sinal",
        "broadcast_btn": "TRANSMITIR",
        "mask_coordinates": "MASCARAR COORDENADAS"
      },
      "map": {
        "search_this_area": "PESQUISAR NESTA ÁREA"
      },
      "welcome": {
        "subtitle": "Grade de Sinal Hiperlocal",
        "status_acquiring": "Adquirindo sinal...",
        "status_target": "Alvo: {{city}}",
        "status_scanning_freq": "Escanear frequências locales...",
        "btn_initialize": "INICIALIZAR UPLINK"
      },
      "news": {
        "read_original": "Ler original ({{source}}) →"
      }
    }
  },
  it: {
    translation: {
      "feed": {
        "signals_detected": "Segnali Rilevati",
        "regional_intercept": "INTERCETTAZIONE REGIONALE",
        "local_signals": "SEGNALI LOCALI",
        "scanning": "SCANSIONE SETTORE...",
        "signal_locked": "SEGNALE BLOCCATO",
        "translate": "Traduci",
        "show_original": "Mostra Originale",
        "translated_by_ai": "Tradotto da IA"
      },
      "input": {
        "broadcast_signal": "Trasmetti Segnale",
        "broadcast_btn": "TRASMETTI",
        "mask_coordinates": "MASCHERA COORDINATE"
      },
      "map": {
        "search_this_area": "CERCA IN QUESTA ZONA"
      },
      "welcome": {
        "subtitle": "Griglia di Segnale Iperlocale",
        "status_acquiring": "Acquisizione segnale...",
        "status_target": "Obiettivo: {{city}}",
        "status_scanning_freq": "Scansione frequenze locali...",
        "btn_initialize": "INIZIALIZZA UPLINK"
      },
      "news": {
        "read_original": "Leggi originale ({{source}}) →"
      }
    }
  },
  ru: {
    translation: {
      "feed": {
        "signals_detected": "Сигналы Обнаружены",
        "regional_intercept": "РЕГИОНАЛЬНЫЙ ПЕРЕХВАТ",
        "local_signals": "ЛОКАЛЬНЫЕ СИГНАЛЫ",
        "scanning": "СКАНИРОВАНИЕ СЕКТОРА...",
        "signal_locked": "СИГНАЛ ЗАБЛОКИРОВАН",
        "translate": "Перевести",
        "show_original": "Оригинал",
        "translated_by_ai": "Переведено ИИ"
      },
      "input": {
        "broadcast_signal": "Транслировать Сигнал",
        "broadcast_btn": "ТРАНСЛЯЦИЯ",
        "mask_coordinates": "МАСКИРОВКА КООРДИНАТ"
      },
      "map": {
        "search_this_area": "ИСKATЬ В ЭТОЙ ОБЛАСТИ"
      },
      "welcome": {
        "subtitle": "Гиперлокальная Сеть Сигналов",
        "status_acquiring": "Получение сигнала...",
        "status_target": "Цель: {{city}}",
        "status_scanning_freq": "Сканирование местных частот...",
        "btn_initialize": "ИНИЦИАЛИЗАЦИЯ СВЯЗИ"
      },
      "news": {
        "read_original": "Читать оригинал ({{source}}) →"
      }
    }
  },
  zh: {
    translation: {
      "feed": {
        "signals_detected": "检测到信号",
        "regional_intercept": "区域拦截",
        "local_signals": "本地信号",
        "scanning": "正在扫描扇区...",
        "signal_locked": "信号已锁定",
        "translate": "翻译",
        "show_original": "显示原文",
        "translated_by_ai": "AI 翻译"
      },
      "input": {
        "broadcast_signal": "广播信号",
        "broadcast_btn": "广播",
        "mask_coordinates": "掩盖坐标"
      },
      "map": {
        "search_this_area": "搜索此区域"
      },
      "welcome": {
        "subtitle": "超本地信号网",
        "status_acquiring": "正在获取信号...",
        "status_target": "目标：{{city}}",
        "status_scanning_freq": "正在扫描本地频率...",
        "btn_initialize": "初始化上行链路"
      },
      "news": {
        "read_original": "阅读原文 ({{source}}) →"
      }
    }
  },
  ja: {
    translation: {
      "feed": {
        "signals_detected": "信号を検出",
        "regional_intercept": "地域傍受",
        "local_signals": "ローカル信号",
        "scanning": "セクタースキャン中...",
        "signal_locked": "信号ロック",
        "translate": "翻訳",
        "show_original": "原文を表示",
        "translated_by_ai": "AIによる翻訳"
      },
      "input": {
        "broadcast_signal": "信号を送信",
        "broadcast_btn": "送信",
        "mask_coordinates": "座標をマスク"
      },
      "map": {
        "search_this_area": "このエリアを検索"
      },
      "welcome": {
        "subtitle": "超地域限定信号グリッド",
        "status_acquiring": "信号を取得中...",
        "status_target": "ターゲット: {{city}}",
        "status_scanning_freq": "ローカル周波数をスキャン中...",
        "btn_initialize": "アップリンク初期化"
      },
      "news": {
        "read_original": "原文を読む ({{source}}) →"
      }
    }
  },
  ko: {
    translation: {
      "feed": {
        "signals_detected": "신호 감지됨",
        "regional_intercept": "지역 차단",
        "local_signals": "로컬 신호",
        "scanning": "섹터 스캔 중...",
        "signal_locked": "신호 고정",
        "translate": "번역",
        "show_original": "원문 보기",
        "translated_by_ai": "AI 번역됨"
      },
      "input": {
        "broadcast_signal": "신호 브로드캐스트",
        "broadcast_btn": "방송",
        "mask_coordinates": "좌표 마스킹"
      },
      "map": {
        "search_this_area": "이 지역 검색"
      },
      "welcome": {
        "subtitle": "초현지 신호 그리드",
        "status_acquiring": "신호 수신 중...",
        "status_target": "목표: {{city}}",
        "status_scanning_freq": "로컬 주파수 스캔 중...",
        "btn_initialize": "업링크 초기화"
      },
      "news": {
        "read_original": "원문 읽기 ({{source}}) →"
      }
    }
  },
  ar: {
    translation: {
      "feed": {
        "signals_detected": "تم رصد إشارات",
        "regional_intercept": "اعتراض إقليمي",
        "local_signals": "إشارات محلية",
        "scanning": "جاري مسح القطاع...",
        "signal_locked": "تم قفل الإشارة",
        "translate": "ترجم",
        "show_original": "عرض الأصل",
        "translated_by_ai": "مترجم بواسطة الذكاء الاصطناعي"
      },
      "input": {
        "broadcast_signal": "بث إشارة",
        "broadcast_btn": "بث",
        "mask_coordinates": "قناع الإحداثيات"
      },
      "map": {
        "search_this_area": "ابحث في هذه المنطقة"
      },
      "welcome": {
        "subtitle": "شبكة إشارات محلية للغاية",
        "status_acquiring": "جاري التقاط الإشارة...",
        "status_target": "الهدف: {{city}}",
        "status_scanning_freq": "جاري مسح الترددات المحلية...",
        "btn_initialize": "بدء الاتصال الصاعد"
      },
      "news": {
        "read_original": "اقرأ المصدر ({{source}}) →"
      }
    }
  },
  hi: {
    translation: {
      "feed": {
        "signals_detected": "सिग्नल मिले",
        "regional_intercept": "क्षेत्रीय अवरोधन",
        "local_signals": "स्थानीय सिग्नल",
        "scanning": "सेक्टर स्कैन किया जा रहा है...",
        "signal_locked": "सिग्नल लॉक",
        "translate": "अनुवाद करें",
        "show_original": "मूल दिखाएं",
        "translated_by_ai": "AI द्वारा अनुवादित"
      },
      "input": {
        "broadcast_signal": "सिग्नल प्रसारित करें",
        "broadcast_btn": "प्रसारण",
        "mask_coordinates": "निर्देशांक छुपाएं"
      },
      "map": {
        "search_this_area": "इस क्षेत्र में खोजें"
      },
      "welcome": {
        "subtitle": "हाइपरलोकल सिग्नल ग्रिड",
        "status_acquiring": "सिग्नल प्राप्त किया जा रहा है...",
        "status_target": "लक्षy: {{city}}",
        "status_scanning_freq": "स्थानीय आवृत्तियों को स्कैन किया जा रहा है...",
        "btn_initialize": "अपलिंक शुरू करें"
      },
      "news": {
        "read_original": "मूल समाचार पढ़ें ({{source}}) →"
      }
    }
  },
  tr: {
    translation: {
      "feed": {
        "signals_detected": "Sinyaller Tespit Edildi",
        "regional_intercept": "BÖLGESEL MÜDAHALE",
        "local_signals": "YEREL SİNYALLER",
        "scanning": "SEKTÖR TARANIYOR...",
        "signal_locked": "SİNYAL KİLİTLENDİ",
        "translate": "Çevir",
        "show_original": "Orijinali Göster",
        "translated_by_ai": "Yapay Zeka ile Çevrildi"
      },
      "input": {
        "broadcast_signal": "Sinyal Yayınla",
        "broadcast_btn": "YAYINLA",
        "mask_coordinates": "KOORDİNATLARI MASKELE"
      },
      "map": {
        "search_this_area": "BU BÖLGEDE ARA"
      },
      "welcome": {
        "subtitle": "Hiper-yerel Sinyal Ağı",
        "status_acquiring": "Sinyal alınıyor...",
        "status_target": "Hedef: {{city}}",
        "status_scanning_freq": "Yerel frekanslar taranıyor...",
        "btn_initialize": "BAĞLANTIYI BAŞLAT"
      },
      "news": {
        "read_original": "Orijinalini oku ({{source}}) →"
      }
    }
  }
};

// Use 'i18nextInstance' to initialize the library, exported as default.
i18nextInstance
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
      caches: ['localStorage'],
    }
});

export default i18nextInstance;
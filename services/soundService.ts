import { Howl } from 'howler';

// Short, optimized UI sounds (Base64 WAV)

// "Click" - Mechanical switch sound
const SFX_CLICK = "data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAEA////////AQD//wAAAAAAAAEAAQAAAAAAAAD//wAA//8BAAAAAAAAAP//AQAAAAAAAAD//wEAAQAAAAAAAAD//wAA//8AAAAAAQD//wEAAAD//wEAAAAAAAEAAAD//wAAAAD//wEAAQAAAAAAAAD//wAA//8BAAAAAAAAAP//AQAAAAAAAAD//wEAAQAAAAAAAAD//wAA//8AAAAAAQD//wEAAAD//wEAAAAAAAEAAAD//wAAAAD//wEAAQAAAAAAAAD//wAA";

// "Scan" - High pitch data chirp
const SFX_SCAN = "data:audio/wav;base64,UklGRlIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAAA//8AAP//AAAAAP//AQAAAAAA//8BAAAAAAAA//8AAAAA//8BAAAAAAD//wEAAAAAAP//AAAAAP//AQAAAAAA//8BAAAAAAD//wAAAAAA//8BAAAAAAD//wEAAAAAAP//AAAAAP//AQAAAAAA//8BAAAAAAD//wAAAAAA//8BAAAAAAD//wEAAAAAAP//AAAAAP//AQAAAAAA//8BAAAAAAD//wAAAAAA//8BAAAAAAD//wEAAAAAAP//AAAAAP//AQAAAAAA//8BAAAAAAD//wAAAAAA//8BAAAAAAD//wEAAAAAAP//AAAAAP//AQAAAAAA//8BAAAAAAD//wAAAAAA//8BAAAAAAD//wEAAAAAAP//AAAAAP//AQAAAA==";

// "Success" - Sent message confirmation
const SFX_SUCCESS = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAEA//8AAP//AAABAA==";

let isMuted = localStorage.getItem('kaiku_muted') === 'true';

// Initialize Howl instances
const clickSound = new Howl({ src: [SFX_CLICK], volume: 0.4 });
const scanSound = new Howl({ src: [SFX_SCAN], volume: 0.15, rate: 1.2 });
const successSound = new Howl({ src: [SFX_SCAN], volume: 0.2, rate: 0.8 }); // Lower pitch scan for success

export const SoundService = {
  playClick: () => {
    if (isMuted) return;
    clickSound.play();
  },
  playScan: () => {
    if (isMuted) return;
    scanSound.play();
  },
  playSuccess: () => {
      if (isMuted) return;
      successSound.play();
  },
  toggleMute: () => {
    isMuted = !isMuted;
    localStorage.setItem('kaiku_muted', isMuted.toString());
    return isMuted;
  },
  getMuteStatus: () => isMuted
};
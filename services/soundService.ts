
import { Howl } from 'howler';

// "Success" - Subtle sent message confirmation (Low pitch data chirp)
const SFX_SUCCESS = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAEA//8AAP//AAABAA==";

let isMuted = localStorage.getItem('kaiku_muted') === 'true';

// Initialize only the Success sound
const successSound = new Howl({ 
  src: [SFX_SUCCESS], 
  volume: 0.2, 
  rate: 0.8 
});

export const SoundService = {
  // Silent operations for legacy calls to prevent crashes
  playClick: () => {},
  playScan: (volumeScale: number = 1.0) => {},
  
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

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MapPin, AlertCircle, Loader2, Clock, Image as ImageIcon, Trash2, Shield, Crosshair, AlertTriangle } from 'lucide-react';
import { THEME_COLOR } from '../constants';
import { SoundService } from '../services/soundService';
import { triggerHaptic } from '../services/hapticService';
import { useTranslation } from 'react-i18next';
import { canSendImages, uploadImage } from '../services/storageService';

interface ChatInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (text: string, imageUrl?: string, isMasked?: boolean) => Promise<void>;
  cooldownUntil: number | null;
  targetLocationName?: string;
  onTypingStateChange?: (isTyping: boolean) => void;
  gpsAccuracy: number | null; 
}

const REQUIRED_ACCURACY_METERS = 50; 

const ChatInputModal: React.FC<ChatInputModalProps> = ({ isOpen, onClose, onSave, cooldownUntil, targetLocationName, onTypingStateChange, gpsAccuracy }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [isMasked, setIsMasked] = useState(false);
  const typingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
        setError(null);
    } else {
        setSelectedFile(null);
        setPreviewUrl(null);
        setText('');
        setIsMasked(false); 
        if (onTypingStateChange) onTypingStateChange(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!cooldownUntil || !isOpen) return;
    const interval = setInterval(() => {
      const diff = cooldownUntil - Date.now();
      if (diff <= 0) setTimeLeft('');
      else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        
        if (h > 0) setTimeLeft(`${h}h ${m}m`);
        else setTimeLeft(`${m}m ${s}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil, isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          if (!file.type.startsWith('image/')) {
              setError("Invalid file type. Please select an image.");
              return;
          }
          if (file.size > 5 * 1024 * 1024) {
              setError("Image is too large (Max 5MB).");
              return;
          }
          triggerHaptic('light');
          setSelectedFile(file);
          setPreviewUrl(URL.createObjectURL(file));
          setError(null);
      }
  };

  const clearImage = () => {
      triggerHaptic('light');
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      if (onTypingStateChange) {
          onTypingStateChange(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
              onTypingStateChange(false);
          }, 1000);
      }
  };

  const handleToggleMask = () => {
      triggerHaptic('light');
      setIsMasked(!isMasked);
  };

  const handleSubmit = async () => {
    if (!text.trim() && !selectedFile) return;
    
    setIsSubmitting(true);
    setError(null);
    triggerHaptic('light');
    
    if (onTypingStateChange) {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        onTypingStateChange(false);
    }
    
    try {
      let uploadedImageUrl: string | undefined = undefined;
      if (selectedFile) {
          setIsUploading(true);
          uploadedImageUrl = await uploadImage(selectedFile);
          setIsUploading(false);
      }
      await onSave(text, uploadedImageUrl, isMasked);
      
      // Success feedback: Subtle chime + rhythmic pulse
      SoundService.playSuccess();
      triggerHaptic('success');
      
      setText('');
      clearImage();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || t('input.error_transmission'));
      triggerHaptic('error');
      setIsUploading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSignalWeak = gpsAccuracy === null || gpsAccuracy > REQUIRED_ACCURACY_METERS;
  const isExactModeBlocked = !isMasked && isSignalWeak;
  const isLocked = !!cooldownUntil && timeLeft !== '';
  const canAttachImages = canSendImages();
  const isSendDisabled = isSubmitting || (!text.trim() && !selectedFile) || !targetLocationName || isExactModeBlocked;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { triggerHaptic('light'); onClose(); }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-[#0f0f18] border border-white/10 rounded-2xl shadow-2xl p-6 text-white"
          >
            <button onClick={() => { triggerHaptic('light'); onClose(); }} className="absolute top-4 right-4 text-gray-500 hover:text-white">
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold mb-1 text-white">{t('input.broadcast_signal')}</h2>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-6">
                 {targetLocationName ? (
                    <>
                        <span>{t('input.to')}</span>
                        <span className="text-cyan-400 font-bold flex items-center gap-1">
                            <MapPin size={10} /> {targetLocationName}
                        </span>
                        {gpsAccuracy && (
                            <span className={`ml-2 font-mono text-[10px] ${gpsAccuracy > REQUIRED_ACCURACY_METERS ? 'text-red-400' : 'text-green-400'}`}>
                                [GPS: ±{Math.round(gpsAccuracy)}m]
                            </span>
                        )}
                    </>
                 ) : (
                    <span className="animate-pulse">{t('input.locating')}</span>
                 )}
            </div>

            {isLocked ? (
              <div className="bg-white/5 rounded-xl p-6 text-center border border-white/10">
                <Clock className="mx-auto mb-2 text-yellow-500" size={32} />
                <h3 className="text-white font-medium">{t('input.rate_limit_exceeded')}</h3>
                <p className="text-sm text-gray-400 mt-1">{t('input.wait_message', { time: timeLeft })}</p>
              </div>
            ) : (
              <>
                {previewUrl && (
                    <div className="relative mb-4 w-full h-32 bg-black/40 rounded-xl overflow-hidden border border-cyan-500/30 group">
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover opacity-80" />
                        <button 
                            onClick={clearImage}
                            className="absolute top-2 right-2 p-1.5 bg-red-500/80 text-white rounded-full hover:bg-red-500 transition-colors"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                )}

                <div className="relative">
                    <textarea
                    value={text}
                    onChange={handleTextChange}
                    placeholder={t('input.placeholder')}
                    className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-gray-200 focus:outline-none focus:border-cyan-500/50 resize-none mb-3 pb-12"
                    />
                    <div className="absolute bottom-6 left-4 flex gap-2">
                        {canAttachImages && (
                            <>
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    onChange={handleFileSelect}
                                />
                                <button 
                                    onClick={() => { triggerHaptic('light'); fileInputRef.current?.click(); }}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                                    title="Attach Image"
                                >
                                    <ImageIcon size={20} />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div 
                    onClick={handleToggleMask}
                    className={`mb-4 flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-300 group
                        ${isMasked 
                            ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.1)]' 
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        }
                    `}
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg transition-colors ${isMasked ? 'bg-cyan-500 text-black' : 'bg-gray-800 text-gray-500'}`}>
                            <Shield size={18} className={isMasked ? 'animate-pulse' : ''} />
                        </div>
                        <div className="flex flex-col">
                            <span className={`text-xs font-bold tracking-wider ${isMasked ? 'text-cyan-400' : 'text-gray-400'}`}>
                                {t('input.mask_coordinates')}
                            </span>
                            <span className="text-[10px] text-gray-500 font-mono">
                                {t('input.mask_description')}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {isExactModeBlocked && (
                             <div title="Signal too weak for exact mode">
                                <AlertTriangle size={16} className="text-red-500 animate-pulse" />
                             </div>
                        )}
                        <div className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${isMasked ? 'bg-cyan-500' : 'bg-gray-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-md ${isMasked ? 'left-6' : 'left-1'}`} />
                        </div>
                    </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-200 text-xs">
                    <AlertCircle size={16} className="shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={isSendDisabled}
                  className={`w-full py-3 font-bold rounded-xl flex items-center justify-center gap-2 transition-all 
                      ${isExactModeBlocked 
                          ? 'bg-amber-900/50 text-amber-200 cursor-not-allowed border border-amber-500/30' 
                          : 'bg-white text-black hover:bg-gray-200 disabled:opacity-50'
                      }`}
                >
                  {isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" />
                        <span>{isUploading ? "UPLOADING..." : "SENDING..."}</span>
                      </>
                  ) : isExactModeBlocked ? (
                      <>
                        <Loader2 className="animate-spin" />
                        <span className="animate-pulse">ACQUIRING SATELLITES...</span>
                      </>
                  ) : (
                      <>
                        <Send size={18} />
                        <span>{t('input.broadcast_btn')}</span>
                      </>
                  )}
                </button>
              </>
            )}
            
            <div className={`mt-4 flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase transition-colors duration-300 ${isMasked ? 'text-cyan-400' : 'text-amber-500'}`}>
               {isMasked ? (
                   <Shield size={12} className="mt-0.5" />
               ) : (
                   <Crosshair size={12} className="mt-0.5" />
               )}
               <p className="animate-pulse">
                   {isMasked ? t('input.status_masked') : t('input.status_precise')}
               </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ChatInputModal;
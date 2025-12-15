import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';

interface ImageAttachmentProps {
  src: string;
  alt?: string;
}

const ImageAttachment: React.FC<ImageAttachmentProps> = ({ src, alt = "Attached image" }) => {
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <div className="mt-3 relative rounded-lg overflow-hidden border border-white/10 group max-w-sm w-full">
      <div 
        className="relative cursor-pointer" 
        onClick={(e) => {
            e.stopPropagation();
            setIsRevealed(!isRevealed);
        }}
      >
        <img 
            src={src} 
            alt={alt}
            className={`w-full max-h-[300px] object-cover bg-black/50 transition-all duration-500 ease-in-out ${
                isRevealed ? 'filter-none' : 'blur-xl scale-105 opacity-60'
            }`}
            loading="lazy"
        />

        {/* Overlay when blurred */}
        {!isRevealed && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-xl">
                    <EyeOff className="text-cyan-400" size={24} />
                    <span className="text-[10px] text-white font-mono tracking-widest uppercase">Tap to reveal</span>
                </div>
            </div>
        )}

        {/* Floating Toggle when revealed */}
        {isRevealed && (
             <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white transition-all opacity-0 group-hover:opacity-100">
                 <Eye size={16} />
             </div>
        )}
      </div>
    </div>
  );
};

export default ImageAttachment;
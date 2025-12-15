import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface BootSequenceProps {
  onComplete: () => void;
}

const BootSequence: React.FC<BootSequenceProps> = ({ onComplete }) => {
  const [lines, setLines] = useState<string[]>([]);

  const SEQUENCE = [
    { text: "> INITIALIZING KAIKU PROTOCOL...", delay: 200 },
    { text: "> CONNECTING TO SIGNAL GRID...", delay: 800 },
    { text: "> DECRYPTING LOCAL CHANNELS... [OK]", delay: 1500 },
    { text: "> UPLINK ESTABLISHED.", delay: 2200 }
  ];

  useEffect(() => {
    let timeouts: NodeJS.Timeout[] = [];

    SEQUENCE.forEach(({ text, delay }) => {
      const t = setTimeout(() => {
        setLines(prev => [...prev, text]);
      }, delay);
      timeouts.push(t);
    });

    // Fade out trigger
    const finishTimer = setTimeout(onComplete, 3000);
    timeouts.push(finishTimer);

    return () => timeouts.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="flex flex-col justify-center w-full max-w-3xl px-8 font-mono text-lg md:text-2xl font-bold tracking-wider">
      {lines.map((line, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-3 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"
        >
          {line}
        </motion.div>
      ))}
      <motion.div
        className="w-3 h-6 bg-cyan-400 mt-2 shadow-[0_0_10px_rgba(34,211,238,0.8)]"
        animate={{ opacity: [1, 0] }}
        transition={{ repeat: Infinity, duration: 0.3 }}
      />
    </div>
  );
};

export default BootSequence;
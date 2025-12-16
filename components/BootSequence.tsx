import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface BootSequenceProps {
  onComplete: () => void;
}

const BootSequence: React.FC<BootSequenceProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  
  // We use a counter instead of an array to prevent "Strict Mode" duplicate appends
  const [visibleCount, setVisibleCount] = useState(0);

  const SEQUENCE = useMemo(() => [
      t('boot.step1'),
      t('boot.step2'),
      t('boot.step3'),
      t('boot.step4')
  ], [t]);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // Timeline of events (ms)
    const schedule = [
        { count: 1, time: 200 },
        { count: 2, time: 800 },
        { count: 3, time: 1500 },
        { count: 4, time: 2200 },
    ];

    schedule.forEach(({ count, time }) => {
      const t = setTimeout(() => {
        setVisibleCount(prev => Math.max(prev, count));
      }, time);
      timeouts.push(t);
    });

    // Fade out trigger (Last item + 500ms pause)
    const finishTimer = setTimeout(onComplete, 2700);
    timeouts.push(finishTimer);

    return () => timeouts.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="flex flex-col justify-center w-full max-w-3xl px-8 font-mono text-lg md:text-2xl font-bold tracking-wider">
      {SEQUENCE.slice(0, visibleCount).map((line, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-3 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"
        >
          {line}
        </motion.div>
      ))}
      
      {/* Blinking Cursor */}
      <motion.div
        className="w-3 h-6 bg-cyan-400 mt-2 shadow-[0_0_10px_rgba(34,211,238,0.8)]"
        animate={{ opacity: [1, 0] }}
        transition={{ repeat: Infinity, duration: 0.3 }}
      />
    </div>
  );
};

export default BootSequence;
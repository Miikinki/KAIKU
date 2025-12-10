import React from 'react';
import { DreamCategory } from '../types';
import { CATEGORY_COLORS } from '../constants';
import clsx from 'clsx';

interface FilterBarProps {
  currentFilter: DreamCategory | 'ALL';
  onFilterChange: (filter: DreamCategory | 'ALL') => void;
}

const FilterBar: React.FC<FilterBarProps> = ({ currentFilter, onFilterChange }) => {
  return (
    <div className="fixed bottom-6 left-0 right-0 z-[400] px-4 flex justify-center pointer-events-none">
      <div className="bg-[#0f0f18]/80 backdrop-blur-md border border-white/10 rounded-full p-1.5 flex gap-1 shadow-2xl overflow-x-auto max-w-full pointer-events-auto no-scrollbar">
        <button
          onClick={() => onFilterChange('ALL')}
          className={clsx(
            "px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap",
            currentFilter === 'ALL' 
              ? "bg-white text-black shadow-lg" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          )}
        >
          ALL
        </button>
        {Object.values(DreamCategory).map((cat) => (
          <button
            key={cat}
            onClick={() => onFilterChange(cat)}
            className={clsx(
              "px-4 py-2 rounded-full text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap",
              currentFilter === cat 
                ? "bg-white/10 text-white shadow-inner ring-1 ring-white/20" 
                : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
            style={{
               color: currentFilter === cat ? CATEGORY_COLORS[cat] : undefined
            }}
          >
            <span 
                className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
                style={{ backgroundColor: CATEGORY_COLORS[cat] }} 
            />
            {cat.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FilterBar;
// components/home/PassengerCounter.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Users, Minus, Plus, ChevronDown } from 'lucide-react';

const PassengerCounter = ({
  adults = 1,
  children = 0,
  onAdultsChange,
  onChildrenChange,
  childAgeLimit = 12,
  label = 'ခရီးသည်ဦးရေ'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalPassengers = adults + children;

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-white/90 mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white focus:bg-white/20 focus:border-sky-400 focus:outline-none transition-all flex items-center justify-between hover:bg-white/15"
      >
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          <Users className="h-4 w-4 text-sky-300 flex-shrink-0" />
          <span className="text-white text-sm truncate text-left">
            {totalPassengers} ဦး
            {adults > 0 && children > 0 && (
              <span className="text-white/40 text-xs ml-1">
                (လူကြီး {adults}, ကလေး {children})
              </span>
            )}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-white/70 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-[100] right-0 mt-1 w-56 bg-slate-800 border border-white/20 rounded-lg shadow-2xl p-3">
          {/* Adults */}
          <div className="flex items-center justify-between py-2 border-b border-white/10">
            <div>
              <p className="text-white text-xs font-medium">လူကြီး</p>
              <p className="text-white/40 text-[10px]">အသက် ၁၂ နှစ်အထက်</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => onAdultsChange(Math.max(1, adults - 1))}
                disabled={adults <= 1}
                className="w-7 h-7 rounded-full border border-white/30 flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-white text-sm w-5 text-center font-medium">{adults}</span>
              <button
                type="button"
                onClick={() => onAdultsChange(Math.min(10, adults + 1))}
                disabled={adults >= 10}
                className="w-7 h-7 rounded-full border border-white/30 flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Children */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-white text-xs font-medium">ကလေး</p>
              <p className="text-white/40 text-[10px]">အသက် {childAgeLimit} နှစ်အောက်</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => onChildrenChange(Math.max(0, children - 1))}
                disabled={children <= 0}
                className="w-7 h-7 rounded-full border border-white/30 flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-white text-sm w-5 text-center font-medium">{children}</span>
              <button
                type="button"
                onClick={() => onChildrenChange(Math.min(5, children + 1))}
                disabled={children >= 5}
                className="w-7 h-7 rounded-full border border-white/30 flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Done Button */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-full mt-2 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-md transition-colors"
          >
            အိုကေ
          </button>
        </div>
      )}
    </div>
  );
};

export default PassengerCounter;
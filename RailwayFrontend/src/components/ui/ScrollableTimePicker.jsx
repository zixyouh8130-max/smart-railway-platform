// components/ui/ScrollableTimePicker.jsx

import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, Clock } from 'lucide-react';

const ScrollableTimePicker = ({ value, onChange, minuteStep = 1, showSeconds = false, secondStep = 1 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const dropdownRef = useRef(null);

  // Initialize from value prop
  useEffect(() => {
    if (value) {
      const parts = value.split(':');
      setHours(parts[0] || '');
      setMinutes(parts[1] || '');
      setSeconds(showSeconds ? (parts[2] || '00') : '00');
    }
  }, [value, showSeconds]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll selected items into view when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        const hourElement = document.getElementById(`hour-${parseInt(hours)}`);
        const minuteElement = document.getElementById(`minute-${parseInt(minutes)}`);
        const secondElement = document.getElementById(`second-${parseInt(seconds)}`);
        
        hourElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        minuteElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (showSeconds) {
          secondElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 50);
    }
  }, [isOpen, hours, minutes, seconds, showSeconds]);

  const handleHourChange = (e) => {
    const val = e.target.value;
    if (val === '' || (parseInt(val) >= 0 && parseInt(val) <= 23)) {
      setHours(val);
    }
  };

  const handleMinuteChange = (e) => {
    const val = e.target.value;
    if (val === '' || (parseInt(val) >= 0 && parseInt(val) <= 59)) {
      setMinutes(val);
    }
  };

  const handleSecondChange = (e) => {
    const val = e.target.value;
    if (val === '' || (parseInt(val) >= 0 && parseInt(val) <= 59)) {
      setSeconds(val);
    }
  };

  const handleHourBlur = () => {
    let h = parseInt(hours);
    if (isNaN(h) || h < 0) h = 0;
    if (h > 23) h = 23;
    const formatted = h.toString().padStart(2, '0');
    setHours(formatted);
    updateTime(formatted, minutes, seconds);
  };

  const handleMinuteBlur = () => {
    let m = parseInt(minutes);
    if (isNaN(m) || m < 0) m = 0;
    if (m > 59) m = 59;
    
    if (!showSeconds && minuteStep > 1) {
      m = Math.round(m / minuteStep) * minuteStep;
      if (m >= 60) m = 0;
    }
    
    const formatted = m.toString().padStart(2, '0');
    setMinutes(formatted);
    updateTime(hours, formatted, seconds);
  };

  const handleSecondBlur = () => {
    let s = parseInt(seconds);
    if (isNaN(s) || s < 0) s = 0;
    if (s > 59) s = 59;
    
    if (secondStep > 1) {
      s = Math.round(s / secondStep) * secondStep;
      if (s >= 60) s = 0;
    }
    
    const formatted = s.toString().padStart(2, '0');
    setSeconds(formatted);
    updateTime(hours, minutes, formatted);
  };

  const updateTime = (h, m, s = '00') => {
    if (h && m) {
      const hourStr = h.toString().padStart(2, '0');
      const minuteStr = m.toString().padStart(2, '0');
      const secondStr = showSeconds ? `:${s.toString().padStart(2, '0')}` : '';
      onChange(`${hourStr}:${minuteStr}${secondStr}`);
    }
  };

  const incrementHour = () => {
    let h = parseInt(hours) || 0;
    h = (h + 1) % 24;
    const formatted = h.toString().padStart(2, '0');
    setHours(formatted);
    updateTime(formatted, minutes, seconds);
  };

  const decrementHour = () => {
    let h = parseInt(hours) || 0;
    h = (h - 1 + 24) % 24;
    const formatted = h.toString().padStart(2, '0');
    setHours(formatted);
    updateTime(formatted, minutes, seconds);
  };

  const incrementMinute = () => {
    let m = parseInt(minutes) || 0;
    const step = showSeconds ? 1 : minuteStep;
    m = (m + step) % 60;
    const formatted = m.toString().padStart(2, '0');
    setMinutes(formatted);
    updateTime(hours, formatted, seconds);
  };

  const decrementMinute = () => {
    let m = parseInt(minutes) || 0;
    const step = showSeconds ? 1 : minuteStep;
    m = (m - step + 60) % 60;
    const formatted = m.toString().padStart(2, '0');
    setMinutes(formatted);
    updateTime(hours, formatted, seconds);
  };

  const incrementSecond = () => {
    let s = parseInt(seconds) || 0;
    s = (s + secondStep) % 60;
    const formatted = s.toString().padStart(2, '0');
    setSeconds(formatted);
    updateTime(hours, minutes, formatted);
  };

  const decrementSecond = () => {
    let s = parseInt(seconds) || 0;
    s = (s - secondStep + 60) % 60;
    const formatted = s.toString().padStart(2, '0');
    setSeconds(formatted);
    updateTime(hours, minutes, formatted);
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const setCurrentTime = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const hourStr = h.toString().padStart(2, '0');
    const minuteStr = m.toString().padStart(2, '0');
    const secondStr = s.toString().padStart(2, '0');
    setHours(hourStr);
    setMinutes(minuteStr);
    setSeconds(secondStr);
    onChange(`${hourStr}:${minuteStr}${showSeconds ? `:${secondStr}` : ''}`);
    setIsOpen(false);
  };

  const generateHourOptions = () => Array.from({ length: 24 }, (_, i) => i);
  const generateMinuteOptions = () => Array.from({ length: 60 }, (_, i) => i);
  const generateSecondOptions = () => Array.from({ length: 60 }, (_, i) => i);

  // Custom scrollbar hiding styles
  const hideScrollbarStyles = {
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  };

  const webkitScrollbarStyles = `
    .hide-scrollbar::-webkit-scrollbar {
      display: none;
    }
  `;

  return (
    <div className="relative" ref={dropdownRef}>
      <style>{webkitScrollbarStyles}</style>
      
      <div
        className="flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent overflow-hidden cursor-pointer hover:border-gray-400 transition-colors"
        onClick={toggleDropdown}
      >
        <div className="flex-1 flex items-center px-3 py-2">
          <Clock className="w-4 h-4 text-gray-400 mr-2" />
          <input
            type="text"
            value={hours}
            onChange={handleHourChange}
            onBlur={handleHourBlur}
            className="w-8 text-center outline-none text-sm font-medium bg-transparent"
            placeholder="00"
            maxLength={2}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="mx-0.5 text-gray-400 font-medium">:</span>
          <input
            type="text"
            value={minutes}
            onChange={handleMinuteChange}
            onBlur={handleMinuteBlur}
            className="w-8 text-center outline-none text-sm font-medium bg-transparent"
            placeholder="00"
            maxLength={2}
            onClick={(e) => e.stopPropagation()}
          />
          {showSeconds && (
            <>
              <span className="mx-0.5 text-gray-400 font-medium">:</span>
              <input
                type="text"
                value={seconds}
                onChange={handleSecondChange}
                onBlur={handleSecondBlur}
                className="w-8 text-center outline-none text-sm font-medium bg-transparent"
                placeholder="00"
                maxLength={2}
                onClick={(e) => e.stopPropagation()}
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5 pr-1">
          <div className="flex flex-col">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                incrementHour();
              }}
              className="p-0.5 hover:bg-gray-100 rounded transition-colors"
              title="Increase hour"
            >
              <ChevronUp className="w-3 h-3 text-gray-500" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                decrementHour();
              }}
              className="p-0.5 hover:bg-gray-100 rounded transition-colors"
              title="Decrease hour"
            >
              <ChevronDown className="w-3 h-3 text-gray-500" />
            </button>
          </div>
          <div className="flex flex-col">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                incrementMinute();
              }}
              className="p-0.5 hover:bg-gray-100 rounded transition-colors"
              title="Increase minute"
            >
              <ChevronUp className="w-3 h-3 text-gray-500" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                decrementMinute();
              }}
              className="p-0.5 hover:bg-gray-100 rounded transition-colors"
              title="Decrease minute"
            >
              <ChevronDown className="w-3 h-3 text-gray-500" />
            </button>
          </div>
          {showSeconds && (
            <div className="flex flex-col">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  incrementSecond();
                }}
                className="p-0.5 hover:bg-gray-100 rounded transition-colors"
                title="Increase second"
              >
                <ChevronUp className="w-3 h-3 text-gray-500" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  decrementSecond();
                }}
                className="p-0.5 hover:bg-gray-100 rounded transition-colors"
                title="Decrease second"
              >
                <ChevronDown className="w-3 h-3 text-gray-500" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Select Time</span>
            <button
              onClick={setCurrentTime}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <Clock className="w-3 h-3" />
              Now
            </button>
          </div>
          
          <div className="flex items-center justify-center gap-2">
            {/* Hours Column */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => incrementHour()}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <ChevronUp className="w-4 h-4 text-gray-500" />
              </button>
              <div 
                className="h-32 overflow-y-auto hide-scrollbar px-2 my-1"
                style={hideScrollbarStyles}
              >
                {generateHourOptions().map((h) => (
                  <div
                    id={`hour-${h}`}
                    key={`h-${h}`}
                    className={`px-2 py-1 text-sm cursor-pointer rounded transition-colors text-center ${
                      parseInt(hours) === h
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      const formatted = h.toString().padStart(2, '0');
                      setHours(formatted);
                      updateTime(formatted, minutes, seconds);
                    }}
                  >
                    {h.toString().padStart(2, '0')}
                  </div>
                ))}
              </div>
              <button
                onClick={() => decrementHour()}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
              <span className="text-xs text-gray-500 mt-1 font-medium">Hr</span>
            </div>

            <span className="text-gray-400 font-bold text-lg mt-4">:</span>

            {/* Minutes Column */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => incrementMinute()}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <ChevronUp className="w-4 h-4 text-gray-500" />
              </button>
              <div 
                className="h-32 overflow-y-auto hide-scrollbar px-2 my-1"
                style={hideScrollbarStyles}
              >
                {generateMinuteOptions().map((m) => (
                  <div
                    id={`minute-${m}`}
                    key={`m-${m}`}
                    className={`px-2 py-1 text-sm cursor-pointer rounded transition-colors text-center ${
                      parseInt(minutes) === m
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      const formatted = m.toString().padStart(2, '0');
                      setMinutes(formatted);
                      updateTime(hours, formatted, seconds);
                    }}
                  >
                    {m.toString().padStart(2, '0')}
                  </div>
                ))}
              </div>
              <button
                onClick={() => decrementMinute()}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
              <span className="text-xs text-gray-500 mt-1 font-medium">Min</span>
            </div>

            {/* Seconds Column */}
            {showSeconds && (
              <>
                <span className="text-gray-400 font-bold text-lg mt-4">:</span>
                <div className="flex flex-col items-center">
                  <button
                    onClick={() => incrementSecond()}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                  >
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  </button>
                  <div 
                    className="h-32 overflow-y-auto hide-scrollbar px-2 my-1"
                    style={hideScrollbarStyles}
                  >
                    {generateSecondOptions().map((s) => (
                      <div
                        id={`second-${s}`}
                        key={`s-${s}`}
                        className={`px-2 py-1 text-sm cursor-pointer rounded transition-colors text-center ${
                          parseInt(seconds) === s
                            ? 'bg-blue-100 text-blue-700 font-medium'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => {
                          const formatted = s.toString().padStart(2, '0');
                          setSeconds(formatted);
                          updateTime(hours, minutes, formatted);
                        }}
                      >
                        {s.toString().padStart(2, '0')}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => decrementSecond()}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                  >
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </button>
                  <span className="text-xs text-gray-500 mt-1 font-medium">Sec</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScrollableTimePicker;
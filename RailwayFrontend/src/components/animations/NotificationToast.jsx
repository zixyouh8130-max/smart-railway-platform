import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';

const NotificationToast = ({ message, type = 'info', duration = 5000 }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => setIsVisible(false), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  if (!isVisible) return null;

  const colors = {
    info: 'bg-railway-red-500',
    success: 'bg-green-500',
    warning: 'bg-railway-orange-500',
  };

  return (
    <div
      className={`fixed top-20 right-4 z-50 animate-slide-in-right ${isExiting ? 'animate-slide-out-right' : ''}`}
    >
      <div className={`${colors[type]} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center space-x-3 backdrop-blur-sm`}>
        <Bell className="w-5 h-5 animate-pulse-soft" />
        <p className="text-sm font-medium">{message}</p>
        <button
          onClick={() => {
            setIsExiting(true);
            setTimeout(() => setIsVisible(false), 300);
          }}
          className="ml-4 hover:bg-white/20 rounded-full p-1 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default NotificationToast;
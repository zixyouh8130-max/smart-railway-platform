import React, { useState, useEffect } from 'react';
import HeroSection from '@/components/home/HeroSection';
import QuickActions from '@/components/home/QuickActions';
import LiveUpdates from '@/components/home/LiveUpdates';
import Services from '@/components/home/Services';
import Stats from '@/components/home/Stats';
import NotificationToast from '@/components/animations/NotificationToast';

const HomePage = () => {
  const [showNotification, setShowNotification] = useState(true);

  return (
    <div className="w-full">
      {showNotification && (
        <NotificationToast
          message="🚂 Welcome to RailConnect! Get 10% off on your first booking."
          type="info"
          duration={6000}
        />
      )}
      <HeroSection />
      <QuickActions />
      <LiveUpdates />
      <Services />
      <Stats />
    </div>
  );
};

export default HomePage;
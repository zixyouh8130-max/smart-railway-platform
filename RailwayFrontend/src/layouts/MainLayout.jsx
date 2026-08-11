import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import ChatbotWidget from '@/components/Chatbot/ChatbotWidget';  // 👈 Add this import

const MainLayout = () => {
  return (
    <div className="min-h-screen flex flex-col w-full overflow-x-hidden">
      <Navbar />
      <main className="flex-grow w-full">
        <Outlet />
      </main>
      <ChatbotWidget />
      <Footer />
    </div>
  );
};

export default MainLayout;
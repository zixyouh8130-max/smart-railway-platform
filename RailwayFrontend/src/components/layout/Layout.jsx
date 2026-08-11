import React from 'react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col w-full overflow-x-hidden">
      <Navbar />
      <main className="flex-grow w-full">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
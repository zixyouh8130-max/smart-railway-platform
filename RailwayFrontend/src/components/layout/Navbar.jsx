import React, { useState, useEffect } from 'react';
import { Menu, X, Train, User, Search, Bell, ChevronDown } from 'lucide-react';
import Button from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { getDefaultPathForUser } from '@/utils/authSession';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'လက်မှတ်ဝယ်ရန်', href: '/' },
    { name: 'လက်မှတ်အခြေအနေ', href: '/pnr-status' },
    { name: 'အချိန်ဇယားရှာရန်', href: '/' },
    { name: 'ဝန်ဆောင်မှုများ', href: '/' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300 ${
      isScrolled
        ? 'bg-white/95 backdrop-blur-md shadow-lg border-b border-gray-100'
        : 'bg-transparent'
    }`}>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
              isScrolled
                ? 'bg-blue-600 shadow-lg shadow-blue-500/25'
                : 'bg-white/20 backdrop-blur-sm'
            }`}>
              <Train className={`w-6 h-6 transition-colors duration-300 ${
                isScrolled ? 'text-white' : 'text-white'
              }`} />
            </div>
            <span className={`text-xl font-bold transition-colors duration-300 ${
              isScrolled ? 'text-gray-900' : 'text-white'
            }`}>
              ရထားဆက်သွယ်ရေး
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className={`text-sm font-medium transition-colors duration-200 relative group py-2 ${
                  isScrolled
                    ? 'text-gray-700 hover:text-blue-600'
                    : 'text-white/90 hover:text-white'
                }`}
              >
                {link.name}
                <span className={`absolute bottom-0 left-0 w-0 h-0.5 transition-all duration-300 group-hover:w-full ${
                  isScrolled ? 'bg-blue-600' : 'bg-white'
                }`} />
              </a>
            ))}
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-3">
            {/* Search Button */}
            <button className={`p-2 rounded-lg transition-colors relative ${
              isScrolled ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-white/10 text-white'
            }`}>
              <Search className="w-5 h-5" />
            </button>

            {/* Notifications */}
            <button className={`p-2 rounded-lg transition-colors relative ${
              isScrolled ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-white/10 text-white'
            }`}>
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </button>

            {/* Language Switcher */}
            {/* <button className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isScrolled ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-white/10 text-white'
            }`}>
              <span>မြန်မာ</span>
              <ChevronDown className="w-4 h-4" />
            </button> */}

            {/* User Profile Icon */}
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isScrolled
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25'
                    : 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 border border-white/30'
                }`}
              >
                <User className="w-5 h-5" />
              </button>

              {/* Profile Dropdown */}
              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 animate-fadeIn">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">
                      {isAuthenticated ? user?.full_name : 'ဧည့်သည်'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {isAuthenticated ? user?.email : 'Guest User'}
                    </p>
                  </div>

                  {isAuthenticated ? (
                    <div className="border-t border-gray-100 mt-2 pt-2">
                      {(user?.staff || ['ADMIN', 'SUPER_ADMIN'].includes(user?.role)) && (
                        <a
                          href={getDefaultPathForUser(user)}
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Portal
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={logout}
                        className="w-full text-left block px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-medium"
                      >
                        အကောင့်ထွက်ရန်
                      </button>
                    </div>
                  ) : (
                    <div className="border-t border-gray-100 mt-2 pt-2">
                      <a href="/login" className="block px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium">
                        အကောင့်ဝင်ရန်
                      </a>
                      <a href="/register" className="block px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium">
                        အကောင့်ဖွင့်ရန်
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center space-x-2">
            {/* Mobile User Icon */}
            <button className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isScrolled
                ? 'bg-blue-600 text-white'
                : 'bg-white/20 text-white border border-white/30'
            }`}>
              <User className="w-5 h-5" />
            </button>

            <button
              onClick={() => setIsOpen(!isOpen)}
              className={`p-2 rounded-lg transition-colors ${
                isScrolled ? 'text-gray-700 hover:bg-gray-100' : 'text-white hover:bg-white/10'
              }`}
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden bg-white rounded-2xl shadow-2xl mt-2 p-4 border border-gray-100 animate-fadeIn">
            <div className="px-4 py-3 border-b border-gray-100 mb-3">
              <p className="text-sm font-medium text-gray-900">မီနူး</p>
            </div>
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="block px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
              >
                {link.name}
              </a>
            ))}
            <div className="mt-4 pt-4 border-t space-y-2">
              {isAuthenticated ? (
                <>
                  {(user?.staff || ['ADMIN', 'SUPER_ADMIN'].includes(user?.role)) && (
                    <a
                      href={getDefaultPathForUser(user)}
                      className="block px-4 py-3 text-center border border-blue-600 text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors"
                    >
                      Portal
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full block px-4 py-3 text-center bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                  >
                    အကောင့်ထွက်ရန်
                  </button>
                </>
              ) : (
                <>
                  <a href="/login" className="block px-4 py-3 text-center bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                    အကောင့်ဝင်ရန်
                  </a>
                  <a href="/register" className="block px-4 py-3 text-center border border-blue-600 text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors">
                    အကောင့်ဖွင့်ရန်
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
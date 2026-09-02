import { useEffect, useRef, useState } from 'react';
import { BellRing, ChevronDown, Menu, TrainFront, User, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import { getDefaultPathForUser } from '@/utils/authSession';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const isHomeTop = location.pathname === '/' && !isScrolled;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 16);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
    setIsProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const navLinks = [
    { name: 'လက်မှတ်ဝယ်ရန်', to: '/' },
    { name: 'လက်မှတ်အခြေအနေ', to: '/pnr-status' },
    { name: 'လက်ရှိပြေးဆွဲမှု', to: '/running-trains' },
  ];

  const textClass = isHomeTop ? 'text-white' : 'text-slate-800';
  const mutedClass = isHomeTop ? 'text-white/85 hover:text-white' : 'text-slate-600 hover:text-blue-700';

  return (
    <nav className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
      isHomeTop
        ? 'bg-transparent'
        : 'border-b border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/5 backdrop-blur-xl'
    }`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="ရထားဆက်သွယ်ရေး ပင်မစာမျက်နှာ">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors ${
              isHomeTop ? 'border border-white/30 bg-white/15 text-white backdrop-blur' : 'bg-blue-700 text-white shadow-lg shadow-blue-700/20'
            }`}>
              <TrainFront className="h-5 w-5" />
            </span>
            <div className="min-w-0 text-left">
              <p className={`truncate text-sm font-bold sm:text-base ${textClass}`}>ရထားဆက်သွယ်ရေး</p>
              <p className={`hidden text-[11px] sm:block ${isHomeTop ? 'text-white/65' : 'text-slate-400'}`}>Passenger Railway Service</p>
            </div>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => {
              const active = link.to !== '/'
                ? location.pathname.startsWith(link.to)
                : location.pathname === '/';
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => {
                    if (link.to === '/' && location.pathname === '/') {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                    active && !isHomeTop
                      ? 'bg-blue-50 text-blue-700'
                      : mutedClass
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <Link
              to="/pnr-status"
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                isHomeTop ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
              aria-label="လက်မှတ်အသိပေးချက်"
            >
              <BellRing className="h-5 w-5" />
            </Link>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setIsProfileOpen((value) => !value)}
                className={`flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  isHomeTop
                    ? 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <User className="h-4 w-4" />
                <span>{isAuthenticated ? (user?.full_name || 'Account') : 'ဧည့်သည်'}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl shadow-slate-900/15">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{isAuthenticated ? (user?.full_name || 'အသုံးပြုသူ') : 'ဧည့်သည်အဖြစ် အသုံးပြုနေသည်'}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{isAuthenticated ? user?.email : 'အကောင့်မလိုဘဲ လက်မှတ်ဝယ်နိုင်ပါသည်'}</p>
                  </div>
                  {isAuthenticated ? (
                    <div className="p-2">
                      {(user?.staff || ['ADMIN', 'SUPER_ADMIN'].includes(user?.role)) && (
                        <a href={getDefaultPathForUser(user)} className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Portal</a>
                      )}
                      <button type="button" onClick={logout} className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50">အကောင့်ထွက်ရန်</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 p-2">
                      <Link to="/login" className="rounded-xl bg-blue-50 px-3 py-2 text-center text-sm font-semibold text-blue-700">ဝင်ရန်</Link>
                      <Link to="/register" className="rounded-xl bg-blue-700 px-3 py-2 text-center text-sm font-semibold text-white">ဖွင့်ရန်</Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className={`flex h-10 w-10 items-center justify-center rounded-xl lg:hidden ${
              isHomeTop ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'
            }`}
            onClick={() => setIsOpen((value) => !value)}
            aria-label="မီနူးဖွင့်/ပိတ်"
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {isOpen && (
          <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-2xl shadow-slate-900/10 lg:hidden">
            <div className="space-y-1">
              {navLinks.map((link) => (
                <Link key={link.to} to={link.to} onClick={() => { if (link.to === '/' && location.pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="block rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                  {link.name}
                </Link>
              ))}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              {isAuthenticated ? (
                <div className="space-y-2">
                  {(user?.staff || ['ADMIN', 'SUPER_ADMIN'].includes(user?.role)) && (
                    <a href={getDefaultPathForUser(user)} className="block rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700">Portal</a>
                  )}
                  <button type="button" onClick={logout} className="w-full rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">အကောင့်ထွက်ရန်</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/login" className="rounded-xl border border-blue-200 px-4 py-3 text-center text-sm font-semibold text-blue-700">အကောင့်ဝင်ရန်</Link>
                  <Link to="/register" className="rounded-xl bg-blue-700 px-4 py-3 text-center text-sm font-semibold text-white">အကောင့်ဖွင့်ရန်</Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

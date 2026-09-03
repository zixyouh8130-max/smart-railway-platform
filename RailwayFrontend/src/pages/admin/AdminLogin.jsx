import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Train,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Shield,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Button from '@/components/ui/button';

const AdminLogin = () => {
  const navigate = useNavigate();
  const { adminLogin } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email) {
      newErrors.email = 'အီးမေးလ်ထည့်သွင်းပါ';
    }

    if (!formData.password) {
      newErrors.password = 'စကားဝှက်ထည့်သွင်းပါ';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!validateForm()) return;

    setLoading(true);

    try {
      await adminLogin(formData.email, formData.password);
      navigate('/admin/dashboard', { replace: true });
    } catch (error) {
      setServerError(
        'အက်ဒမင် အခွင့်အရေး မရှိပါ သို့မဟုတ် အချက်အလက်များ မှားယွင်းနေပါသည်'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 flex items-center justify-center px-4 py-8 sm:px-6">
      {/* Soft decorative background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-200/50 blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-sky-200/50 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(#2563eb 1px, transparent 1px), linear-gradient(90deg, #2563eb 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[430px]">
        {/* Brand */}
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white border border-blue-100 shadow-[0_10px_30px_rgba(37,99,235,0.12)]">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600">
              <Train className="h-6 w-6 text-white" />
            </div>
          </div>

          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700 border border-blue-100">
            <Shield className="h-3.5 w-3.5" />
            Admin Portal
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
            အက်ဒမင် အကောင့်ဝင်ရန်
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Admin Panel Access
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
          {serverError && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
              <p className="pt-1 text-sm leading-5 text-red-700">
                {serverError}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                အက်ဒမင် အီးမေးလ်
              </label>

              <div className="group relative">
                <Mail className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="admin@railway.com"
                  className={`w-full rounded-xl border bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all ${
                    errors.email
                      ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-4 focus:ring-red-50'
                      : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50'
                  }`}
                />
              </div>

              {errors.email && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                စကားဝှက်
              </label>

              <div className="group relative">
                <Lock className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" />

                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  placeholder="••••••••"
                  className={`w-full rounded-xl border bg-slate-50/70 py-3.5 pl-11 pr-12 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all ${
                    errors.password
                      ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-4 focus:ring-red-50'
                      : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50'
                  }`}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>

              {errors.password && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  {errors.password}
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="group mt-2 w-full !rounded-xl !bg-blue-600 !text-white shadow-lg shadow-blue-600/20 transition-all hover:!bg-blue-700 hover:shadow-blue-600/30"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ဝင်ရောက်နေသည်...
                </div>
              ) : (
                <>
                  အက်ဒမင် ဝင်ရောက်မည်
                  <ArrowRight className="ml-1 h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Secure administrator access · RailConnect
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Train, Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Shield, CheckCircle } from 'lucide-react';
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
  const [focusedField, setFocusedField] = useState(null);

  const validateForm = () => {
    const newErrors = {};
    if (!formData.email) {
      newErrors.email = 'အီးမေးလ် ထည့်သွင်းပါ';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'အီးမေးလ် ဖော်မတ် မှန်ကန်ပါစေ';
    }
    if (!formData.password) {
      newErrors.password = 'စကားဝှက် ထည့်သွင်းပါ';
    } else if (formData.password.length < 6) {
      newErrors.password = 'စကားဝှက် အနည်းဆုံး ၆ လုံးရှိရပါမည်';
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
      await adminLogin(
        formData.email,
        formData.password
      );
      navigate('/admin/dashboard', { replace: true });
    } catch (error) {
      setServerError('အက်ဒမင် အခွင့်အရေး မရှိပါ သို့မဟုတ် အချက်အလက်များ မှားယွင်းနေပါသည်');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData({...formData, [field]: value});
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors({...errors, [field]: ''});
    }
  };

  const getInputClassName = (field) => {
    const baseClass = "w-full pl-11 pr-4 py-3.5 bg-white border rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200";
    if (errors[field]) {
      return `${baseClass} border-red-300 focus:ring-red-400 focus:border-red-400`;
    }
    if (focusedField === field) {
      return `${baseClass} border-blue-400 ring-2 ring-blue-100/50 focus:ring-blue-400`;
    }
    return `${baseClass} border-gray-200 hover:border-gray-300 focus:border-blue-400`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50/50 to-purple-50/30 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/30 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200/30 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-100/20 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl mb-6 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-shadow duration-300">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-2">
            <Train className="w-7 h-7 text-blue-600" />
            အက်ဒမင် အကောင့်ဝင်ရန်
          </h1>
          <p className="text-gray-500 text-sm">
            စီမံခန့်ခွဲမှု ဒတ်ရှ်ဘုတ်သို့ ဝင်ရောက်ရန်
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-8 shadow-xl shadow-gray-200/50 border border-white/50 transition-all duration-300 hover:shadow-2xl hover:shadow-gray-200/60">
          {/* Security Badge */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700">လုံခြုံသော ချိတ်ဆက်မှု</span>
            </div>
          </div>

          {serverError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 animate-shake">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">{serverError}</p>
                <p className="text-xs text-red-600 mt-0.5">ကျေးဇူးပြု၍ ပြန်လည်ကြိုးစားပါ</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                အီးမေးလ်
              </label>
              <div className="relative group">
                <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-200 ${
                  errors.email ? 'text-red-400' : focusedField === 'email' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                }`} />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="admin@railway.com"
                  className={getInputClassName('email')}
                />
                {errors.email && (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {errors.email}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                စကားဝှက်
              </label>
              <div className="relative group">
                <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-200 ${
                  errors.password ? 'text-red-400' : focusedField === 'password' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                }`} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••"
                  className={getInputClassName('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
                {errors.password && (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {errors.password}
                  </p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300"
              size="lg"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>ဝင်ရောက်နေသည်...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>အက်ဒမင် ဝင်ရောက်မည်</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                </div>
              )}
            </Button>

            {/* Additional Info */}
            <div className="mt-6 pt-6 border-t border-gray-100">
              <p className="text-xs text-center text-gray-400">
                ဤစာမျက်နှာသည် စီမံခန့်ခွဲမှုဝန်ထမ်းများအတွက်သာ ဖြစ်သည်
              </p>
              <div className="flex items-center justify-center gap-4 mt-3">
                <span className="text-xs text-gray-300">•</span>
                <span className="text-xs text-gray-400">လုံခြုံရေး စစ်ဆေးမှု</span>
                <span className="text-xs text-gray-300">•</span>
                <span className="text-xs text-gray-400">SSL ကုဒ်ဝှက်ထားသည်</span>
                <span className="text-xs text-gray-300">•</span>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-gray-400">
            ရထားစီမံခန့်ခွဲမှုစနစ် v2.0
          </p>
        </div>
      </div>

      {/* Add animation keyframes */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default AdminLogin;
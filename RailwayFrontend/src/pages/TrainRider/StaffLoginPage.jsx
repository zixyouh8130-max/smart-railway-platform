// pages/TrainRider/StaffLoginPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Train, LogIn, AlertCircle, BadgeCheck } from 'lucide-react';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

const StaffLoginPage = () => {
  const navigate = useNavigate();
  const { staffLogin } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await staffLogin(
        form.email,
        form.password
      );

      navigate(
        '/train-rider',
        { replace: true }
      );
    } catch (err) {
      console.error('Staff login error:', err);

      if (
        err.message === 'Staff profile required'
      ) {
        setError(
          'ဤအကောင့်သည် ဝန်ထမ်းအကောင့် မဟုတ်ပါ။ ကျေးဇူးပြု၍ ဝန်ထမ်းအကောင့်ဖြင့် ဝင်ရောက်ပါ'
        );
      } else {
        setError(
          err.message ||
          'ဝင်ရောက်ရန် မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
      <Card padding="p-8" className="w-full max-w-md" hover={false}>
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-railway-red-500 to-railway-orange-500 rounded-2xl mb-4 shadow-lg">
            <Train className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Train Rider</h1>
          <p className="text-gray-500 mt-1">ဝန်ထမ်းအကောင့်ဖြင့် ဝင်ရောက်ပါ</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleStaffLogin} className="space-y-5">
          <div>
            <Label className="text-sm font-medium text-gray-700">အီးမေးလ်</Label>
            <div className="relative mt-1">
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-railway-red-500 focus:border-transparent outline-none transition-all"
                placeholder="staff@railway.com"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium text-gray-700">စကားဝှက်</Label>
            <div className="relative mt-1">
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-railway-red-500 focus:border-transparent outline-none transition-all"
                placeholder="စကားဝှက် ရိုက်ထည့်ပါ"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full py-3 text-base"
            icon={<LogIn className="w-5 h-5" />}
            disabled={loading}
          >
            {loading ? 'ဝင်ရောက်နေသည်...' : 'ဝင်ရောက်မည်'}
          </Button>
        </form>

        {/* Staff Info */}
        <div className="mt-6 p-4 bg-blue-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <BadgeCheck className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-medium text-blue-800">ဝန်ထမ်းများအတွက်</p>
          </div>
          <p className="text-xs text-blue-600">
            ဝန်ထမ်းအကောင့်ဖြင့်သာ ဝင်ရောက်နိုင်ပါသည်။ အက်ဒမင်မှ ဝန်ထမ်းအကောင့် ဖန်တီးပေးရန် လိုအပ်ပါသည်။
          </p>
        </div>

        {/* Demo Credentials */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500">
            <strong>Demo:</strong> staff@railway.com / staff123
          </p>
        </div>
      </Card>
    </div>
  );
};

export default StaffLoginPage;
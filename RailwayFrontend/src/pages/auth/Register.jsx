import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Train, Mail, Lock, Eye, EyeOff, User, Phone, AlertCircle,
  ArrowRight, Check, ArrowLeft, Shield
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Button from '@/components/ui/button';

const Register = () => {
  const navigate = useNavigate();
  const { register, error: authError, clearError } = useAuth();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const validateStep1 = () => {
    const newErrors = {};

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required';
    } else if (formData.full_name.trim().length < 2) {
      newErrors.full_name = 'Name must be at least 2 characters';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.phone) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\+?[\d\s-]{10,}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors = {};

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must include uppercase, lowercase, and number';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    clearError();

    if (step === 1) {
      if (validateStep1()) {
        setStep(2);
      }
      return;
    }

    if (!validateStep2()) return;

    setLoading(true);
    try {
      await register({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      });
      navigate('/', { replace: true });
    } catch (error) {
      setServerError(error.message || 'Registration failed. Please try again.');
      setStep(1); // Go back to first step on error
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    if (serverError) {
      setServerError('');
    }
  };

  const passwordStrength = {
    score:
      (formData.password.length >= 8 ? 1 : 0) +
      (/(?=.*[a-z])/.test(formData.password) ? 1 : 0) +
      (/(?=.*[A-Z])/.test(formData.password) ? 1 : 0) +
      (/(?=.*\d)/.test(formData.password) ? 1 : 0) +
      (/(?=.*[!@#$%^&*(),.?":{}|<>])/.test(formData.password) ? 1 : 0),
    labels: ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'],
    colors: ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-400', 'bg-green-500'],
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-8 sm:px-6">
      {/* Soft decorative background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-200/50 blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-[28rem] w-[28rem] rounded-full bg-sky-200/50 blur-3xl" />

        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(#2563eb 1px, transparent 1px), linear-gradient(90deg, #2563eb 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[500px]">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-white shadow-[0_10px_30px_rgba(37,99,235,0.12)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
              <Train className="h-5 w-5 text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
            Create Account
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Start your journey with RailConnect
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center">
            {[1, 2].map((s) => (
              <React.Fragment key={s}>
                <div className="flex min-w-0 items-center">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                      step > s
                        ? 'bg-emerald-500 text-white'
                        : step === s
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {step > s ? <Check className="h-4 w-4" /> : s}
                  </div>

                  <div className="ml-2.5 hidden sm:block">
                    <p
                      className={`text-xs font-semibold ${
                        step === s ? 'text-slate-800' : 'text-slate-400'
                      }`}
                    >
                      Step {s}
                    </p>
                    <p
                      className={`text-xs ${
                        step === s ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    >
                      {s === 1 ? 'Personal Info' : 'Security'}
                    </p>
                  </div>
                </div>

                {s < 2 && (
                  <div
                    className={`mx-3 h-px flex-1 transition-colors duration-300 ${
                      step > s ? 'bg-emerald-400' : 'bg-slate-200'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Registration card */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
          {(serverError || authError) && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="pt-0.5 text-sm font-medium leading-5 text-red-700">
                  {serverError || authError}
                </p>
                <p className="mt-1 text-xs text-red-500">
                  Please try again or contact support
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 1 ? (
              <>
                {/* Full Name */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Full Name
                  </label>
                  <div className="group relative">
                    <User className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" />
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      placeholder="John Doe"
                      autoComplete="name"
                      className={`w-full rounded-xl border bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all ${
                        errors.full_name
                          ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-4 focus:ring-red-50'
                          : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50'
                      }`}
                    />
                  </div>
                  {errors.full_name && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.full_name}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Email Address
                  </label>
                  <div className="group relative">
                    <Mail className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="john@example.com"
                      autoComplete="email"
                      className={`w-full rounded-xl border bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all ${
                        errors.email
                          ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-4 focus:ring-red-50'
                          : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50'
                      }`}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Phone Number
                  </label>
                  <div className="group relative">
                    <Phone className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+1 (555) 123-4567"
                      autoComplete="tel"
                      className={`w-full rounded-xl border bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all ${
                        errors.phone
                          ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-4 focus:ring-red-50'
                          : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50'
                      }`}
                    />
                  </div>
                  {errors.phone && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.phone}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Password */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Password
                  </label>
                  <div className="group relative">
                    <Lock className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Create a strong password"
                      autoComplete="new-password"
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
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.password}
                    </p>
                  )}

                  {/* Password Strength */}
                  {formData.password && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex gap-1.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                              level <= passwordStrength.score
                                ? passwordStrength.colors[
                                    passwordStrength.score - 1
                                  ]
                                : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>

                      <p className="mb-3 text-xs font-semibold text-slate-500">
                        Password Strength:{' '}
                        <span className="text-slate-800">
                          {passwordStrength.labels[passwordStrength.score - 1] ||
                            'Very Weak'}
                        </span>
                      </p>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {[
                          {
                            label: 'At least 8 characters',
                            test: formData.password.length >= 8,
                          },
                          {
                            label: 'One lowercase letter',
                            test: /(?=.*[a-z])/.test(formData.password),
                          },
                          {
                            label: 'One uppercase letter',
                            test: /(?=.*[A-Z])/.test(formData.password),
                          },
                          {
                            label: 'One number',
                            test: /(?=.*\d)/.test(formData.password),
                          },
                          {
                            label: 'One special character',
                            test: /(?=.*[!@#$%^&*(),.?":{}|<>])/.test(
                              formData.password
                            ),
                          },
                        ].map(({ label, test }) => (
                          <div key={label} className="flex items-center text-xs">
                            <div
                              className={`mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                                test ? 'bg-emerald-100' : 'bg-slate-200'
                              }`}
                            >
                              {test ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              )}
                            </div>
                            <span
                              className={
                                test ? 'text-emerald-600' : 'text-slate-500'
                              }
                            >
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Confirm Password
                  </label>
                  <div className="group relative">
                    <Shield className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" />
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      className={`w-full rounded-xl border bg-slate-50/70 py-3.5 pl-11 pr-12 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all ${
                        errors.confirmPassword
                          ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-4 focus:ring-red-50'
                          : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50'
                      }`}
                    />
                    {formData.confirmPassword &&
                      formData.password === formData.confirmPassword && (
                        <Check className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" />
                      )}
                  </div>

                  {errors.confirmPassword && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-1">
              {step === 2 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="!rounded-xl border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  icon={<ArrowLeft className="h-4 w-4" />}
                >
                  Back
                </Button>
              )}

              <Button
                type="submit"
                size="lg"
                className="group flex-1 !rounded-xl !bg-blue-600 !text-white shadow-lg shadow-blue-600/20 transition-all hover:!bg-blue-700 hover:shadow-blue-600/30"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Creating Account...
                  </div>
                ) : step === 1 ? (
                  <>
                    Continue
                    <ArrowRight className="ml-1 h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                  </>
                ) : (
                  <>
                    Create Account
                    <Check className="ml-1 h-5 w-5" />
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Login link */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs text-slate-400">OR</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-blue-600 transition-colors hover:text-blue-700 hover:underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-400">
          By creating an account, you agree to our{' '}
          <a href="#" className="text-slate-500 hover:text-blue-600 hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-slate-500 hover:text-blue-600 hover:underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );

};

export default Register;
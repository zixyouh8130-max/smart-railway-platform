import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Train, Mail, Lock, Eye, EyeOff, User, Phone, AlertCircle,
  ArrowRight, Check, ArrowLeft, Shield
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Button from '@/components/ui/Button';

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
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
      {/* Animated Background Pattern */}
      <div className="absolute inset-0 overflow-hidden opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" />
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl mb-6 shadow-lg hover:scale-105 transition-transform duration-300">
            <Train className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-blue-200 text-lg">Start your journey with RailConnect</p>
        </div>

        {/* Steps Indicator */}
        <div className="flex items-center justify-center space-x-4 mb-8">
          {[1, 2].map((s) => (
            <React.Fragment key={s}>
              <div className="flex items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                  step > s
                    ? 'bg-green-500 text-white scale-110'
                    : step === s
                      ? 'bg-white text-blue-600 scale-110 shadow-lg'
                      : 'bg-white/20 text-blue-200'
                }`}>
                  {step > s ? <Check className="w-5 h-5" /> : s}
                </div>
                <span className={`ml-2 text-sm font-medium hidden sm:block ${
                  step === s ? 'text-white' : 'text-blue-200'
                }`}>
                  {s === 1 ? 'Personal Info' : 'Security'}
                </span>
              </div>
              {s < 2 && (
                <div className={`flex-1 h-0.5 transition-all duration-300 ${
                  step > s ? 'bg-green-500' : 'bg-white/20'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Registration Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20 hover:border-white/30 transition-all duration-300">
          {/* Error Alert */}
          {(serverError || authError) && (
            <div className="mb-6 p-4 bg-red-500/20 backdrop-blur-sm border border-red-400/30 rounded-xl flex items-start space-x-3 animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-200">{serverError || authError}</p>
                <p className="text-xs text-red-300 mt-1">Please try again or contact support</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 1 ? (
              <>
                {/* Full Name */}
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Full Name
                  </label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300 group-focus-within:text-white transition-colors" />
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      placeholder="John Doe"
                      autoComplete="name"
                      className={`w-full pl-10 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/10 transition-all ${
                        errors.full_name ? 'border-red-400 focus:ring-red-400' : 'border-white/20 hover:border-white/40'
                      }`}
                    />
                  </div>
                  {errors.full_name && (
                    <p className="mt-1.5 text-sm text-red-400 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.full_name}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Email Address
                  </label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300 group-focus-within:text-white transition-colors" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="john@example.com"
                      autoComplete="email"
                      className={`w-full pl-10 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/10 transition-all ${
                        errors.email ? 'border-red-400 focus:ring-red-400' : 'border-white/20 hover:border-white/40'
                      }`}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1.5 text-sm text-red-400 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Phone Number
                  </label>
                  <div className="relative group">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300 group-focus-within:text-white transition-colors" />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+1 (555) 123-4567"
                      autoComplete="tel"
                      className={`w-full pl-10 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/10 transition-all ${
                        errors.phone ? 'border-red-400 focus:ring-red-400' : 'border-white/20 hover:border-white/40'
                      }`}
                    />
                  </div>
                  {errors.phone && (
                    <p className="mt-1.5 text-sm text-red-400 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.phone}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Password
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300 group-focus-within:text-white transition-colors" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Create a strong password"
                      autoComplete="new-password"
                      className={`w-full pl-10 pr-12 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/10 transition-all ${
                        errors.password ? 'border-red-400 focus:ring-red-400' : 'border-white/20 hover:border-white/40'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white transition-colors p-1"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1.5 text-sm text-red-400 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.password}
                    </p>
                  )}

                  {/* Password Strength Indicator */}
                  {formData.password && (
                    <div className="mt-3 p-4 bg-white/5 rounded-xl border border-white/10">
                      <div className="flex gap-1.5 mb-3">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                              level <= passwordStrength.score
                                ? passwordStrength.colors[passwordStrength.score - 1]
                                : 'bg-white/10'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs font-medium text-blue-300 mb-3">
                        Password Strength: <span className="text-white">{passwordStrength.labels[passwordStrength.score - 1] || 'Very Weak'}</span>
                      </p>
                      <div className="space-y-2">
                        {[
                          { label: 'At least 8 characters', test: formData.password.length >= 8 },
                          { label: 'One lowercase letter', test: /(?=.*[a-z])/.test(formData.password) },
                          { label: 'One uppercase letter', test: /(?=.*[A-Z])/.test(formData.password) },
                          { label: 'One number', test: /(?=.*\d)/.test(formData.password) },
                          { label: 'One special character', test: /(?=.*[!@#$%^&*(),.?":{}|<>])/.test(formData.password) },
                        ].map(({ label, test }) => (
                          <div key={label} className="flex items-center text-xs">
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center mr-2 ${
                              test ? 'bg-green-500/20' : 'bg-white/10'
                            }`}>
                              {test ? (
                                <Check className="w-3 h-3 text-green-400" />
                              ) : (
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-300/50" />
                              )}
                            </div>
                            <span className={test ? 'text-green-400' : 'text-blue-300/70'}>
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
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative group">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300 group-focus-within:text-white transition-colors" />
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      className={`w-full pl-10 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/10 transition-all ${
                        errors.confirmPassword ? 'border-red-400 focus:ring-red-400' : 'border-white/20 hover:border-white/40'
                      }`}
                    />
                    {formData.confirmPassword && formData.password === formData.confirmPassword && (
                      <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-400" />
                    )}
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-1.5 text-sm text-red-400 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-3 pt-2">
              {step === 2 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                  icon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
              )}
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                className="flex-1 group"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
                    Creating Account...
                  </div>
                ) : step === 1 ? (
                  <>
                    Continue
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                ) : (
                  <>
                    Create Account
                    <Check className="w-5 h-5" />
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Login Link */}
          <p className="mt-8 text-center text-sm text-blue-200">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-white hover:text-blue-200 transition-colors underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-sm text-blue-300/70">
          By creating an account, you agree to our{' '}
          <a href="#" className="text-white hover:underline">Terms of Service</a>
          {' '}and{' '}
          <a href="#" className="text-white hover:underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
};

export default Register;
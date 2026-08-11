import React, { useState, useEffect } from 'react';
import {
  Train, Users, Ticket, Route, TrendingUp, Clock,
  AlertCircle, CheckCircle, Activity, DollarSign, Calendar,

} from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalTrains: 24,
    activeTrains: 18,
    totalUsers: 15420,
    todayBookings: 342,
    totalRoutes: 12,
    revenue: 45250000,
    onTimePerformance: 92,
    alerts: 3,
  });

  const recentActivities = [
    { id: 1, action: 'ရထားအသစ်ထည့်သွင်း', train: 'DEMU-003', time: '၁၀ မိနစ် အကြာ', icon: <Train className="w-4 h-4" />, color: 'bg-blue-100 text-blue-600' },
    { id: 2, action: 'အချိန်ဇယားပြောင်းလဲ', train: 'ရန်ကုန်-မန္တလေး', time: '၂၅ မိနစ် အကြာ', icon: <Clock className="w-4 h-4" />, color: 'bg-yellow-100 text-yellow-600' },
    { id: 3, action: 'လက်မှတ်အသစ်ဝယ်ယူ', user: 'ဦးအောင်မင်း', time: '၃၀ မိနစ် အကြာ', icon: <Ticket className="w-4 h-4" />, color: 'bg-green-100 text-green-600' },
    { id: 4, action: 'အသုံးပြုသူအသစ်', user: 'မမြင့်မြင့်', time: '၁ နာရီ အကြာ', icon: <Users className="w-4 h-4" />, color: 'bg-purple-100 text-purple-600' },
    { id: 5, action: 'လမ်းကြောင်းအသစ်', route: 'မန္တလေး-လားရှိုး', time: '၂ နာရီ အကြာ', icon: <Route className="w-4 h-4" />, color: 'bg-orange-100 text-orange-600' },
  ];

  const quickStats = [
    {
      label: 'စုစုပေါင်းရထား',
      value: stats.totalTrains,
      subtext: `${stats.activeTrains} စီးသွားလာနေ`,
      icon: <Train className="w-6 h-6" />,
      color: 'bg-blue-500',
      trend: '+2',
      trendUp: true
    },
    {
      label: 'အသုံးပြုသူများ',
      value: stats.totalUsers.toLocaleString(),
      subtext: 'မှတ်ပုံတင်ထားသူ',
      icon: <Users className="w-6 h-6" />,
      color: 'bg-green-500',
      trend: '+156',
      trendUp: true
    },
    {
      label: 'ယနေ့လက်မှတ်',
      value: stats.todayBookings,
      subtext: 'ယနေ့ဝယ်ယူမှု',
      icon: <Ticket className="w-6 h-6" />,
      color: 'bg-purple-500',
      trend: '+28',
      trendUp: true
    },
    {
      label: 'လမ်းကြောင်းများ',
      value: stats.totalRoutes,
      subtext: 'စုစုပေါင်းလမ်းကြောင်း',
      icon: <Route className="w-6 h-6" />,
      color: 'bg-orange-500',
      trend: '0',
      trendUp: false
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-600">ထိန်းချုပ်စင်တာ</h1>
        <p className="text-gray-600 mt-1">ရထားဝန်ဆောင်မှုစနစ်၏ အခြေအနေများ</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {quickStats.map((stat, index) => (
          <div key={index} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center text-white`}>
                {stat.icon}
              </div>
              <span className={`flex items-center text-sm font-medium ${
                stat.trendUp ? 'text-green-600' : 'text-gray-600'
              }`}>
                <TrendingUp className={`w-4 h-4 mr-1 ${!stat.trendUp && 'hidden'}`} />
                {stat.trend}
              </span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</h3>
            <p className="text-sm text-gray-600">{stat.label}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.subtext}</p>
          </div>
        ))}
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">ဝင်ငွေ</h3>
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900 mb-2">
            {stats.revenue.toLocaleString()} Ks
          </p>
          <p className="text-sm text-gray-600">ယခုလ စုစုပေါင်းဝင်ငွေ</p>
          <div className="mt-4 h-2 bg-gray-100 rounded-full">
            <div className="h-2 bg-green-500 rounded-full" style={{ width: '75%' }} />
          </div>
          <p className="text-xs text-gray-500 mt-2">ပြီးခဲ့သောလထက် ၁၅% တိုးတက်</p>
        </div>

        {/* On-Time Performance */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">အချိန်မှန်စွမ်းဆောင်ရည်</h3>
            <Activity className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex items-center justify-center mb-4">
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-gray-100"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 56}`}
                  strokeDashoffset={`${2 * Math.PI * 56 * (1 - stats.onTimePerformance / 100)}`}
                  className="text-blue-500"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold text-gray-900">{stats.onTimePerformance}%</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-600 text-center">ယခုလ ပျမ်းမျှအချိန်မှန်နှုန်း</p>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">သတိပေးချက်များ</h3>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm text-red-600">{stats.alerts} ခု</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-start space-x-3 p-3 bg-red-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">DEMU-005 နောက်ကျနေ</p>
                <p className="text-xs text-red-600">မန္တလေး-ပြင်ဦးလွင် လမ်းကြောင်း</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">ပြုပြင်ထိန်းသိမ်းမှု လိုအပ်</p>
                <p className="text-xs text-yellow-600">DEMU-012 - နောက်ရက်သတ္တပတ်</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">စနစ်အဆင့်မြှင့်တင်မှု</p>
                <p className="text-xs text-blue-600">ည ၁၂:၀၀ နာရီတွင် ပြုလုပ်မည်</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activities */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">လတ်တလောလုပ်ဆောင်ချက်များ</h3>
        <div className="space-y-4">
          {recentActivities.map((activity) => (
            <div key={activity.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activity.color}`}>
                  {activity.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                  {activity.train && <p className="text-xs text-gray-500">{activity.train}</p>}
                  {activity.user && <p className="text-xs text-gray-500">{activity.user}</p>}
                  {activity.route && <p className="text-xs text-gray-500">{activity.route}</p>}
                </div>
              </div>
              <span className="text-xs text-gray-500">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button className="p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors text-left">
          <Train className="w-6 h-6 text-blue-600 mb-2" />
          <p className="font-medium text-gray-900">ရထားထည့်မည်</p>
          <p className="text-xs text-gray-600">ရထားအသစ်မှတ်ပုံတင်ရန်</p>
        </button>
        <button className="p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors text-left">
          <Route className="w-6 h-6 text-green-600 mb-2" />
          <p className="font-medium text-gray-900">လမ်းကြောင်းထည့်မည်</p>
          <p className="text-xs text-gray-600">လမ်းကြောင်းအသစ်သတ်မှတ်ရန်</p>
        </button>
        <button className="p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors text-left">
          <Calendar className="w-6 h-6 text-purple-600 mb-2" />
          <p className="font-medium text-gray-900">အချိန်ဇယားထည့်မည်</p>
          <p className="text-xs text-gray-600">အချိန်ဇယားအသစ်သတ်မှတ်ရန်</p>
        </button>
        <button className="p-4 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors text-left">
          <Users className="w-6 h-6 text-orange-600 mb-2" />
          <p className="font-medium text-gray-900">အစီရင်ခံစာများ</p>
          <p className="text-xs text-gray-600">အသေးစိတ်အစီရင်ခံစာကြည့်ရန်</p>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
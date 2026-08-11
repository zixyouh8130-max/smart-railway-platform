import React from 'react';
import { Save, Bell, Shield, Globe, Database } from 'lucide-react';
import Button from '@/components/ui/Button';

const Settings = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ဆက်တင်များ</h1>
        <p className="text-gray-600 mt-1">စနစ်ဆက်တင်များ ပြင်ဆင်ခြင်း</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <Globe className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">အထွေထွေဆက်တင်များ</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ဘာသာစကား</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option>မြန်မာ</option>
                <option>English</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">အချိန်ဇုန်</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option>Asia/Yangon (UTC+6:30)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <Bell className="w-5 h-5 text-orange-600" />
            <h2 className="font-semibold text-gray-900">အကြောင်းကြားချက်များ</h2>
          </div>

          <div className="space-y-4">
            {['အီးမေးလ်အကြောင်းကြားချက်', 'SMS အကြောင်းကြားချက်', 'အက်ပ်အကြောင်းကြားချက်'].map((item) => (
              <label key={item} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-700">{item}</span>
                <input type="checkbox" className="rounded text-blue-600" defaultChecked />
              </label>
            ))}
          </div>
        </div>

        {/* Security Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <Shield className="w-5 h-5 text-green-600" />
            <h2 className="font-semibold text-gray-900">လုံခြုံရေးဆက်တင်များ</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">စကားဝှက်မူဝါဒ</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option>အနည်းဆုံး စာလုံးရေ ၈ လုံး</option>
                <option>အနည်းဆုံး စာလုံးရေ ၁၂ လုံး</option>
              </select>
            </div>
          </div>
        </div>

        {/* System Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <Database className="w-5 h-5 text-purple-600" />
            <h2 className="font-semibold text-gray-900">စနစ်ဆက်တင်များ</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ဒေတာသိမ်းဆည်းခြင်း</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                <option>နေ့စဉ် အလိုအလျောက်</option>
                <option>အပတ်စဉ်</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Save className="w-4 h-4" />
          သိမ်းဆည်းမည်
        </Button>
      </div>
    </div>
  );
};

export default Settings;
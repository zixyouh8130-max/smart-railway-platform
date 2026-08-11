import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';

const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">{title || 'အတည်ပြုချက်'}</h3>
        </div>

        <p className="text-gray-600 mb-6">
          {message || 'ဤလုပ်ဆောင်ချက်ကို ဆက်လက်လုပ်ဆောင်လိုပါသလား?'}
        </p>

        <div className="flex space-x-3">
          <Button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            မလုပ်တော့ပါ
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
          >
            အတည်ပြုမည်
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
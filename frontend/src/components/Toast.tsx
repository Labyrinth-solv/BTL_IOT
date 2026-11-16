import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toastMessage } = useAuth();

  if (!toastMessage) return null;

  const getStyle = () => {
    switch (toastMessage.type) {
      case 'success':
        return 'bg-white border-emerald-300 text-emerald-900';
      case 'warning':
        return 'bg-white border-amber-300 text-amber-900';
      case 'error':
      default:
        return 'bg-white border-rose-300 text-rose-900';
    }
  };

  const getIcon = () => {
    switch (toastMessage.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />;
      case 'warning':
        return <Info className="w-5 h-5 text-amber-600 shrink-0" />;
      case 'error':
      default:
        return <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-bounce-short">
      <div
        className={`flex items-start gap-3 p-4 rounded-2xl border shadow-xl ${getStyle()}`}
      >
        {getIcon()}
        <div className="text-sm font-medium leading-relaxed">{toastMessage.text}</div>
      </div>
    </div>
  );
};

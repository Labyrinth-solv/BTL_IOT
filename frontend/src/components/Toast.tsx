import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toastMessage } = useAuth();

  if (!toastMessage) return null;

  const getStyle = () => {
    switch (toastMessage.type) {
      case 'success':
        return 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200';
      case 'warning':
        return 'bg-amber-950/90 border-amber-500/50 text-amber-200';
      case 'error':
      default:
        return 'bg-rose-950/90 border-rose-500/50 text-rose-200';
    }
  };

  const getIcon = () => {
    switch (toastMessage.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />;
      case 'warning':
        return <Info className="w-5 h-5 text-amber-400 shrink-0" />;
      case 'error':
      default:
        return <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-bounce-short">
      <div
        className={`flex items-start gap-3 p-4 rounded-xl border shadow-2xl backdrop-blur-md ${getStyle()}`}
      >
        {getIcon()}
        <div className="text-sm font-medium leading-relaxed">{toastMessage.text}</div>
      </div>
    </div>
  );
};

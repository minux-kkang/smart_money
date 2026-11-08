import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string[];
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  details,
  confirmText = '확인',
  cancelText = '취소',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-xl shrink-0 ${
                isDestructive ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-slate-900 leading-snug">{title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{message}</p>
              {details && details.length > 0 && (
                <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-700 space-y-1 border border-slate-100">
                  {details.map((detail, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                      <span>{detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-xs transition-all cursor-pointer ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700 active:scale-95'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

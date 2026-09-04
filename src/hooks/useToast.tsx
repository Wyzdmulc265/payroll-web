import { useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, XCircle } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastConfig {
  message: string;
  variant: ToastVariant;
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-blue-600 text-white',
};

const VARIANT_ICONS: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

export function useToast() {
  const [toast, setToast] = useState<ToastConfig | null>(null);

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const Toast = useCallback(() => {
    if (!toast) return null;
    const Icon = VARIANT_ICONS[toast.variant];
    return (
      <div className="fixed bottom-6 right-6 z-50" role="status" aria-live="polite">
        <div className={`${VARIANT_STYLES[toast.variant]} px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 max-w-sm`}>
          <Icon className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      </div>
    );
  }, [toast]);

  return { showToast, Toast };
}

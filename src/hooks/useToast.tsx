import { useState, useCallback } from 'react';

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const Toast = useCallback(() => {
    if (!message) return null;
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <div className="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <span>{message}</span>
        </div>
      </div>
    );
  }, [message]);

  return { showToast, Toast };
}

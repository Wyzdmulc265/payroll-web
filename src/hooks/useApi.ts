import { useState, useCallback } from 'react';

interface UseApiState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

export function useApi<T = unknown>() {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const request = useCallback(async (url: string, options?: RequestInit): Promise<T | null> => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const res = await fetch(url, options);
      const data = await res.json();
      if (!res.ok || !data.success) {
        const error = data.error || 'Request failed';
        setState({ data: null, error, isLoading: false });
        return null;
      }
      setState({ data: data.data as T, error: null, isLoading: false });
      return data.data as T;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Network error';
      setState({ data: null, error, isLoading: false });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return { ...state, request, reset };
}

import { useEffect, useCallback, useRef, type RefObject } from 'react';

/**
 * Traps focus inside a modal container while it is open.
 *
 * Usage:
 *   const ref = useRef<HTMLElement>(null);
 *   useFocusTrap(isOpen, ref);
 *
 * The hook:
 *  - focuses the first focusable element on mount (or the container itself if
 *    there are no focusable children).
 *  - cycles Tab/Shift+Tab between the first and last focusable element.
 *  - returns focus to the previously focused element on unmount.
 */
export function useFocusTrap<T extends HTMLElement>(
  isOpen: boolean,
  ref: RefObject<T | null>
): void {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const focusFirst = useCallback(() => {
    const container = ref.current;
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0] ?? container;
    first.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    // Save the element that had focus before the modal opened.
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Small timeout so the DOM has mounted before we try to focus.
    const id = setTimeout(() => {
      focusFirst();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const container = ref.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(id);
      document.removeEventListener('keydown', onKeyDown);
      // Restore focus to the element that had it before the modal opened.
      previousActiveElement.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, focusFirst]);
}
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ListTree } from 'lucide-react';
import { useCurrentUser } from '@/components/UserContext';
import { getVisibleHowToItems, type HowToNavItem } from '@/lib/how-to-nav';

const MANUAL_PATH = '/know-your-app';

export function JumpToButton({ onSelect }: { onSelect?: (item: HowToNavItem) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();

  const items = useMemo(() => getVisibleHowToItems(user?.role), [user?.role]);

  // Close the dropdown when clicking outside of it.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const handleSelect = (item: HowToNavItem) => {
    setOpen(false);

    if (onSelect) {
      onSelect(item);
      return;
    }

    if (pathname === MANUAL_PATH) {
      const element = document.getElementById(item.id);
      if (element) {
        const headerOffset = 96;
        const elementPosition = element.getBoundingClientRect().top + window.scrollY;
        window.history.replaceState(null, '', `#${item.id}`);
        window.scrollTo({ top: elementPosition - headerOffset, behavior: 'smooth' });
        element.focus({ preventScroll: true });
      }
      return;
    }

    router.push(`${MANUAL_PATH}#${item.id}`);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="btn-secondary print:hidden"
      >
        <ListTree className="h-4 w-4" aria-hidden="true" />
        Jump To
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Jump to section"
          className="absolute right-0 z-30 mt-2 max-h-80 w-60 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {items.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">No sections available</li>
          )}
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(item)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
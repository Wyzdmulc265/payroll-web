'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  Calculator,
  FileText,
  BarChart3,
  TrendingUp,
  Settings,
  Building2,
} from 'lucide-react';

const NAV = [
  { name: 'Dashboard', href: '/dashboard', icon: TrendingUp },
  { name: 'Employees', href: '/employees', icon: Users },
  { name: 'Payroll', href: '/payroll', icon: Calculator },
  { name: 'Payslips', href: '/payslips', icon: FileText },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

/**
 * Persistent navigation rendered once from the root layout so every page
 * shares it. Desktop: fixed left sidebar (lg+). Mobile: fixed bottom bar.
 * The active item is derived from the current route.
 */
export default function MainNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex print:hidden"
        aria-label="Sidebar"
      >
        <div className="flex items-center gap-2 border-b border-gray-200 p-6">
          <Building2 className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-lg font-bold leading-tight text-gray-900">WizTech Payroll</p>
            <p className="text-xs text-gray-500">Malawi</p>
          </div>
        </div>
        <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto p-4">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary text-white'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
      >
        <div className="grid grid-cols-6">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
                  active ? 'text-primary' : 'text-gray-500'
                }`}
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
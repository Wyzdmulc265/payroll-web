'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Users,
  Calculator,
  FileText,
  BarChart3,
  TrendingUp,
  Settings,
  Building2,
  LogOut,
  UserCog,
} from 'lucide-react';
import { useCurrentUser } from './UserContext';
import { Permission, hasPermission } from '@/lib/auth/permissions';
import { ReactNode } from 'react';

const ALL_NAV: {
  name: string;
  href: string;
  icon: typeof Users;
  permission: Permission;
  requiresBusiness?: boolean;
}[] = [
  { name: 'Dashboard', href: '/dashboard', icon: TrendingUp, permission: Permission.READ_PAYROLL }, // Or READ_EMPLOYEES, we'll check dynamically
  { name: 'Employees', href: '/employees', icon: Users, permission: Permission.READ_EMPLOYEES },
  { name: 'Payroll', href: '/payroll', icon: Calculator, permission: Permission.READ_PAYROLL },
  { name: 'Payslips', href: '/payslips', icon: FileText, permission: Permission.READ_PAYROLL },
  { name: 'Reports', href: '/reports', icon: BarChart3, permission: Permission.READ_REPORTS },
  { name: 'Settings', href: '/settings', icon: Settings, permission: Permission.READ_SETTINGS },
  { name: 'Users', href: '/users', icon: UserCog, permission: Permission.MANAGE_USERS, requiresBusiness: true },
];

/**
 * Persistent navigation rendered once from the root layout so every page
 * shares it. Desktop: fixed left sidebar (lg+). Mobile: fixed bottom bar.
 * Also conditionally renders nothing if on an auth page.
 */
export default function MainNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();

  // If we are on an auth page, render no nav and no layout offset.
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/reset-password/');

  if (isAuthPage) {
    return <>{children}</>;
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Filter NAV by user permissions
  const visibleNav = ALL_NAV.filter((item) => {
    if (!user) return false;
    // User-management requires an assigned business tenant (SUPER_ADMIN has no
    // implicit business and must select one first — Phase 9).
    if (item.requiresBusiness && !user.businessId) return false;
    // Special case for dashboard: can see if they can read payroll OR employees
    if (item.name === 'Dashboard') {
      return hasPermission(user.role, Permission.READ_PAYROLL) || hasPermission(user.role, Permission.READ_EMPLOYEES);
    }
    return hasPermission(user.role, item.permission);
  });

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

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
          {visibleNav.map((item) => {
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

        {/* User Footer */}
        {user && (
          <div className="border-t border-gray-200 p-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-primary">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <div className="truncate">
                  <p className="truncate text-sm font-medium text-gray-900">{user.email}</p>
                  <p className="text-xs text-gray-500 capitalize">{user.role.replace('_', ' ').toLowerCase()}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="btn-icon"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden overflow-x-auto"
      >
        <div className="flex w-full justify-around min-w-max px-2">
          {visibleNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 px-3 text-[10px] font-medium ${
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

      {/* Content Area Offset */}
      <div className="min-h-screen pb-24 lg:pb-0 print:ml-0 print:pb-0 lg:ml-64">
        {children}
      </div>
    </>
  );
}
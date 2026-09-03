'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Users, FileText, Loader2, TrendingUp } from 'lucide-react';

interface BusinessDto {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  _count: { users: number; employees: number };
}

interface AdminStats {
  businesses: number;
  admins: number;
  payrollRecords: number;
}

interface AdminStatsResponse {
  success: boolean;
  error?: string;
  data?: {
    counts: AdminStats;
    recentBusinesses: BusinessDto[];
  };
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<AdminStats | null>(null);
  const [recentBusinesses, setRecentBusinesses] = useState<BusinessDto[]>([]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/stats', { credentials: 'same-origin' });
      const json: AdminStatsResponse = await res.json();
      if (!json.success || !json.data) {
        setError(json.error ?? 'Failed to load dashboard');
        return;
      }
      setCounts(json.data.counts);
      setRecentBusinesses(json.data.recentBusinesses);
    } catch {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center gap-3 mb-8">
        <TrendingUp className="h-7 w-7 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin mr-3" aria-hidden="true" />
          Loading dashboard…
        </div>
      )}

      {!loading && counts && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <KpiCard
              title="Businesses"
              value={counts.businesses}
              icon={<Building2 className="h-6 w-6 text-primary" aria-hidden="true" />}
            />
            <KpiCard
              title="Admins"
              value={counts.admins}
              icon={<Users className="h-6 w-6 text-primary" aria-hidden="true" />}
            />
            <KpiCard
              title="Payroll Records"
              value={counts.payrollRecords}
              icon={<FileText className="h-6 w-6 text-primary" aria-hidden="true" />}
            />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Businesses</h2>
            {recentBusinesses.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No businesses yet.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium text-gray-500">Users</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium text-gray-500">Employees</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium text-gray-500">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentBusinesses.map((b) => (
                      <tr key={b.id}>
                        <td className="px-4 py-2">
                          <Link
                            href={`/businesses?drawer=${b.id}`}
                            className="font-medium text-primary hover:text-primary-hover"
                          >
                            {b.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            b.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-200 text-gray-600'
                          }`}>
                            {b.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{b._count.users}</td>
                        <td className="px-4 py-2 text-gray-700">{b._count.employees}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                          {new Date(b.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="card p-6 text-center">
      <div className="flex items-center justify-center gap-2 text-gray-500 mb-2">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

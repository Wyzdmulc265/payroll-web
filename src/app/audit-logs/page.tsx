'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Download, ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_ENTITY_OPTIONS,
  type AuditLogDto,
} from '@/lib/audit-constants';

interface AuditLogResponse {
  success: boolean;
  error?: string;
  data?: {
    auditLogs: AuditLogDto[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  };
}

const PAGE_SIZE = 50;

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/^[=@+\-\t\r]/.test(s)) return `'${s.replace(/'/g, "''")}`;
  return s;
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [defaults] = useState(() => {
    const now = Date.now();
    return [
      formatDate(new Date(now - 30 * 24 * 60 * 60 * 1000)),
      formatDate(new Date(now)),
    ] as const;
  });
  const [startDate, setStartDate] = useState(defaults[0]);
  const [endDate, setEndDate] = useState(defaults[1]);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [query, setQuery] = useState('');

  const buildQuery = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams({
        startDate: new Date(`${startDate}T00:00:00Z`).toISOString(),
        endDate: new Date(`${endDate}T23:59:59Z`).toISOString(),
        page: String(pageNum),
        limit: String(PAGE_SIZE),
      });
      if (action) params.set('action', action);
      if (entityType) params.set('entityType', entityType);
      if (query.trim()) params.set('query', query.trim());
      return params;
    },
    [startDate, endDate, action, entityType, query]
  );

  const fetchLogs = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/audit-logs?${buildQuery(pageNum).toString()}`, {
          credentials: 'same-origin',
        });
        const json: AuditLogResponse = await res.json();
        if (!json.success || !json.data) {
          setError(json.error ?? 'Failed to load audit logs');
          setLogs([]);
          return;
        }
        setLogs(json.data.auditLogs);
        setTotal(json.data.pagination.total);
        setTotalPages(Math.max(1, json.data.pagination.totalPages));
      } catch {
        setError('Failed to load audit logs');
        setLogs([]);
      } finally {
        setLoading(false);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchLogs(1);
  }

  function handlePage(newPage: number) {
    setPage(newPage);
    fetchLogs(newPage);
  }

  function exportCsv() {
    const headers = [
      'Timestamp', 'Action', 'Entity Type', 'Entity ID', 'Description',
      'Actor Email', 'Actor Role', 'Employee ID', 'IP Address', 'Old Value', 'New Value',
    ];
    const rows = logs.map((log) =>
      [
        new Date(log.timestamp).toISOString(),
        log.action,
        log.entityType,
        log.entityId,
        log.description,
        log.user?.email ?? '',
        log.user?.role ?? '',
        log.employee?.employeeId ?? '',
        log.ipAddress,
        log.oldValue,
        log.newValue,
      ]
        .map((cell) => csvField(escapeCsvCell(cell)))
        .join(',')
    );
    const csv = [headers.map(csvField).join(','), ...rows].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${formatDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" aria-hidden="true" />
            Audit Logs
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? 'Loading…' : `${total} event${total === 1 ? '' : 's'} in range`}
          </p>
        </div>
        <button onClick={exportCsv} disabled={logs.length === 0} className="btn-secondary">
          <Download className="h-4 w-4 mr-2" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      <form onSubmit={handleFilterSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <div>
          <label className="label" htmlFor="audit-start">From</label>
          <input id="audit-start" type="date" value={startDate} max={endDate}
            onChange={(e) => setStartDate(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="audit-end">To</label>
          <input id="audit-end" type="date" value={endDate} min={startDate}
            onChange={(e) => setEndDate(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="audit-action">Action</label>
          <select id="audit-action" value={action} onChange={(e) => setAction(e.target.value)} className="input">
            <option value="">All actions</option>
            {AUDIT_ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="audit-entity">Entity Type</label>
          <select id="audit-entity" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="input">
            <option value="">All entities</option>
            {AUDIT_ENTITY_OPTIONS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="audit-query">Search</label>
          <input id="audit-query" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Action, entity, or description" className="input" />
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <button type="submit" className="btn-primary">Apply Filters</button>
        </div>
      </form>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="w-8 px-3 py-2" />
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500">Timestamp</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500">Action</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500">Entity</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500">Actor</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    No audit events match the current filters.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" aria-hidden="true" />
                    Loading…
                  </td>
                </tr>
              )}
              {logs.map((log) => {
                const hasDetail = log.oldValue !== null || log.newValue !== null;
                const isOpen = expanded === log.id;
                return (
                  <tr key={log.id} className={isOpen ? 'bg-gray-50' : ''}>
                    <td className="px-3 py-2">
                      {hasDetail && (
                        <button type="button" onClick={() => setExpanded(isOpen ? null : log.id)}
                          className="btn-icon" aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                          aria-expanded={isOpen}>
                          {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                      {formatTimestamp(log.timestamp.toISOString())}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{log.action}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{log.entityType}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                      {log.user?.email ?? '—'}
                      {log.employee && (
                        <span className="block text-xs text-gray-400">{log.employee.employeeId}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{log.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {expanded && (() => {
          const log = logs.find((l) => l.id === expanded);
          if (!log) return null;
          return (
            <div className="border-t border-gray-200 bg-gray-50 p-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Old Value</p>
                <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {log.oldValue ? JSON.stringify(JSON.parse(log.oldValue), null, 2) : '—'}
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">New Value</p>
                <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {log.newValue ? JSON.stringify(JSON.parse(log.newValue), null, 2) : '—'}
                </pre>
              </div>
              <div className="md:col-span-2 text-xs text-gray-500">
                Entity ID: {log.entityId ?? '—'} · IP: {log.ipAddress ?? '—'} · Business: {log.business?.name ?? '—'}
              </div>
            </div>
          );
        })()}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-sm">
            <span className="text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => handlePage(page - 1)} disabled={page <= 1}
                className="btn-secondary disabled:opacity-50">Previous</button>
              <button type="button" onClick={() => handlePage(page + 1)} disabled={page >= totalPages}
                className="btn-secondary disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';

interface PeriodPickerProps {
  value: string;
  onChange: (period: string) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export function PeriodPicker({ value, onChange, disabled, label = 'Period', id }: PeriodPickerProps) {
  const [periods, setPeriods] = useState<string[]>([]);
  const initialized = useRef(false);

  const currentYear = new Date().getFullYear();
  const suggestedPeriod = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    let cancelled = false;
    const fetchPeriods = async () => {
      try {
        const res = await fetch('/api/dashboard');
        const data = await res.json();
        if (!cancelled && data.success && data.data.periods) {
          setPeriods(data.data.periods);
          if (!initialized.current) {
            initialized.current = true;
            if (!value) {
              onChange(data.data.periods[0] || suggestedPeriod);
            }
          }
        }
      } catch {
        // Non-fatal: period list just won't populate
      }
    };
    fetchPeriods();
    return () => { cancelled = true; };
  }, []);

  const handleMonthInput = (v: string) => {
    if (!v) return;
    onChange(v);
    setPeriods((prev) => (prev.includes(v) ? prev : [v, ...prev]));
  };

  const selectId = id ?? 'period-select';

  return (
    <>
      <label className="text-sm text-gray-600" htmlFor={selectId}>{label}</label>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-auto"
        disabled={disabled}
      >
        {value && !periods.includes(value) && (
          <option value={value}>{value}</option>
        )}
        {periods.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <input
        type="month"
        aria-label="Pick a period (YYYY-MM)"
        title="Pick a period (YYYY-MM)"
        value={value}
        onChange={(e) => handleMonthInput(e.target.value)}
        className="input w-auto"
        disabled={disabled}
      />
    </>
  );
}

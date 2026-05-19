import { useState, useMemo } from 'react';

/**
 * Table sort hook + clickable header. The hook returns the sorted array and
 * a `<SortHeader />` component you drop into your `<thead>`.
 *
 * Usage:
 *   const { sorted, headerProps } = useSort(rows, 'name');
 *   <th {...headerProps('name')}>Name</th>
 *   {sorted.map(...)}
 */
export function useSort<T extends Record<string, any>>(rows: T[], defaultKey: keyof T) {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return direction === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return direction === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return arr;
  }, [rows, sortKey, direction]);

  const headerProps = (key: keyof T) => ({
    style: { cursor: 'pointer', userSelect: 'none' as const },
    onClick: () => {
      if (sortKey === key) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      else { setSortKey(key); setDirection('asc'); }
    },
    'data-sort-active': sortKey === key,
    'data-sort-dir': sortKey === key ? direction : '',
  });

  const sortIndicator = (key: keyof T) => {
    if (sortKey !== key) return '';
    return direction === 'asc' ? ' ↑' : ' ↓';
  };

  return { sorted, headerProps, sortIndicator, sortKey, direction, setSortKey, setDirection };
}

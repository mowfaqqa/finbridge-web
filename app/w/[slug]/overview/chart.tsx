'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui';
import type { CashFlow } from '@/lib/api/client';
import { formatMoney, formatMonth } from '@/lib/format';

const series = [
  { key: 'inflowKobo', name: 'Inflow', color: 'var(--chart-in)', pattern: 'solid' },
  { key: 'outflowKobo', name: 'Outflow', color: 'var(--chart-out)', pattern: 'stripe' },
  { key: 'netKobo', name: 'Net', color: 'var(--chart-net)', pattern: 'dot' },
] as const;

export function CashChart({ data }: { data: CashFlow['monthly'] }) {
  const [table, setTable] = useState(false);
  const id = useId();
  const magnitude = (value: bigint) => value < 0n ? -value : value;
  const largest = data.flatMap((month) => series.map((item) => magnitude(BigInt(month[item.key]))))
    .reduce((max, value) => value > max ? value : max, 1n);
  const chartWidth = 720;
  const baseline = 120;
  const span = (chartWidth - 56) / data.length;
  const width = Math.min(24, span / 4);
  const scale = (value: string) => Number((magnitude(BigInt(value)) * 90_000n) / largest) / 1000;

  return <div className="space-y-4">
    <div className="flex flex-wrap justify-between gap-3">
      <h3 className="text-section font-semibold">Monthly movements</h3>
      <Button secondary onClick={() => setTable(!table)} aria-expanded={table} aria-controls={`${id}-table`}>
        {table ? 'Hide data table' : 'Show data table'}
      </Button>
    </div>
    <p className="text-label text-muted">Amounts in NGN. The baseline separates positive and negative net movement.</p>
    <ul className="flex flex-wrap gap-4 text-label" aria-label="Chart legend">
      {series.map((item) => <li key={item.key} className="flex items-center gap-2">
        <span aria-hidden="true" className="inline-block size-3" style={{
          background: item.pattern === 'stripe' ? `repeating-linear-gradient(45deg, ${item.color} 0 3px, white 3px 4px)`
            : item.pattern === 'dot' ? `radial-gradient(white 1px, ${item.color} 1px)` : item.color,
          backgroundSize: item.pattern === 'dot' ? '4px 4px' : undefined,
        }} />{item.name}
      </li>)}
    </ul>
    <svg aria-hidden="true" viewBox={`0 0 ${chartWidth} 244`} className="h-auto w-full">
      <defs>
        <pattern id={`${id}-stripe`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--chart-out)" /><path d="M 0 0 V 6" stroke="white" strokeWidth="2" />
        </pattern>
        <pattern id={`${id}-dot`} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="var(--chart-net)" /><circle cx="2.5" cy="2.5" r="0.8" fill="white" />
        </pattern>
      </defs>
      <path d="M 26 30 H 708 M 26 210 H 708" stroke="var(--divider)" />
      <path d={`M 26 ${baseline} H 708`} stroke="var(--control-border)" />
      {data.map((month, index) => {
        const x = 26 + span * index + span / 2;
        return <g key={month.month}>
          {series.map((item, offset) => {
            const value = month[item.key];
            const height = scale(value);
            return <rect key={item.key} x={x + (offset - 1.5) * width} y={value.startsWith('-') ? baseline : baseline - height}
              width={Math.max(1, width - 2)} height={height}
              fill={item.pattern === 'solid' ? item.color : `url(#${id}-${item.pattern})`} />;
          })}
          {(data.length <= 7 || index % 2 === 0) &&
            <text x={x} y="235" textAnchor="middle" fill="var(--text-muted)" fontSize="13">{formatMonth(month.month)}</text>}
        </g>;
      })}
      <text x="12" y={baseline + 4} fontSize="13" fill="var(--text-muted)">0</text>
    </svg>
    <div id={`${id}-table`} hidden={!table} className="overflow-x-auto" role="region" aria-label="Monthly movement data table" tabIndex={0}>
      <table className="w-full min-w-[420px] text-left text-label">
        <caption className="mb-2 text-left font-medium">Monthly statement movements in NGN</caption>
        <thead className="border-b border-divider"><tr><th scope="col">Month</th>
          {series.map((item) => <th key={item.key} scope="col" className="px-1 py-2 text-right">{item.name}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-divider">{data.map((row) => <tr key={row.month}>
          <th scope="row" className="py-2 font-medium">{formatMonth(row.month)}</th>
          {series.map((item) => <td key={item.key} className="px-1 py-2 text-right tabular-nums">{formatMoney(row[item.key])}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

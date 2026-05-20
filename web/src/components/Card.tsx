import type { ReactNode } from 'react';

interface Props {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}

/**
 * Lightweight panel used across the reservist dashboard and Settings.
 * Uppercase mono title + optional right-aligned action slot.
 */
export function Card({ title, right, children }: Props) {
  return (
    <section style={{
      background: 'var(--card)', border: '1px solid var(--line)',
      borderRadius: 12, padding: 16, marginBottom: 14,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
          textTransform: 'uppercase', letterSpacing: '.08em',
          color: 'var(--ink-mute)',
        }}>{title}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

import type { ReactNode } from 'react';

interface Props {
  title: string;
  icon: ReactNode;
  count: number;
  emptyText: string;
  children: ReactNode;
}

export function CameraSection({ title, icon, count, emptyText, children }: Props) {
  return (
    <section className="section" aria-label={title}>
      <header className="section-head">
        <span className="section-icon" aria-hidden="true">{icon}</span>
        <h2>{title}</h2>
        <span className="count">{count}</span>
      </header>
      {count === 0 ? <p className="empty">{emptyText}</p> : <div className="grid">{children}</div>}
    </section>
  );
}

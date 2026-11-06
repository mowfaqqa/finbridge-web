import { panelStyle } from '@/components/ui';

export default function Overview() {
  return (
    <div className="space-y-6">
      <h1 className="text-title font-semibold">Overview</h1>
      <section className={panelStyle} aria-labelledby="statement-data">
        <h2 id="statement-data" className="text-section font-semibold">No statement data</h2>
        <p className="mt-2 text-muted">This workspace has no published statement movements.</p>
      </section>
    </div>
  );
}

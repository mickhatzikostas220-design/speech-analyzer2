import { getUserBrandState } from '@/lib/brand/server';
import { DashboardHome } from '@/components/DashboardHome';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { brand } = await getUserBrandState();
  const first = (brand.name || 'there').split(' ')[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <header className="mb-10">
        <p className="eyebrow mb-2">Your hub</p>
        <h1 className="display-h1">
          Hey {first},{' '}
          <span className="script" style={{ fontSize: '1.2em' }}>
            {brand.voice.greeting || "let's get to work."}
          </span>
        </h1>
      </header>
      <DashboardHome />
    </div>
  );
}

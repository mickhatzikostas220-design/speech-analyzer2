import { Logo } from '@/components/brand/Logo';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex justify-center">
            <Logo brand={DEFAULT_BRAND} size={24} />
          </div>
          <p className="text-sm text-muted">Every tool a speaker needs, in one place.</p>
        </div>
        {children}
      </div>
    </div>
  );
}

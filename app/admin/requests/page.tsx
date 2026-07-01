'use client';

import { useState, useEffect } from 'react';
import type { PlanId } from '@/lib/subscription/plans';

interface AccessRequest {
  id: string;
  name: string;
  email: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
}

function statusBadge(status: AccessRequest['status']) {
  if (status === 'approved') return 'bg-[var(--success-bg)] text-[color:var(--success)] border-[color:var(--success)]/30';
  if (status === 'denied') return 'bg-[var(--danger-bg)] text-[color:var(--danger)] border-[color:var(--danger)]/30';
  return 'bg-[var(--warning-bg)] text-[#8A6D00] border-[#8A6D00]/30';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // Grant plan state
  const [grantEmail, setGrantEmail] = useState('');
  const [grantPlan, setGrantPlan] = useState<PlanId>('full');
  const [granting, setGranting] = useState(false);

  useEffect(() => { fetchRequests(); }, []);

  async function fetchRequests() {
    const res = await fetch('/api/admin/requests');
    const data = await res.json();
    setRequests(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleApprove(id: string) {
    setProcessing(id);
    const res = await fetch(`/api/admin/requests/${id}/approve`, { method: 'POST' });
    if (res.ok) {
      const d = await res.json();
      if (d.emailSent) {
        showToast('Approved — invite email sent.');
      } else {
        setInviteLink(d.signupUrl ?? null);
        showToast('Approved — copy the invite link below to send manually.');
      }
    } else {
      const d = await res.json();
      showToast(d.error ?? 'Failed to approve.');
    }
    await fetchRequests();
    setProcessing(null);
  }

  async function handleDeny(id: string) {
    setProcessing(id);
    const res = await fetch(`/api/admin/requests/${id}/deny`, { method: 'POST' });
    if (res.ok) {
      showToast('Denied — rejection email sent.');
    } else {
      showToast('Failed to deny.');
    }
    await fetchRequests();
    setProcessing(null);
  }

  async function handleGrantPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!grantEmail.trim()) return;
    setGranting(true);
    const res = await fetch('/api/admin/grant-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: grantEmail.trim(), plan: grantPlan }),
    });
    const d = await res.json();
    if (res.ok) {
      if (d.invited && d.inviteLink) {
        setInviteLink(d.inviteLink);
        showToast(`Invited ${grantEmail} with ${grantPlan} plan — send them the link below.`);
      } else if (d.invited) {
        showToast(`Invited ${grantEmail} with ${grantPlan} plan — invite email sent.`);
      } else {
        showToast(`${grantEmail} granted ${grantPlan} plan.`);
      }
      setGrantEmail('');
    } else {
      showToast(d.error ?? 'Failed to grant plan.');
    }
    setGranting(false);
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const reviewed = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      {/* Toast */}
      {toast && (
        <div className="animate-slide-up fixed right-4 top-20 z-50 rounded-[var(--radius-md)] bg-[var(--surface-ink)] px-4 py-2.5 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* Invite link (shown when email is not configured) */}
      {inviteLink && (
        <div className="space-y-2 rounded-[var(--radius-md)] bg-[var(--warning-bg)] p-4">
          <p className="text-sm font-semibold text-[#8A6D00]">Email not configured — send this link manually</p>
          <div className="flex gap-2">
            <input readOnly value={inviteLink} className="input flex-1 font-mono text-xs" />
            <button
              onClick={() => { navigator.clipboard.writeText(inviteLink); showToast('Copied!'); }}
              className="btn-outline"
              style={{ padding: '8px 14px', fontSize: 'var(--text-xs)' }}
            >
              Copy
            </button>
            <button
              onClick={() => setInviteLink(null)}
              className="btn-ghost"
              style={{ padding: '8px 14px', fontSize: 'var(--text-xs)' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Grant Plan */}
      <div className="card p-5 space-y-4">
        <div>
          <p className="eyebrow mb-0.5">Admin</p>
          <h2 className="text-base font-semibold text-strong">Grant plan access</h2>
          <p className="text-xs text-muted mt-0.5">
            Instantly grant any email free, core, or full plan — no payment required.
            If the user has no account they will receive an invite link.
          </p>
        </div>
        <form onSubmit={handleGrantPlan} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            placeholder="user@example.com"
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
            className="input flex-1"
          />
          <select
            value={grantPlan}
            onChange={(e) => setGrantPlan(e.target.value as PlanId)}
            className="input w-36 shrink-0"
          >
            <option value="full">Full Premium</option>
            <option value="core">Core Premium</option>
            <option value="free">Free</option>
          </select>
          <button
            type="submit"
            disabled={granting}
            className="rounded-[var(--radius-pill)] px-4 py-2 text-xs font-bold text-white transition-colors disabled:opacity-50 shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            {granting ? 'Granting…' : 'Grant access'}
          </button>
        </form>
      </div>

      <div>
        <p className="eyebrow mb-1">Admin</p>
        <h1 className="section-title" style={{ fontSize: 'var(--text-h3)' }}>Access requests</h1>
        <p className="mt-1 text-sm text-muted">
          {pending.length} pending · {reviewed.length} reviewed
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="py-20 text-center text-sm text-faint">No requests yet.</div>
      ) : (
        <div className="space-y-8">
          {/* Pending */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="eyebrow">Pending</h2>
              {pending.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  processing={processing === req.id}
                  onApprove={() => handleApprove(req.id)}
                  onDeny={() => handleDeny(req.id)}
                />
              ))}
            </div>
          )}

          {/* Reviewed */}
          {reviewed.length > 0 && (
            <div className="space-y-3">
              <h2 className="eyebrow">Reviewed</h2>
              {reviewed.map((req) => (
                <RequestCard key={req.id} req={req} processing={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequestCard({
  req,
  processing,
  onApprove,
  onDeny,
}: {
  req: AccessRequest;
  processing: boolean;
  onApprove?: () => void;
  onDeny?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-strong">{req.name}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(req.status)}`}>
              {req.status}
            </span>
          </div>
          <p className="text-xs text-muted">{req.email}</p>
          <p className="mt-0.5 text-xs text-faint">{formatDate(req.created_at)}</p>

          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs font-semibold"
            style={{ color: 'var(--text-link)' }}
          >
            {expanded ? 'Hide reason' : 'View reason'}
          </button>

          {expanded && (
            <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--surface-sunk)] p-3 text-sm leading-relaxed text-body">
              {req.reason}
            </p>
          )}
        </div>

        {req.status === 'pending' && (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onApprove}
              disabled={processing}
              className="rounded-[var(--radius-pill)] px-3.5 py-1.5 text-xs font-bold text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--success)' }}
            >
              {processing ? '…' : 'Approve'}
            </button>
            <button
              onClick={onDeny}
              disabled={processing}
              className="btn-outline"
              style={{ padding: '6px 14px', fontSize: 'var(--text-xs)' }}
            >
              {processing ? '…' : 'Deny'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

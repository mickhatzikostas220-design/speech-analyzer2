'use client';

import { useState, useEffect } from 'react';

interface AccessRequest {
  id: string;
  name: string;
  email: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
}

function statusBadge(status: AccessRequest['status']) {
  if (status === 'approved') return 'bg-green-500/10 text-green-400 border-green-500/20';
  if (status === 'denied') return 'bg-red-500/10 text-red-400 border-red-500/20';
  return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
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

  const pending = requests.filter((r) => r.status === 'pending');
  const reviewed = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-4 bg-zinc-800 border border-zinc-700 text-white text-sm px-4 py-2.5 rounded-xl shadow-xl animate-slide-up z-50">
          {toast}
        </div>
      )}

      {/* Invite link (shown when email is not configured) */}
      {inviteLink && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
          <p className="text-amber-400 text-sm font-medium">Email not configured — send this link manually</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteLink}
              className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-2 font-mono"
            />
            <button
              onClick={() => { navigator.clipboard.writeText(inviteLink); showToast('Copied!'); }}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded-lg transition-colors border border-zinc-700"
            >
              Copy
            </button>
            <button
              onClick={() => setInviteLink(null)}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors border border-zinc-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-white">Access Requests</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {pending.length} pending · {reviewed.length} reviewed
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 text-zinc-600 text-sm">No requests yet.</div>
      ) : (
        <div className="space-y-8">
          {/* Pending */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Pending</h2>
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
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Reviewed</h2>
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-white font-medium text-sm">{req.name}</span>
            <span className={`text-xs border rounded-full px-2 py-0.5 ${statusBadge(req.status)}`}>
              {req.status}
            </span>
          </div>
          <p className="text-zinc-400 text-xs">{req.email}</p>
          <p className="text-zinc-600 text-xs mt-0.5">{formatDate(req.created_at)}</p>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors mt-2"
          >
            {expanded ? 'Hide reason' : 'View reason'}
          </button>

          {expanded && (
            <p className="text-zinc-300 text-sm mt-2 leading-relaxed bg-zinc-800 rounded-lg p-3">
              {req.reason}
            </p>
          )}
        </div>

        {req.status === 'pending' && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onApprove}
              disabled={processing}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {processing ? '…' : 'Approve'}
            </button>
            <button
              onClick={onDeny}
              disabled={processing}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-red-600 disabled:opacity-50 text-zinc-300 hover:text-white text-xs font-medium rounded-lg transition-colors border border-zinc-700 hover:border-red-600"
            >
              {processing ? '…' : 'Deny'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

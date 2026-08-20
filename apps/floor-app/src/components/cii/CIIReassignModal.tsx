import { useEffect, useState } from 'react';
import { ReasonCodeField } from '../shared/ReasonCodeField';
import { splitReasonCode } from '../../lib/reasonCode';
import { apiFetch } from '../../lib/api';
import { useMessageBar } from '../../context/MessageBarContext';
import type { Store } from '@shared/index';

interface Props {
  cid: string;
  currentStore: { id: number; name: string };
  token: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CIIReassignModal({ cid, currentStore, token, onClose, onSuccess }: Props) {
  const { setMessage } = useMessageBar();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<number | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<Store[]>('/api/stores', token)
      .then(setStores)
      .catch(() => setStores([]));
  }, [token]);

  async function handleConfirm() {
    const parts = splitReasonCode(reasonCode);
    if (!parts || !selectedStore) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/stray-eaches/${cid}/reassign`, token, {
        method: 'POST',
        body: JSON.stringify({ newStore: selectedStore, reasonPrefix: parts.prefix, reasonNumber: parts.number, reasonNote: reasonNote || undefined }),
      });
      setMessage({ type: 'success', text: 'Destination reassigned' });
      onClose();
      onSuccess();
    } catch {
      setMessage({ type: 'error', text: 'Reassign failed' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[65]">
      <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 w-[460px] shadow-2xl flex flex-col gap-4">
        <h2 className="font-ui text-[19px] font-semibold text-white text-center">Reassign Destination</h2>
        <p className="font-ui text-[14px] text-[#9A9A9A] text-center">
          Current: {currentStore.name} (#{currentStore.id})
        </p>

        <div className="flex flex-col gap-1">
          <label className="font-ui text-[13px] text-[#9A9A9A] uppercase tracking-wider">New Store</label>
          <select
            value={selectedStore ?? ''}
            onChange={(e) => setSelectedStore(Number(e.target.value) || null)}
            className="h-[40px] px-3 rounded-[8px] bg-[#1A1A1A] border border-[#3A3A3A] font-ui text-[15px] text-white outline-none focus:border-[#CC0000]"
          >
            <option value="">Select a store</option>
            {stores.filter((s) => s.id !== currentStore.id).map((s) => (
              <option key={s.id} value={s.id}>{s.name} (#{s.id})</option>
            ))}
          </select>
        </div>

        <ReasonCodeField domain="STRAY_REASSIGN" value={reasonCode} onChange={setReasonCode} size="compact" />

        <div className="flex flex-col gap-1">
          <label className="font-ui text-[13px] text-[#9A9A9A] uppercase tracking-wider">Note (optional)</label>
          <input
            type="text"
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            maxLength={255}
            className="h-[40px] px-3 rounded-[8px] bg-[#1A1A1A] border border-[#3A3A3A] font-ui text-[15px] text-white placeholder:text-[#666] outline-none focus:border-[#CC0000]"
            placeholder="Optional annotation"
          />
        </div>

        <button
          type="button"
          disabled={!selectedStore || !reasonCode || submitting}
          onClick={() => void handleConfirm()}
          className="h-[48px] rounded-[10px] bg-[#CC0000] hover:bg-[#DD0000] disabled:opacity-40 font-ui text-[16px] font-semibold text-white transition-colors"
        >
          {submitting ? 'Reassigning...' : 'Confirm Reassign'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-[44px] rounded-[10px] border border-[#3A3A3A] font-ui text-[15px] font-medium text-white hover:bg-[#1A1A1A] transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}

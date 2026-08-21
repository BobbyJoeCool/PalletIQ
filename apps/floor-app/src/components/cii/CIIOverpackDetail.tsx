import { useState } from 'react';
import { DataRow } from '../shared/DataRow';
import { StatusBadge } from '../shared/StatusBadge';
import type { CIIContainerData } from '../../context/CIIContext';
import { CIIOverpackActionModal } from './CIIOverpackActionModal';

type OverpackData = Extract<CIIContainerData, { type: '92' }>;

interface Props {
  data: OverpackData;
  isIM: boolean;
  token: string;
  onRefresh: () => void;
  onNavigateContainer: (cid: string) => void;
}

export function CIIOverpackDetail({ data, isIM, token, onRefresh, onNavigateContainer }: Props) {
  const [action, setAction] = useState<'FORCE_CLOSE' | 'REOPEN' | null>(null);

  const displayStatus = data.purged ? 'PURGED' : data.open ? 'OPEN' : 'CLOSED';
  const canForceClose = isIM && data.open && !data.purged;
  const canReopen = isIM && !data.open && !data.purged;

  const daysOpen = data.open && !data.purged
    ? Math.floor((Date.now() - new Date(data.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const openWarning = daysOpen !== null && daysOpen > 3;

  return (
    <div className="flex flex-col gap-1">
      <DataRow label="Status"><StatusBadge status={displayStatus} /></DataRow>
      {daysOpen !== null && (
        <DataRow label="Open Duration">
          <span className={`font-semibold ${openWarning ? 'text-[#FF6633]' : 'text-white'}`}>
            Opened {daysOpen} {daysOpen === 1 ? 'day' : 'days'} ago
          </span>
        </DataRow>
      )}
      <DataRow label="Destination">{data.destinationStore.name} (#{data.destinationStore.id})</DataRow>
      <DataRow label="Created">{new Date(data.createdAt).toLocaleString()}</DataRow>
      <DataRow label="Purge Date">{new Date(data.purgeDate).toLocaleDateString()}</DataRow>
      {data.closedAt && <DataRow label="Closed At">{new Date(data.closedAt).toLocaleString()}</DataRow>}
      {data.closedByZ && <DataRow label="Closed By">{data.closedByZ}</DataRow>}
      {data.purgedAt && <DataRow label="Purged At">{new Date(data.purgedAt).toLocaleString()}</DataRow>}

      <div className="mt-3">
        <h3 className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider mb-2">
          Contents ({data.contents.length})
        </h3>
        {data.contents.length === 0 && <p className="font-ui text-[14px] text-[#666]">No items packed</p>}
        <div className="flex flex-col gap-1">
          {data.contents.map((c) => (
            <div key={c.childCid} className="flex items-center gap-3 py-1.5 border-b border-[#1A1A1A]">
              <button type="button" onClick={() => onNavigateContainer(c.childCid)} className="font-data text-[18px] text-[#4499FF] underline">{c.childCid}</button>
              <span className="font-ui text-[13px] text-[#9A9A9A]">{c.childType}</span>
            </div>
          ))}
        </div>
      </div>

      {(canForceClose || canReopen) && (
        <div className="mt-4 flex gap-3">
          {canForceClose && (
            <button
              type="button"
              onClick={() => setAction('FORCE_CLOSE')}
              className="h-[48px] px-6 rounded-[10px] bg-[#664400] hover:bg-[#885500] font-ui text-[16px] font-semibold text-white transition-colors"
            >
              Force Close
            </button>
          )}
          {canReopen && (
            <button
              type="button"
              onClick={() => setAction('REOPEN')}
              className="h-[48px] px-6 rounded-[10px] bg-[#003366] hover:bg-[#004488] font-ui text-[16px] font-semibold text-white transition-colors"
            >
              Reopen
            </button>
          )}
        </div>
      )}

      {action && (
        <CIIOverpackActionModal
          cid={data.cid}
          action={action}
          token={token}
          onClose={() => setAction(null)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}

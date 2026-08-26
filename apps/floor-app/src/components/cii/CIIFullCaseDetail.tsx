import { useState } from 'react';
import { DataRow } from '../shared/DataRow';
import { StatusBadge } from '../shared/StatusBadge';
import type { CIIContainerData } from '../../context/CIIContext';
import { CIICancelModal } from './CIICancelModal';

type FullCaseData = Extract<CIIContainerData, { type: '91' }>;

interface Props {
  data: FullCaseData;
  isIM: boolean;
  token: string;
  onRefresh: () => void;
  onNavigatePallet: (pid: number) => void;
  onNavigateItem: (dept: number, cls: number, item: number) => void;
  onNavigateLocation: (aisle: number, bin: number, level: number) => void;
  onNavigatePRQ: () => void;
}

export function CIIFullCaseDetail({ data, isIM, token, onRefresh, onNavigatePallet, onNavigateItem, onNavigateLocation, onNavigatePRQ }: Props) {
  const [showCancel, setShowCancel] = useState(false);
  const canCancel = isIM && ['AVAILABLE', 'VERIFIED'].includes(data.status);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-6">
        <div className="flex-1 flex flex-col gap-1">
          <DataRow label="Status"><StatusBadge status={data.status} /></DataRow>
          <DataRow label="Pull Function"><span className="text-white">{data.pullFunction}</span></DataRow>
          <DataRow label="DPCI">
            <button type="button" onClick={() => onNavigateItem(data.deptClassItem!.dept, data.deptClassItem!.class, data.deptClassItem!.item)} className="text-[#4499FF] underline">{data.dpci}</button>
          </DataRow>
          <DataRow label="Item">{data.itemDesc}</DataRow>
          <DataRow label="Storage Code">{data.storageCode}</DataRow>
          <DataRow label="Qty: Cartons">{data.quantity.cartons}</DataRow>
          <DataRow label="Qty: SSPs">{data.quantity.ssps}</DataRow>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <DataRow label="Batch Date">{data.batchDate ?? '—'}</DataRow>
          <DataRow label="Purge Date">{data.purgeDate ? new Date(data.purgeDate).toLocaleDateString() : '—'}</DataRow>
          <DataRow label="Destination">{data.destinationStore.name} (#{data.destinationStore.id})</DataRow>
          <DataRow label="Pallet ID">
            <button type="button" onClick={() => onNavigatePallet(data.pallet.pid)} className="text-[#4499FF] underline">{data.pallet.pid}</button>
          </DataRow>
          <DataRow label="Pallet Status"><StatusBadge status={data.pallet.status} /></DataRow>
          {data.location && (
            <DataRow label="Location">
              <button type="button" onClick={() => onNavigateLocation(data.location!.aisle, data.location!.bin, data.location!.level)} className="text-[#4499FF] underline">
                {String(data.location.aisle).padStart(3, '0')}-{String(data.location.bin).padStart(3, '0')}-{String(data.location.level).padStart(2, '0')}
              </button>
            </DataRow>
          )}
          <DataRow label="Pull Request">
            <button type="button" onClick={onNavigatePRQ} className="text-[#4499FF] underline">View in PRQ</button>
          </DataRow>
        </div>
      </div>

      {canCancel && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="h-[48px] px-6 rounded-[10px] bg-[#660000] hover:bg-[#880000] font-ui text-[16px] font-semibold text-white transition-colors"
          >
            Cancel Container
          </button>
        </div>
      )}

      {showCancel && (
        <CIICancelModal
          cid={data.cid}
          typeLabel="Full Case"
          token={token}
          onClose={() => setShowCancel(false)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}

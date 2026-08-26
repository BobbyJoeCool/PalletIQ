import { useState } from 'react';
import { DataRow } from '../shared/DataRow';
import { StatusBadge } from '../shared/StatusBadge';
import type { CIIContainerData } from '../../context/CIIContext';
import { CIICancelModal } from './CIICancelModal';

type SSPMasterData = Extract<CIIContainerData, { type: '93' }>;

interface Props {
  data: SSPMasterData;
  isIM: boolean;
  token: string;
  onRefresh: () => void;
  onNavigatePallet: (pid: number) => void;
  onNavigateItem: (dept: number, cls: number, item: number) => void;
  onNavigateLocation: (aisle: number, bin: number, level: number) => void;
  onNavigateContainer: (cid: string) => void;
}

export function CIISSPMasterDetail({ data, isIM, token, onRefresh, onNavigatePallet, onNavigateItem, onNavigateLocation, onNavigateContainer }: Props) {
  const [showCancel, setShowCancel] = useState(false);
  const canCancel = isIM && data.status !== 'PACKED' && data.status !== 'CANCELED' && data.status !== 'PURGED';

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
        </div>
      </div>

      <div className="mt-3">
        <h3 className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider mb-2">
          SSP Units ({data.children.length})
        </h3>
        {data.children.length === 0 && <p className="font-ui text-[14px] text-[#666]">No units created</p>}
        <div className="flex flex-col gap-1">
          {data.children.map((c) => (
            <div key={c.cid} className="flex items-center gap-3 py-1.5 border-b border-[#1A1A1A]">
              <button type="button" onClick={() => onNavigateContainer(c.cid)} className="font-data text-[18px] text-[#4499FF] underline">{c.cid}</button>
              <StatusBadge status={c.status} />
              <span className="font-ui text-[13px] text-[#9A9A9A]">Qty: {c.actualEachQty}</span>
            </div>
          ))}
        </div>
      </div>

      {canCancel && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="h-[48px] px-6 rounded-[10px] bg-[#660000] hover:bg-[#880000] font-ui text-[16px] font-semibold text-white transition-colors"
          >
            Cancel Container (Cascade)
          </button>
        </div>
      )}

      {showCancel && (
        <CIICancelModal
          cid={data.cid}
          typeLabel="SSP Pull Master"
          cascade={data.children.filter((c) => c.status === 'PENDING').length}
          token={token}
          onClose={() => setShowCancel(false)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}

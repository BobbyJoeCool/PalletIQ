import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ContainerIdField, type ContainerIdFieldHandle } from '../components/shared/ContainerIdField';
import { StatusBadge } from '../components/shared/StatusBadge';

import { useAuth } from '../context/AuthContext';
import { useCII, type CIIContainerData } from '../context/CIIContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { CID_TYPE_LABELS, type CidTypeCode } from '@shared/index';
import { CIIEventLog } from '../components/cii/CIIEventLog';
import { CIIFullCaseDetail } from '../components/cii/CIIFullCaseDetail';
import { CIIOverpackDetail } from '../components/cii/CIIOverpackDetail';
import { CIISSPMasterDetail } from '../components/cii/CIISSPMasterDetail';
import { CIISSPUnitDetail } from '../components/cii/CIISSPUnitDetail';
import { CIIStrayEachDetail } from '../components/cii/CIIStrayEachDetail';

export function CIIPage() {
  const { token, user } = useAuth();
  const { setMessage, clearMessage } = useMessageBar();
  const { hidePanel } = useNumpad();
  const navigate = useNavigate();
  const { data, setData } = useCII();
  const [cidValue, setCidValue] = useState(data?.cid ?? '');
  const [loading, setLoading] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const cidFieldRef = useRef<ContainerIdFieldHandle>(null);
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');

  const lookup = useCallback(async (canonical: string, _type: CidTypeCode) => {
    hidePanel();
    clearMessage();
    setLoading(true);
    setInvalid(false);
    try {
      const result = await apiFetch<CIIContainerData>(`/api/containers/inquiry/${canonical}`, token!);
      setData(result);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Container not found' });
      setData(null);
      setInvalid(true);
    } finally {
      setLoading(false);
    }
  }, [token, hidePanel, clearMessage, setMessage, setData]);

  function handleCidChange(v: string) {
    setCidValue(v);
    if (!v) {
      setInvalid(false);
      clearMessage();
    }
  }

  function navigateToPallet(pid: number) {
    navigate(`/pallet?pid=${pid}`);
  }

  function navigateToItem(dept: number, cls: number, item: number) {
    navigate(`/item?dpci=${String(dept).padStart(3, '0')}${String(cls).padStart(2, '0')}${String(item).padStart(4, '0')}`);
  }

  function navigateToLocation(aisle: number, bin: number, level: number) {
    navigate(`/location?loc=${String(aisle).padStart(3, '0')}${String(bin).padStart(3, '0')}${String(level).padStart(2, '0')}`);
  }

  function navigateToContainer(cid: string) {
    setCidValue(cid);
    void lookup(cid, cid.slice(0, 2) as CidTypeCode);
  }

  function navigateToPRQ() {
    navigate('/reporting/pull-request');
  }

  function renderDetail() {
    if (!data) return null;
    const props = { data, isIM, token: token!, onRefresh: () => void lookup(data.cid, data.type as CidTypeCode) };
    switch (data.type) {
      case '91': return <CIIFullCaseDetail {...props} data={data} onNavigatePallet={navigateToPallet} onNavigateItem={navigateToItem} onNavigateLocation={navigateToLocation} onNavigatePRQ={navigateToPRQ} />;
      case '92': return <CIIOverpackDetail {...props} data={data} onNavigateContainer={navigateToContainer} />;
      case '93': return <CIISSPMasterDetail {...props} data={data} onNavigatePallet={navigateToPallet} onNavigateItem={navigateToItem} onNavigateLocation={navigateToLocation} onNavigateContainer={navigateToContainer} />;
      case '94': return <CIISSPUnitDetail data={data} onNavigateContainer={navigateToContainer} onNavigateItem={navigateToItem} />;
      case '95': return <CIIStrayEachDetail {...props} data={data} onNavigateItem={navigateToItem} />;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header — CID entry */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#1A1A1A]">
        <ContainerIdField
          ref={cidFieldRef}
          value={cidValue}
          onChange={handleCidChange}
          onLookup={lookup}
          invalid={invalid}
          demoScanner
        />
        {data && (
          <div className="flex items-center gap-3">
            <span className="font-ui text-[14px] text-[#9A9A9A] uppercase tracking-wider">
              {CID_TYPE_LABELS[data.type as CidTypeCode]}
            </span>
            <StatusBadge status={data.status} />
          </div>
        )}
        {loading && <span className="font-ui text-[14px] text-[#666]">Loading...</span>}
      </div>

      {/* Body — two column layout */}
      {data && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: type-specific detail */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {renderDetail()}
          </div>

          {/* Right: event log */}
          <div className="w-[380px] border-l border-[#1A1A1A] overflow-y-auto px-4 py-4">
            <CIIEventLog cid={data.cid} token={token!} onNavigateContainer={navigateToContainer} />
          </div>
        </div>
      )}

      {!data && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-ui text-[18px] text-[#666]">Scan or enter a Container ID</p>
        </div>
      )}
    </div>
  );
}

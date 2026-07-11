import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';
import { useNumpadField } from '../lib/useNumpadField';

interface ReinstateResult { palletId: number; status: 'PUT_PENDING' | 'STORED'; locationId: string | null }
interface SampleReinstate { dpci: string; vcp: number; ssp: number; pallets: number; cartons: number; ssps: number }

/** Labeled input display box; `highlight` renders a red border to flag a field the server rejected. */
function FieldDisplay({
  label, value, onFocus, active = false, highlight = false, width = 'w-[200px]',
}: { label: string; value: string; onFocus: () => void; active?: boolean; highlight?: boolean; width?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${width}`}>
      <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">{label}</span>
      <button
        type="button"
        onClick={onFocus}
        className={`flex items-center h-[64px] px-4 rounded-[12px] bg-[#0D0D0D] border-2 transition-colors ${
          highlight || active ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'
        }`}
      >
        <span className="font-data text-[24px] font-medium text-white">
          {value || <span className="text-[#444]">—</span>}
        </span>
        {active && <span className="inline-block w-[2px] h-[24px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
      </button>
    </div>
  );
}

/**
 * PAR — Pallet Reinstate. IM+ only (Worker sees access denied). Creates a new pallet
 * record from scratch for physical inventory with no system record. See
 * DevNotes/Screen-Specs/PAR.md.
 */
export function PARPage() {
  const { token, user } = useAuth();
  const { setMessage } = useMessageBar();
  const { hidePanel } = useNumpad();
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');

  const dpciField = useNumpadField('keyboard');
  const vcpField = useNumpadField();
  const sspField = useNumpadField();
  const palletsField = useNumpadField();
  const cartonsField = useNumpadField();
  const sspsQtyField = useNumpadField();
  const locationField = useNumpadField();

  const [locationHighlight, setLocationHighlight] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /** Registers the DPCI field's keyboard handler; on confirm, validates format and confirms the DPCI exists via the API (no pre-fill — Item has no vcp/ssp). */
  const focusDpci = useCallback(() => {
    dpciField.focus(async (v) => {
      const trimmed = v.trim().toUpperCase();
      dpciField.set(trimmed);
      hidePanel();
      const digits = trimmed.replace(/-/g, '');
      if (!/^\d{9}$/.test(digits)) return;
      try {
        // Item model has no vcp/ssp (see IIDPage.tsx's note) — nothing to pre-fill from
        // the item lookup itself; this call only confirms the DPCI exists ahead of submit.
        await apiFetch(`/api/items/dpci/${digits}`, token!);
      } catch {
        playAlert('error');
        setMessage({ type: 'error', text: 'DPCI not found' });
      }
    });
  }, [dpciField, hidePanel, token, setMessage]);

  /** Registers the VCP field's numpad handler. */
  const focusVcp = useCallback(() => vcpField.focus((v) => { vcpField.set(v.trim()); hidePanel(); }), [vcpField, hidePanel]);
  /** Registers the SSP field's numpad handler. */
  const focusSsp = useCallback(() => sspField.focus((v) => { sspField.set(v.trim()); hidePanel(); }), [sspField, hidePanel]);
  /** Registers the Pallets quantity field's numpad handler. */
  const focusPallets = useCallback(() => palletsField.focus((v) => { palletsField.set(v.trim()); hidePanel(); }), [palletsField, hidePanel]);
  /** Registers the Cartons quantity field's numpad handler. */
  const focusCartons = useCallback(() => cartonsField.focus((v) => { cartonsField.set(v.trim()); hidePanel(); }), [cartonsField, hidePanel]);
  /** Registers the SSPs quantity field's numpad handler. */
  const focusSspsQty = useCallback(() => sspsQtyField.focus((v) => { sspsQtyField.set(v.trim()); hidePanel(); }), [sspsQtyField, hidePanel]);
  /** Registers the optional Location field's numpad handler; clears any prior "not empty" highlight on confirm. */
  const focusLocation = useCallback(() => {
    locationField.focus((v) => { locationField.set(v.trim()); setLocationHighlight(false); hidePanel(); });
  }, [locationField, hidePanel]);

  const dpciDigits = dpciField.value.replace(/-/g, '');
  const canSubmit =
    /^\d{9}$/.test(dpciDigits) &&
    vcpField.value.trim() !== '' &&
    sspField.value.trim() !== '' &&
    palletsField.value.trim() !== '' &&
    cartonsField.value.trim() !== '' &&
    sspsQtyField.value.trim() !== '';

  /** Resets every field on the form and clears the location "not empty" highlight. */
  function clearForm() {
    dpciField.clear();
    vcpField.clear();
    sspField.clear();
    palletsField.clear();
    cartonsField.clear();
    sspsQtyField.clear();
    locationField.clear();
    setLocationHighlight(false);
  }

  /** Submits the new pallet via POST /api/pallets/reinstate; highlights the location field if the server reports it's not empty. */
  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setLocationHighlight(false);
    try {
      const result = await apiFetch<ReinstateResult>('/api/pallets/reinstate', token!, {
        method: 'POST',
        body: JSON.stringify({
          dpci: dpciDigits,
          vcp: parseInt(vcpField.value, 10),
          ssp: parseInt(sspField.value, 10),
          pallets: parseInt(palletsField.value, 10),
          cartons: parseInt(cartonsField.value, 10),
          ssps: parseInt(sspsQtyField.value, 10),
          locationId: locationField.value.trim() || null,
        }),
      });

      playAlert('info');
      const text = result.locationId
        ? `Pallet ${result.palletId} created — stored at ${fmtLocation(result.locationId)}`
        : `Pallet ${result.palletId} created — PUT_PENDING`;
      setMessage({ type: 'success', text });
      clearForm();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      playAlert('error');
      if (code === 'DPCI_NOT_FOUND') {
        setMessage({ type: 'error', text: 'DPCI not found' });
      } else if (code === 'LOCATION_NOT_FOUND') {
        setMessage({ type: 'error', text: 'Location not found' });
      } else if (code === 'LOCATION_NOT_EMPTY') {
        setLocationHighlight(true);
        setMessage({ type: 'error', text: `Location ${fmtLocation(locationField.value.trim())} is not empty — must be EMPTY to reinstate here` });
      } else {
        setMessage({ type: 'error', text: 'Create failed — please try again' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Fetches a randomized sample reinstate payload from the API for the demo buttons to fill in. */
  const fillSample = useCallback(async (): Promise<SampleReinstate | null> => {
    try {
      return await apiFetch<SampleReinstate>('/api/pallets/sample-reinstate', token!);
    } catch {
      setMessage({ type: 'error', text: 'Demo fill unavailable' });
      return null;
    }
  }, [token, setMessage]);

  /** Fills the form with a sample pallet, leaving Location blank (PUT_PENDING outcome). */
  const demoCreate = useCallback(async () => {
    const sample = await fillSample();
    if (!sample) return;
    dpciField.set(sample.dpci);
    vcpField.set(String(sample.vcp));
    sspField.set(String(sample.ssp));
    palletsField.set(String(sample.pallets));
    cartonsField.set(String(sample.cartons));
    sspsQtyField.set(String(sample.ssps));
    locationField.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillSample]);

  /** Fills the form with a sample pallet and a real empty location, simulating a successful direct-to-location create. */
  const demoToLocation = useCallback(async () => {
    const sample = await fillSample();
    if (!sample) return;
    try {
      // locationId is only aisle+bin (6 digits) — level comes back as its own field (see
      // api/functions/samples.ts's sampleLocation) and must be appended to form the full
      // 8-digit barcode the Location field/submit expect, or parseFullLocationBarcode
      // rejects it as malformed (issue #70 — this used to leave Level off entirely).
      const { locationId, level } = await apiFetch<{ locationId: string; level: number }>('/api/demo/location?status=empty', token!);
      dpciField.set(sample.dpci);
      vcpField.set(String(sample.vcp));
      sspField.set(String(sample.ssp));
      palletsField.set(String(sample.pallets));
      cartonsField.set(String(sample.cartons));
      sspsQtyField.set(String(sample.ssps));
      locationField.set(locationId + String(level).padStart(2, '0'));
    } catch {
      setMessage({ type: 'error', text: 'Demo fill unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillSample, token]);

  /** Fills the form with a DPCI that doesn't exist, simulating a rejected create. */
  const demoBadDpci = useCallback(() => {
    dpciField.set('999999000');
    vcpField.set('12');
    sspField.set('12');
    palletsField.set('1');
    cartonsField.set('12');
    sspsQtyField.set('0');
    locationField.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fills the form with a sample pallet and a real occupied location, simulating a "not empty" rejection. */
  const demoBadLocation = useCallback(async () => {
    const sample = await fillSample();
    if (!sample) return;
    try {
      // See demoToLocation's comment above — level must be appended to form the full
      // 8-digit barcode (issue #70).
      const { locationId, level } = await apiFetch<{ locationId: string; level: number }>('/api/demo/location?status=occupied', token!);
      dpciField.set(sample.dpci);
      vcpField.set(String(sample.vcp));
      sspField.set(String(sample.ssp));
      palletsField.set(String(sample.pallets));
      cartonsField.set(String(sample.cartons));
      sspsQtyField.set(String(sample.ssps));
      locationField.set(locationId + String(level).padStart(2, '0'));
    } catch {
      setMessage({ type: 'error', text: 'Demo fill unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillSample, token]);

  /** Footer demo-button slot content: create, create-to-location, bad DPCI, and bad location triggers. */
  const demoSlot = useMemo(() => (
    <>
      <button type="button" onClick={demoCreate} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors">
        ✓ Create
      </button>
      <button type="button" onClick={demoToLocation} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors">
        ✓ To Location
      </button>
      <button type="button" onClick={demoBadDpci} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors">
        ✗ Bad DPCI
      </button>
      <button type="button" onClick={demoBadLocation} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#554400] hover:bg-[#665500] text-white transition-colors">
        ✗ Bad Location
      </button>
    </>
  ), [demoCreate, demoToLocation, demoBadDpci, demoBadLocation]);

  useDemoSlot(isIM ? demoSlot : null);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!isIM) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 select-none">
        <h2 className="font-ui text-[26px] font-semibold text-white">Access Denied</h2>
        <p className="font-ui text-[17px] text-[#555]">Pallet Reinstate requires Inventory Manager or higher.</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-5 select-none overflow-y-auto">
      <div className="flex flex-wrap gap-4">
        <FieldDisplay label="DPCI" value={dpciField.value} onFocus={focusDpci} active={dpciField.isActive} width="w-[240px]" />
        <FieldDisplay label="VCP" value={vcpField.value} onFocus={focusVcp} active={vcpField.isActive} width="w-[140px]" />
        <FieldDisplay label="SSP" value={sspField.value} onFocus={focusSsp} active={sspField.isActive} width="w-[140px]" />
      </div>
      <div className="flex flex-wrap gap-4">
        <FieldDisplay label="Pallets" value={palletsField.value} onFocus={focusPallets} active={palletsField.isActive} width="w-[160px]" />
        <FieldDisplay label="Cartons per Pallet" value={cartonsField.value} onFocus={focusCartons} active={cartonsField.isActive} width="w-[220px]" />
        <FieldDisplay label="SSPs" value={sspsQtyField.value} onFocus={focusSspsQty} active={sspsQtyField.isActive} width="w-[160px]" />
      </div>
      <FieldDisplay
        label="Location (optional)"
        value={locationField.value}
        onFocus={focusLocation}
        active={locationField.isActive}
        highlight={locationHighlight}
        width="w-[240px]"
      />

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit || submitting}
        className="w-[240px] h-[64px] mt-2 rounded-[12px] font-ui text-[18px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40 transition-colors"
      >
        Create Pallet
      </button>
    </div>
  );
}

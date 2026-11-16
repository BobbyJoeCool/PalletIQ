import { useState } from 'react';
import { reasonListFor } from '@shared/workforce';
import { functionLabel } from '../../lib/rosterFormat';
import { RosterDialog } from './RosterDialog';
import { workIsComplete } from '../../lib/rosterWork';
import type { Work } from '../../lib/rosterWork';
import { WorkPicker } from './WorkPicker';

interface ReasonDialogProps {
  /** DTM or OFF. */
  functionCode: string;
  count: number;
  onConfirm: (work: Work) => void;
  onCancel: () => void;
}

/** Asks for the reason before Downtime or Time Off is bulk-assigned (#145). */
export function ReasonDialog({ functionCode, count, onConfirm, onCancel }: ReasonDialogProps) {
  const [work, setWork] = useState<Work>({ functionCode, reasonCode: null, reasonText: null });
  const reasons = reasonListFor(functionCode);

  return (
    <RosterDialog
      title={`${functionLabel(functionCode)} for ${count} ${count === 1 ? 'person' : 'people'}`}
      confirmLabel="Next"
      confirmDisabled={!reasons || !workIsComplete(work)}
      onConfirm={() => onConfirm({ ...work, reasonText: work.reasonText?.trim() || null })}
      onCancel={onCancel}
    >
      <WorkPicker
        label="Bulk"
        functionCodes={[]}
        value={work}
        onChange={(w) => setWork({ ...w, functionCode })}
      />
    </RosterDialog>
  );
}

import type { StackState } from '../context/StagingContext';

/**
 * Resolves a stack's *effective* Aisle/StorageCode/Size — Master Control's current value
 * for any field not overridden, the stack's own stored value for any field that is (issue
 * #99). This is what every consumer of a stack's Aisle/Storage/Size should read instead of
 * the raw `StackState` fields directly, since a non-overridden field's raw value is unused/
 * stale (cleared whenever its override toggles off — see StackBox in STGPage.tsx). Kept in
 * its own file (not StagingContext.tsx) since that file only exports the provider
 * component and its `useStaging` hook — a plain function export there breaks Fast Refresh.
 */
export function effectiveStack(
  stack: StackState,
  master: { aisle: string; storageCode: string; size: string },
): { aisle: string; storageCode: string; size: string } {
  return {
    aisle: stack.aisleOverride ? stack.aisle : master.aisle,
    storageCode: stack.storageCodeOverride ? stack.storageCode : master.storageCode,
    size: stack.sizeOverride ? stack.size : master.size,
  };
}

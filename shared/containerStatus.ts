// Container status vocabulary and rules (#213) — one typed definition of "open", of what
// can be canceled, and of how the user-facing "Verified" label maps onto stored statuses.
// Previously "open" was defined four different ways across the API, two of them using
// statuses no code ever writes (VERIFIED, PACKED-on-a-full-case).

/** Every status a `Container` row can hold. PARTIALLY_PACKED/PACKED are SSP Pull Master
 *  only (Breakpack-Workflow.md). There is no stored VERIFIED status — see VERIFIED_STATUS. */
export type ContainerStatus =
  | 'AVAILABLE'        // in the system, not yet printed
  | 'PRINTED'          // label printed, waiting to be pulled
  | 'PULLED'           // physically pulled (shown to workers as "Verified")
  | 'PARTIALLY_PACKED' // SSP master: some child SSP units packed
  | 'PACKED'           // SSP master: every child SSP unit packed
  | 'DIVERTED'
  | 'CANCELED'
  | 'PURGED';

export const CONTAINER_STATUSES: readonly ContainerStatus[] = [
  'AVAILABLE', 'PRINTED', 'PULLED', 'PARTIALLY_PACKED', 'PACKED', 'DIVERTED', 'CANCELED', 'PURGED',
];

/** Type guard for a status read from the untyped `Container.status` column. */
export function isContainerStatus(value: unknown): value is ContainerStatus {
  return typeof value === 'string' && (CONTAINER_STATUSES as readonly string[]).includes(value);
}

/**
 * A container is "open" against its pallet until it is pulled: AVAILABLE or PRINTED. While
 * a pallet has any open container it stays CA_PULL_PEND/FP_PULL_PEND (and can't be moved).
 */
export const OPEN_CONTAINER_STATUSES: readonly ContainerStatus[] = ['AVAILABLE', 'PRINTED'];

export function isOpenContainer(status: string): boolean {
  return (OPEN_CONTAINER_STATUSES as readonly string[]).includes(status);
}

/**
 * The user-facing "Verified" (pulled by a puller — PRQ.md / CII spec) is stored as PULLED.
 * Direct instruction 2026-11-15: keep PULLED as the stored status; "Verified" is a label.
 */
export const VERIFIED_STATUS: ContainerStatus = 'PULLED';

/** PRQ's three lookup filters (UI value → stored status). */
export const PRQ_STATUS_FILTERS = {
  AVAILABLE: 'AVAILABLE',
  PRINTED: 'PRINTED',
  VERIFIED: VERIFIED_STATUS,
} as const satisfies Record<string, ContainerStatus>;

export type PrqStatusFilter = keyof typeof PRQ_STATUS_FILTERS;

/** Full-case (type 91) cancel eligibility: not yet printed (AVAILABLE), or verified-pulled
 *  but not yet diverted (PULLED). */
export function canCancelFullCase(status: string): boolean {
  return status === 'AVAILABLE' || status === VERIFIED_STATUS;
}

/** SSP Pull Master (type 93) cancel eligibility: anything not fully packed or already closed. */
export function canCancelSspMaster(status: string): boolean {
  return status !== 'PACKED' && status !== 'CANCELED' && status !== 'PURGED';
}

/** Worker-facing label for a container status: PULLED reads "VERIFIED" (direct instruction
 *  2026-11-15 — keep the "Verified" wording workers know); everything else is unchanged. */
export function containerStatusLabel(status: string): string {
  return status === VERIFIED_STATUS ? 'VERIFIED' : status;
}

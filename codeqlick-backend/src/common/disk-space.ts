import { statfs } from 'node:fs/promises';

/** The disk guard's states (architecture 4.13 "Disk guard (one server)", decision 49). */
export type DiskState = 'ok' | 'low' | 'full';

export interface DiskFloors {
  /** Under this many free bytes the disk is low. */
  lowBytes: number;
  /** Under this many free bytes the disk is full. */
  minBytes: number;
}

export interface DiskReading extends DiskFloors {
  state: DiskState;
  totalBytes: number;
  freeBytes: number;
}

/** The state of a disk with `free` bytes left, against the guard's floors. */
export function diskState(free: number, floors: DiskFloors): DiskState {
  if (free < floors.minBytes) return 'full';
  if (free < floors.lowBytes) return 'low';
  return 'ok';
}

/**
 * Reads the free space of the disk holding `path` against the floors. Shared by Cloud's disk guard
 * and by everything else that must not fill the single server.
 */
export async function readDiskSpace(path: string, floors: DiskFloors): Promise<DiskReading> {
  const stats = await statfs(path);
  const freeBytes = stats.bavail * stats.bsize;
  return {
    state: diskState(freeBytes, floors),
    totalBytes: stats.blocks * stats.bsize,
    freeBytes,
    ...floors,
  };
}

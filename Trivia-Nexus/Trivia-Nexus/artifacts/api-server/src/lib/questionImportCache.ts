import type { ValidatedQuestion } from "./questionImport";

export interface PendingImport {
  adminId: string;
  createdAt: number;
  validRows: ValidatedQuestion[];
  subjectsToCreate: string[];
  subcategoriesToCreate: Array<{ subject: string; subcategory: string }>;
}

const IMPORT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const pendingImports = new Map<string, PendingImport>();

function evictExpired(): void {
  const now = Date.now();
  for (const [id, imp] of pendingImports) {
    if (now - imp.createdAt > IMPORT_TTL_MS) pendingImports.delete(id);
  }
}

export function savePendingImport(id: string, data: PendingImport): void {
  evictExpired();
  pendingImports.set(id, data);
}

export function getPendingImport(id: string): PendingImport | undefined {
  evictExpired();
  return pendingImports.get(id);
}

export function deletePendingImport(id: string): void {
  pendingImports.delete(id);
}

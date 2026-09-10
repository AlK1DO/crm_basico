/**
 * DatasetContext.tsx
 *
 * Contexto central para gestión de datasets.
 * Expone todos los métodos del hook useDatasets más filtrado por permisos.
 */

import React, { createContext, useContext } from 'react';
import { useDatasets } from '../hooks/useDatasets';
import type { Dataset } from '../types';

// ─── Tipo del contexto ────────────────────────────────────────────────────────

interface DatasetContextValue {
  datasets: Dataset[];
  loading: boolean;
  activeDataset: Dataset | null;
  activeDatasetId: string | null;
  setActiveDatasetId: (id: string | null) => void;
  /** Agrega un único archivo y retorna el resultado (éxito o tipo de error). */
  addDataset: ReturnType<typeof useDatasets>['addDataset'];
  /** Compatibilidad con código anterior — carga varios archivos. */
  addDatasets: ReturnType<typeof useDatasets>['addDatasets'];
  removeDataset: (id: string) => void;
  clearAll: () => void;
  /** Persiste el resultado de limpieza en el dataset correspondiente. */
  saveCleanedData: (
    datasetId: string,
    cleanRows: Record<string, string>[],
    report: unknown,
  ) => void;
  /** Filtra los datasets visibles según los IDs autorizados del perfil del usuario. */
  getAuthorizedDatasets: (authorizedIds: string[]) => Dataset[];
}

// ─── Context ──────────────────────────────────────────────────────────────────

const DatasetContext = createContext<DatasetContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const value = useDatasets();
  return (
    <DatasetContext.Provider value={value}>
      {children}
    </DatasetContext.Provider>
  );
}

// ─── Hook de acceso ───────────────────────────────────────────────────────────

export function useDatasetContext(): DatasetContextValue {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error('useDatasetContext debe usarse dentro de <DatasetProvider>');
  return ctx;
}

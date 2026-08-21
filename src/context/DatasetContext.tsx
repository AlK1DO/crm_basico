import React, { createContext, useContext } from 'react';
import { useDatasets, type Dataset } from '../hooks/useDatasets';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DatasetContextValue {
  datasets: Dataset[];
  loading: boolean;
  addDatasets: (files: FileList | File[]) => Promise<void>;
  removeDataset: (id: string) => void;
  clearAll: () => void;
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDatasetContext(): DatasetContextValue {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error('useDatasetContext debe usarse dentro de <DatasetProvider>');
  return ctx;
}

/**
 * useDatasets.ts
 *
 * Hook central para gestión de datasets.
 * Mejoras sobre la versión anterior:
 * - Deduplicación por hash SHA-256 del contenido (no por nombre).
 * - Detección automática de columnas con tipo semántico.
 * - Soporte para datos limpios (cleanRows) persistido junto al dataset.
 * - Dataset activo seleccionable.
 * - Filtrado de datasets por permisos (para analistas).
 */

import { useState, useCallback, useEffect } from 'react';
import Papa from 'papaparse';
import { detectColumns } from '../engine/columnDetector';
import { hashFile } from '../utils/hashUtils';
import type { Dataset, ColumnInfo } from '../types';

// Re-exportar Dataset para backward compat con código que importa desde aquí
export type { Dataset };

// ─── Serialización para localStorage ─────────────────────────────────────────

interface StoredDataset extends Omit<Dataset, 'uploadedAt'> {
  uploadedAt: string; // ISO string
}

const STORAGE_KEY = 'crm_datasets_v2';

function loadFromStorage(): Dataset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: StoredDataset[] = JSON.parse(raw);
    return parsed.map((d) => ({
      ...d,
      uploadedAt: new Date(d.uploadedAt),
      cleanRows: d.cleanRows ?? null,
      columnInfo: d.columnInfo ?? [],
    }));
  } catch {
    return [];
  }
}

function saveToStorage(datasets: Dataset[]): void {
  try {
    const serializable: StoredDataset[] = datasets.map((d) => ({
      ...d,
      uploadedAt: d.uploadedAt.toISOString(),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // localStorage lleno — no romper la app
    console.warn('[useDatasets] No se pudo guardar en localStorage (posiblemente lleno).');
  }
}

// ─── Resultado de carga de archivo ───────────────────────────────────────────

export interface AddDatasetResult {
  success: boolean;
  dataset?: Dataset;
  error?: 'duplicate_content' | 'duplicate_name_different_content' | 'parse_error' | 'not_csv';
  existingName?: string; // nombre del dataset existente con mismo contenido
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDatasets() {
  const [datasets, setDatasets] = useState<Dataset[]>(loadFromStorage);
  const [loading, setLoading] = useState(false);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);

  // Sincronizar con localStorage
  useEffect(() => {
    saveToStorage(datasets);
  }, [datasets]);

  // Dataset activo (null si no hay selección)
  const activeDataset = datasets.find((d) => d.id === activeDatasetId) ?? null;

  // ── Parsing ────────────────────────────────────────────────────────────────

  const parseFile = useCallback(
    async (file: File, existingDatasets: Dataset[]): Promise<AddDatasetResult> => {
      // Validar que sea CSV
      if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
        return { success: false, error: 'not_csv' };
      }

      // Calcular hash del contenido
      let contentHash: string;
      try {
        contentHash = await hashFile(file);
      } catch {
        contentHash = `fallback_${Date.now()}`;
      }

      // Verificar duplicado por contenido (independientemente del nombre)
      const duplicateByContent = existingDatasets.find((d) => d.contentHash === contentHash);
      if (duplicateByContent) {
        return {
          success: false,
          error: 'duplicate_content',
          existingName: duplicateByContent.name,
        };
      }

      // Parse CSV
      return new Promise((resolve) => {
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const columns = results.meta.fields ?? [];
            const rows = results.data;

            // Detectar tipos de columnas
            let columnInfo: ColumnInfo[] = [];
            try {
              columnInfo = detectColumns(columns, rows);
            } catch {
              columnInfo = [];
            }

            const dataset: Dataset = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: file.name,
              contentHash,
              columns,
              columnInfo,
              rowCount: rows.length,
              rows,
              cleanRows: null,
              isCleaned: false,
              uploadedAt: new Date(),
              size: formatFileSize(file.size),
            };

            resolve({ success: true, dataset });
          },
          error: () => resolve({ success: false, error: 'parse_error' }),
        });
      });
    },
    [],
  );

  // ── Agregar datasets ───────────────────────────────────────────────────────

  const addDataset = useCallback(
    async (file: File): Promise<AddDatasetResult> => {
      setLoading(true);
      try {
        // Leer datasets actuales para verificar duplicados
        const currentDatasets = loadFromStorage();
        const result = await parseFile(file, currentDatasets);
        if (result.success && result.dataset) {
          setDatasets((prev) => [...prev, result.dataset!]);
        }
        return result;
      } finally {
        setLoading(false);
      }
    },
    [parseFile],
  );

  /** Compatibilidad con código anterior que pasa FileList | File[]. */
  const addDatasets = useCallback(
    async (files: FileList | File[]): Promise<AddDatasetResult[]> => {
      setLoading(true);
      const results: AddDatasetResult[] = [];
      try {
        const fileArray = Array.from(files);
        // Procesar secuencialmente para que cada uno vea los anteriores
        for (const file of fileArray) {
          const currentDatasets = loadFromStorage();
          const result = await parseFile(file, currentDatasets);
          if (result.success && result.dataset) {
            // Actualizar estado y esperar para el próximo
            await new Promise<void>((res) => {
              setDatasets((prev) => {
                const updated = [...prev, result.dataset!];
                saveToStorage(updated);
                res();
                return updated;
              });
            });
          }
          results.push(result);
        }
        return results;
      } finally {
        setLoading(false);
      }
    },
    [parseFile],
  );

  // ── Eliminar ───────────────────────────────────────────────────────────────

  const removeDataset = useCallback((id: string) => {
    setDatasets((prev) => prev.filter((d) => d.id !== id));
    setActiveDatasetId((prev) => (prev === id ? null : prev));
  }, []);

  // ── Limpiar todo ───────────────────────────────────────────────────────────

  const clearAll = useCallback(() => {
    setDatasets([]);
    setActiveDatasetId(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // ── Persistir datos limpios ────────────────────────────────────────────────

  const saveCleanedData = useCallback(
    (datasetId: string, cleanRows: Record<string, string>[], report: unknown) => {
      setDatasets((prev) =>
        prev.map((d) =>
          d.id === datasetId
            ? { ...d, cleanRows, isCleaned: true }
            : d
        )
      );
      // report se almacena en el estado del módulo de limpieza
      void report;
    },
    [],
  );

  // ── Filtrar por permisos (para analistas) ──────────────────────────────────

  const getAuthorizedDatasets = useCallback(
    (authorizedIds: string[]): Dataset[] => {
      if (authorizedIds.length === 0) return datasets; // admin ve todos
      return datasets.filter((d) => authorizedIds.includes(d.id));
    },
    [datasets],
  );

  return {
    datasets,
    loading,
    activeDataset,
    activeDatasetId,
    setActiveDatasetId,
    addDataset,
    addDatasets,
    removeDataset,
    clearAll,
    saveCleanedData,
    getAuthorizedDatasets,
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

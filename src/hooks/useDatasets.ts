import { useState, useCallback, useEffect } from 'react';
import Papa from 'papaparse';

export interface Dataset {
  id: string;
  name: string;
  rows: Record<string, string>[];
  columns: string[];
  uploadedAt: Date;
  size: string;
}

// Forma serializable para localStorage (uploadedAt como string ISO)
interface StoredDataset extends Omit<Dataset, 'uploadedAt'> {
  uploadedAt: string;
}

const STORAGE_KEY = 'crm_datasets';

function loadFromStorage(): Dataset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: StoredDataset[] = JSON.parse(raw);
    return parsed.map((d) => ({ ...d, uploadedAt: new Date(d.uploadedAt) }));
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
    // Si localStorage está lleno (datasets muy grandes) no romper la app
  }
}

export function useDatasets() {
  const [datasets, setDatasets] = useState<Dataset[]>(loadFromStorage);
  const [loading, setLoading] = useState(false);

  // Sincroniza con localStorage cada vez que cambian los datasets
  useEffect(() => {
    saveToStorage(datasets);
  }, [datasets]);

  const parseFile = useCallback((file: File): Promise<Dataset> => {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const columns = results.meta.fields ?? [];
          const dataset: Dataset = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            rows: results.data,
            columns,
            uploadedAt: new Date(),
            size: formatFileSize(file.size),
          };
          resolve(dataset);
        },
        error: (err) => reject(err),
      });
    });
  }, []);

  const addDatasets = useCallback(
    async (files: FileList | File[]) => {
      setLoading(true);
      try {
        const fileArray = Array.from(files);
        const parsed = await Promise.all(fileArray.map(parseFile));
        setDatasets((prev) => [...prev, ...parsed]);
      } finally {
        setLoading(false);
      }
    },
    [parseFile]
  );

  const removeDataset = useCallback((id: string) => {
    setDatasets((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setDatasets([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { datasets, loading, addDatasets, removeDataset, clearAll };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

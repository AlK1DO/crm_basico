import { useState, useCallback } from 'react';
import Papa from 'papaparse';

export interface Dataset {
  id: string;
  name: string;
  rows: Record<string, string>[];
  columns: string[];
  uploadedAt: Date;
  size: string;
}

export function useDatasets() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);

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
        // Agregar al final sin borrar los anteriores
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

  const clearAll = useCallback(() => setDatasets([]), []);

  return { datasets, loading, addDatasets, removeDataset, clearAll };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

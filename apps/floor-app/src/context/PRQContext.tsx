import { createContext, useContext, useState } from 'react';

export type PRQLevel = 1 | 2 | 3;

export interface PRQFilters {
  aisleStart: string;
  aisleEnd: string;
  workstation: string;
  status: string;
  batchDate: number | null;
  pullFunction: string;
  drillAisle: number | null;
  binStart: string;
  binEnd: string;
  level: string;
}

const EMPTY_FILTERS: PRQFilters = {
  aisleStart: '',
  aisleEnd: '',
  workstation: '',
  status: '',
  batchDate: null,
  pullFunction: '',
  drillAisle: null,
  binStart: '',
  binEnd: '',
  level: '',
};

interface PRQContextValue {
  filters: PRQFilters;
  setFilters: React.Dispatch<React.SetStateAction<PRQFilters>>;
  currentLevel: PRQLevel;
  setCurrentLevel: (l: PRQLevel) => void;
  selectedIndex: number | null;
  setSelectedIndex: (i: number | null) => void;
}

const PRQCtx = createContext<PRQContextValue | null>(null);

export function PRQProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<PRQFilters>(EMPTY_FILTERS);
  const [currentLevel, setCurrentLevel] = useState<PRQLevel>(1);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  return (
    <PRQCtx.Provider value={{ filters, setFilters, currentLevel, setCurrentLevel, selectedIndex, setSelectedIndex }}>
      {children}
    </PRQCtx.Provider>
  );
}

export function usePRQ() {
  const ctx = useContext(PRQCtx);
  if (!ctx) throw new Error('usePRQ must be used within PRQProvider');
  return ctx;
}

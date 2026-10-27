'use client';

import React, { createContext, useContext, useReducer } from 'react';
import type { BoothAction, BoothState } from '@photovoks/shared-types';
import { boothReducer, initialBoothState } from './boothReducer';

interface BoothContextValue {
  state: BoothState;
  dispatch: React.Dispatch<BoothAction>;
}

const BoothContext = createContext<BoothContextValue | null>(null);

/**
 * Hook to access the booth context.
 * Throws if called outside of BoothProvider.
 */
export function useBoothContext(): BoothContextValue {
  const ctx = useContext(BoothContext);
  if (!ctx) {
    throw new Error('useBoothContext must be used within a BoothProvider');
  }
  return ctx;
}

interface BoothProviderProps {
  children: React.ReactNode;
}

/**
 * Provides the single booth state machine to all booth sub-routes.
 * Place this at the (booth) layout level so all steps share state.
 */
export function BoothProvider({ children }: BoothProviderProps) {
  const [state, dispatch] = useReducer(boothReducer, initialBoothState);

  return (
    <BoothContext.Provider value={{ state, dispatch }}>
      {children}
    </BoothContext.Provider>
  );
}

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AppData } from '@/lib/types';
import { addItem, updateItem, deleteItem } from '@/lib/store';
import {
  replaySteps,
  applyStep,
  computeSimulationDelta,
  genStepId,
  type SimulationStep,
} from '@/lib/simulation';

interface SimulationState {
  isSimulationMode: boolean;
  baseData: AppData | null;
  steps: SimulationStep[];
  simulatedData: AppData | null;
  delta: ReturnType<typeof computeSimulationDelta> | null;
}

type SimulationContextValue = SimulationState & {
  enterSimulation: (data: AppData) => void;
  enterSimulationWithSteps: (data: AppData, steps: SimulationStep[]) => void;
  exitSimulation: () => void;
  addStep: (step: SimulationStep) => void;
  undoStep: () => void;
  undoStepAtIndex: (index: number) => void;
  applyAll: () => Promise<void>;
  discard: () => void;
  setBaseData: (data: AppData) => void;
};

const initialState: SimulationState = {
  isSimulationMode: false,
  baseData: null,
  steps: [],
  simulatedData: null,
  delta: null,
};

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SimulationState>(initialState);

  const setBaseData = useCallback((data: AppData) => {
    setState((s) => ({
      ...s,
      baseData: data,
      steps: [],
      simulatedData: data,
      delta: null,
    }));
  }, []);

  const enterSimulation = useCallback((data: AppData) => {
    setState({
      isSimulationMode: true,
      baseData: data,
      steps: [],
      simulatedData: data,
      delta: null,
    });
  }, []);

  const enterSimulationWithSteps = useCallback((data: AppData, steps: SimulationStep[]) => {
    if (steps.length === 0) {
      enterSimulation(data);
      return;
    }
    const simulatedData = replaySteps(data, steps);
    const delta = computeSimulationDelta(data, simulatedData);
    setState({
      isSimulationMode: true,
      baseData: data,
      steps,
      simulatedData,
      delta,
    });
  }, [enterSimulation]);

  const exitSimulation = useCallback(() => {
    setState(initialState);
  }, []);

  const addStep = useCallback((step: SimulationStep) => {
    setState((s) => {
      if (!s.baseData) return s;
      const steps = [...s.steps, step];
      const simulatedData = replaySteps(s.baseData, steps);
      const delta = computeSimulationDelta(s.baseData, simulatedData);
      return { ...s, steps, simulatedData, delta };
    });
  }, []);

  const undoStep = useCallback(() => {
    setState((s) => {
      if (s.steps.length === 0 || !s.baseData) return s;
      const steps = s.steps.slice(0, -1);
      const simulatedData = replaySteps(s.baseData, steps);
      const delta = steps.length === 0 ? null : computeSimulationDelta(s.baseData, simulatedData);
      return { ...s, steps, simulatedData, delta };
    });
  }, []);

  const undoStepAtIndex = useCallback((index: number) => {
    setState((s) => {
      if (index < 0 || index >= s.steps.length || !s.baseData) return s;
      const steps = s.steps.filter((_, i) => i !== index);
      const simulatedData = replaySteps(s.baseData, steps);
      const delta = steps.length === 0 ? null : computeSimulationDelta(s.baseData, simulatedData);
      return { ...s, steps, simulatedData, delta };
    });
  }, []);

  const applyAll = useCallback(async () => {
    const { baseData, steps } = state;
    if (!baseData || steps.length === 0) return;

    let data = baseData;
    for (const step of steps) {
      data = applyStep(data, step);
      switch (step.type) {
        case 'add_allocation':
          await addItem('allocations', step.allocation);
          break;
        case 'remove_allocation':
          await deleteItem('allocations', step.allocationId);
          break;
        case 'update_allocation_capacity': {
          const alloc = data.allocations.find((a) => a.id === step.allocationId);
          if (alloc)
            await updateItem('allocations', {
              ...alloc,
              ftePercent: step.ftePercent,
              agreedMonthlyHours: Math.round((173 * step.ftePercent) / 100),
            });
          break;
        }
        case 'reassign_task': {
          const task = data.tasks.find((t) => t.id === step.taskId);
          if (task) await updateItem('tasks', { ...task });
          break;
        }
        case 'add_task':
          await addItem('tasks', step.task);
          break;
        case 'update_task': {
          const task = data.tasks.find((t) => t.id === step.taskId);
          if (task) await updateItem('tasks', { ...task, ...step.patch });
          break;
        }
        case 'update_user_calendar': {
          const user = data.users.find((u) => u.id === step.userId);
          if (user) await updateItem('users', { ...user });
          break;
        }
      }
    }

    window.dispatchEvent(new CustomEvent('allocations-updated'));
    setState(initialState);
  }, [state.baseData, state.steps]);

  const discard = useCallback(() => {
    setState(initialState);
  }, []);

  const value = useMemo<SimulationContextValue>(
    () => ({
      ...state,
      enterSimulation,
      enterSimulationWithSteps,
      exitSimulation,
      addStep,
      undoStep,
      undoStepAtIndex,
      applyAll,
      discard,
      setBaseData,
    }),
    [state, enterSimulation, enterSimulationWithSteps, exitSimulation, addStep, undoStep, undoStepAtIndex, applyAll, discard, setBaseData]
  );

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulation must be used within SimulationProvider');
  return ctx;
}

export function useSimulationOptional() {
  return useContext(SimulationContext);
}

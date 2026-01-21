"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface NotificationItem {
  id: string;
  message: string;
  timestamp: number;
  isError?: boolean;
}

interface AppState {
  simplicityProgram: string;
  witProgram: string;
  compiledProgramBase64: string;
  compiledWitnessBase64: string;
  bitcoinScript: string;
  compiledHex: string;
  compiledAddress: string;
  inputTransactionHash: string;
  inputIndex: string;
  cosignSecretKey: string;
  
  savedSimplicityProgram: boolean;
  savedBitcoinScript: boolean;
  compiledWithWitnessForTransaction: boolean;
  
  logs: Array<{ timestamp: Date; message: string }>;
  notifications: NotificationItem[];
}

interface AppContextType {
  state: AppState;
  updateSimplicityProgram: (code: string) => void;
  updateWitProgram: (wit: string) => void;
  updateBitcoinScript: (script: string) => void;
  updateTransactionForm: (hash: string, index: string, key: string) => void;
  saveSimplicityProgram: (compiledProgramBase64: string, compiledWitnessBase64: string, tweakedPublicKey?: string, includeWitnessForTransaction?: boolean) => void;
  saveBitcoinScript: (compiledHex: string, address: string) => void;
  canSendTransaction: () => boolean;
  addLog: (message: string) => void;
  showNotification: (message: string, isError?: boolean) => void;
  removeNotification: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    simplicityProgram: "",
    witProgram: "",
    compiledProgramBase64: "",
    compiledWitnessBase64: "",
    bitcoinScript: "",
    compiledHex: "",
    compiledAddress: "",
    inputTransactionHash: "",
    inputIndex: "",
    cosignSecretKey: "",
    savedSimplicityProgram: false,
    savedBitcoinScript: false,
    compiledWithWitnessForTransaction: false,
    logs: [],
    notifications: [],
  });

  const updateSimplicityProgram = (code: string) => {
    setState((prev) => ({
      ...prev,
      simplicityProgram: code,
      compiledProgramBase64: "",
      savedSimplicityProgram: false,
      compiledWithWitnessForTransaction: false,
    }));
  };

  const updateWitProgram = (wit: string) => {
    setState((prev) => ({
      ...prev,
      witProgram: wit,
      compiledProgramBase64: "",
      savedSimplicityProgram: false,
      compiledWithWitnessForTransaction: false,
    }));
  };

  const updateBitcoinScript = (script: string) => {
    setState((prev) => ({
      ...prev,
      bitcoinScript: script,
      compiledHex: "",
      compiledAddress: "",
      savedBitcoinScript: false,
    }));
  };

  const updateTransactionForm = (hash: string, index: string, key: string) => {
    setState((prev) => ({
      ...prev,
      inputTransactionHash: hash,
      inputIndex: index,
      cosignSecretKey: key,
    }));
  };

  const saveSimplicityProgram = (compiledProgramBase64: string, compiledWitnessBase64: string, tweakedPublicKey?: string, includeWitnessForTransaction?: boolean) => {
    if (state.simplicityProgram.trim() && compiledProgramBase64) {
      setState((prev) => ({
        ...prev,
        compiledProgramBase64,
        compiledWitnessBase64,
        savedSimplicityProgram: true,
        compiledWithWitnessForTransaction: includeWitnessForTransaction || false,
      }));
      const logMessage = tweakedPublicKey 
        ? `Simplicity program compiled and saved successfully. Tweaked Public Key: ${tweakedPublicKey}`
        : "Simplicity program compiled and saved successfully";
      addLog(logMessage);
      showNotification("Simplicity program compiled and saved successfully");
    }
  };

  const saveBitcoinScript = (compiledHex: string, address: string) => {
    if (state.bitcoinScript.trim() && compiledHex && address) {
      setState((prev) => ({
        ...prev,
        compiledHex,
        compiledAddress: address,
        savedBitcoinScript: true,
      }));
      addLog(`Bitcoin script compiled - Address: ${address}`);
      showNotification("Bitcoin script saved and P2WSH address generated");
    }
  };

  const canSendTransaction = () => {
    return state.savedSimplicityProgram && state.savedBitcoinScript && state.compiledWithWitnessForTransaction;
  };

  const addLog = (message: string) => {
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs, { timestamp: new Date(), message }],
    }));
  };

  const showNotification = (message: string, isError = false) => {
    const id = `notification-${Date.now()}-${Math.random()}`;
    const notification: NotificationItem = {
      id,
      message,
      timestamp: Date.now(),
      isError,
    };
    
    setState((prev) => ({
      ...prev,
      notifications: [...prev.notifications, notification],
    }));
    
    setTimeout(() => {
      removeNotification(id);
    }, 7000);
  };

  const removeNotification = (id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((n) => n.id !== id),
    }));
  };

  return (
    <AppContext.Provider
      value={{
        state,
        updateSimplicityProgram,
        updateWitProgram,
        updateBitcoinScript,
        updateTransactionForm,
        saveSimplicityProgram,
        saveBitcoinScript,
        canSendTransaction,
        addLog,
        showNotification,
        removeNotification,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}

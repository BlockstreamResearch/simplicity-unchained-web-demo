"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import type { PreparedDemo, TransactionResult } from "@/services/demoFlow";

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
  compiledCmr: string;
  compiledWitnessBase64: string;
  bitcoinScript: string;
  compiledHex: string;
  compiledAddress: string;
  tweakedPublicKey: string;
  userLeafHash: string;
  compiledUserPubkey: string;
  inputTransactionHash: string;
  inputIndex: string;
  cosignSecretKey: string;
  network: "elements" | "bitcoin";
  operation: "preparing" | "sending" | null;
  progress: string;
  transactionResult: TransactionResult | null;
  programOrigin: "guided" | "custom";
  
  savedSimplicityProgram: boolean;
  savedBitcoinScript: boolean;
  compiledWithWitnessForTransaction: boolean;
  
  logs: Array<{ timestamp: Date; message: string }>;
  notifications: NotificationItem[];
}

export type ServiceStatus = "checking" | "online" | "offline";

interface AppContextType {
  state: AppState;
  serviceStatus: ServiceStatus;
  checkService: () => Promise<void>;
  updateSimplicityProgram: (code: string) => void;
  updateWitProgram: (wit: string) => void;
  updateBitcoinScript: (script: string) => void;
  updateTransactionForm: (hash: string, index: string, key: string) => void;
  setNetwork: (network: "elements" | "bitcoin") => void;
  setOperation: (operation: AppState["operation"], progress?: string) => void;
  loadPreparedDemo: (demo: PreparedDemo) => void;
  resetToGuided: () => void;
  completeTransaction: (result: TransactionResult) => void;
  clearTransaction: () => void;
  saveSimplicityProgram: (compiledProgramBase64: string, compiledWitnessBase64: string, cmr: string, includeWitnessForTransaction: boolean) => void;
  saveBitcoinScript: (compiledHex: string, address: string, userLeafHash: string, userPubkey: string, tweakedPublicKey: string) => void;
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
    compiledCmr: "",
    compiledWitnessBase64: "",
    bitcoinScript: "",
    compiledHex: "",
    compiledAddress: "",
    tweakedPublicKey: "",
    userLeafHash: "",
    compiledUserPubkey: "",
    inputTransactionHash: "",
    inputIndex: "",
    cosignSecretKey: "",
    network: "elements",
    operation: null,
    progress: "",
    transactionResult: null,
    programOrigin: "guided",
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
      programOrigin: "custom",
      compiledProgramBase64: "",
      compiledCmr: "",
      compiledWitnessBase64: "",
      tweakedPublicKey: "",
      compiledHex: "",
      compiledAddress: "",
      userLeafHash: "",
      compiledUserPubkey: "",
      savedBitcoinScript: false,
      savedSimplicityProgram: false,
      compiledWithWitnessForTransaction: false,
      transactionResult: null,
    }));
  };

  const updateWitProgram = (wit: string) => {
    setState((prev) => ({
      ...prev,
      witProgram: wit,
      programOrigin: "custom",
      compiledProgramBase64: "",
      compiledCmr: "",
      compiledWitnessBase64: "",
      tweakedPublicKey: "",
      compiledHex: "",
      compiledAddress: "",
      userLeafHash: "",
      compiledUserPubkey: "",
      savedBitcoinScript: false,
      transactionResult: null,
      savedSimplicityProgram: false,
      compiledWithWitnessForTransaction: false,
    }));
  };

  const updateBitcoinScript = (script: string) => {
    setState((prev) => ({
      ...prev,
      bitcoinScript: script,
      tweakedPublicKey: "",
      programOrigin: "custom",
      compiledHex: "",
      compiledAddress: "",
      userLeafHash: "",
      compiledUserPubkey: "",
      savedBitcoinScript: false,
      transactionResult: null,
    }));
  };

  const updateTransactionForm = useCallback((hash: string, index: string, key: string) => {
    setState((prev) => ({
      ...prev,
      inputTransactionHash: hash,
      inputIndex: index,
      cosignSecretKey: key,
      ...(key !== prev.cosignSecretKey ? {
        tweakedPublicKey: "",
        compiledHex: "",
        compiledAddress: "",
        userLeafHash: "",
        compiledUserPubkey: "",
        savedBitcoinScript: false,
        transactionResult: null,
      } : {}),
    }));
  }, []);

  const setNetwork = (network: "elements" | "bitcoin") => {
    setState((prev) => prev.network === network || prev.operation ? prev : ({
      ...prev,
      network,
      compiledProgramBase64: "",
      compiledCmr: "",
      compiledWitnessBase64: "",
      savedSimplicityProgram: false,
      compiledWithWitnessForTransaction: false,
      compiledHex: "",
      compiledAddress: "",
      tweakedPublicKey: "",
      userLeafHash: "",
      compiledUserPubkey: "",
      savedBitcoinScript: false,
      inputTransactionHash: "",
      inputIndex: "",
      transactionResult: null,
    }));
  };

  const setOperation = useCallback((operation: AppState["operation"], progress = "") => {
    setState((prev) => ({ ...prev, operation, progress }));
  }, []);

  const resetToGuided = useCallback(() => {
    setState((prev) => ({
      ...prev,
      programOrigin: "guided",
      compiledProgramBase64: "",
      compiledCmr: "",
      compiledWitnessBase64: "",
      tweakedPublicKey: "",
      compiledHex: "",
      compiledAddress: "",
      userLeafHash: "",
      compiledUserPubkey: "",
      savedSimplicityProgram: false,
      savedBitcoinScript: false,
      compiledWithWitnessForTransaction: false,
      transactionResult: null,
    }));
  }, []);

  const loadPreparedDemo = useCallback((demo: PreparedDemo) => {
    setState((prev) => ({
      ...prev, ...demo,
      programOrigin: "guided",
      savedSimplicityProgram: true,
      savedBitcoinScript: true,
      compiledWithWitnessForTransaction: true,
      inputTransactionHash: "",
      inputIndex: "",
      transactionResult: null,
    }));
  }, []);

  const completeTransaction = useCallback((transactionResult: TransactionResult) => {
    setState((prev) => ({
      ...prev, transactionResult,
      inputTransactionHash: "",
      inputIndex: "",
    }));
  }, []);

  const clearTransaction = useCallback(() => {
    setState((prev) => ({ ...prev, transactionResult: null }));
  }, []);

  const saveSimplicityProgram = (compiledProgramBase64: string, compiledWitnessBase64: string, cmr: string, includeWitnessForTransaction: boolean) => {
    if (state.simplicityProgram.trim() && compiledProgramBase64) {
      setState((prev) => ({
        ...prev,
        compiledProgramBase64,
        compiledWitnessBase64,
        compiledCmr: cmr,
        tweakedPublicKey: "",
        compiledHex: "",
        compiledAddress: "",
        userLeafHash: "",
        compiledUserPubkey: "",
        savedBitcoinScript: false,
        savedSimplicityProgram: true,
        compiledWithWitnessForTransaction: includeWitnessForTransaction || false,
      }));
      addLog("Simplicity program compiled. Build the recovery script to derive its script-bound service key.");
      showNotification("Simplicity program compiled and saved successfully");
    }
  };

  const saveBitcoinScript = (compiledHex: string, address: string, userLeafHash: string, userPubkey: string, tweakedPublicKey: string) => {
    if (state.bitcoinScript.trim() && compiledHex && address) {
      setState((prev) => ({
        ...prev,
        compiledHex,
        compiledAddress: address,
        userLeafHash,
        compiledUserPubkey: userPubkey,
        tweakedPublicKey,
        savedBitcoinScript: true,
      }));
      addLog(`Bitcoin script compiled - Address: ${address}`);
      addLog(`Recovery leaf hash: ${userLeafHash}`);
      showNotification("Recovery script saved and P2TR address generated");
    }
  };

  const canSendTransaction = () => {
    return state.savedSimplicityProgram && state.savedBitcoinScript && state.compiledWithWitnessForTransaction;
  };

  const addLog = useCallback((message: string) => {
    const timestamp = new Date();
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs, { timestamp, message }],
    }));
  }, []);

  const removeNotification = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((n) => n.id !== id),
    }));
  }, []);

  const showNotification = useCallback((message: string, isError = false) => {
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
  }, [removeNotification]);

  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>("checking");
  const checkService = useCallback(async () => {
    try {
      const response = await fetch("/api/proxy/status", { cache: "no-store" });
      setServiceStatus(response.ok ? "online" : "offline");
    } catch {
      setServiceStatus("offline");
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void checkService(), 0);
    const timer = setInterval(() => void checkService(), 15000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [checkService]);

  return (
    <AppContext.Provider
      value={{
        state,
        serviceStatus,
        checkService,
        updateSimplicityProgram,
        updateWitProgram,
        updateBitcoinScript,
        updateTransactionForm,
        setNetwork,
        setOperation,
        loadPreparedDemo,
        resetToGuided,
        completeTransaction,
        clearTransaction,
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

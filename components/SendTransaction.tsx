"use client";

import { useApp } from "@/contexts/AppContext";
import { proxyApi } from "@/services/proxyApi";
import { useState, useRef, useEffect } from "react";
import { API_CONFIG } from "@/config/api.config";

export function SendTransaction() {
  const { state, updateTransactionForm, canSendTransaction, addLog, showNotification } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [messageToSign, setMessageToSign] = useState("");
  const [isHexMode, setIsHexMode] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleHashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateTransactionForm(e.target.value, state.inputIndex, state.cosignSecretKey);
  };

  const handleIndexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateTransactionForm(state.inputTransactionHash, e.target.value, state.cosignSecretKey);
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateTransactionForm(state.inputTransactionHash, state.inputIndex, e.target.value);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleSignMessage = async () => {
    if (!messageToSign.trim()) {
      showNotification("Please enter a message to sign", true);
      return;
    }

    if (!state.cosignSecretKey) {
      showNotification("Please enter a secret key", true);
      return;
    }

    try {
      // Convert text to hex if not in hex mode
      let messageHex = messageToSign;
      if (!isHexMode) {
        // Convert text to hex
        messageHex = Array.from(messageToSign)
          .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('');
      }

      // Call the sign message API
      const response = await proxyApi.signMessage({
        message: messageHex,
        secret_key_hex: state.cosignSecretKey,
      });

      // Log the results
      addLog(`Message signed successfully`);
      addLog(`Message Hash: ${response.digest_hex}`);
      addLog(`Signature: ${response.signature_hex}`);
      
      console.log("Public Key:", response.public_key_hex);
      console.log("Message Hash:", response.digest_hex);
      console.log("Signature:", response.signature_hex);

      showNotification("Message signed successfully!");
      setShowSignModal(false);
      setMessageToSign("");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      addLog(`Failed to sign message: ${errorMessage}`);
      showNotification("Failed to sign message", true);
      console.error("Sign message error:", error);
    }
  };

  const handleSendTransaction = async () => {
    if (!canSendTransaction()) {
      showNotification(getDisabledReason() || "Please compile Simplicity Program (with witness included) and Bitcoin Script first");
      return;
    }

    // Validate required fields
    if (!state.inputTransactionHash || !state.inputIndex || !state.cosignSecretKey) {
      showNotification("Please fill in all transaction fields");
      return;
    }

    setIsSending(true);

    try {
      // Step 1: Create PSET
      const createPsetResponse = await proxyApi.createPset({
        inputs: [`${state.inputTransactionHash}:${state.inputIndex}`],
        outputs: [
          `${state.compiledAddress}:99000`,
          "fee:1000"
        ],
        asset_id: null,
        network: API_CONFIG.NETWORK,
      });
      addLog(`PSET created with ${createPsetResponse.inputs} input(s) and ${createPsetResponse.outputs} output(s)`);
      console.log("Created PSET:", createPsetResponse.pset);

      // Step 2: Sign with Simplicity service
      const simplicitySignResponse = await proxyApi.simplicitySignPset({
        pset_hex: createPsetResponse.pset,
        input_index: 0,
        redeem_script_hex: state.compiledHex,
        program: state.compiledProgramBase64,
        witness: state.compiledWitnessBase64,
      });
      addLog(`Simplicity signature added (${simplicitySignResponse.partial_sigs_count} partial signature(s))`);
      console.log("Simplicity signed PSET:", simplicitySignResponse.pset_hex);

      // Step 3: Sign with cosign key via proxy
      const proxySignResponse = await proxyApi.signPset({
        pset_hex: simplicitySignResponse.pset_hex,
        secret_key_hex: state.cosignSecretKey,
        input_index: 0,
        redeem_script_hex: state.compiledHex,
      });
      addLog(`Cosign signature added (${proxySignResponse.partial_sigs_count} partial signature(s))`);
      console.log("Fully signed PSET:", proxySignResponse.pset);

      // Step 4: Finalize PSET
      const finalizeResponse = await proxyApi.finalizePset({
        pset_hex: proxySignResponse.pset,
      });
      console.log("Final transaction hex:", finalizeResponse.transaction_hex);

      // Step 5: Broadcast transaction
      const broadcastResponse = await proxyApi.broadcastTransaction({
        transaction_hex: finalizeResponse.transaction_hex,
      });
      
      addLog("Transaction broadcast successfully!");
      addLog(`View transaction: ${broadcastResponse.explorer_url}`);
      showNotification("Transaction sent successfully!");
      
      console.log("Broadcast result:", broadcastResponse);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      addLog(`Transaction failed: ${errorMessage}`);
      showNotification("Transaction failed", true);
      console.error("Transaction error:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateKeypair = async () => {
    setIsGenerating(true);
    try {
      const response = await proxyApi.generateKeypair();
      
      // Update the form with the generated secret key
      updateTransactionForm(
        state.inputTransactionHash,
        state.inputIndex,
        response.secret_key
      );
      
      // Log the public key
      addLog(`Keypair generated - Public Key: ${response.public_key}`);
      console.log("Generated Public Key:", response.public_key);
      console.log("Generated Secret Key:", response.secret_key);
      
      showNotification("Keypair generated successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      addLog(`Failed to generate keypair: ${errorMessage}`);
      showNotification("Failed to generate keypair", true);
      console.error("Keypair generation error:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const isDisabled = !canSendTransaction();

  const getDisabledReason = () => {
    const missing: string[] = [];
    if (!state.savedSimplicityProgram) missing.push("Simplicity Program not compiled");
    if (!state.savedBitcoinScript) missing.push("Bitcoin Script not compiled");
    if (!state.compiledWithWitnessForTransaction) missing.push("Witness not included in compilation");
    return missing.join(", ");
  };

  return (
    <section className="border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="mb-4 text-lg font-semibold text-zinc-100">
        Send Transaction
      </h2>
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Input Transaction Hash
          </label>
          <input
            type="text"
            value={state.inputTransactionHash}
            onChange={handleHashChange}
            disabled={isGenerating}
            className="w-full border border-zinc-700 bg-zinc-950 px-4 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter transaction hash..."
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Input Index
          </label>
          <input
            type="number"
            value={state.inputIndex}
            onChange={handleIndexChange}
            disabled={isGenerating}
            className="w-full border border-zinc-700 bg-zinc-950 px-4 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder="Enter vout index..."
          />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm text-zinc-400">
              Cosign Secret Key
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={handleGenerateKeypair}
                disabled={isGenerating}
                className="group relative p-1 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Generate Keypair"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
                <span className="absolute right-0 bottom-full mb-1 hidden group-hover:block whitespace-nowrap bg-zinc-800 border border-zinc-600 px-2 py-1 text-xs text-zinc-300 rounded shadow-lg">
                  Generate Keypair
                </span>
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="group relative p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Secret Key Actions"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                    />
                  </svg>
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-8 z-50 w-48 border border-zinc-700 bg-zinc-900 shadow-xl">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowSignModal(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      Sign Message
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <input
            type="text"
            value={state.cosignSecretKey}
            onChange={handleKeyChange}
            className="w-full border border-zinc-700 bg-zinc-950 px-4 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
            placeholder="Enter secret key..."
          />
        </div>
        <button
          onClick={handleSendTransaction}
          disabled={isDisabled || isSending}
          className={`px-4 py-1.5 text-xs font-bold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
            isDisabled || isSending
              ? "bg-zinc-700 cursor-not-allowed opacity-50"
              : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {isSending ? "Sending transaction..." : "Send a transaction"}
        </button>
        {isDisabled && (
          <p className="text-xs text-zinc-500 italic">
            {getDisabledReason()}
          </p>
        )}
      </div>

      {/* Sign Message Modal */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSignModal(false)}>
          <div className="border border-zinc-800 bg-zinc-900 p-6 shadow-xl w-96" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-100">Sign Message</h3>
              <button
                onClick={() => setShowSignModal(false)}
                className="p-1 hover:bg-zinc-800 transition-colors rounded"
                title="Close"
              >
                <svg className="w-5 h-5 text-zinc-400 hover:text-zinc-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Message
                </label>
                <textarea
                  value={messageToSign}
                  onChange={(e) => setMessageToSign(e.target.value)}
                  className="w-full border border-zinc-700 bg-zinc-950 px-4 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none resize-none"
                  placeholder="Enter message to sign..."
                  rows={4}
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-400">
                  Input Type
                </label>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${!isHexMode ? 'text-zinc-100 font-medium' : 'text-zinc-500'}`}>
                    Text
                  </span>
                  <button
                    onClick={() => setIsHexMode(!isHexMode)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isHexMode ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isHexMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-sm ${isHexMode ? 'text-zinc-100 font-medium' : 'text-zinc-500'}`}>
                    Hex
                  </span>
                </div>
              </div>

              <button
                onClick={handleSignMessage}
                className="w-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Sign
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

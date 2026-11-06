export function recoveryScriptForKey(compressedPublicKey: string) {
  if (!/^(02|03)[0-9a-fA-F]{64}$/.test(compressedPublicKey)) {
    throw new Error("Expected a 33-byte compressed public key.");
  }
  return `OP_PUSHBYTES_33 0x${compressedPublicKey} OP_DROP OP_PUSHBYTES_32 0x${compressedPublicKey.slice(2)} OP_CHECKSIG`;
}

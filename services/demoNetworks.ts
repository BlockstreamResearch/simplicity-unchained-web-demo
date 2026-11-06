import { POLICY_NETWORKS } from "./policyTypes";

export type DemoNetwork = "testnet4" | "liquidtestnet";
export const LIQUID_TESTNET_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
export const DEMO_NETWORKS = {
  testnet4: POLICY_NETWORKS.testnet4,
  liquidtestnet: {
    label: "Liquid Testnet",
    api: "https://blockstream.info/liquidtestnet/api",
    explorer: "https://blockstream.info/liquidtestnet",
    faucet: "https://liquidtestnet.com/faucet",
  },
} as const;

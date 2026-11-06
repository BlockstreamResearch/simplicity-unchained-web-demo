"use client";

import { useState } from "react";
import type { DemoNetwork } from "@/services/demoNetworks";
import { PolicyWorkspace } from "./PolicyWorkspace";
import { LiquidPolicyWorkspace } from "./LiquidPolicyWorkspace";

export function PolicyDemo() {
  const [network, setNetwork] = useState<DemoNetwork>("testnet4");
  const [liquidVisited, setLiquidVisited] = useState(false);
  function switchNetwork(next: DemoNetwork) {
    if (next === "liquidtestnet") setLiquidVisited(true);
    setNetwork(next);
  }
  return <>
    <div hidden={network !== "testnet4"}><PolicyWorkspace onNetworkChange={switchNetwork} /></div>
    {liquidVisited && <div hidden={network !== "liquidtestnet"}><LiquidPolicyWorkspace onNetworkChange={switchNetwork} /></div>}
  </>;
}

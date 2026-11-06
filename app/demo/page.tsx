import type { Metadata } from "next";
import { PolicyDemo } from "@/components/PolicyDemo";
import { WarningModal } from "@/components/WarningModal";

export const metadata: Metadata = {
  title: "Policy Demo | Simplicity Unchained",
  description: "Try Simplicity policies on Bitcoin Testnet4 and confidential multi-asset Liquid Testnet.",
};

export default function DemoPage() {
  return <div className="min-h-screen bg-white text-ink">
    <WarningModal />
    <PolicyDemo />
  </div>;
}

import { API_CONFIG } from "@/config/api.config";
import { proxyPolicyRequest } from "@/services/policyProxy";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return proxyPolicyRequest(request, "capabilities", API_CONFIG.SIMPLICITY_SERVICE_URL, fetch, "liquid");
}

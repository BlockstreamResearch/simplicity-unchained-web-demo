import { API_CONFIG } from "@/config/api.config";
import { proxyPolicyRequest } from "@/services/policyProxy";

export function POST(request: Request) {
  return proxyPolicyRequest(request, "evaluate", API_CONFIG.SIMPLICITY_SERVICE_URL, fetch, "liquid");
}

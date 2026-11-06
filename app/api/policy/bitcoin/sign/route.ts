import { API_CONFIG } from "@/config/api.config";
import { proxyPolicyRequest } from "@/services/policyProxy";

export async function POST(request: Request) {
  return proxyPolicyRequest(request, "sign", API_CONFIG.SIMPLICITY_SERVICE_URL);
}

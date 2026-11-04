import { API_CONFIG } from "@/config/api.config";
import { proxyServiceRequest } from "@/services/serviceProxy";

export async function POST(request: Request) {
  return proxyServiceRequest(request, "sign/psbt", API_CONFIG.SIMPLICITY_SERVICE_URL);
}

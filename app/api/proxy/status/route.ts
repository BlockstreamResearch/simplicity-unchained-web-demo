import { API_CONFIG } from "@/config/api.config";
import { checkServiceHealth } from "@/services/serviceProxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return checkServiceHealth(API_CONFIG.SIMPLICITY_SERVICE_URL);
}

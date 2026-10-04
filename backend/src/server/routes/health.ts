import { APP_VERSION } from "../../version.js";

export interface HealthResponse {
  status: "ok";
  uptime: number;
  timestamp: string;
  version: string;
}

export async function getHealth(): Promise<HealthResponse> {
  return {
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  };
}

export interface HealthResponse {
  status: 'ok';
  uptime: number;
  timestamp: string;
  version: string;
}

export async function getHealth(): Promise<HealthResponse> {
  return {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
}

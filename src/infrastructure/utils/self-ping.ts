import http from 'http';
import https from 'https';

export class SelfPingService {
  private interval: NodeJS.Timeout | null = null;
  private pingIntervalMs: number;
  private appUrl: string;
  private isHttps: boolean;
  
  constructor(appUrl: string, pingIntervalMinutes: number = 10) {
    this.pingIntervalMs = pingIntervalMinutes * 60 * 1000;
    this.appUrl = appUrl;
    this.isHttps = appUrl.startsWith('https');
    
    if (this.appUrl.endsWith('/')) {
      this.appUrl = this.appUrl.slice(0, -1);
    }
  }
  
  start(): void {
    if (this.interval) {
      console.log('Self-ping service is already running');
      return;
    }
    
    console.log(`starting self-ping service, will ping ${this.appUrl}/health every ${this.pingIntervalMs / 60000} minutes`);
    
    this.pingHealth();
    
    this.interval = setInterval(() => {
      this.pingHealth();
    }, this.pingIntervalMs);
  }
  
  stop(): void {
    if (!this.interval) {
      console.log('Self-ping service is not running');
      return;
    }
    
    clearInterval(this.interval);
    this.interval = null;
    console.log('Self-ping service stopped');
  }
  
  private pingHealth(): void {
    const options = {
      hostname: new URL(this.appUrl).hostname,
      port: new URL(this.appUrl).port || (this.isHttps ? 443 : 80),
      path: '/health',
      method: 'GET',
    };
    
    const protocol = this.isHttps ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log(`Self-ping successful: ${response.status} at ${response.timestamp}`);
        } catch (error) {
          console.log(`Self-ping received non-JSON response: ${data}`);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`Self-ping error: ${error.message}`);
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      console.error('Self-ping request timed out');
    });
    
    req.end();
  }
}

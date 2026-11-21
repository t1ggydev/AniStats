import { observeRequest } from '../utils/operationalMetrics';
export default defineEventHandler((event) => {
  if (event.path.startsWith('/api/internal/metrics') || event.path.startsWith('/api/public/health')) return;
  const start = performance.now();
  event.node.res.once('finish', () => observeRequest(event.method,event.node.res.statusCode,(performance.now()-start)/1000));
});

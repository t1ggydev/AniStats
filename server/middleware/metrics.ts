import { observeRequest, shouldObserveHttp } from '../utils/operationalMetrics';
export default defineEventHandler((event) => {
  if (!shouldObserveHttp(event.path)) return;
  const start = performance.now();
  event.node.res.once('finish', () => observeRequest(event.method,event.node.res.statusCode,(performance.now()-start)/1000));
});

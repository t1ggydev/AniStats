import { randomUUID } from 'node:crypto';
const boot = randomUUID();
const started = Date.now()/1000;
const environment = process.env.ANISTATS_ENVIRONMENT === 'production' ? 'production' : 'stage';
const limits = [.005,.01,.025,.05,.1,.25,.5,1,2.5,5,10,30,60,120,300,Infinity];
const buckets = limits.map(() => 0);
const requests = new Map<string,number>();
let count = 0, sum = 0;
export function observeRequest(method: string, status: number, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const safeMethod = ['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'].includes(method) ? method : 'OTHER';
  const key = safeMethod+':'+Math.min(5,Math.max(1,Math.floor(status/100)))+'xx';
  requests.set(key,(requests.get(key)||0)+1);
  count++; sum+=seconds;
  limits.forEach((limit,i) => { if (seconds<=limit) buckets[i]++; });
}
export function renderOperationalMetrics() {
  const labels = `application="anistats",environment="${environment}",boot_id="${boot}"`;
  const histogramLabels = labels+',histogram_schema="v2"';
  // One synchronous snapshot: every histogram bucket/count belongs to the same process generation.
  const lines = [`anistats_process_start_time_seconds{${labels}} ${started}`,
    `anistats_process_resident_memory_bytes{${labels}} ${process.memoryUsage().rss}`];
  for (const [key,value] of requests) {
    const [method,status] = key.split(':');
    lines.push(`anistats_http_requests_total{${labels},method="${method}",status_class="${status}"} ${value}`);
  }
  limits.forEach((limit,i) => lines.push(`anistats_http_request_duration_seconds_bucket{${histogramLabels},le="${limit===Infinity?'+Inf':limit}"} ${buckets[i]}`));
  lines.push(`anistats_http_request_duration_seconds_count{${histogramLabels}} ${count}`,
    `anistats_http_request_duration_seconds_sum{${histogramLabels}} ${sum}`);
  return lines.join('\n')+'\n';
}

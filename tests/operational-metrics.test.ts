import { describe, expect, it, vi } from 'vitest';
describe('operational histogram generations', () => {
  it('keeps buckets monotonic, separates restarts, and exports no URL/user data', async () => {
    vi.resetModules();
    const first = await import('../server/utils/operationalMetrics');
    first.observeRequest('GET',200,.02);first.observeRequest('POST',500,4);first.observeRequest('GET',200,NaN);
    const text=first.renderOperationalMetrics();
    const buckets=text.split('\n').filter(x=>x.startsWith('anistats_http_request_duration_seconds_bucket')).map(x=>Number(x.split(' ').at(-1)));
    expect(buckets.every((x,i)=>i===0||x>=buckets[i-1])).toBe(true);
    expect(buckets.at(-1)).toBe(2);
    expect(text).not.toMatch(/token|cookie|url=|user=/);
    const boot=text.match(/boot_id="([^"]+)"/)![1];
    vi.resetModules();
    const second=await import('../server/utils/operationalMetrics');
    const restarted=second.renderOperationalMetrics();
    expect(restarted).not.toContain(boot);
    expect(restarted).toMatch(/anistats_http_request_duration_seconds_count\{[^}]+\} 0/);
  });
});

import { createError, defineEventHandler, getHeader, setHeader } from 'h3';
import { renderOperationalMetrics } from '../../utils/operationalMetrics';
export default defineEventHandler((event) => {
  const token = process.env.ANISTATS_MONITORING_TOKEN;
  if (!token || getHeader(event,'authorization') !== 'Bearer '+token) throw createError({ statusCode: 401 });
  setHeader(event,'Content-Type','text/plain; version=0.0.4; charset=utf-8');
  setHeader(event,'Cache-Control','no-store');
  return renderOperationalMetrics();
});

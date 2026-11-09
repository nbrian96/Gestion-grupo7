/**
 * Capa de comunicación HTTP con la API REST
 */
import { state } from './state.js';

let onUnauthorizedHandler = null;

export function setUnauthorizedHandler(fn) {
  onUnauthorizedHandler = fn;
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch (_) {}

  if (!response.ok) {
    if (response.status === 401) {
      if (typeof onUnauthorizedHandler === 'function') {
        onUnauthorizedHandler();
      }
    }
    throw new Error(data?.error || `Error ${response.status}`);
  }
  return data;
}

export async function downloadMonotributo(memberId, filename = 'constancia_monotributo.pdf') {
  const response = await fetch(`/api/members/${memberId}/monotributo`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (!response.ok) {
    let data = null;
    try { data = await response.json(); } catch (_) {}
    throw new Error(data?.error || `Error ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'constancia_monotributo.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadMotionPdf(motionId, title = 'mocion') {
  const response = await fetch(`/api/motions/${motionId}/report.pdf`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (!response.ok) {
    let data = null;
    try { data = await response.json(); } catch (_) {}
    throw new Error(data?.error || `Error ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const safe = String(title || 'mocion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'mocion';
  const a = document.createElement('a');
  a.href = url;
  a.download = `mocion-${safe}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadAdminReportPdf(from, to) {
  const response = await fetch(`/api/admin-report/report.pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (!response.ok) {
    let data = null;
    try { data = await response.json(); } catch (_) {}
    throw new Error(data?.error || `Error ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte-gestion-${from}-a-${to}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

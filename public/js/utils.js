/**
 * Funciones de utilidad, formateo y procesamiento de datos
 */

export const $ = (id) => document.getElementById(id);

export const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
}[c]));

export const dateOnly = (v) => String(v || '').slice(0, 10);

export const displayDate = (v) => {
  const d = dateOnly(v);
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

export const initials = (name) => String(name || 'U')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map(x => x[0] || '')
  .join('')
  .toUpperCase();

export const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

export function formatCUIT(v) {
  const d = digitsOnly(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return d.slice(0, 2) + '-' + d.slice(2);
  return d.slice(0, 2) + '-' + d.slice(2, 10) + '-' + d.slice(10);
}

export const workTypeBadge = (workType, holidayDescription = '') => {
  if (workType === 'holiday') {
    const title = holidayDescription ? ` title="${esc(holidayDescription)}"` : '';
    return `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle"${title}><i class="bi bi-calendar-event me-1"></i>Feriado</span>`;
  }
  if (workType === 'sunday') {
    return '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle"><i class="bi bi-sun me-1"></i>Domingo</span>';
  }
  return '<span class="badge bg-light text-secondary border">Habitual</span>';
};

export const workTypeInline = (workType, holidayDescription = '') => {
  if (workType === 'holiday') return holidayDescription ? `Feriado (${holidayDescription})` : 'Feriado';
  if (workType === 'sunday') return 'Domingo';
  return 'Habitual';
};

export function parseCsvMatrix(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const firstLine = normalized.split('\n').find(line => line.trim()) || '';
  const separator = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === '"') {
      if (quoted && normalized[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === separator && !quoted) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' && !quoted) {
      row.push(field.trim());
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

export function parseMultipleWorkCsv(text) {
  const rows = parseCsvMatrix(text);
  if (rows.length < 2) throw new Error('El CSV debe tener encabezados y al menos una fila de datos.');
  const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[ _-]+/g, '');
  const headers = rows[0].map(clean);
  const findIndex = (...names) => headers.findIndex(h => names.includes(h));
  const cuitIndex = findIndex('cuit');
  const dateIndex = findIndex('fecha', 'workdate');
  const hoursIndex = findIndex('horas', 'hora', 'hours');
  const descIndex = findIndex('descripcion', 'detalle', 'description');
  if ([cuitIndex, dateIndex, hoursIndex].some(i => i < 0)) {
    throw new Error('El CSV debe incluir las columnas cuit, fecha y horas.');
  }
  return rows.slice(1).filter(r => r.some(Boolean)).map((r, index) => ({
    sourceRow: index + 2,
    cuit: r[cuitIndex] || '',
    workDate: r[dateIndex] || '',
    hours: String(r[hoursIndex] || '').replace(',', '.'),
    description: descIndex >= 0 ? (r[descIndex] || '') : ''
  }));
}

export async function fileToBase64(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('No se pudo leer el PDF para enviarlo al servidor.'));
    reader.readAsDataURL(file);
  });
}

export async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error('No se pudo cargar PDF.js.');
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const c = await p.getTextContent();
    out.push(c.items.map(x => x.str).join(' '));
  }
  return out.join('\n');
}

export function parseArDateToken(token) {
  const m = String(token || '').match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})$/);
  if (!m) return null;
  let y = m[3];
  if (y.length === 2) y = Number(y) >= 70 ? '19' + y : '20' + y;
  const iso = `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  const d = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : iso;
}

export function localValidityFromText(txt) {
  const low = String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
  const find = (labels) => {
    const m = low.match(new RegExp(`(?:${labels})\\s*(?:[:\\-]|es|el)?\\s*(\\d{1,2}[\\/.-]\\d{1,2}[\\/.-](?:\\d{4}|\\d{2}))`, 'i'));
    return m ? parseArDateToken(m[1]) : null;
  };
  const expiresAt = find('fecha de vencimiento|fecha vencimiento|vencimiento|vigente hasta|vigencia hasta|valida hasta|valido hasta');
  const issuedAt = find('fecha de emision|fecha emision|emitida el|emitido el|fecha de generacion|generada el|generado el|fecha de impresion|fecha impresion');
  let status = 'unknown', daysRemaining = null;
  if (expiresAt) {
    const now = new Date(), base = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())), end = new Date(expiresAt + 'T00:00:00Z');
    daysRemaining = Math.round((end - base) / 86400000);
    status = daysRemaining < 0 ? 'expired' : daysRemaining <= 5 ? 'expiring' : 'valid';
  }
  return { issuedAt, expiresAt, status, daysRemaining };
}

export function getAssociateWeekDates() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const res = [];
  for (let i = 0; i < 5; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    const iso = cur.toISOString().slice(0, 10);
    res.push({
      name: dayNames[i],
      iso,
      formatted: `${String(cur.getDate()).padStart(2, '0')}/${String(cur.getMonth() + 1).padStart(2, '0')}`
    });
  }
  return res;
}

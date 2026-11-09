/**
 * Módulo del Portal del Asociado de CoopGestión
 */
import {
  $, esc, money, dateOnly, displayDate, workTypeInline,
  getAssociateWeekDates, fileToBase64, extractPdfText
} from '../utils.js';
import {
  state, viewDataCache, assocHoursMode, setAssocHoursMode, persistUserState
} from '../state.js';
import { api, downloadMonotributo } from '../api.js';
import { notify, monoBadge, alertHtml, createBootstrapModal, confirmModal } from '../ui.js';

export async function getAssociateData() {
  const me = await api('/api/me');
  return me.member;
}

/* -------------------------------------------------------------
 * 1. Associate Home / Inicio
 * ------------------------------------------------------------- */
export async function renderAssociateHome() {
  const [member, logs, retribution, motions, mono] = await Promise.all([
    getAssociateData(),
    api('/api/work-logs'),
    api('/api/retribution/me'),
    api('/api/motions'),
    api('/api/me/monotributo/status')
  ]);

  const hours = logs.reduce((s, x) => s + Number(x.hours || 0), 0);
  const pending = motions.filter(m => !m.own_vote).length;
  const d = mono.document;

  const alertContent = d?.validity_status === 'expired' ?
    alertHtml(`<strong>Tu constancia de monotributo está vencida.</strong> Venció el ${displayDate(d.expires_at)}. Subí una nueva desde <a href="#" class="alert-link" id="goto-profile-mono">Mi perfil</a>.`, 'danger') :
    d?.validity_status === 'expiring' ?
    alertHtml(`<strong>Tu constancia está por vencer.</strong> Vence en ${d.days_remaining} día${Number(d.days_remaining) === 1 ? '' : 's'} (${displayDate(d.expires_at)}). Podés renovarla desde <a href="#" class="alert-link" id="goto-profile-mono">Mi perfil</a>.`, 'warning') :
    !d || d.validity_status === 'unknown' ?
    alertHtml(`<strong>No pudimos determinar la vigencia de tu constancia.</strong> Subí una constancia nueva desde <a href="#" class="alert-link" id="goto-profile-mono">Mi perfil</a>.`, 'warning') : '';

  $('assoc-inicio').innerHTML = `
    ${alertContent ? `<div class="mb-4">${alertContent}</div>` : ''}

    <div class="row g-3 mb-4">
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3 h-100">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-secondary small fw-bold text-uppercase">Mis horas trabajadas</span>
            <span class="badge bg-primary-subtle text-primary p-2 rounded-3"><i class="bi bi-clock-history fs-5"></i></span>
          </div>
          <div class="metric-value text-primary">${hours.toLocaleString('es-AR')} h</div>
          <div class="text-muted small mt-1">Registradas en el sistema</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3 h-100">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-secondary small fw-bold text-uppercase">Mi retribución</span>
            <span class="badge bg-success-subtle text-success p-2 rounded-3"><i class="bi bi-wallet2 fs-5"></i></span>
          </div>
          <div class="metric-value text-success">${money(retribution.total)}</div>
          <div class="text-muted small mt-1">Liquidación acumulada</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3 h-100">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-secondary small fw-bold text-uppercase">Mociones pendientes</span>
            <span class="badge bg-warning-subtle text-warning-emphasis p-2 rounded-3"><i class="bi bi-person-check fs-5"></i></span>
          </div>
          <div class="metric-value text-dark">${pending}</div>
          <div class="text-muted small mt-1">Requieren tu voto en asamblea</div>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
      <h2 class="h5 fw-bold mb-1 text-dark">Hola, ${esc(member.full_name.split(/\s+/)[0])}</h2>
      <p class="text-secondary small mb-0">Desde este portal podés consultar tu legajo cooperativo, cargar tus horas de trabajo semanales y participar democráticamente en las asambleas.</p>
    </div>
  `;

  $('goto-profile-mono')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('#nav [data-view="assoc-perfil"]')?.click();
  });
}

/* -------------------------------------------------------------
 * 2. Associate Profile / Mi Perfil y Monotributo
 * ------------------------------------------------------------- */
export function openAssociatePasswordDialog() {
  const bodyHtml = `
    <form id="assoc-password-form">
      <div class="mb-3">
        <label for="assoc-current-password" class="form-label small fw-semibold">Contraseña actual</label>
        <input id="assoc-current-password" type="password" class="form-control" autocomplete="current-password" required>
      </div>
      <div class="mb-3">
        <label for="assoc-new-password" class="form-label small fw-semibold">Nueva contraseña</label>
        <input id="assoc-new-password" type="password" minlength="4" class="form-control" autocomplete="new-password" required>
      </div>
      <div class="mb-3">
        <label for="assoc-confirm-password" class="form-label small fw-semibold">Repetir nueva contraseña</label>
        <input id="assoc-confirm-password" type="password" minlength="4" class="form-control" autocomplete="new-password" required>
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" data-bs-dismiss="modal" type="button">Cancelar</button>
    <button class="btn btn-primary fw-semibold" id="assoc-password-submit" type="button">
      <i class="bi bi-check-circle me-1"></i> Guardar contraseña
    </button>
  `;

  const { bsModal } = createBootstrapModal({
    id: 'assocPasswordModal',
    title: 'Cambiar contraseña',
    subtitle: 'Ingresá tu contraseña actual y elegí una nueva',
    bodyHtml,
    footerHtml,
    size: 'modal-md'
  });

  $('assoc-password-submit').addEventListener('click', async () => {
    const currentPassword = $('assoc-current-password').value;
    const newPassword = $('assoc-new-password').value;
    const confirmPassword = $('assoc-confirm-password').value;

    if (newPassword.length < 4) {
      notify('La nueva contraseña debe tener al menos 4 caracteres.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify('Las contraseñas nuevas no coinciden.', 'error');
      return;
    }

    try {
      await api('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      state.user.mustChangePassword = false;
      persistUserState();
      bsModal.hide();
      notify('Contraseña actualizada correctamente.');
    } catch (err) {
      notify(err.message, 'error');
    }
  });

  bsModal.show();
}

export async function renderAssociateProfile() {
  const [m, mono] = await Promise.all([
    getAssociateData(),
    api('/api/me/monotributo/status')
  ]);

  const pending = Math.max(0, Number(m.capital_subscribed) - Number(m.capital_integrated));
  const roles = (m.roles || []).length ? m.roles : ['Asociado'];
  const d = mono.document;

  const items = [
    ['DNI', m.dni],
    ['CUIT', m.cuit],
    ['Correo', m.email],
    ['Fecha de alta', displayDate(m.joined_on)],
    ['Rol / cargos', roles.join(', ')],
    ['Capital suscripto', money(m.capital_subscribed)],
    ['Capital integrado', money(m.capital_integrated)],
    ['Saldo pendiente', money(pending)]
  ];

  const statusHtml = d ? `
    <div class="d-flex align-items-center gap-2 flex-wrap">
      ${monoBadge(d.validity_status, d.days_remaining)}
      <div class="small text-secondary">
        <span>Emisión: <strong>${displayDate(d.issued_at)}</strong></span> · 
        <span>Vencimiento: <strong>${displayDate(d.expires_at)}</strong></span>
      </div>
    </div>
  ` : '<span class="badge bg-secondary-subtle text-secondary border">Sin constancia almacenada</span>';

  const warning = d?.validity_status === 'expired' ?
    alertHtml(`<strong>Constancia vencida</strong>. Venció el ${displayDate(d.expires_at)}. Subí una nueva para mantener al día tu legajo.`, 'danger') :
    d?.validity_status === 'expiring' ?
    alertHtml(`<strong>Tu constancia vence pronto</strong>. Quedan ${d.days_remaining} día${Number(d.days_remaining) === 1 ? '' : 's'}.`, 'warning') : '';

  $('assoc-perfil').innerHTML = `
    ${warning ? `<div class="mb-4">${warning}</div>` : ''}

    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4 pb-3 border-bottom">
        <div>
          <h2 class="h4 fw-bold mb-1 text-dark">${esc(m.full_name)}</h2>
          <p class="text-secondary small mb-0">${esc(roles.join(' · '))} · Socio desde ${displayDate(m.joined_on)}</p>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-success-subtle text-success border border-success-subtle px-3 py-2">Socio Activo</span>
          <button class="btn btn-sm btn-outline-secondary" id="assoc-open-password" type="button">
            <i class="bi bi-key me-1"></i> Cambiar contraseña
          </button>
        </div>
      </div>

      <h3 class="h6 fw-bold text-dark mb-3">Datos personales</h3>
      <div class="row g-3 mb-4">
        ${items.slice(0, 5).map(([k, v]) => `
          <div class="col-12 col-sm-6 col-md-4">
            <div class="p-2 border rounded-2 bg-light">
              <span class="text-secondary small d-block">${esc(k)}</span>
              <strong class="text-dark">${esc(v ?? '—')}</strong>
            </div>
          </div>
        `).join('')}
      </div>

      <h3 class="h6 fw-bold text-dark mb-3">Capital social cooperativo</h3>
      <div class="row g-3">
        ${items.slice(5).map(([k, v]) => `
          <div class="col-12 col-sm-4">
            <div class="p-3 border rounded-3 bg-light text-center">
              <span class="text-secondary small d-block mb-1">${esc(k)}</span>
              <strong class="h5 mb-0 text-primary">${esc(v)}</strong>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Constancia de Monotributo -->
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h3 class="h5 fw-bold mb-1 text-dark">Constancia de Monotributo</h3>
          <p class="text-secondary small mb-0">Consultá la vigencia de tu documentación o subí una nueva constancia de AFIP.</p>
        </div>
        <div>${statusHtml}</div>
      </div>

      ${m.monotributo_stored ? `
        <div class="mb-4">
          <button class="btn btn-outline-primary btn-sm" id="assoc-download-monotributo">
            <i class="bi bi-download me-1"></i> Descargar constancia actual en PDF
          </button>
        </div>
      ` : ''}

      <div class="p-3 border rounded-3 bg-light">
        <label class="form-label small fw-semibold">Actualizar constancia (PDF)</label>
        <input id="assoc-monotributo-file" type="file" class="form-control" accept="application/pdf,.pdf">
        <div class="form-text small mb-3">El archivo no debe superar 5 MB y debe tener texto seleccionable con fecha de vencimiento legible.</div>
        <div id="assoc-mono-upload-result" class="alert alert-secondary py-2 small mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-info-circle"></i> <span>Seleccioná un archivo PDF para renovar tu constancia.</span>
        </div>
        <button class="btn btn-primary fw-semibold" id="assoc-upload-monotributo">
          <i class="bi bi-shield-check me-1"></i> Verificar y actualizar constancia
        </button>
      </div>
    </div>
  `;

  $('assoc-download-monotributo')?.addEventListener('click', async () => {
    try {
      await downloadMonotributo(m.id, m.monotributo_file);
    } catch (err) {
      notify(err.message, 'error');
    }
  });

  $('assoc-upload-monotributo').addEventListener('click', async () => {
    const file = $('assoc-monotributo-file').files?.[0];
    const result = $('assoc-mono-upload-result');
    if (!file) {
      result.className = 'alert alert-danger py-2 small mb-3';
      result.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i> Seleccioná un archivo PDF.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      result.className = 'alert alert-danger py-2 small mb-3';
      result.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i> El PDF supera los 5 MB.';
      return;
    }

    result.className = 'alert alert-info py-2 small mb-3';
    result.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Verificando constancia con PDF.js...';

    try {
      const extractedText = await extractPdfText(file);
      if (!String(extractedText || '').trim()) {
        throw new Error('No se pudo extraer texto del PDF. Probá con una constancia descargada directamente de AFIP.');
      }
      const contentBase64 = await fileToBase64(file);
      const data = await api('/api/me/monotributo', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          contentBase64,
          extractedText
        })
      });
      result.className = 'alert alert-success py-2 small mb-3';
      result.innerHTML = `<i class="bi bi-check-circle me-1"></i> ${esc(data.validation.message)}`;
      notify('Constancia actualizada y verificada con éxito.');
      setTimeout(() => renderAssociateProfile().catch(() => {}), 800);
    } catch (err) {
      result.className = 'alert alert-danger py-2 small mb-3';
      result.innerHTML = `<i class="bi bi-exclamation-circle me-1"></i> ${esc(err.message)}`;
    }
  });

  $('assoc-open-password').addEventListener('click', openAssociatePasswordDialog);
}

/* -------------------------------------------------------------
 * 3. Associate Hours / Carga de Horas (Individual y Semanal)
 * ------------------------------------------------------------- */
export async function renderAssociateHours(silent = false) {
  const logs = await api('/api/work-logs');
  const fp = JSON.stringify([assocHoursMode, logs.map(x => [x.id, x.hours, x.work_date, x.description])]);
  if (silent && viewDataCache['assoc-horas'] === fp) return;
  viewDataCache['assoc-horas'] = fp;

  const weekDays = getAssociateWeekDates();

  const singleFormHtml = `
    <form id="assoc-hours-form" class="card border-0 shadow-sm p-4 bg-white rounded-3">
      <h3 class="h5 fw-bold mb-1 text-dark">Registrar trabajo individual</h3>
      <p class="text-secondary small mb-3">La carga queda vinculada automáticamente a tu legajo cooperativo.</p>
      <div class="mb-3">
        <label for="assoc-date" class="form-label small fw-semibold">Fecha *</label>
        <input id="assoc-date" type="date" class="form-control" required>
      </div>
      <div class="mb-3">
        <label for="assoc-hours" class="form-label small fw-semibold">Horas *</label>
        <div class="input-group">
          <input id="assoc-hours" type="number" min="0.5" max="23.5" step="0.5" class="form-control" placeholder="Ej. 8" required>
          <span class="input-group-text">hs</span>
        </div>
      </div>
      <div class="mb-3">
        <label for="assoc-description" class="form-label small fw-semibold">Descripción</label>
        <textarea id="assoc-description" class="form-control" rows="2" maxlength="180" placeholder="Ej. Tareas de producción"></textarea>
      </div>
      <div class="alert alert-light border py-2 small mb-3">
        <i class="bi bi-info-circle me-1"></i> No se permite duplicar una fecha ya registrada.
      </div>
      <button class="btn btn-primary fw-semibold w-100" type="submit">
        <i class="bi bi-plus-circle me-1"></i> Registrar horas
      </button>
    </form>
  `;

  const weeklyFormHtml = `
    <form id="assoc-weekly-form" class="card border-0 shadow-sm p-4 bg-white rounded-3">
      <h3 class="h5 fw-bold mb-1 text-dark">Carga semanal rápida</h3>
      <p class="text-secondary small mb-3">Ingresá las horas trabajadas de lunes a viernes de la semana en curso.</p>
      
      <div class="d-flex flex-column gap-3 mb-4">
        ${weekDays.map(d => `
          <div class="p-3 border rounded-3 bg-light">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <strong class="text-dark">${d.name}</strong>
              <span class="badge bg-secondary-subtle text-secondary">${d.formatted} (${d.iso})</span>
            </div>
            <div class="row g-2">
              <div class="col-4">
                <div class="input-group input-group-sm">
                  <input type="number" min="0.5" max="23.5" step="0.5" class="form-control" placeholder="Horas" data-week-iso="${d.iso}">
                  <span class="input-group-text">hs</span>
                </div>
              </div>
              <div class="col-8">
                <input type="text" maxlength="180" class="form-control form-control-sm" placeholder="Detalle" data-week-desc="${d.iso}" value="Producción">
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <button class="btn btn-primary fw-semibold w-100" type="submit">
        <i class="bi bi-calendar-check me-1"></i> Registrar horas de la semana
      </button>
    </form>
  `;

  $('assoc-horas').innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-4">
      <div class="btn-group" role="group">
        <button type="button" class="btn ${assocHoursMode === 'single' ? 'btn-primary' : 'btn-outline-secondary'}" id="assoc-mode-single">
          <i class="bi bi-calendar-day me-1"></i> Carga individual
        </button>
        <button type="button" class="btn ${assocHoursMode === 'weekly' ? 'btn-primary' : 'btn-outline-secondary'}" id="assoc-mode-weekly">
          <i class="bi bi-calendar-week me-1"></i> Carga semanal rápida
        </button>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-12 col-lg-5">
        ${assocHoursMode === 'single' ? singleFormHtml : weeklyFormHtml}
      </div>

      <div class="col-12 col-lg-7">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
          <div class="d-flex align-items-center justify-content-between mb-3">
            <h3 class="h5 fw-bold mb-0 text-dark">Mis registros cargados</h3>
            <span class="badge bg-light text-dark">${logs.length} registros</span>
          </div>
          <div class="list-group list-group-flush gap-2">
            ${logs.length ? logs.map(x => `
              <div class="list-group-item border rounded-3 p-3 d-flex align-items-center justify-content-between bg-light">
                <div>
                  <strong class="text-dark d-block">${displayDate(x.work_date)}</strong>
                  <div class="text-secondary small">${esc(x.description || 'Sin detalle')} · ${esc(workTypeInline(x.work_type, x.holiday_description))}</div>
                </div>
                <div class="h6 mb-0 text-primary fw-bold">
                  ${Number(x.hours).toLocaleString('es-AR')} h
                </div>
              </div>
            `).join('') : '<div class="text-muted text-center py-4">Todavía no registraste horas.</div>'}
          </div>
        </div>
      </div>
    </div>
  `;

  $('assoc-mode-single').onclick = () => { setAssocHoursMode('single'); renderAssociateHours(); };
  $('assoc-mode-weekly').onclick = () => { setAssocHoursMode('weekly'); renderAssociateHours(); };

  if (assocHoursMode === 'single') {
    $('assoc-date').value = new Date().toISOString().slice(0, 10);
    $('assoc-hours-form').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api('/api/work-logs', {
          method: 'POST',
          body: JSON.stringify({
            workDate: $('assoc-date').value,
            hours: Number($('assoc-hours').value),
            description: $('assoc-description').value
          })
        });
        notify('Horas registradas. Administración ya puede ver la carga.');
        await renderAssociateHours();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  } else {
    $('assoc-weekly-form').addEventListener('submit', async e => {
      e.preventDefault();
      const rows = $('assoc-weekly-form').querySelectorAll('[data-week-iso]');
      const items = [];
      rows.forEach(input => {
        const hours = Number(input.value);
        if (hours > 0 && hours < 24) {
          const iso = input.dataset.weekIso;
          const descInput = $('assoc-weekly-form').querySelector(`[data-week-desc="${iso}"]`);
          items.push({
            workDate: iso,
            hours,
            description: descInput?.value.trim() || 'Producción'
          });
        }
      });
      if (!items.length) {
        notify('Ingresá las horas para al menos un día de la semana.', 'error');
        return;
      }
      let success = 0;
      let errors = [];
      for (const item of items) {
        try {
          await api('/api/work-logs', { method: 'POST', body: JSON.stringify(item) });
          success++;
        } catch (err) {
          errors.push(`${displayDate(item.workDate)}: ${err.message}`);
        }
      }
      if (success > 0) {
        notify(`Se registraron ${success} día${success === 1 ? '' : 's'} de trabajo correctamente.${errors.length ? ' Algunos días tenían carga previa.' : ''}`);
        await renderAssociateHours();
      } else {
        notify(`No se pudieron guardar las horas: ${errors.join(', ')}`, 'error');
      }
    });
  }
}

/* -------------------------------------------------------------
 * 4. Associate Retribution / Mi Retribución
 * ------------------------------------------------------------- */
export async function renderAssociateRetribution() {
  const [x, cfg] = await Promise.all([
    api('/api/retribution/me'),
    api('/api/retribution/settings')
  ]);
  const transferred = Number(x.transferred_amount) === Number(x.total) && Number(x.total) > 0;

  $('assoc-retribucion').innerHTML = `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-4 pb-3 border-bottom">
        <div>
          <h2 class="h4 fw-bold mb-1 text-dark">Mi retribución acumulada</h2>
          <p class="text-secondary small mb-0">Calculada en base a tus horas de trabajo aprobadas y las tarifas vigentes.</p>
        </div>
        <span class="badge ${transferred ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-warning-subtle text-warning-emphasis border border-warning-subtle'} px-3 py-2 fs-6">
          <i class="bi ${transferred ? 'bi-check2-all' : 'bi-hourglass-split'} me-1"></i>
          ${transferred ? 'Transferencia realizada' : 'Pendiente de acreditación'}
        </span>
      </div>

      <div class="row g-3 mb-4">
        <div class="col-12 col-md-4">
          <div class="card border p-3 rounded-3 bg-light h-100">
            <span class="text-secondary small fw-bold text-uppercase">Horas habituales</span>
            <div class="metric-value text-dark mt-1">${x.normal_hours} h</div>
            <div class="text-muted small mt-1">${money(x.normal_rate)} / h · ${money(x.normal_amount)}</div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="card border p-3 rounded-3 bg-light h-100">
            <span class="text-secondary small fw-bold text-uppercase">Domingos y feriados</span>
            <div class="metric-value text-dark mt-1">${x.special_hours} h</div>
            <div class="text-muted small mt-1">${money(x.special_rate)} / h · ${money(x.special_amount)}</div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="card border p-3 rounded-3 bg-primary-subtle text-primary border-primary-subtle h-100">
            <span class="text-primary small fw-bold text-uppercase">Total liquidado</span>
            <div class="metric-value text-primary mt-1">${money(x.total)}</div>
            <div class="text-primary small mt-1">Suma habituales + especiales</div>
          </div>
        </div>
      </div>

      <div class="alert alert-light border small text-muted mb-0">
        <i class="bi bi-info-circle me-1"></i> Los domingos se liquidan a tarifa especial automáticamente. Feriados vigentes cargados por Administración: <strong>${cfg.holidays.length}</strong>.
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------
 * 5. Associate Assembly / Asamblea y Votación
 * ------------------------------------------------------------- */
export async function renderAssociateAssembly() {
  const motions = await api('/api/motions');

  $('assoc-asamblea').innerHTML = `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4">
      <h2 class="h4 fw-bold mb-1 text-dark">Asamblea democrática</h2>
      <p class="text-secondary small mb-0">Tu usuario identifica de forma individual e intransferible quién emite cada voto. Cada socio dispone de un voto.</p>
    </div>

    <div class="list-group list-group-flush gap-3">
      ${motions.length ? motions.map(m => `
        <div class="list-group-item border rounded-3 p-4 bg-white shadow-sm">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
            <div>
              <h3 class="h5 fw-bold mb-1 text-dark">${esc(m.title)}</h3>
              <div class="text-secondary small">${m.motion_type === 'extraordinary' ? 'Mayoría especial ≥ 66%' : 'Mayoría simple > 50%'}</div>
            </div>
            <span class="badge ${m.motion_type === 'extraordinary' ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-info-subtle text-info border border-info-subtle'}">
              ${m.motion_type === 'extraordinary' ? 'Extraordinaria' : 'Ordinaria'}
            </span>
          </div>

          <div class="pt-2 border-top">
            ${m.own_vote ? `
              <div class="alert alert-success d-flex align-items-center gap-2 mb-0 py-2">
                <i class="bi bi-check-circle-fill fs-5"></i>
                <div>Ya emitiste tu voto en esta moción: <strong class="text-dark">${esc(m.own_vote.vote)}</strong></div>
              </div>
            ` : `
              <div>
                <p class="small text-muted mb-2">Seleccioná tu voto para esta moción:</p>
                <div class="d-flex gap-2 flex-wrap">
                  <button class="btn btn-outline-success fw-semibold" data-vote="A favor" data-motion="${m.id}">
                    <i class="bi bi-hand-thumbs-up me-1"></i> A favor
                  </button>
                  <button class="btn btn-outline-danger fw-semibold" data-vote="En contra" data-motion="${m.id}">
                    <i class="bi bi-hand-thumbs-down me-1"></i> En contra
                  </button>
                  <button class="btn btn-outline-secondary fw-semibold" data-vote="Abstención" data-motion="${m.id}">
                    <i class="bi bi-dash-circle me-1"></i> Abstención
                  </button>
                </div>
              </div>
            `}
          </div>
        </div>
      `).join('') : '<div class="text-muted text-center py-5">No hay mociones abiertas para votar en este momento.</div>'}
    </div>
  `;

  document.querySelectorAll('[data-vote][data-motion]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const vote = btn.dataset.vote;
      const motionId = btn.dataset.motion;
      const motion = motions.find(m => String(m.id) === String(motionId));
      const title = motion ? esc(motion.title) : 'la moción';
      const variant = vote === 'A favor' ? 'success' : vote === 'En contra' ? 'danger' : 'secondary';
      const icon = vote === 'A favor' ? 'bi-hand-thumbs-up-fill' : vote === 'En contra' ? 'bi-hand-thumbs-down-fill' : 'bi-dash-circle-fill';

      const confirmed = await confirmModal({
        title: 'Confirmar voto en asamblea',
        message: `¿Estás seguro de registrar tu voto <strong>${vote}</strong> para <em>${title}</em>? Recordá que el voto es definitivo y no podrá modificarse una vez emitido.`,
        confirmText: `Confirmar "${vote}"`,
        confirmVariant: variant,
        icon
      });
      if (!confirmed) return;

      try {
        await api(`/api/motions/${motionId}/vote`, {
          method: 'POST',
          body: JSON.stringify({ vote })
        });
        notify('Voto registrado. El cómputo de la asamblea fue actualizado.');
        await renderAssociateAssembly();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  });
}

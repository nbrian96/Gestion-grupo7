/**
 * Módulo de Administración de CoopGestión
 */
import {
  $, esc, money, dateOnly, displayDate, initials, digitsOnly, formatCUIT,
  workTypeBadge, parseMultipleWorkCsv, fileToBase64, extractPdfText,
  localValidityFromText
} from '../utils.js';
import {
  state, viewDataCache, adminWorkHistoryState, memberUiState, layoutUi,
  reportUiState, resetMono
} from '../state.js';
import {
  api, downloadMonotributo, downloadMotionPdf, downloadAdminReportPdf
} from '../api.js';
import { notify, monoBadge, alertHtml, createBootstrapModal, confirmModal } from '../ui.js';

/* -------------------------------------------------------------
 * 1. Admin Home / Inicio
 * ------------------------------------------------------------- */
export async function renderAdminHome(silent = false) {
  const [members, work, motions, retributions] = await Promise.all([
    api('/api/members'),
    api('/api/work-logs'),
    api('/api/motions'),
    api('/api/retributions')
  ]);

  const fp = JSON.stringify([members.length, work.length, motions.length, retributions.length]);
  if (silent && viewDataCache['admin-inicio'] === fp) return;
  viewDataCache['admin-inicio'] = fp;

  const active = members.filter(m => m.active && !m.verification_pending).length;
  const hours = work.reduce((s, x) => s + Number(x.hours || 0), 0);
  const total = retributions.reduce((s, x) => s + Number(x.total || 0), 0);

  $('admin-inicio').innerHTML = `
    <div class="row g-3 mb-4">
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm metric-card p-3 p-md-4 h-100 bg-white rounded-3">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-secondary small fw-bold text-uppercase">Socios activos</span>
            <span class="badge bg-primary-subtle text-primary p-2 rounded-3"><i class="bi bi-people-fill fs-5"></i></span>
          </div>
          <div class="metric-value">${active}</div>
          <div class="text-muted small mt-1">En el padrón cooperativo</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm metric-card p-3 p-md-4 h-100 bg-white rounded-3">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-secondary small fw-bold text-uppercase">Horas registradas</span>
            <span class="badge bg-success-subtle text-success p-2 rounded-3"><i class="bi bi-clock-history fs-5"></i></span>
          </div>
          <div class="metric-value">${hours.toLocaleString('es-AR')} h</div>
          <div class="text-muted small mt-1">Total acumulado de trabajo</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm metric-card p-3 p-md-4 h-100 bg-white rounded-3">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-secondary small fw-bold text-uppercase">Retribuciones calculadas</span>
            <span class="badge bg-info-subtle text-info p-2 rounded-3"><i class="bi bi-cash-stack fs-5"></i></span>
          </div>
          <div class="metric-value">${money(total)}</div>
          <div class="text-muted small mt-1">Liquidación según horas y tarifas</div>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h3 class="h5 fw-bold mb-1 text-dark">Actividad compartida y asambleas</h3>
          <p class="text-secondary small mb-0">Consultá las horas registradas, las retribuciones y las decisiones de la cooperativa.</p>
        </div>
        <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-3 py-2 fs-6">
          <i class="bi bi-bell-fill me-1"></i> Mociones abiertas: <strong>${motions.length}</strong>
        </span>
      </div>
      <div class="alert alert-light border d-flex align-items-center gap-3 mb-0 py-3">
        <i class="bi bi-info-circle text-primary fs-3 flex-shrink-0"></i>
        <div class="small text-muted">
          Utilizá la barra de navegación lateral para consultar el padrón de socios, registrar horas de trabajo de forma individual o masiva, gestionar movimientos de fondos o convocar a asambleas.
        </div>
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------
 * 2. Admin Members / Socios y Aportes
 * ------------------------------------------------------------- */
export async function renderAdminMembers(silent = false) {
  const [members, authorities, monoAlerts] = await Promise.all([
    api('/api/members'),
    api('/api/authorities'),
    api('/api/admin/monotributos/alerts')
  ]);

  const fp = JSON.stringify([
    memberUiState.formOpen,
    memberUiState.search,
    memberUiState.filter,
    members.map(m => [m.id, m.active, m.verification_pending, m.monotributo_status, m.roles]),
    authorities,
    monoAlerts.items.length
  ]);
  if (silent && viewDataCache['admin-socios'] === fp) return;
  viewDataCache['admin-socios'] = fp;
  window.__adminMembers = members;

  const q = (memberUiState.search || '').toLowerCase();
  const filtered = members.filter(m => {
    const statusOk = memberUiState.filter === 'all' ||
      (memberUiState.filter === 'active' && m.active && !m.verification_pending) ||
      (memberUiState.filter === 'pending' && m.verification_pending) ||
      (memberUiState.filter === 'inactive' && !m.active && !m.verification_pending);
    const hay = [m.full_name, m.dni, m.cuit, m.email, ...(m.roles || [])].join(' ').toLowerCase();
    return statusOk && (!q || hay.includes(q));
  });

  const active = members.filter(m => m.active && !m.verification_pending);
  const byRole = Object.fromEntries(authorities.map(a => [a.role, a]));

  const authorityCards = ['Presidente', 'Secretario', 'Tesorero'].map(role => {
    const cur = byRole[role];
    return `
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm p-3 bg-white rounded-3 h-100">
          <div class="d-flex align-items-center gap-3 mb-3">
            <div class="rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center" style="width: 44px; height: 44px;">
              ${role[0]}
            </div>
            <div>
              <div class="text-secondary small fw-bold text-uppercase">${role}</div>
              <strong class="text-dark d-block text-truncate">${esc(cur?.full_name || 'Sin asignar')}</strong>
            </div>
          </div>
          <div class="mt-auto">
            <label class="form-label small text-muted mb-1">Reasignar cargo</label>
            <select class="form-select form-select-sm" aria-label="Asignar ${role}" data-authority-role="${role}">
              ${active.map(m => `<option value="${m.id}" ${cur && Number(cur.member_id) === Number(m.id) ? 'selected' : ''}>${esc(m.full_name)}${(m.roles || []).length ? ` (${esc((m.roles || []).join(', '))})` : ''}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }).join('');

  $('admin-socios').innerHTML = `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
        <div>
          <h2 class="h4 fw-bold mb-1 text-dark">Gestión de socios</h2>
          <p class="text-secondary small mb-0">Consultá el padrón, revisá las altas y administrá la documentación de los asociados.</p>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button id="show-member-form" class="btn btn-primary fw-semibold d-flex align-items-center gap-2">
            <i class="bi bi-person-plus-fill"></i> Nuevo socio
          </button>
          <button id="export-members" class="btn btn-outline-secondary d-flex align-items-center gap-2">
            <i class="bi bi-download"></i> Exportar datos
          </button>
        </div>
      </div>

      <!-- Pestañas de Secciones -->
      <ul class="nav nav-pills mt-4 border-bottom pb-3 gap-2" role="tablist">
        <li class="nav-item">
          <button type="button" class="nav-link ${layoutUi.members === 'list' ? 'active' : ''}" data-section-button="list">
            <i class="bi bi-people me-1"></i> Socios <span class="badge bg-light text-dark ms-1">${members.length}</span>
          </button>
        </li>
        <li class="nav-item">
          <button type="button" class="nav-link ${layoutUi.members === 'authorities' ? 'active' : ''}" data-section-button="authorities">
            <i class="bi bi-award me-1"></i> Autoridades
          </button>
        </li>
        <li class="nav-item">
          <button type="button" class="nav-link ${layoutUi.members === 'documents' ? 'active' : ''}" data-section-button="documents">
            <i class="bi bi-file-earmark-check me-1"></i> Vencimientos 
            <span class="badge ${monoAlerts.items.length ? 'bg-danger' : 'bg-light text-dark'} ms-1">${monoAlerts.items.length}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Formulario de Alta / Reincorporación -->
    <div id="member-form-card" class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4 ${memberUiState.formOpen ? '' : 'd-none'}">
      <div class="d-flex align-items-center justify-content-between mb-4 pb-2 border-bottom">
        <div>
          <h3 class="h5 fw-bold mb-1 text-dark">${memberUiState.reactivatingId ? 'Reincorporar socio' : 'Registrar nuevo socio'}</h3>
          <p class="text-secondary small mb-0">${memberUiState.reactivatingId ? 'Adjuntá una nueva constancia de AFIP para iniciar la reincorporación.' : 'El alta queda pendiente hasta que Administración la verifique y apruebe.'}</p>
        </div>
        <button id="cancel-member" class="btn btn-sm btn-outline-secondary" type="button">
          <i class="bi bi-x-lg me-1"></i> Cancelar
        </button>
      </div>

      <form id="member-form" novalidate>
        <div class="row g-3 mb-4">
          <div class="col-12 col-md-6">
            <label class="form-label fw-semibold small">Nombre y apellido *</label>
            <input id="member-name" class="form-control" maxlength="120" placeholder="Ej. Juan Pérez">
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label fw-semibold small">DNI *</label>
            <input id="member-dni" class="form-control" inputmode="numeric" maxlength="12" placeholder="Número de documento">
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label fw-semibold small">CUIT *</label>
            <input id="member-cuit" class="form-control" inputmode="numeric" maxlength="13" placeholder="20-XXXXXXXX-X">
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label fw-semibold small">Correo electrónico *</label>
            <input id="member-email" type="email" class="form-control" placeholder="nombre@correo.com">
          </div>
        </div>

        <h4 class="h6 fw-bold text-dark border-bottom pb-2 mb-3">Capital Social Cooperativo</h4>
        <div class="row g-3 mb-3">
          <div class="col-12 col-md-6">
            <label class="form-label fw-semibold small">Capital suscripto ($) *</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <input id="member-capital" type="number" min="1" step="1000" class="form-control" value="370000">
            </div>
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label fw-semibold small">Aporte inicial integrado ($) *</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <input id="member-initial" type="number" min="0" step="100" class="form-control" value="18500">
            </div>
            <div class="form-text small">Mínimo 5% del capital suscripto por ley.</div>
          </div>
        </div>

        <div class="bg-light p-3 rounded-3 mb-4 d-flex justify-content-around flex-wrap gap-2 text-center">
          <div><div class="small text-muted">Mínimo requerido (5%)</div><strong class="h6 mb-0 text-dark" id="minimum-contribution">$18.500</strong></div>
          <div><div class="small text-muted">Capital integrado</div><strong class="h6 mb-0 text-primary" id="integrated-preview">$18.500</strong></div>
          <div><div class="small text-muted">Saldo pendiente</div><strong class="h6 mb-0 text-secondary" id="pending-preview">$351.500</strong></div>
        </div>

        <h4 class="h6 fw-bold text-dark border-bottom pb-2 mb-3">Constancia de Monotributo (AFIP)</h4>
        <div class="card bg-light border p-3 rounded-3 mb-4">
          <div class="mb-3">
            <label class="form-label fw-semibold small">Constancia en PDF *</label>
            <input id="member-monotributo" type="file" class="form-control" accept="application/pdf,.pdf">
            <div class="form-text small">El sistema analiza el PDF con PDF.js, valida el CUIT y la fecha de vigencia.</div>
          </div>
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <strong class="small d-block text-dark">Verificación automática de documento</strong>
              <small class="text-muted">Contenido + CUIT coincidente + vigencia vs. fecha actual</small>
            </div>
            <button id="verify-monotributo" class="btn btn-sm btn-outline-primary" type="button">
              <i class="bi bi-shield-check me-1"></i> Verificar constancia
            </button>
          </div>
          <div id="member-mono-result" class="alert alert-secondary mt-3 mb-0 py-2 small d-flex align-items-center gap-2">
            <i class="bi bi-hourglass-split"></i> <span>Pendiente de verificación.</span>
          </div>
        </div>

        <div id="member-login-section">
          <h4 class="h6 fw-bold text-dark border-bottom pb-2 mb-3">Acceso al Sistema</h4>
          <div class="row g-3 mb-3">
            <div class="col-12 col-md-6">
              <label class="form-label fw-semibold small">Nombre de usuario *</label>
              <input id="member-username" class="form-control" maxlength="80" placeholder="Ej. ana.perez">
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label fw-semibold small">Contraseña temporal *</label>
              <input id="member-password" type="password" minlength="4" class="form-control" placeholder="Mínimo 4 caracteres">
            </div>
          </div>
          <div class="alert alert-info py-2 small mb-4">
            <i class="bi bi-info-circle me-1"></i> El usuario se crea inhabilitado y se activa al aprobar el alta. En su primer ingreso deberá configurar una clave personal.
          </div>
        </div>

        <div class="card border p-3 rounded-3 mb-4 bg-light">
          <strong class="small fw-bold text-dark mb-2 d-block">Requisitos para completar el registro:</strong>
          <ul id="member-validation-list" class="list-unstyled mb-0 small"></ul>
        </div>

        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-primary fw-semibold px-4" type="submit">
            <i class="bi bi-check-circle me-1"></i> ${memberUiState.reactivatingId ? 'Solicitar reincorporación' : 'Registrar alta'}
          </button>
        </div>
      </form>
    </div>

    <!-- Pestaña 1: Listado de Socios -->
    <section class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4 ${layoutUi.members === 'list' ? '' : 'd-none'}" data-section-content="list">
      <div class="row g-3 align-items-center justify-content-between mb-4">
        <div class="col-12 col-md-6 col-lg-7">
          <div class="input-group">
            <span class="input-group-text bg-light text-muted border-end-0"><i class="bi bi-search"></i></span>
            <input id="member-search" class="form-control border-start-0 ps-0" type="search" placeholder="Buscar por nombre, DNI, CUIT o rol..." value="${esc(memberUiState.search)}">
          </div>
        </div>
        <div class="col-12 col-md-4 col-lg-3">
          <select id="member-filter" class="form-select" aria-label="Filtrar por estado">
            <option value="all" ${memberUiState.filter === 'all' ? 'selected' : ''}>Todos los estados</option>
            <option value="active" ${memberUiState.filter === 'active' ? 'selected' : ''}>Solo Activos</option>
            <option value="pending" ${memberUiState.filter === 'pending' ? 'selected' : ''}>Solo Pendientes</option>
            <option value="inactive" ${memberUiState.filter === 'inactive' ? 'selected' : ''}>Solo Bajas</option>
          </select>
        </div>
      </div>

      <div class="list-group list-group-flush gap-2">
        ${filtered.length ? filtered.map(m => {
          const roles = (m.roles || []).length ? m.roles : ['Asociado'];
          const status = m.verification_pending ? 'Pendiente' : m.active ? 'Activo' : 'Baja';
          const badgeClass = m.verification_pending ? 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' :
            m.active ? 'bg-success-subtle text-success-emphasis border border-success-subtle' :
            'bg-secondary-subtle text-secondary border border-secondary-subtle';
          
          return `
            <div class="list-group-item border rounded-3 p-3 interactive-row d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
              <div class="d-flex align-items-center gap-3">
                <div class="avatar rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center flex-shrink-0" style="width: 44px; height: 44px;">
                  ${initials(m.full_name)}
                </div>
                <div>
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <strong class="text-dark">${esc(m.full_name)}</strong>
                    <span class="badge ${badgeClass}">${status}</span>
                    ${m.monotributo_expires_at ? monoBadge(m.monotributo_validity_status, m.monotributo_days_remaining) : ''}
                  </div>
                  <div class="text-secondary small mt-1">
                    <span>${esc(m.email || 'Sin correo')}</span> · <span>CUIT ${esc(m.cuit)}</span> · <span>DNI ${esc(m.dni)}</span>
                  </div>
                  <div class="mt-2 d-flex gap-1 flex-wrap">
                    ${roles.map(r => `<span class="badge bg-light text-secondary border">${esc(r)}</span>`).join(' ')}
                  </div>
                </div>
              </div>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <button class="btn btn-sm btn-outline-secondary" data-member-detail="${m.id}">
                  <i class="bi bi-eye"></i> Detalle
                </button>
                ${m.verification_pending ? `
                  <button class="btn btn-sm btn-success" data-member-approve="${m.id}">
                    <i class="bi bi-check-lg"></i> Aprobar alta
                  </button>
                ` : ''}
                ${m.active && !m.verification_pending ? `
                  <button class="btn btn-sm btn-outline-danger" data-member-deactivate="${m.id}">
                    <i class="bi bi-person-x"></i> Baja
                  </button>
                ` : ''}
                ${!m.active && !m.verification_pending ? `
                  <button class="btn btn-sm btn-outline-primary" data-member-reactivate="${m.id}">
                    <i class="bi bi-arrow-clockwise"></i> Reincorporar
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('') : `
          <div class="text-center py-5 text-muted">
            <i class="bi bi-person-x fs-1 d-block mb-2 text-secondary"></i>
            No se encontraron socios que coincidan con los filtros aplicados.
          </div>
        `}
      </div>
    </section>

    <!-- Pestaña 2: Autoridades -->
    <section class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4 ${layoutUi.members === 'authorities' ? '' : 'd-none'}" data-section-content="authorities">
      <div class="d-flex align-items-center justify-content-between mb-4 pb-2 border-bottom">
        <div>
          <h3 class="h5 fw-bold mb-1 text-dark">Autoridades de la cooperativa</h3>
          <p class="text-secondary small mb-0">Los cargos legales deben permanecer asignados. El Presidente puede acumular funciones.</p>
        </div>
        <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle">3 cargos colegiados</span>
      </div>
      <div class="row g-3">${authorityCards}</div>
    </section>

    <!-- Pestaña 3: Vencimientos -->
    <section class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4 ${layoutUi.members === 'documents' ? '' : 'd-none'}" data-section-content="documents">
      <div class="d-flex align-items-center justify-content-between mb-4 pb-2 border-bottom">
        <div>
          <h3 class="h5 fw-bold mb-1 text-dark">Vencimientos de Monotributo</h3>
          <p class="text-secondary small mb-0">Alertas automáticas para constancias vencidas o que vencen dentro de los próximos ${monoAlerts.alertDays} días.</p>
        </div>
        <span class="badge ${monoAlerts.items.length ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-success-subtle text-success border border-success-subtle'}">
          ${monoAlerts.items.length} requieren atención
        </span>
      </div>
      <div class="list-group list-group-flush gap-2">
        ${monoAlerts.items.length ? monoAlerts.items.map(x => `
          <div class="list-group-item border rounded-3 p-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <strong class="text-dark d-block">${esc(x.full_name)}</strong>
              <div class="text-secondary small">CUIT ${esc(x.cuit)} · Vence ${displayDate(x.expires_at)}</div>
            </div>
            <div>${monoBadge(x.status, x.days_remaining)}</div>
          </div>
        `).join('') : `
          <div class="text-center py-5 text-muted">
            <i class="bi bi-shield-check fs-1 text-success d-block mb-2"></i>
            Todas las constancias de monotributo están vigentes y al día.
          </div>
        `}
      </div>
    </section>
  `;

  bindSectionNav('admin-socios', 'members', renderAdminMembers);
  renderMonoResult();
  if (memberUiState.formOpen) renderMemberValidation();

  // Handlers
  $('show-member-form').onclick = () => {
    memberUiState.formOpen = true;
    memberUiState.reactivatingId = null;
    resetMono();
    layoutUi.members = 'list';
    renderAdminMembers().then(() => $('member-name')?.focus());
  };

  $('cancel-member')?.addEventListener('click', () => {
    memberUiState.formOpen = false;
    memberUiState.reactivatingId = null;
    resetMono();
    renderAdminMembers();
  });

  $('member-search').oninput = e => {
    memberUiState.search = e.target.value;
    renderAdminMembers().then(() => {
      const input = $('member-search');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  };

  $('member-filter').onchange = e => {
    memberUiState.filter = e.target.value;
    renderAdminMembers();
  };

  $('export-members').onclick = () => {
    const blob = new Blob([JSON.stringify(members, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'socios_coopgestion.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  document.querySelectorAll('[data-authority-role]').forEach(sel => {
    sel.onchange = async () => {
      try {
        await api('/api/authorities/' + encodeURIComponent(sel.dataset.authorityRole), {
          method: 'PUT',
          body: JSON.stringify({ memberId: Number(sel.value) })
        });
        notify('Autoridad actualizada correctamente.');
        await renderAdminMembers();
      } catch (err) {
        notify(err.message, 'error');
        await renderAdminMembers();
      }
    };
  });

  if (memberUiState.formOpen) {
    ['member-name', 'member-dni', 'member-email', 'member-capital', 'member-initial', 'member-username', 'member-password'].forEach(id => {
      $(id)?.addEventListener('input', renderMemberValidation);
    });

    $('member-cuit').addEventListener('input', e => {
      e.target.value = formatCUIT(e.target.value);
      resetMono();
      renderMonoResult();
      renderMemberValidation();
    });

    $('member-monotributo').addEventListener('change', () => {
      resetMono();
      renderMonoResult();
      renderMemberValidation();
    });

    $('verify-monotributo').onclick = verifyMemberPdf;

    $('member-name').addEventListener('input', () => {
      if (!memberUiState.reactivatingId && !$('member-username').value.trim()) {
        $('member-username').value = $('member-name').value
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .split(/\s+/)[0]
          .replace(/[^a-z0-9._-]/g, '');
        renderMemberValidation();
      }
    });

    $('member-form').addEventListener('submit', async e => {
      e.preventDefault();
      const s = getMemberFormState(members);

      if (memberUiState.reactivatingId) {
        if (!s.fileOk || !s.monoOk) {
          notify('Para reincorporar se requiere una nueva constancia verificada.', 'error');
          return;
        }
        try {
          const monotributoContentBase64 = await fileToBase64(s.file);
          await api('/api/members/' + memberUiState.reactivatingId + '/reactivate', {
            method: 'POST',
            body: JSON.stringify({
              monotributoFile: s.file.name,
              monotributoMimeType: s.file.type || 'application/pdf',
              monotributoContentBase64,
              monotributoExtractedText: memberUiState.mono.extractedText,
              monotributoAutoVerified: true,
              monotributoCuitMatched: true
            })
          });
          notify('Reincorporación pendiente de revisión. La nueva constancia quedó guardada en PostgreSQL.');
          memberUiState.formOpen = false;
          memberUiState.reactivatingId = null;
          resetMono();
          await renderAdminMembers();
        } catch (err) {
          notify(err.message, 'error');
        }
        return;
      }

      if (![s.nameOk, s.dniOk, s.cuitOk, s.emailOk, s.capitalOk, s.fileOk, s.monoOk, s.loginOk].every(Boolean)) {
        notify('Revisá los requisitos antes de registrar.', 'error');
        renderMemberValidation();
        return;
      }

      if (s.duplicate) {
        notify(s.duplicate.active || s.duplicate.verification_pending ? 'Ya existe un socio o alta pendiente con ese DNI/CUIT.' : 'Ese DNI/CUIT pertenece a un ex-socio. Usá Reincorporar.', 'error');
        return;
      }

      try {
        const monotributoContentBase64 = await fileToBase64(s.file);
        await api('/api/members', {
          method: 'POST',
          body: JSON.stringify({
            fullName: s.fullName,
            dni: s.dni,
            cuit: formatCUIT(s.cuit),
            email: s.email,
            capitalSubscribed: s.cap,
            capitalIntegrated: s.integrated,
            monotributoFile: s.file.name,
            monotributoMimeType: s.file.type || 'application/pdf',
            monotributoContentBase64,
            monotributoExtractedText: memberUiState.mono.extractedText,
            monotributoAutoVerified: true,
            monotributoCuitMatched: true,
            username: s.username,
            password: s.password
          })
        });
        notify('Alta registrada. La constancia quedó guardada en PostgreSQL y el socio pendiente de verificación.');
        memberUiState.formOpen = false;
        resetMono();
        await renderAdminMembers();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  }

  document.querySelectorAll('[data-member-detail]').forEach(btn => {
    btn.onclick = () => showMemberDetails(members.find(m => String(m.id) === btn.dataset.memberDetail));
  });

  document.querySelectorAll('[data-member-approve]').forEach(btn => {
    btn.onclick = async () => {
      const memberId = btn.dataset.memberApprove;
      const member = members.find(m => String(m.id) === String(memberId));
      const name = member ? esc(member.full_name) : 'este asociado';

      const confirmed = await confirmModal({
        title: 'Aprobar alta de asociado',
        message: `¿Confirmás la habilitación de <strong>${name}</strong>? Se creará su estado activo en el padrón y podrá ingresar al sistema con su usuario.`,
        confirmText: 'Aprobar alta',
        confirmVariant: 'success',
        icon: 'bi-person-check-fill'
      });
      if (!confirmed) return;

      try {
        await api('/api/members/' + memberId + '/approve', { method: 'POST' });
        notify('Socio habilitado correctamente.');
        await renderAdminMembers();
      } catch (err) {
        notify(err.message, 'error');
      }
    };
  });

  document.querySelectorAll('[data-member-deactivate]').forEach(btn => {
    btn.onclick = async () => {
      const memberId = btn.dataset.memberDeactivate;
      const member = members.find(m => String(m.id) === String(memberId));
      const name = member ? esc(member.full_name) : 'este asociado';

      const confirmed = await confirmModal({
        title: 'Registrar baja de asociado',
        message: `¿Estás seguro de registrar la baja de <strong>${name}</strong>? Su acceso al sistema quedará inhabilitado.`,
        confirmText: 'Registrar baja',
        confirmVariant: 'danger',
        icon: 'bi-person-x-fill'
      });
      if (!confirmed) return;

      try {
        await api('/api/members/' + memberId + '/deactivate', { method: 'POST' });
        notify('Baja registrada.');
        await renderAdminMembers();
      } catch (err) {
        notify(err.message, 'error');
      }
    };
  });

  document.querySelectorAll('[data-member-reactivate]').forEach(btn => {
    btn.onclick = () => {
      const m = members.find(x => String(x.id) === btn.dataset.memberReactivate);
      memberUiState.formOpen = true;
      memberUiState.reactivatingId = m.id;
      resetMono();
      renderAdminMembers().then(() => {
        $('member-name').value = m.full_name;
        $('member-dni').value = m.dni;
        $('member-cuit').value = m.cuit;
        $('member-email').value = m.email || '';
        $('member-capital').value = m.capital_subscribed;
        $('member-initial').value = m.capital_integrated;
        ['member-name', 'member-dni', 'member-cuit', 'member-email', 'member-capital', 'member-initial'].forEach(id => $(id).disabled = true);
        $('member-login-section')?.classList.add('d-none');
        renderMemberValidation();
      });
    };
  });
}

function bindSectionNav(containerId, stateKey, onSelectCallback) {
  const container = $(containerId);
  if (!container) return;
  container.querySelectorAll('[data-section-button]').forEach(btn => {
    btn.onclick = () => {
      layoutUi[stateKey] = btn.dataset.sectionButton;
      onSelectCallback();
    };
  });
}

function renderMonoResult() {
  const b = $('member-mono-result');
  if (!b) return;
  const isOk = memberUiState.mono.valid;
  const isChecked = memberUiState.mono.checked;

  b.className = `alert mt-3 mb-0 py-2 small d-flex align-items-center gap-2 ${isOk ? 'alert-success' : isChecked ? 'alert-danger' : 'alert-secondary'}`;
  const icon = isOk ? 'bi-check-circle-fill' : isChecked ? 'bi-exclamation-circle-fill' : 'bi-hourglass-split';
  b.innerHTML = `<i class="bi ${icon}"></i> <span>${esc(memberUiState.mono.message)}</span>`;
}

function getMemberFormState(members = []) {
  const fullName = $('member-name')?.value.trim() || '';
  const dni = digitsOnly($('member-dni')?.value);
  const cuit = digitsOnly($('member-cuit')?.value);
  const email = $('member-email')?.value.trim() || '';
  const cap = Number($('member-capital')?.value || 0);
  const integrated = Number($('member-initial')?.value || 0);
  const file = $('member-monotributo')?.files?.[0] || null;
  const username = $('member-username')?.value.trim() || '';
  const password = $('member-password')?.value || '';
  const duplicate = members.find(m => digitsOnly(m.cuit) === cuit || digitsOnly(m.dni) === dni);

  return {
    fullName, dni, cuit, email, cap, integrated, file, username, password, duplicate,
    nameOk: fullName.length >= 3,
    dniOk: dni.length >= 7,
    cuitOk: cuit.length === 11,
    emailOk: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    capitalOk: cap > 0 && integrated >= cap * 0.05 && integrated <= cap,
    fileOk: !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) && file.size <= 5 * 1024 * 1024,
    loginOk: username.length >= 3 && password.length >= 4,
    monoOk: memberUiState.mono.valid
  };
}

function renderMemberValidation() {
  const ul = $('member-validation-list');
  if (!ul) return;
  const s = getMemberFormState(window.__adminMembers || []);
  const isReact = !!memberUiState.reactivatingId;

  const items = isReact ? [
    [s.fileOk, 'Nueva constancia en PDF (máx. 5 MB)'],
    [s.monoOk, 'Constancia verificada, CUIT coincidente y no vencida']
  ] : [
    [s.nameOk, 'Nombre y apellido completos'],
    [s.dniOk, 'DNI informado'],
    [s.cuitOk, 'CUIT con 11 dígitos'],
    [s.emailOk, 'Correo electrónico válido'],
    [s.capitalOk, 'Aporte inicial entre 5% y 100%'],
    [s.fileOk, 'Constancia en PDF (máx. 5 MB)'],
    [s.monoOk, 'Constancia verificada, CUIT coincidente y no vencida'],
    [s.loginOk, 'Usuario y contraseña inicial configurados'],
    [!s.duplicate || (!s.duplicate.active && !s.duplicate.verification_pending), 'Sin DNI/CUIT duplicado activo o pendiente']
  ];

  ul.innerHTML = items.map(([ok, t]) => `
    <li class="d-flex align-items-center gap-2 mb-1 ${ok ? 'text-success' : 'text-danger'}">
      <i class="bi ${ok ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i>
      <span>${t}</span>
    </li>
  `).join('');

  if ($('minimum-contribution')) $('minimum-contribution').textContent = money(Math.round(s.cap * 0.05));
  if ($('integrated-preview')) $('integrated-preview').textContent = money(s.integrated);
  if ($('pending-preview')) $('pending-preview').textContent = money(Math.max(0, s.cap - s.integrated));
}

async function verifyMemberPdf() {
  const file = $('member-monotributo')?.files?.[0];
  const entered = digitsOnly($('member-cuit')?.value);

  if (entered.length !== 11) {
    notify('Ingresá primero un CUIT válido.', 'error');
    return;
  }
  if (!file) {
    notify('Adjuntá la constancia PDF.', 'error');
    return;
  }

  try {
    const txt = await extractPdfText(file);
    const low = txt.toLowerCase();
    const looks = low.includes('monotributo') || low.includes('monotributista') || low.includes('constancia de opcion') || low.includes('constancia de opción');
    const matches = digitsOnly(txt).includes(entered);
    const validity = localValidityFromText(txt);
    const valid = looks && matches && !!validity.expiresAt && validity.status !== 'expired' && validity.status !== 'unknown';

    let message;
    if (!looks) message = 'El PDF no parece una constancia de monotributo.';
    else if (!matches) message = 'El CUIT de la constancia no coincide.';
    else if (!validity.expiresAt) message = 'No se pudo determinar la vigencia del documento.';
    else if (validity.status === 'expired') message = `La constancia está vencida desde ${displayDate(validity.expiresAt)}.`;
    else if (validity.status === 'expiring') message = `✓ Constancia válida. Vence en ${validity.daysRemaining} día${validity.daysRemaining === 1 ? '' : 's'} (${displayDate(validity.expiresAt)}).`;
    else message = `✓ Constancia vigente hasta ${displayDate(validity.expiresAt)}.`;

    memberUiState.mono = { checked: true, valid, message, ...validity, extractedText: txt };
    renderMonoResult();
    renderMemberValidation();
  } catch (err) {
    memberUiState.mono = { checked: true, valid: false, message: 'No se pudo leer el PDF.', issuedAt: null, expiresAt: null, status: 'unknown', daysRemaining: null, extractedText: '' };
    renderMonoResult();
    renderMemberValidation();
    notify(err.message, 'error');
  }
}

export function showMemberDetails(m) {
  const roles = (m.roles || []).length ? m.roles : ['Asociado'];
  const pending = Math.max(0, Number(m.capital_subscribed || 0) - Number(m.capital_integrated || 0));
  const docStatus = m.monotributo_stored ? 'Constancia disponible para descargar' : (m.monotributo_file ? 'Solo nombre histórico; sin contenido binario' : 'No cargada');

  const fields = [
    ['DNI', m.dni],
    ['CUIT', m.cuit],
    ['Correo', m.email || '—'],
    ['Fecha de alta', displayDate(m.joined_on)],
    ['Capital suscripto', money(m.capital_subscribed)],
    ['Capital integrado', money(m.capital_integrated)],
    ['Saldo pendiente', money(pending)],
    ['Monotributo', m.monotributo_status],
    ['Constancia', m.monotributo_file || 'No cargada'],
    ['Almacenamiento', docStatus],
    ['Verificación automática', m.monotributo_auto_verified && m.monotributo_cuit_matched ? 'PDF válido · CUIT coincidente' : 'Pendiente / no verificada'],
    ['Emisión', displayDate(m.monotributo_issued_at)],
    ['Vencimiento', displayDate(m.monotributo_expires_at)],
    ['Vigencia', m.monotributo_validity_status === 'expired' ? 'Vencida' : m.monotributo_validity_status === 'expiring' ? `Vence en ${m.monotributo_days_remaining} días` : m.monotributo_validity_status === 'valid' ? 'Vigente' : 'Sin determinar']
  ];

  const bodyHtml = `
    <div class="row g-3">
      ${fields.map(([k, v]) => `
        <div class="col-12 col-sm-6">
          <div class="p-2 border rounded-2 bg-light">
            <span class="text-secondary small d-block">${esc(k)}</span>
            <strong class="text-dark">${esc(v)}</strong>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  const footerHtml = `
    ${m.monotributo_stored ? `
      <button class="btn btn-outline-primary" id="download-member-monotributo">
        <i class="bi bi-download me-1"></i> Descargar constancia PDF
      </button>
    ` : ''}
    <button class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
  `;

  const { bsModal } = createBootstrapModal({
    id: 'memberDetailModal',
    title: esc(m.full_name),
    subtitle: esc(roles.join(' · ')),
    bodyHtml,
    footerHtml,
    size: 'modal-lg'
  });

  $('download-member-monotributo')?.addEventListener('click', async () => {
    try {
      await downloadMonotributo(m.id, m.monotributo_file);
    } catch (err) {
      notify(err.message, 'error');
    }
  });

  bsModal.show();
}

/* -------------------------------------------------------------
 * 3. Admin Work / Trabajo e Historial Paginado
 * ------------------------------------------------------------- */
export async function renderAdminWork(silent = false) {
  const query = new URLSearchParams({
    paginated: '1',
    page: String(adminWorkHistoryState.page),
    pageSize: String(adminWorkHistoryState.pageSize),
    search: adminWorkHistoryState.search,
    type: adminWorkHistoryState.type
  });

  const [history, members] = await Promise.all([
    api('/api/work-logs?' + query.toString()),
    api('/api/members')
  ]);

  const fp = JSON.stringify([adminWorkHistoryState, history.total, history.page, history.items?.map(x => [x.id, x.hours, x.work_date]), members.length]);
  if (silent && viewDataCache['admin-trabajo'] === fp) return;
  viewDataCache['admin-trabajo'] = fp;

  const logs = history.items || [];
  adminWorkHistoryState.page = history.page || 1;
  const activeMembers = members.filter(m => m.active && !m.verification_pending);
  const from = history.total ? ((history.page - 1) * history.pageSize) + 1 : 0;
  const to = history.total ? Math.min(history.page * history.pageSize, history.total) : 0;

  $('admin-trabajo').innerHTML = `
    <div class="row g-4">
      <!-- Formulario de Registro Individual -->
      <div class="col-12 col-lg-4">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
          <h3 class="h5 fw-bold mb-1 text-dark">Registrar horas</h3>
          <p class="text-secondary small mb-3">Carga manual de horas para cualquier socio activo.</p>
          <form id="admin-work-form">
            <div class="mb-3">
              <label for="admin-work-member" class="form-label small fw-semibold">Socio activo *</label>
              <select id="admin-work-member" class="form-select" required>
                ${activeMembers.map(m => `<option value="${m.id}">${esc(m.full_name)}</option>`).join('')}
              </select>
            </div>
            <div class="mb-3">
              <label for="admin-work-date" class="form-label small fw-semibold">Fecha *</label>
              <input id="admin-work-date" type="date" class="form-control" required>
            </div>
            <div class="mb-3">
              <label for="admin-work-hours" class="form-label small fw-semibold">Horas *</label>
              <div class="input-group">
                <input id="admin-work-hours" type="number" min="0.5" max="23.5" step="0.5" class="form-control" placeholder="Ej. 8" required>
                <span class="input-group-text">hs</span>
              </div>
            </div>
            <div class="mb-4">
              <label for="admin-work-description" class="form-label small fw-semibold">Descripción / Detalle</label>
              <textarea id="admin-work-description" class="form-control" rows="2" maxlength="180" placeholder="Ej. Producción y empaque"></textarea>
            </div>
            <div class="d-grid gap-2">
              <button class="btn btn-primary fw-semibold" type="submit">
                <i class="bi bi-plus-circle me-1"></i> Registrar horas
              </button>
              <button class="btn btn-outline-secondary" id="open-multiple-work" type="button">
                <i class="bi bi-file-earmark-spreadsheet me-1"></i> Registro múltiple / CSV
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Historial de Trabajo Paginado -->
      <div class="col-12 col-lg-8">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
            <div>
              <h2 class="h5 fw-bold mb-1 text-dark">Historial de trabajo</h2>
              <p class="text-secondary small mb-0">Incluye cargas hechas por Administración y por cada asociado.</p>
            </div>
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-2">
              ${history.total} registros
            </span>
          </div>

          <!-- Filtros y Paginación Controls -->
          <form id="work-history-filter" class="row g-2 align-items-end mb-3 p-3 bg-light rounded-3">
            <div class="col-12 col-sm-4">
              <label class="form-label small fw-semibold mb-1">Buscar asociado</label>
              <input id="work-history-search" class="form-control form-control-sm" type="search" placeholder="Nombre..." value="${esc(adminWorkHistoryState.search)}">
            </div>
            <div class="col-6 col-sm-3">
              <label class="form-label small fw-semibold mb-1">Tipo de día</label>
              <select id="work-history-type" class="form-select form-select-sm">
                <option value="all" ${adminWorkHistoryState.type === 'all' ? 'selected' : ''}>Todos</option>
                <option value="regular" ${adminWorkHistoryState.type === 'regular' ? 'selected' : ''}>Habitual</option>
                <option value="sunday" ${adminWorkHistoryState.type === 'sunday' ? 'selected' : ''}>Domingo</option>
                <option value="holiday" ${adminWorkHistoryState.type === 'holiday' ? 'selected' : ''}>Feriado</option>
              </select>
            </div>
            <div class="col-6 col-sm-2">
              <label class="form-label small fw-semibold mb-1">Por pág.</label>
              <select id="work-history-pagesize" class="form-select form-select-sm">
                <option value="5" ${adminWorkHistoryState.pageSize === 5 ? 'selected' : ''}>5</option>
                <option value="10" ${adminWorkHistoryState.pageSize === 10 ? 'selected' : ''}>10</option>
                <option value="25" ${adminWorkHistoryState.pageSize === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${adminWorkHistoryState.pageSize === 50 ? 'selected' : ''}>50</option>
              </select>
            </div>
            <div class="col-12 col-sm-3 d-flex gap-1">
              <button class="btn btn-sm btn-primary w-100" type="submit">Filtrar</button>
              <button class="btn btn-sm btn-outline-secondary w-100" id="work-history-clear" type="button">Limpiar</button>
            </div>
          </form>

          <!-- Tabla de registros -->
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Socio</th>
                  <th>Fecha</th>
                  <th>Horas</th>
                  <th>Detalle</th>
                  <th>Tipo</th>
                  <th class="text-end">Acción</th>
                </tr>
              </thead>
              <tbody>
                ${logs.length ? logs.map(x => `
                  <tr>
                    <td><strong class="text-dark">${esc(x.full_name)}</strong></td>
                    <td>${displayDate(x.work_date)}</td>
                    <td><strong class="text-primary">${Number(x.hours).toLocaleString('es-AR')} h</strong></td>
                    <td class="small text-secondary">${esc(x.description || '—')}</td>
                    <td>${workTypeBadge(x.work_type, x.holiday_description)}</td>
                    <td class="text-end">
                      <button class="btn btn-sm btn-outline-danger" data-delete-work="${x.id}" title="Eliminar registro">
                        <i class="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="6" class="text-center py-4 text-muted">
                      No hay registros de trabajo que coincidan con los filtros.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>

          <!-- Paginación Footer -->
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 pt-3 mt-3 border-top">
            <span class="text-secondary small">Mostrando ${from}–${to} de ${history.total} registros</span>
            <div class="d-flex align-items-center gap-2">
              <button class="btn btn-sm btn-outline-secondary" id="work-history-prev" type="button" ${history.page <= 1 ? 'disabled' : ''}>
                <i class="bi bi-chevron-left me-1"></i> Anterior
              </button>
              <span class="small fw-semibold text-dark">Pág. ${history.page} de ${history.totalPages || 1}</span>
              <button class="btn btn-sm btn-outline-secondary" id="work-history-next" type="button" ${history.page >= history.totalPages ? 'disabled' : ''}>
                Siguiente <i class="bi bi-chevron-right ms-1"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  $('admin-work-date').value = new Date().toISOString().slice(0, 10);
  $('open-multiple-work').onclick = () => openMultipleWorkDialog(activeMembers);

  $('admin-work-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/work-logs', {
        method: 'POST',
        body: JSON.stringify({
          memberId: Number($('admin-work-member').value),
          workDate: $('admin-work-date').value,
          hours: Number($('admin-work-hours').value),
          description: $('admin-work-description').value
        })
      });
      notify('Horas registradas con éxito.');
      adminWorkHistoryState.page = 1;
      await renderAdminWork();
    } catch (err) {
      notify(err.message, 'error');
    }
  });

  $('work-history-pagesize').onchange = async e => {
    adminWorkHistoryState.pageSize = Number(e.target.value);
    adminWorkHistoryState.page = 1;
    await renderAdminWork();
  };

  $('work-history-filter').addEventListener('submit', async e => {
    e.preventDefault();
    adminWorkHistoryState.search = $('work-history-search').value.trim();
    adminWorkHistoryState.type = $('work-history-type').value;
    adminWorkHistoryState.page = 1;
    await renderAdminWork();
  });

  $('work-history-clear').onclick = async () => {
    Object.assign(adminWorkHistoryState, { page: 1, search: '', type: 'all' });
    await renderAdminWork();
  };

  $('work-history-prev').onclick = async () => {
    if (adminWorkHistoryState.page > 1) {
      adminWorkHistoryState.page -= 1;
      await renderAdminWork();
    }
  };

  $('work-history-next').onclick = async () => {
    if (adminWorkHistoryState.page < history.totalPages) {
      adminWorkHistoryState.page += 1;
      await renderAdminWork();
    }
  };

  document.querySelectorAll('[data-delete-work]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmModal({
        title: 'Eliminar registro de horas',
        message: '¿Estás seguro de que deseas eliminar este registro de horas de trabajo?',
        confirmText: 'Eliminar registro',
        confirmVariant: 'danger',
        icon: 'bi-trash-fill'
      });
      if (!confirmed) return;

      try {
        await api('/api/work-logs/' + btn.dataset.deleteWork, { method: 'DELETE' });
        notify('Registro eliminado.');
        await renderAdminWork();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  });
}

function multipleWorkRowHtml(activeMembers, preset = {}) {
  const selectedId = String(preset.memberId || '');
  return `
    <tr class="multiple-work-row">
      <td>
        <select class="form-select form-select-sm" data-multiple-member required>
          <option value="">Seleccionar socio...</option>
          ${activeMembers.map(m => `<option value="${m.id}" ${String(m.id) === selectedId ? 'selected' : ''}>${esc(m.full_name)}</option>`).join('')}
        </select>
      </td>
      <td>
        <input class="form-control form-control-sm" data-multiple-date type="date" value="${esc(preset.workDate || '')}" required>
      </td>
      <td>
        <input class="form-control form-control-sm" data-multiple-hours type="number" min="0.5" max="23.5" step="0.5" value="${esc(preset.hours || '')}" required>
      </td>
      <td>
        <input class="form-control form-control-sm" data-multiple-description maxlength="180" value="${esc(preset.description || '')}" placeholder="Detalle opcional">
      </td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-danger" type="button" data-multiple-remove title="Quitar fila">
          <i class="bi bi-x-lg"></i>
        </button>
      </td>
    </tr>
  `;
}

export function openMultipleWorkDialog(activeMembers) {
  const bodyHtml = `
    <div class="alert alert-info py-2 small d-flex align-items-center gap-2 mb-3">
      <i class="bi bi-info-circle-fill fs-5 flex-shrink-0"></i>
      <div>Cargá un archivo CSV con las columnas <code>cuit, fecha, horas, descripcion</code> o agregá filas interactivamente.</div>
    </div>
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <div class="d-flex align-items-center gap-2">
        <label class="btn btn-sm btn-outline-primary mb-0">
          <i class="bi bi-upload me-1"></i> Importar CSV
          <input id="multiple-work-csv" type="file" accept=".csv,text/csv" class="d-none">
        </label>
        <button class="btn btn-sm btn-outline-secondary" id="multiple-work-download-sample" type="button">
          <i class="bi bi-file-earmark-arrow-down me-1"></i> Descargar plantilla CSV
        </button>
      </div>
      <button class="btn btn-sm btn-outline-success" id="multiple-work-add" type="button">
        <i class="bi bi-plus-lg me-1"></i> Agregar fila
      </button>
    </div>
    <div id="multiple-work-message"></div>
    <div class="table-responsive table-scrollable-container border rounded-3">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead class="table-light">
          <tr>
            <th style="min-width: 220px;">Socio</th>
            <th style="width: 160px;">Fecha</th>
            <th style="width: 100px;">Horas</th>
            <th>Descripción</th>
            <th style="width: 50px;"></th>
          </tr>
        </thead>
        <tbody id="multiple-work-body"></tbody>
      </table>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" data-bs-dismiss="modal" type="button">Cancelar</button>
    <button class="btn btn-primary fw-semibold" id="multiple-work-submit" type="button">
      <i class="bi bi-check-circle me-1"></i> Guardar registros
    </button>
  `;

  const { bsModal } = createBootstrapModal({
    id: 'multipleWorkModal',
    title: 'Registro múltiple de horas',
    subtitle: 'Carga masiva para varios asociados',
    bodyHtml,
    footerHtml,
    size: 'modal-xl'
  });

  const body = $('multiple-work-body');
  const addRow = (preset = {}) => body.insertAdjacentHTML('beforeend', multipleWorkRowHtml(activeMembers, preset));
  const setMessage = (html = '') => { $('multiple-work-message').innerHTML = html; };

  // Fila inicial
  addRow({ workDate: new Date().toISOString().slice(0, 10), hours: 8, description: 'Producción' });

  $('multiple-work-add').onclick = () => addRow({ workDate: new Date().toISOString().slice(0, 10), hours: 8, description: 'Producción' });

  $('multiple-work-download-sample').onclick = () => {
    const today = new Date().toISOString().slice(0, 10);
    const firstCuit = activeMembers[0]?.cuit || '20-30123456-9';
    const sampleCsv = 'cuit,fecha,horas,descripcion\n' + firstCuit + ',' + today + ',8,Producción\n';
    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_horas_coopgestion.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  body.addEventListener('click', e => {
    const btn = e.target.closest('[data-multiple-remove]');
    if (btn) btn.closest('tr')?.remove();
  });

  $('multiple-work-csv').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseMultipleWorkCsv(await file.text());
      const byCuit = new Map(activeMembers.map(m => [digitsOnly(m.cuit), m]));
      const errors = [];
      body.innerHTML = '';
      parsed.forEach(item => {
        const member = byCuit.get(digitsOnly(item.cuit));
        if (!member) {
          errors.push(`Fila ${item.sourceRow}: CUIT ${item.cuit} no corresponde a ningún socio activo.`);
          return;
        }
        addRow({ memberId: member.id, workDate: item.workDate, hours: item.hours, description: item.description });
      });
      if (errors.length) {
        setMessage(alertHtml(errors.slice(0, 5).join('<br>') + (errors.length > 5 ? `<br>...y ${errors.length - 5} errores más.` : ''), 'warning'));
      } else {
        setMessage(alertHtml(`Se importaron ${parsed.length} filas desde el CSV.`, 'success'));
      }
    } catch (err) {
      setMessage(alertHtml(err.message, 'danger'));
    }
  });

  $('multiple-work-submit').onclick = async () => {
    const rows = [...body.querySelectorAll('.multiple-work-row')];
    const entries = rows.map(row => ({
      memberId: Number(row.querySelector('[data-multiple-member]').value),
      workDate: row.querySelector('[data-multiple-date]').value,
      hours: Number(row.querySelector('[data-multiple-hours]').value),
      description: row.querySelector('[data-multiple-description]').value.trim()
    }));

    if (!entries.length) {
      setMessage(alertHtml('No hay filas para guardar.', 'warning'));
      return;
    }
    if (entries.some(x => !x.memberId || !x.workDate || !x.hours)) {
      setMessage(alertHtml('Completá socio, fecha y horas en todas las filas.', 'danger'));
      return;
    }

    try {
      const result = await api('/api/work-logs/bulk', { method: 'POST', body: JSON.stringify({ entries }) });
      if (result.errors?.length) {
        const byId = new Map(activeMembers.map(m => [String(m.id), m.full_name]));
        const errList = result.errors.map(err => {
          const name = byId.get(String(err.item?.memberId)) || 'Socio';
          return `${name} (${displayDate(err.item?.workDate)}): ${err.message}`;
        });
        setMessage(alertHtml(`Se guardaron ${result.inserted} registros.<br>${errList.join('<br>')}`, 'warning'));
      } else {
        notify(`Se guardaron ${result.inserted} registros correctamente.`);
        bsModal.hide();
        await renderAdminWork();
      }
    } catch (err) {
      setMessage(alertHtml(err.message, 'danger'));
    }
  };

  bsModal.show();
}

/* -------------------------------------------------------------
 * 4. Admin Retributions / Retribuciones y Tarifas
 * ------------------------------------------------------------- */
export async function renderAdminRetributions() {
  const [cfg, rows] = await Promise.all([
    api('/api/retribution/settings'),
    api('/api/retributions')
  ]);

  $('admin-retribuciones').innerHTML = `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h2 class="h4 fw-bold mb-1 text-dark">Retribuciones y liquidaciones</h2>
          <p class="text-secondary small mb-0">Configurá tarifas por hora, administrá feriados y registrá transferencias a asociados.</p>
        </div>
      </div>
      <ul class="nav nav-pills border-bottom pb-3 gap-2" role="tablist">
        <li class="nav-item">
          <button type="button" class="nav-link ${layoutUi.retributions === 'payments' ? 'active' : ''}" data-section-button="payments">
            <i class="bi bi-wallet2 me-1"></i> Liquidaciones de socios
          </button>
        </li>
        <li class="nav-item">
          <button type="button" class="nav-link ${layoutUi.retributions === 'settings' ? 'active' : ''}" data-section-button="settings">
            <i class="bi bi-sliders me-1"></i> Tarifas y feriados
          </button>
        </li>
      </ul>
    </div>

    <!-- Pestaña 1: Liquidaciones -->
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4 ${layoutUi.retributions === 'payments' ? '' : 'd-none'}" data-section-content="payments">
      <h3 class="h5 fw-bold mb-3 text-dark">Liquidaciones calculadas</h3>
      <div class="row g-3">
        ${rows.map(x => {
          const isTransferred = Number(x.transferred_amount) === Number(x.total) && Number(x.total) > 0;
          return `
            <div class="col-12 col-md-6 col-lg-4">
              <div class="card border p-3 rounded-3 h-100 bg-light d-flex flex-column justify-content-between">
                <div>
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <strong class="text-dark">${esc(x.member.full_name)}</strong>
                    <span class="badge ${isTransferred ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-warning-subtle text-warning-emphasis border border-warning-subtle'}">
                      ${isTransferred ? 'Transferido' : 'Pendiente'}
                    </span>
                  </div>
                  <div class="metric-value fs-4 text-primary mb-2">${money(x.total)}</div>
                  <div class="text-secondary small mb-1">
                    <i class="bi bi-clock me-1"></i> ${x.normal_hours} h habituales · ${x.special_hours} h especiales
                  </div>
                  <div class="text-muted small">
                    Habituales: ${money(x.normal_amount)} | Especiales: ${money(x.special_amount)}
                  </div>
                </div>
                <div class="mt-3 pt-2 border-top">
                  ${isTransferred ? `
                    <span class="text-success small fw-semibold"><i class="bi bi-check2-all me-1"></i> Transferencia registrada</span>
                  ` : `
                    <button class="btn btn-sm btn-primary w-100 fw-semibold" data-transfer="${x.member.id}">
                      <i class="bi bi-arrow-right-circle me-1"></i> Registrar transferencia
                    </button>
                  `}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Pestaña 2: Configuración de Tarifas y Feriados -->
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4 ${layoutUi.retributions === 'settings' ? '' : 'd-none'}" data-section-content="settings">
      <div class="row g-4">
        <div class="col-12 col-lg-6">
          <form id="rate-form" class="border p-3 rounded-3 bg-light">
            <h3 class="h5 fw-bold mb-2 text-dark">Tarifas por hora</h3>
            <p class="text-secondary small mb-3">Definí los valores aplicados para el cálculo automático de haberes.</p>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Valor hora habitual ($)</label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <input id="normal-rate" type="number" min="0" step="100" class="form-control" value="${cfg.normal_rate}" required>
              </div>
            </div>
            <div class="mb-4">
              <label class="form-label small fw-semibold">Valor hora domingo / feriado ($)</label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <input id="special-rate" type="number" min="0" step="100" class="form-control" value="${cfg.special_rate}" required>
              </div>
            </div>
            <button class="btn btn-primary fw-semibold" type="submit">
              <i class="bi bi-save me-1"></i> Guardar tarifas
            </button>
          </form>
        </div>

        <div class="col-12 col-lg-6">
          <div class="border p-3 rounded-3 bg-light">
            <h3 class="h5 fw-bold mb-2 text-dark">Feriados nacionales</h3>
            <p class="text-secondary small mb-3">Las horas cargadas en estas fechas se liquidan a tarifa especial.</p>
            <div class="row g-2 mb-3">
              <div class="col-5">
                <input id="holiday-date" type="date" class="form-control form-control-sm" required>
              </div>
              <div class="col-5">
                <input id="holiday-description" class="form-control form-control-sm" placeholder="Descripción ej. Día de la Bandera">
              </div>
              <div class="col-2">
                <button id="add-holiday" type="button" class="btn btn-sm btn-outline-primary w-100">
                  <i class="bi bi-plus-lg"></i>
                </button>
              </div>
            </div>
            <div class="list-group list-group-flush gap-2" style="max-height: 250px; overflow-y: auto;">
              ${cfg.holidays.length ? cfg.holidays.map(h => `
                <div class="list-group-item d-flex align-items-center justify-content-between p-2 rounded-2 border">
                  <div>
                    <strong class="text-dark small">${displayDate(h.holiday_date)}</strong>
                    <div class="text-muted small">${esc(h.description)}</div>
                  </div>
                  <button class="btn btn-sm btn-outline-danger" type="button" data-holiday="${dateOnly(h.holiday_date)}">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              `).join('') : '<div class="text-muted small p-2">No hay feriados cargados.</div>'}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindSectionNav('admin-retribuciones', 'retributions', renderAdminRetributions);

  $('rate-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/retribution/settings', {
        method: 'PUT',
        body: JSON.stringify({
          normalRate: Number($('normal-rate').value),
          specialRate: Number($('special-rate').value)
        })
      });
      notify('Tarifas actualizadas correctamente.');
      await renderAdminRetributions();
    } catch (err) {
      notify(err.message, 'error');
    }
  });

  $('add-holiday').addEventListener('click', async () => {
    const d = $('holiday-date').value;
    const desc = $('holiday-description').value.trim();
    if (!d) {
      notify('Seleccioná una fecha para el feriado.', 'error');
      return;
    }
    try {
      await api('/api/holidays', {
        method: 'POST',
        body: JSON.stringify({ date: d, description: desc })
      });
      notify('Feriado agregado.');
      await renderAdminRetributions();
    } catch (err) {
      notify(err.message, 'error');
    }
  });

  document.querySelectorAll('[data-holiday]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const holidayDate = btn.dataset.holiday;
      const confirmed = await confirmModal({
        title: 'Eliminar feriado',
        message: `¿Deseas quitar este feriado del calendario oficial?`,
        confirmText: 'Eliminar feriado',
        confirmVariant: 'danger',
        icon: 'bi-calendar-x'
      });
      if (!confirmed) return;

      try {
        await api('/api/holidays/' + holidayDate, { method: 'DELETE' });
        notify('Feriado eliminado.');
        await renderAdminRetributions();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  });

  document.querySelectorAll('[data-transfer]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const memberId = btn.dataset.transfer;
      const row = rows.find(x => String(x.member.id) === String(memberId));
      const name = row ? esc(row.member.full_name) : 'el socio';
      const amount = row ? money(row.total) : '';

      const confirmed = await confirmModal({
        title: 'Registrar transferencia bancaria',
        message: `¿Confirmás el registro de transferencia por <strong>${amount}</strong> a favor de <strong>${name}</strong>?`,
        confirmText: 'Registrar transferencia',
        confirmVariant: 'success',
        icon: 'bi-cash-coin'
      });
      if (!confirmed) return;

      try {
        await api('/api/retributions/' + memberId + '/transfer', { method: 'POST' });
        notify('Transferencia registrada.');
        await renderAdminRetributions();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  });
}

/* -------------------------------------------------------------
 * 5. Admin Finance / Ingresos y Gastos
 * ------------------------------------------------------------- */
export async function renderAdminFinance() {
  const rows = await api('/api/financial-movements');
  const income = rows.filter(x => x.movement_type === 'Ingreso').reduce((s, x) => s + Number(x.amount || 0), 0);
  const expense = rows.filter(x => x.movement_type === 'Gasto').reduce((s, x) => s + Number(x.amount || 0), 0);

  $('admin-finanzas').innerHTML = `
    <div class="row g-3 mb-4">
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
          <span class="text-secondary small fw-bold text-uppercase">Ingresos totales</span>
          <div class="metric-value text-success mt-1">${money(income)}</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
          <span class="text-secondary small fw-bold text-uppercase">Gastos totales</span>
          <div class="metric-value text-danger mt-1">${money(expense)}</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
          <span class="text-secondary small fw-bold text-uppercase">Saldo neto</span>
          <div class="metric-value ${income >= expense ? 'text-primary' : 'text-danger'} mt-1">${money(income - expense)}</div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-12 col-lg-4">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
          <h3 class="h5 fw-bold mb-3 text-dark">Registrar movimiento</h3>
          <form id="finance-form">
            <div class="mb-3">
              <label class="form-label small fw-semibold">Tipo</label>
              <select id="finance-type" class="form-select">
                <option value="Ingreso">Ingreso</option>
                <option value="Gasto">Gasto</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Concepto</label>
              <input id="finance-concept" class="form-control" maxlength="120" placeholder="Ej. Venta de producción" required>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Monto ($)</label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <input id="finance-amount" type="number" min="1" step="100" class="form-control" required>
              </div>
            </div>
            <div class="mb-4">
              <label class="form-label small fw-semibold">Fecha</label>
              <input id="finance-date" type="date" class="form-control" required>
            </div>
            <button class="btn btn-primary w-100 fw-semibold" type="submit">
              <i class="bi bi-check-circle me-1"></i> Registrar movimiento
            </button>
          </form>
        </div>
      </div>

      <div class="col-12 col-lg-8">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
          <h3 class="h5 fw-bold mb-3 text-dark">Historial de movimientos</h3>
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Concepto</th>
                  <th class="text-end">Monto</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(x => `
                  <tr>
                    <td>${displayDate(x.movement_date)}</td>
                    <td>
                      <span class="badge ${x.movement_type === 'Ingreso' ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'}">
                        ${esc(x.movement_type)}
                      </span>
                    </td>
                    <td>${esc(x.concept)}</td>
                    <td class="text-end fw-semibold ${x.movement_type === 'Ingreso' ? 'text-success' : 'text-danger'}">
                      ${x.movement_type === 'Ingreso' ? '+' : '-'}${money(x.amount)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  $('finance-date').value = new Date().toISOString().slice(0, 10);
  $('finance-form').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/financial-movements', {
        method: 'POST',
        body: JSON.stringify({
          movementType: $('finance-type').value,
          concept: $('finance-concept').value,
          amount: Number($('finance-amount').value),
          movementDate: $('finance-date').value
        })
      });
      notify('Movimiento financiero registrado.');
      await renderAdminFinance();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
}

/* -------------------------------------------------------------
 * 6. Admin Withdrawals / Anticipos y Excedentes
 * ------------------------------------------------------------- */
export async function renderAdminWithdrawals() {
  const logs = await api('/api/work-logs');
  $('admin-retiros').innerHTML = `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4">
      <h2 class="h4 fw-bold mb-1 text-dark">Anticipos de retiro y distribución de excedentes</h2>
      <p class="text-secondary small mb-3">Simulación de distribución proporcional a las horas efectivamente trabajadas por cada socio.</p>
      <div class="row g-3 align-items-end">
        <div class="col-12 col-md-6 col-lg-4">
          <label class="form-label small fw-semibold">Monto total disponible para distribuir ($)</label>
          <div class="input-group">
            <span class="input-group-text">$</span>
            <input id="distribution-total" type="number" min="0" step="1000" class="form-control" value="300000">
          </div>
        </div>
        <div class="col-12 col-md-6 col-lg-4">
          <button id="calculate-distribution" class="btn btn-primary fw-semibold w-100">
            <i class="bi bi-calculator me-1"></i> Calcular distribución
          </button>
        </div>
      </div>
    </div>
    <div id="distribution-results" class="row g-3"></div>
  `;

  $('calculate-distribution').onclick = () => {
    const total = Number($('distribution-total').value || 0);
    const sum = logs.reduce((s, x) => s + Number(x.hours || 0), 0);
    const by = {};
    logs.forEach(x => { by[x.full_name] = (by[x.full_name] || 0) + Number(x.hours || 0); });

    const entries = Object.entries(by);
    $('distribution-results').innerHTML = entries.length ? entries.map(([name, h]) => `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card border-0 shadow-sm p-3 bg-white rounded-3 h-100">
          <strong class="text-dark d-block mb-1">${esc(name)}</strong>
          <div class="text-secondary small mb-2">${h.toLocaleString('es-AR')} h de ${sum.toLocaleString('es-AR')} h (${sum ? ((h / sum) * 100).toFixed(1) : 0}%)</div>
          <div class="metric-value fs-4 text-primary">${money(sum ? total * h / sum : 0)}</div>
        </div>
      </div>
    `).join('') : '<div class="col-12"><div class="alert alert-light border text-center text-muted">No hay registros de horas disponibles para la simulación.</div></div>';
  };
}

/* -------------------------------------------------------------
 * 7. Admin Funds / Fondos Cooperativos
 * ------------------------------------------------------------- */
export async function renderAdminFunds() {
  const rows = await api('/api/fund-movements');
  const totals = {};
  rows.forEach(x => {
    totals[x.fund_name] = (totals[x.fund_name] || 0) + (x.movement_type === 'Ingreso' ? 1 : -1) * Number(x.amount || 0);
  });
  const names = [...new Set(['Fondo de reserva', 'Fondo operativo', ...Object.keys(totals)])];

  $('admin-fondos').innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-4">
      <div>
        <h2 class="h4 fw-bold mb-1 text-dark">Fondos de la cooperativa</h2>
        <p class="text-secondary small mb-0">Consultá saldos y registrá ingresos o egresos de fondos específicos.</p>
      </div>
    </div>

    <div class="row g-3 mb-4">
      ${names.map(n => `
        <div class="col-12 col-md-4">
          <div class="card border-0 shadow-sm p-4 bg-white rounded-3 h-100">
            <span class="text-secondary small fw-bold text-uppercase">${esc(n)}</span>
            <div class="metric-value text-primary mt-1">${money(totals[n] || 0)}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="row g-4">
      <div class="col-12 col-lg-4">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
          <h3 class="h5 fw-bold mb-3 text-dark">Registrar movimiento de fondo</h3>
          <form id="fund-form">
            <div class="mb-3">
              <label class="form-label small fw-semibold">Nombre del fondo</label>
              <input id="fund-name" class="form-control" value="Fondo de reserva" required>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Tipo de movimiento</label>
              <select id="fund-type" class="form-select">
                <option value="Ingreso">Ingreso</option>
                <option value="Egreso">Egreso</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Monto ($)</label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <input id="fund-amount" type="number" min="1" step="100" class="form-control" required>
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Fecha</label>
              <input id="fund-date" type="date" class="form-control" required>
            </div>
            <div class="mb-4">
              <label class="form-label small fw-semibold">Motivo</label>
              <input id="fund-reason" class="form-control" maxlength="180" placeholder="Ej. Aporte para equipamiento">
            </div>
            <button class="btn btn-primary w-100 fw-semibold" type="submit">
              <i class="bi bi-check-circle me-1"></i> Registrar en fondo
            </button>
          </form>
        </div>
      </div>

      <div class="col-12 col-lg-8">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
          <h3 class="h5 fw-bold mb-3 text-dark">Movimientos en fondos</h3>
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Fecha</th>
                  <th>Fondo</th>
                  <th>Tipo</th>
                  <th>Monto</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(x => `
                  <tr>
                    <td>${displayDate(x.movement_date)}</td>
                    <td><strong>${esc(x.fund_name)}</strong></td>
                    <td>
                      <span class="badge ${x.movement_type === 'Ingreso' ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'}">
                        ${esc(x.movement_type)}
                      </span>
                    </td>
                    <td class="fw-semibold">${money(x.amount)}</td>
                    <td class="small text-secondary">${esc(x.reason || '—')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  $('fund-date').value = new Date().toISOString().slice(0, 10);
  $('fund-form').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/fund-movements', {
        method: 'POST',
        body: JSON.stringify({
          fundName: $('fund-name').value,
          movementType: $('fund-type').value,
          amount: Number($('fund-amount').value),
          movementDate: $('fund-date').value,
          reason: $('fund-reason').value
        })
      });
      notify('Movimiento de fondo registrado.');
      await renderAdminFunds();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
}

/* -------------------------------------------------------------
 * 8. Admin Report / Reporte de Gestión Integral
 * ------------------------------------------------------------- */
export async function renderAdminReport() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!reportUiState.to) reportUiState.to = today;
  if (!reportUiState.from) reportUiState.from = `${today.slice(0, 7)}-01`;

  const data = await api(`/api/admin-report?from=${encodeURIComponent(reportUiState.from)}&to=${encodeURIComponent(reportUiState.to)}`);
  const maxHours = Math.max(1, ...data.hoursByMember.map(x => Number(x.totalHours || 0)));
  const recent = data.financialMovements.slice(0, 10);
  const hoursRows = data.hoursByMember.slice(0, 10);

  $('admin-reporte').innerHTML = `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h2 class="h4 fw-bold mb-1 text-dark">Reporte de gestión cooperativa</h2>
          <p class="text-secondary small mb-0">Vista consolidada financiera, de trabajo y fondos para toma de decisiones.</p>
        </div>
        <button class="btn btn-primary fw-semibold d-flex align-items-center gap-2" id="report-export-pdf" type="button">
          <i class="bi bi-file-earmark-pdf-fill"></i> Exportar reporte en PDF
        </button>
      </div>

      <form id="report-period-form" class="row g-2 align-items-end p-3 bg-light rounded-3">
        <div class="col-12 col-sm-4">
          <label class="form-label small fw-semibold mb-1">Desde</label>
          <input id="report-from" type="date" class="form-control form-control-sm" value="${esc(reportUiState.from)}" required>
        </div>
        <div class="col-12 col-sm-4">
          <label class="form-label small fw-semibold mb-1">Hasta</label>
          <input id="report-to" type="date" class="form-control form-control-sm" value="${esc(reportUiState.to)}" required>
        </div>
        <div class="col-12 col-sm-4">
          <button class="btn btn-sm btn-outline-secondary w-100" type="submit">
            <i class="bi bi-arrow-repeat me-1"></i> Actualizar período
          </button>
        </div>
      </form>
    </div>

    <!-- KPIs del período -->
    <div class="row g-3 mb-4">
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="card border-0 shadow-sm p-3 bg-white rounded-3 h-100">
          <span class="text-secondary small fw-bold text-uppercase">Ingresos</span>
          <div class="metric-value text-success mt-1">${money(data.finance.income)}</div>
          <small class="text-muted">${data.finance.movements} movimientos</small>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="card border-0 shadow-sm p-3 bg-white rounded-3 h-100">
          <span class="text-secondary small fw-bold text-uppercase">Gastos</span>
          <div class="metric-value text-danger mt-1">${money(data.finance.expense)}</div>
          <small class="text-muted">En el período</small>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="card border-0 shadow-sm p-3 bg-white rounded-3 h-100">
          <span class="text-secondary small fw-bold text-uppercase">Saldo neto</span>
          <div class="metric-value ${data.finance.balance >= 0 ? 'text-primary' : 'text-danger'} mt-1">${money(data.finance.balance)}</div>
          <small class="text-muted">Ingresos menos gastos</small>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="card border-0 shadow-sm p-3 bg-white rounded-3 h-100">
          <span class="text-secondary small fw-bold text-uppercase">Retribuciones estimadas</span>
          <div class="metric-value text-dark mt-1">${money(data.estimatedRetributions)}</div>
          <small class="text-muted">Según tarifas vigentes</small>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-12 col-lg-6">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3 h-100">
          <h3 class="h5 fw-bold mb-3 text-dark">Distribución de horas trabajadas</h3>
          <div class="mb-3">
            ${[['Habituales', data.work.regularHours], ['Domingos', data.work.sundayHours], ['Feriados', data.work.holidayHours]].map(([label, value]) => `
              <div class="mb-3">
                <div class="d-flex justify-content-between small fw-semibold mb-1">
                  <span>${label}</span>
                  <strong>${Number(value || 0).toLocaleString('es-AR')} h</strong>
                </div>
                <div class="progress-bar-custom">
                  <span style="width: ${data.work.totalHours ? Math.max(2, Number(value || 0) / data.work.totalHours * 100) : 0}%"></span>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="small text-muted pt-2 border-top">
            Tarifa habitual: ${money(data.rates.normalRate)} · Tarifa especial: ${money(data.rates.specialRate)}
          </div>
        </div>
      </div>

      <div class="col-12 col-lg-6">
        <div class="card border-0 shadow-sm p-4 bg-white rounded-3 h-100">
          <h3 class="h5 fw-bold mb-3 text-dark">Saldos de fondos</h3>
          <div class="list-group list-group-flush gap-2 mb-3">
            ${data.funds.balances.length ? data.funds.balances.map(f => `
              <div class="list-group-item d-flex justify-content-between p-2 rounded-2 border bg-light">
                <span class="text-dark fw-semibold">${esc(f.fund_name)}</span>
                <strong class="text-primary">${money(f.balance)}</strong>
              </div>
            `).join('') : '<div class="text-muted small">No hay fondos registrados.</div>'}
          </div>
          <div class="small text-muted pt-2 border-top">
            En el período: +${money(data.funds.periodIncome)} · -${money(data.funds.periodExpense)}
          </div>
        </div>
      </div>
    </div>

    <!-- Horas por Asociado -->
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4">
      <h3 class="h5 fw-bold mb-3 text-dark">Horas por asociado (Top 10)</h3>
      <div class="list-group list-group-flush gap-2">
        ${hoursRows.length ? hoursRows.map(r => `
          <div class="list-group-item p-3 border rounded-3 bg-light d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
            <div>
              <strong class="text-dark d-block">${esc(r.fullName)}</strong>
              <div class="text-secondary small">${Number(r.regularHours || 0).toLocaleString('es-AR')} h hab. · ${Number(r.sundayHours || 0).toLocaleString('es-AR')} h dom. · ${Number(r.holidayHours || 0).toLocaleString('es-AR')} h fer.</div>
            </div>
            <div class="text-end">
              <span class="h6 fw-bold text-primary mb-0">${Number(r.totalHours || 0).toLocaleString('es-AR')} h</span>
            </div>
          </div>
        `).join('') : '<div class="text-muted small">No hay horas registradas en este período.</div>'}
      </div>
    </div>
  `;

  $('report-period-form').onsubmit = async e => {
    e.preventDefault();
    const from = $('report-from').value;
    const to = $('report-to').value;
    if (!from || !to) {
      notify('Seleccioná ambas fechas.', 'error');
      return;
    }
    if (from > to) {
      notify('La fecha desde no puede ser posterior a la fecha hasta.', 'error');
      return;
    }
    reportUiState.from = from;
    reportUiState.to = to;
    await renderAdminReport();
  };

  $('report-export-pdf').onclick = async () => {
    const btn = $('report-export-pdf');
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Generando PDF...';
    try {
      await downloadAdminReportPdf(reportUiState.from, reportUiState.to);
      notify('Reporte PDF generado y descargado.');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  };
}

/* -------------------------------------------------------------
 * 9. Admin Assembly / Asamblea y Mociones
 * ------------------------------------------------------------- */
export function tallyHtml(m) {
  const t = m.tally || {};
  return `
    <div class="tally-grid my-3">
      <div class="tally-box"><strong>${t.eligible || 0}</strong><span>Habilitados</span></div>
      <div class="tally-box"><strong>${t.emitted || 0}</strong><span>Emitidos</span></div>
      <div class="tally-box"><strong class="text-success">${t.in_favor || 0}</strong><span>A favor</span></div>
      <div class="tally-box"><strong class="text-danger">${t.against || 0}</strong><span>En contra</span></div>
      <div class="tally-box"><strong class="text-secondary">${t.abstentions || 0}</strong><span>Abstención</span></div>
    </div>
  `;
}

export async function renderAdminAssembly() {
  const motions = await api('/api/motions');

  $('admin-asamblea').innerHTML = `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4">
      <h3 class="h5 fw-bold mb-1 text-dark">Nueva moción para votación</h3>
      <p class="text-secondary small mb-3">El Administrador convoca y cierra las mociones; los votos los emiten los asociados.</p>
      <form id="motion-form" class="row g-3 align-items-end">
        <div class="col-12 col-md-8">
          <label class="form-label small fw-semibold">Título de la moción</label>
          <input id="motion-title" class="form-control" required maxlength="220" placeholder="Ej. Aprobación del balance de ejercicio">
        </div>
        <div class="col-12 col-md-4">
          <label class="form-label small fw-semibold">Tipo de moción</label>
          <select id="motion-type" class="form-select">
            <option value="ordinary">Ordinaria (Mayoría simple > 50%)</option>
            <option value="extraordinary">Extraordinaria (Mayoría especial ≥ 66%)</option>
          </select>
        </div>
        <div class="col-12">
          <button class="btn btn-primary fw-semibold" type="submit">
            <i class="bi bi-plus-circle me-1"></i> Convocar moción
          </button>
        </div>
      </form>
    </div>

    <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
      <h3 class="h5 fw-bold mb-3 text-dark">Mociones abiertas</h3>
      <div class="list-group list-group-flush gap-3">
        ${motions.length ? motions.map(m => `
          <div class="list-group-item border rounded-3 p-4 bg-light">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
              <div>
                <h4 class="h6 fw-bold mb-1 text-dark">${esc(m.title)}</h4>
                <div class="text-secondary small">${m.motion_type === 'extraordinary' ? 'Mayoría especial ≥ 66%' : 'Mayoría simple > 50%'}</div>
              </div>
              <span class="badge ${m.motion_type === 'extraordinary' ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-info-subtle text-info border border-info-subtle'}">
                ${m.motion_type === 'extraordinary' ? 'Extraordinaria' : 'Ordinaria'}
              </span>
            </div>
            ${tallyHtml(m)}
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 pt-2 border-top">
              <div>
                ${m.complete ? `
                  <span class="badge ${m.computed_result === 'approved' ? 'bg-success' : 'bg-danger'} fs-6 px-3 py-2">
                    ${m.computed_result === 'approved' ? 'APROBADA' : 'RECHAZADA'}
                  </span>
                ` : `
                  <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-3 py-2">
                    <i class="bi bi-hourglass-split me-1"></i> Esperando votos
                  </span>
                `}
              </div>
              ${m.complete ? `
                <button class="btn btn-primary fw-semibold" data-close-motion="${m.id}">
                  <i class="bi bi-lock-fill me-1"></i> Cerrar y asentar en historial
                </button>
              ` : ''}
            </div>
            ${m.votes?.length ? `
              <div class="mt-3">
                <details class="text-secondary small">
                  <summary class="fw-semibold text-dark cursor-pointer">Ver detalle de los ${m.votes.length} votos emitidos</summary>
                  <div class="list-group list-group-flush mt-2">
                    ${m.votes.map(v => `
                      <div class="list-group-item p-2 d-flex justify-content-between bg-white border rounded mb-1">
                        <span>${esc(v.full_name)}</span>
                        <strong>${esc(v.vote)}</strong>
                      </div>
                    `).join('')}
                  </div>
                </details>
              </div>
            ` : ''}
          </div>
        `).join('') : '<div class="text-muted text-center py-4">No hay mociones abiertas en este momento.</div>'}
      </div>
    </div>
  `;

  $('motion-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/motions', {
        method: 'POST',
        body: JSON.stringify({
          title: $('motion-title').value,
          motionType: $('motion-type').value
        })
      });
      notify('Moción creada y disponible para votación.');
      await renderAdminAssembly();
    } catch (err) {
      notify(err.message, 'error');
    }
  });

  document.querySelectorAll('[data-close-motion]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const motionId = btn.dataset.closeMotion;
      const motion = motions.find(m => String(m.id) === String(motionId));
      const title = motion ? esc(motion.title) : 'esta moción';

      const confirmed = await confirmModal({
        title: 'Cerrar moción de asamblea',
        message: `¿Confirmás el cierre de <strong>${title}</strong>? El padrón y los votos registrados quedarán archivados de forma inmutable en el historial.`,
        confirmText: 'Cerrar moción',
        confirmVariant: 'primary',
        icon: 'bi-lock-fill'
      });
      if (!confirmed) return;

      try {
        await api('/api/motions/' + motionId + '/close', { method: 'POST' });
        notify('Moción cerrada y guardada en el historial de asambleas.');
        await renderAdminAssembly();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  });
}

/* -------------------------------------------------------------
 * 10. Admin History / Historial de Asambleas
 * ------------------------------------------------------------- */
function historicalResultLabel(result) { return result === 'approved' ? 'APROBADA' : 'RECHAZADA'; }
function historicalTypeLabel(type) { return type === 'extraordinary' ? 'Extraordinaria' : 'Ordinaria'; }
function historicalRuleLabel(type) { return type === 'extraordinary' ? 'Mayoría especial ≥ 66%' : 'Mayoría simple > 50%'; }

function historyVoteRows(snapshot) {
  const electorate = Array.isArray(snapshot?.electorate) ? snapshot.electorate : [];
  const votes = Array.isArray(snapshot?.votes) ? snapshot.votes : [];
  const byId = new Map(votes.map(v => [String(v.member_id), v]));
  const people = electorate.length ? electorate : votes.map(v => ({ member_id: v.member_id, full_name: v.full_name, roles: [] }));
  return people.map(p => {
    const v = byId.get(String(p.member_id));
    return {
      fullName: p.full_name || v?.full_name || '—',
      roles: Array.isArray(p.roles) && p.roles.length ? p.roles : ['Asociado'],
      vote: v?.vote || 'Sin voto',
      createdAt: v?.created_at || null
    };
  });
}

export async function renderAdminHistory() {
  const motions = await api('/api/motions?status=closed');

  $('admin-historial').innerHTML = `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4">
      <h2 class="h4 fw-bold mb-1 text-dark">Historial de asambleas</h2>
      <p class="text-secondary small mb-0">Las mociones cerradas conservan el padrón y los votos inmutables tal como estaban al momento del cierre.</p>
    </div>

    <div class="list-group list-group-flush gap-3">
      ${motions.length ? motions.map(m => {
        const s = m.closed_snapshot || {};
        const t = s.tally || {};
        const rows = historyVoteRows(s);
        const eligible = Number(t.eligible || rows.length || 0);
        const emitted = Number(t.emitted || 0);
        const participation = eligible ? emitted / eligible * 100 : 0;

        return `
          <div class="list-group-item border rounded-3 p-4 bg-white shadow-sm">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
              <div>
                <div class="d-flex align-items-center gap-2 mb-1">
                  <span class="badge bg-secondary-subtle text-secondary border">Moción #${m.id}</span>
                  <span class="badge bg-info-subtle text-info border">${historicalTypeLabel(m.motion_type)}</span>
                </div>
                <h3 class="h5 fw-bold mb-1 text-dark">${esc(m.title)}</h3>
                <div class="text-secondary small">Cerrada: ${m.closed_at ? new Date(m.closed_at).toLocaleString('es-AR') : '—'} · ${historicalRuleLabel(m.motion_type)}</div>
              </div>
              <span class="badge ${m.result === 'approved' ? 'bg-success' : 'bg-danger'} fs-6 px-3 py-2">
                ${historicalResultLabel(m.result)}
              </span>
            </div>

            <div class="history-tally-grid my-3">
              <div class="tally-box"><strong>${eligible}</strong><span>Habilitados</span></div>
              <div class="tally-box"><strong>${emitted}</strong><span>Emitidos</span></div>
              <div class="tally-box"><strong class="text-success">${Number(t.in_favor || 0)}</strong><span>A favor</span></div>
              <div class="tally-box"><strong class="text-danger">${Number(t.against || 0)}</strong><span>En contra</span></div>
              <div class="tally-box"><strong class="text-secondary">${Number(t.abstentions || 0)}</strong><span>Abstención</span></div>
              <div class="tally-box"><strong class="text-primary">${participation.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%</strong><span>Participación</span></div>
            </div>

            <div class="d-flex align-items-center gap-2 pt-2 border-top">
              <button class="btn btn-sm btn-outline-secondary" data-history-toggle="${m.id}">
                <i class="bi bi-list-check me-1"></i> Ver detalle histórico
              </button>
              <button class="btn btn-sm btn-primary" data-export-motion-pdf="${m.id}">
                <i class="bi bi-file-earmark-pdf me-1"></i> Exportar acta en PDF
              </button>
            </div>

            <div id="history-detail-${m.id}" class="mt-3 p-3 bg-light rounded-3 border d-none">
              <h4 class="h6 fw-bold mb-2 text-dark">Detalle del padrón y votos registrados al cierre:</h4>
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                  <thead class="table-light">
                    <tr>
                      <th>Asociado</th>
                      <th>Cargos al cierre</th>
                      <th>Voto</th>
                      <th>Fecha de emisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map(r => `
                      <tr>
                        <td><strong>${esc(r.fullName)}</strong></td>
                        <td class="text-secondary small">${esc(r.roles.join(', '))}</td>
                        <td>
                          <span class="badge ${r.vote === 'A favor' ? 'bg-success' : r.vote === 'En contra' ? 'bg-danger' : 'bg-secondary'}">
                            ${esc(r.vote)}
                          </span>
                        </td>
                        <td class="text-muted small">${r.createdAt ? new Date(r.createdAt).toLocaleString('es-AR') : '—'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
      }).join('') : '<div class="text-muted text-center py-4">No hay mociones cerradas en el historial.</div>'}
    </div>
  `;

  document.querySelectorAll('[data-history-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const detail = $('history-detail-' + btn.dataset.historyToggle);
      const isHidden = detail.classList.contains('d-none');
      detail.classList.toggle('d-none');
      btn.innerHTML = isHidden ? '<i class="bi bi-chevron-up me-1"></i> Ocultar detalle' : '<i class="bi bi-list-check me-1"></i> Ver detalle histórico';
    });
  });

  document.querySelectorAll('[data-export-motion-pdf]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const motion = motions.find(m => String(m.id) === btn.dataset.exportMotionPdf);
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Generando PDF...';
      try {
        await downloadMotionPdf(btn.dataset.exportMotionPdf, motion?.title);
        notify('PDF de acta de asamblea generado y descargado.');
      } catch (err) {
        notify(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = old;
      }
    });
  });
}

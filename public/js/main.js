/**
 * CoopGestión — Entry Point Modular ESM
 */
import { $, esc, initials } from './utils.js';
import { state, viewDataCache, memberUiState } from './state.js';
import { api } from './api.js';
import { notify } from './ui.js';
import { initAuth, logout, enterAuthenticatedApp, registerAppStarter } from './modules/auth.js';
import {
  renderAdminHome, renderAdminMembers, renderAdminWork, renderAdminRetributions,
  renderAdminFinance, renderAdminWithdrawals, renderAdminFunds, renderAdminReport,
  renderAdminAssembly, renderAdminHistory
} from './modules/admin.js';
import {
  renderAssociateHome, renderAssociateProfile, renderAssociateHours,
  renderAssociateRetribution, renderAssociateAssembly
} from './modules/associate.js';

export const adminViews = [
  ['admin-inicio', 'Inicio', 'bi-speedometer2'],
  ['admin-socios', 'Socios y aportes', 'bi-people'],
  ['admin-trabajo', 'Trabajo', 'bi-clock-history'],
  ['admin-retribuciones', 'Retribuciones', 'bi-wallet2'],
  ['admin-finanzas', 'Ingresos y gastos', 'bi-cash-coin'],
  ['admin-retiros', 'Retiros y excedentes', 'bi-pie-chart'],
  ['admin-fondos', 'Fondos', 'bi-bank'],
  ['admin-reporte', 'Reporte de gestión', 'bi-file-earmark-bar-graph'],
  ['admin-asamblea', 'Asamblea', 'bi-megaphone'],
  ['admin-historial', 'Historial de asambleas', 'bi-journal-check']
];

export const assocViews = [
  ['assoc-inicio', 'Inicio', 'bi-speedometer2'],
  ['assoc-perfil', 'Mi perfil', 'bi-person-badge'],
  ['assoc-horas', 'Mis horas', 'bi-calendar-check'],
  ['assoc-retribucion', 'Mi retribución', 'bi-wallet2'],
  ['assoc-asamblea', 'Asamblea', 'bi-megaphone']
];

export function buildNav() {
  const admin = state.user.role === 'admin';
  const subtitle = admin ? 'Administración' : 'Portal del asociado';
  const subtitleEl = $('sidebar-subtitle');
  if (subtitleEl) subtitleEl.textContent = subtitle;

  const views = admin ? adminViews : assocViews;
  const groups = admin ? [
    { title: '', views: views.slice(0, 1) },
    { title: 'Gestión diaria', views: views.slice(1, 3) },
    { title: 'Economía y Finanzas', views: views.slice(3, 8) },
    { title: 'Decisiones', views: views.slice(8) }
  ] : [
    { title: '', views }
  ];

  const renderNavItems = () => groups.map(g => `
    <div class="nav-group mb-2">
      ${g.title ? `<div class="nav-group-label">${g.title}</div>` : ''}
      <div class="d-flex flex-column gap-1">
        ${g.views.map(([id, label, icon]) => `
          <button type="button" class="nav-link border-0 text-start w-100" data-view="${id}">
            <i class="bi ${icon} fs-5"></i>
            <span class="text-truncate">${esc(label)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `).join('') + `
    <div class="mt-auto pt-3 border-top">
      <button type="button" class="nav-link text-danger border-0 text-start w-100" data-logout-btn>
        <i class="bi bi-box-arrow-left fs-5"></i>
        <span>Cerrar sesión</span>
      </button>
    </div>
  `;

  const desktopNav = $('nav');
  if (desktopNav) {
    desktopNav.innerHTML = renderNavItems();
  }

  const mobileNav = $('nav-mobile');
  if (mobileNav) {
    mobileNav.innerHTML = renderNavItems();
  }

  // Bind clicks
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      go(btn.dataset.view);
      // Cerrar offcanvas en móvil si está abierto
      const offcanvasEl = $('sidebarOffcanvas');
      if (offcanvasEl && window.bootstrap?.Offcanvas) {
        const bsOffcanvas = window.bootstrap.Offcanvas.getInstance(offcanvasEl);
        if (bsOffcanvas) bsOffcanvas.hide();
      }
    });
  });

  document.querySelectorAll('[data-logout-btn]').forEach(btn => {
    btn.addEventListener('click', () => logout());
  });
}

export function go(view) {
  state.view = view;
  viewDataCache[view] = null;
  sessionStorage.setItem('coopgestion_view', view);

  // Paneles
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.toggle('active', p.id === view);
  });

  // Botones de navegación
  document.querySelectorAll('[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });

  // Título de página
  const allViews = [...adminViews, ...assocViews];
  const current = allViews.find(x => x[0] === view);
  const titleEl = $('page-title');
  if (titleEl) {
    titleEl.textContent = current ? current[1] : 'CoopGestión';
  }

  refreshCurrentView().catch(err => notify(err.message, 'error'));
}

export async function refreshCurrentView(silent = false) {
  if (!state.token || !state.view) return;
  const renderers = {
    'admin-inicio': renderAdminHome,
    'admin-socios': renderAdminMembers,
    'admin-trabajo': renderAdminWork,
    'admin-retribuciones': renderAdminRetributions,
    'admin-finanzas': renderAdminFinance,
    'admin-retiros': renderAdminWithdrawals,
    'admin-fondos': renderAdminFunds,
    'admin-reporte': renderAdminReport,
    'admin-asamblea': renderAdminAssembly,
    'admin-historial': renderAdminHistory,
    'assoc-inicio': renderAssociateHome,
    'assoc-perfil': renderAssociateProfile,
    'assoc-horas': renderAssociateHours,
    'assoc-retribucion': renderAssociateRetribution,
    'assoc-asamblea': renderAssociateAssembly,
  };
  if (renderers[state.view]) {
    await renderers[state.view](silent);
  }
}

export async function startApp() {
  try {
    await api('/api/me');
  } catch (err) {
    logout(false);
    const loginError = $('login-error');
    const loginErrorText = $('login-error-text');
    if (loginError && loginErrorText) {
      loginErrorText.textContent = err.message;
      loginError.classList.remove('d-none');
    }
    return;
  }

  $('login-screen')?.classList.add('d-none');
  $('app')?.classList.remove('d-none');

  const userName = $('user-name');
  if (userName) userName.textContent = state.user.displayName;

  const userRole = $('user-role');
  if (userRole) userRole.textContent = state.user.role === 'admin' ? 'Administrador' : 'Asociado';

  const userAvatar = $('user-avatar');
  if (userAvatar) userAvatar.textContent = initials(state.user.displayName);

  buildNav();

  const validViews = (state.user.role === 'admin' ? adminViews : assocViews).map(x => x[0]);
  const first = validViews.includes(state.view) ? state.view : validViews[0];
  go(first);

  // Polling automático no destructivo cada 4 segundos
  clearInterval(state.poll);
  state.poll = setInterval(() => {
    const activeEl = document.activeElement;
    const tag = activeEl?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.visibilityState !== 'visible') return;
    if (document.querySelector('.modal.show, .panel.active form[data-dirty], .panel.active details[open], .panel.active #history-detail:not(.d-none)')) return;
    if (state.view === 'admin-socios' && memberUiState.formOpen) return;
    refreshCurrentView(true).catch(() => {});
  }, 4000);
}

// Registro de eventos para no interrumpir formularios mientras el usuario escribe
document.addEventListener('input', event => {
  const form = event.target.closest('form');
  if (form) form.dataset.dirty = 'true';
});
document.addEventListener('change', event => {
  const form = event.target.closest('form');
  if (form) form.dataset.dirty = 'true';
});

// Registrar appStarter en módulo auth
registerAppStarter(startApp);

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  if (state.token && state.user) {
    enterAuthenticatedApp();
  }
});

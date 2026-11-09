/**
 * Gestión del estado central de CoopGestión
 */

export const state = {
  token: sessionStorage.getItem('coopgestion_token') || '',
  user: JSON.parse(sessionStorage.getItem('coopgestion_user') || 'null'),
  view: sessionStorage.getItem('coopgestion_view') || '',
  poll: null,
};

export const viewDataCache = {};

export const adminWorkHistoryState = {
  page: 1,
  pageSize: 10,
  search: '',
  type: 'all'
};

export let assocHoursMode = 'single';
export function setAssocHoursMode(mode) {
  assocHoursMode = mode;
}

export const layoutUi = {
  members: 'list',
  retributions: 'payments'
};

export const reportUiState = {
  from: '',
  to: ''
};

export const memberUiState = {
  search: '',
  filter: 'all',
  formOpen: false,
  reactivatingId: null,
  mono: {
    checked: false,
    valid: false,
    message: 'Pendiente de verificación.',
    issuedAt: null,
    expiresAt: null,
    status: 'unknown',
    daysRemaining: null,
    extractedText: ''
  }
};

export function resetMono() {
  memberUiState.mono = {
    checked: false,
    valid: false,
    message: 'Pendiente de verificación.',
    issuedAt: null,
    expiresAt: null,
    status: 'unknown',
    daysRemaining: null,
    extractedText: ''
  };
}

export function setSession(token, user) {
  state.token = token;
  state.user = user;
  sessionStorage.setItem('coopgestion_token', token);
  sessionStorage.setItem('coopgestion_user', JSON.stringify(user));
}

export function persistUserState() {
  sessionStorage.setItem('coopgestion_user', JSON.stringify(state.user));
}

export function clearSession() {
  state.token = '';
  state.user = null;
  state.view = '';
  sessionStorage.removeItem('coopgestion_token');
  sessionStorage.removeItem('coopgestion_user');
  sessionStorage.removeItem('coopgestion_view');
  if (state.poll) {
    clearInterval(state.poll);
    state.poll = null;
  }
}

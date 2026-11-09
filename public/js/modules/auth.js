/**
 * Módulo de Autenticación y Gestión de Sesión
 */
import { $, esc } from '../utils.js';
import { state, setSession, persistUserState, clearSession } from '../state.js';
import { api, setUnauthorizedHandler } from '../api.js';
import { createBootstrapModal, notify } from '../ui.js';

let appStarter = null;

export function registerAppStarter(fn) {
  appStarter = fn;
}

export function logout(show = true) {
  clearSession();
  const appEl = $('app');
  const loginScreen = $('login-screen');
  if (appEl) appEl.classList.add('d-none');
  if (loginScreen) loginScreen.classList.remove('d-none');

  const errorEl = $('login-error');
  if (errorEl && show) {
    errorEl.classList.add('d-none');
  }
}

// Configurar handler para 401
setUnauthorizedHandler(() => logout(false));

export function showForcedPasswordChange() {
  return new Promise((resolve) => {
    const bodyHtml = `
      <p class="text-secondary mb-3">Es tu primer ingreso con la contraseña temporal creada por Administración. Por seguridad, debés ingresar una contraseña personal antes de continuar.</p>
      <div class="alert alert-warning d-flex align-items-center gap-2 mb-3" role="alert">
        <i class="bi bi-shield-lock-fill flex-shrink-0 fs-5"></i>
        <div class="small">Este cambio es obligatorio por única vez. Mínimo 4 caracteres.</div>
      </div>
      <form id="forced-password-form">
        <div class="mb-3">
          <label for="forced-new-password" class="form-label fw-semibold">Nueva contraseña</label>
          <input id="forced-new-password" type="password" minlength="4" class="form-control" autocomplete="new-password" required>
        </div>
        <div class="mb-3">
          <label for="forced-confirm-password" class="form-label fw-semibold">Repetir nueva contraseña</label>
          <input id="forced-confirm-password" type="password" minlength="4" class="form-control" autocomplete="new-password" required>
        </div>
        <div id="forced-password-error" class="alert alert-danger d-none small py-2" role="alert"></div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-outline-secondary" id="forced-password-logout" type="button">
        <i class="bi bi-box-arrow-left me-1"></i> Cerrar sesión
      </button>
      <button class="btn btn-primary fw-semibold" id="forced-password-submit" type="button">
        <i class="bi bi-check2-circle me-1"></i> Guardar contraseña
      </button>
    `;

    const { modalEl, bsModal } = createBootstrapModal({
      id: 'forcedPasswordModal',
      title: 'Actualizá tu contraseña',
      subtitle: 'Primer acceso al sistema cooperativo',
      bodyHtml,
      footerHtml,
      size: 'modal-md'
    });

    $('forced-password-logout').addEventListener('click', () => {
      bsModal.hide();
      logout(false);
      resolve(false);
    });

    const submitBtn = $('forced-password-submit');
    const form = $('forced-password-form');

    const handleSave = async (e) => {
      if (e) e.preventDefault();
      const errorDiv = $('forced-password-error');
      errorDiv.classList.add('d-none');

      const next = $('forced-new-password').value;
      const confirm = $('forced-confirm-password').value;

      if (next.length < 4) {
        errorDiv.textContent = 'La contraseña debe tener al menos 4 caracteres.';
        errorDiv.classList.remove('d-none');
        return;
      }
      if (next !== confirm) {
        errorDiv.textContent = 'Las contraseñas no coinciden.';
        errorDiv.classList.remove('d-none');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';

      try {
        await api('/api/me/password', {
          method: 'POST',
          body: JSON.stringify({ newPassword: next })
        });
        state.user.mustChangePassword = false;
        persistUserState();
        bsModal.hide();
        notify('Contraseña actualizada correctamente.');
        resolve(true);
      } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.classList.remove('d-none');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Guardar contraseña';
      }
    };

    submitBtn.addEventListener('click', handleSave);
    form.addEventListener('submit', handleSave);

    bsModal.show();
  });
}

export async function enterAuthenticatedApp() {
  if (state.user?.role === 'associate' && state.user?.mustChangePassword) {
    const changed = await showForcedPasswordChange();
    if (!changed) return;
  }
  if (typeof appStarter === 'function') {
    await appStarter();
  }
}

export function initAuth() {
  const loginForm = $('login-form');
  if (!loginForm) return;

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorEl = $('login-error');
    const errorText = $('login-error-text');
    errorEl.classList.add('d-none');

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const origHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Ingresando...';

    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: $('login-user').value.trim(),
          password: $('login-password').value
        })
      });
      setSession(data.token, data.user);
      $('login-password').value = '';
      await enterAuthenticatedApp();
    } catch (err) {
      if (errorText) errorText.textContent = err.message;
      errorEl.classList.remove('d-none');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origHtml;
    }
  });
}

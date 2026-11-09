/**
 * Componentes de interfaz de usuario con Bootstrap 5.3
 */
import { $, esc } from './utils.js';

export function notify(message, type = 'ok', duration = 4000) {
  let container = $('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '1090';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }

  const isError = type === 'error';
  const bgClass = isError ? 'text-bg-danger' : 'text-bg-success';
  const icon = isError ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill';

  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center ${bgClass} border-0 shadow-lg`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');

  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="bi ${icon} fs-5 flex-shrink-0"></i>
        <div class="fw-medium">${esc(message)}</div>
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button>
    </div>
  `;

  container.appendChild(toastEl);

  if (window.bootstrap?.Toast) {
    const bsToast = new window.bootstrap.Toast(toastEl, { delay: duration, autohide: true });
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    bsToast.show();
  } else {
    setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(() => toastEl.remove(), 250);
    }, duration);
  }
}

export function monoBadge(status, days) {
  if (status === 'expired') {
    return `<span class="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle"><i class="bi bi-x-circle-fill me-1"></i>Vencida</span>`;
  }
  if (status === 'expiring') {
    return `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle"><i class="bi bi-exclamation-triangle-fill me-1"></i>Vence en ${days} día${Number(days) === 1 ? '' : 's'}</span>`;
  }
  if (status === 'valid') {
    return `<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle"><i class="bi bi-check-circle-fill me-1"></i>Vigente</span>`;
  }
  return `<span class="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle"><i class="bi bi-question-circle me-1"></i>Sin vigencia</span>`;
}

export function alertHtml(message, type = 'info', icon = null) {
  const iconClass = icon || (
    type === 'danger' ? 'bi-exclamation-triangle-fill' :
    type === 'warning' ? 'bi-exclamation-circle-fill' :
    type === 'success' ? 'bi-check-circle-fill' : 'bi-info-circle-fill'
  );

  return `
    <div class="alert alert-${type} d-flex align-items-center gap-2 shadow-sm" role="alert">
      <i class="bi ${iconClass} flex-shrink-0 fs-5"></i>
      <div>${message}</div>
    </div>
  `;
}

/**
 * Crea y presenta un Modal interactivo de Bootstrap 5.3
 */
export function createBootstrapModal({ id, title, subtitle = '', bodyHtml = '', footerHtml = '', size = 'modal-lg' }) {
  document.getElementById(id)?.remove();

  const modalHtml = `
    <div class="modal fade" id="${id}" tabindex="-1" aria-labelledby="${id}Label" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered ${size} modal-dialog-scrollable">
        <div class="modal-content border-0 shadow-lg">
          <div class="modal-header bg-light">
            <div>
              <h5 class="modal-title fw-bold text-dark" id="${id}Label">${title}</h5>
              ${subtitle ? `<div class="text-secondary small">${subtitle}</div>` : ''}
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body p-4" id="${id}-body">
            ${bodyHtml}
          </div>
          ${footerHtml ? `<div class="modal-footer bg-light p-3" id="${id}-footer">${footerHtml}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modalEl = document.getElementById(id);
  const bsModal = new window.bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: true });

  modalEl.addEventListener('hidden.bs.modal', () => {
    modalEl.remove();
  }, { once: true });

  return { modalEl, bsModal };
}

/**
 * Modal de confirmación estilizado con Bootstrap 5.3 (reemplazo de window.confirm)
 */
export function confirmModal({
  title = '¿Confirmar acción?',
  message = '¿Deseas continuar con esta operación?',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  confirmVariant = 'primary', // 'primary' | 'success' | 'danger' | 'warning'
  icon = 'bi-question-circle'
} = {}) {
  return new Promise((resolve) => {
    let resolved = false;
    const modalId = 'confirmActionModal';

    const iconColor =
      confirmVariant === 'success' ? 'bg-success-subtle text-success' :
      confirmVariant === 'danger' ? 'bg-danger-subtle text-danger' :
      confirmVariant === 'warning' ? 'bg-warning-subtle text-warning' : 'bg-primary-subtle text-primary';

    const bodyHtml = `
      <div class="d-flex align-items-start gap-3">
        <div class="rounded-circle ${iconColor} d-flex align-items-center justify-content-center flex-shrink-0" style="width: 48px; height: 48px;">
          <i class="bi ${icon} fs-4"></i>
        </div>
        <div class="flex-grow-1">
          <p class="mb-0 text-secondary lh-base">${message}</p>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">
        ${cancelText}
      </button>
      <button class="btn btn-${confirmVariant} fw-semibold" type="button" id="confirm-modal-ok-btn">
        ${confirmText}
      </button>
    `;

    const { modalEl, bsModal } = createBootstrapModal({
      id: modalId,
      title,
      bodyHtml,
      footerHtml,
      size: 'modal-md'
    });

    const okBtn = modalEl.querySelector('#confirm-modal-ok-btn');
    if (okBtn) {
      okBtn.addEventListener('click', () => {
        resolved = true;
        bsModal.hide();
        resolve(true);
      });
    }

    modalEl.addEventListener('hidden.bs.modal', () => {
      if (!resolved) {
        resolve(false);
      }
    }, { once: true });

    bsModal.show();
  });
}

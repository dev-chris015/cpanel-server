<script>
  import { createEventDispatcher } from 'svelte';
  import { 
    Trash2, 
    AlertTriangle, 
    X, 
    RefreshCw, 
    Shield, 
    Server, 
    Globe,
    CheckCircle2
  } from 'lucide-svelte';
  import { api } from '../api.js';

  export let show = false;
  export let vhost = null;

  const dispatch = createEventDispatcher();

  let loading = false;
  let error = null;

  $: if (show) {
    error = null;
    loading = false;
  }

  function handleClose() {
    if (loading) return;
    dispatch('close');
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && !loading) {
      handleClose();
    }
  }

  async function handleConfirmDelete() {
    if (loading || !vhost || !vhost.domain) return;

    loading = true;
    error = null;

    try {
      const res = await api.delete(`/proxy/vhosts/${vhost.domain}`);
      if (res && res.success) {
        dispatch('success', {
          domain: vhost.domain,
          result: res
        });
        dispatch('close');
      } else {
        error = res?.error || res?.details || 'No se pudo eliminar el Virtual Host.';
      }
    } catch (err) {
      const errData = err.data || {};
      error = err.message || errData.error || 'Error al comunicarse con el servidor Nginx.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show && vhost}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="modal-backdrop" on:click|self={handleClose} role="presentation">
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-vhost-title">
      
      <!-- ENCABEZADO -->
      <header class="modal-header">
        <div class="header-left">
          <div class="danger-icon-container">
            <Trash2 size={22} class="icon-danger" />
          </div>
          <div class="header-info">
            <h3 id="delete-vhost-title" class="modal-title">Eliminar Virtual Host</h3>
            <span class="header-sub">Acción destructiva de proxy inverso</span>
          </div>
        </div>

        <button 
          type="button" 
          class="btn-close" 
          on:click={handleClose} 
          disabled={loading}
          aria-label="Cerrar modal"
        >
          <X size={18} />
        </button>
      </header>

      <!-- CUERPO -->
      <div class="modal-body">
        <div class="warning-box">
          <AlertTriangle size={18} class="warning-icon" />
          <p class="warning-text">
            ¿Estás seguro de que deseas eliminar la configuración del Virtual Host para el siguiente dominio?
          </p>
        </div>

        <div class="vhost-preview-card">
          <div class="preview-row">
            <span class="preview-label">Dominio:</span>
            <code class="preview-domain">{vhost.domain}</code>
          </div>

          {#if vhost.target}
            <div class="preview-row">
              <span class="preview-label">Destino (Upstream):</span>
              <span class="preview-target">
                <Server size={12} />
                <span>{vhost.target}</span>
              </span>
            </div>
          {/if}

          {#if vhost.hasSsl}
            <div class="preview-row">
              <span class="preview-label">Seguridad SSL:</span>
              <span class="preview-ssl">
                <Shield size={12} class="text-green" />
                <span>Certificado HTTPS asociado (se conservará en disco)</span>
              </span>
            </div>
          {/if}
        </div>

        <div class="rollback-note">
          <Shield size={14} class="note-icon" />
          <p class="note-text">
            <strong>Verificación Sintáctica y Rollback:</strong> Antes de retirar el tráfico, Nginx verificará la consistencia del servicio (<code>nginx -t</code>). Si se detecta algún error, se restaurará automáticamente la configuración previa sin cortes de servicio.
          </p>
        </div>

        {#if error}
          <div class="error-alert">
            <AlertTriangle size={16} class="text-danger" />
            <div class="error-content">
              <strong>Error al eliminar:</strong>
              <p>{error}</p>
            </div>
          </div>
        {/if}
      </div>

      <!-- FOOTER -->
      <footer class="modal-footer">
        <button 
          type="button" 
          class="btn-cancel" 
          on:click={handleClose} 
          disabled={loading}
        >
          Cancelar
        </button>

        <button 
          type="button" 
          class="btn-confirm-delete" 
          on:click={handleConfirmDelete} 
          disabled={loading}
        >
          {#if loading}
            <RefreshCw size={14} class="spin" />
            <span>Eliminando...</span>
          {:else}
            <Trash2 size={14} />
            <span>Confirmar Eliminación</span>
          {/if}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1050;
    padding: 16px;
    box-sizing: border-box;
  }

  .modal-dialog {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #26262a);
    border-radius: 14px;
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    overflow: hidden;
    animation: modalScale 0.18s ease-out;
  }

  @keyframes modalScale {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: var(--surface-muted, #18181b);
    border-bottom: 1px solid var(--card-border, #26262a);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .danger-icon-container {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.25);
    flex-shrink: 0;
  }

  :global(.icon-danger) {
    color: #f87171;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .modal-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-main, #f8fafc);
  }

  .header-sub {
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
  }

  .btn-close {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .btn-close:hover:not(:disabled) {
    color: var(--text-main, #f1f5f9);
    background: rgba(255, 255, 255, 0.08);
  }

  .btn-close:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .modal-body {
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .warning-box {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: 8px;
    padding: 10px 14px;
  }

  :global(.warning-icon) {
    color: #fbbf24;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .warning-text {
    margin: 0;
    font-size: 0.82rem;
    color: #fde68a;
    line-height: 1.4;
  }

  .vhost-preview-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--card-border, #26262a);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .preview-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
  }

  .preview-label {
    color: var(--text-muted, #94a3b8);
    width: 110px;
    flex-shrink: 0;
  }

  .preview-domain {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-weight: 600;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .preview-target {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #e2e8f0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.78rem;
  }

  .preview-ssl {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.76rem;
    color: #94a3b8;
  }

  .rollback-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.74rem;
  }

  :global(.note-icon) {
    color: #38bdf8;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .note-text {
    margin: 0;
    color: var(--text-muted, #94a3b8);
    line-height: 1.4;
  }

  .note-text strong {
    color: #e2e8f0;
  }

  .note-text code {
    background: rgba(255, 255, 255, 0.08);
    padding: 1px 4px;
    border-radius: 3px;
    color: #cbd5e1;
  }

  .error-alert {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.78rem;
    color: #fca5a5;
  }

  .error-content p {
    margin: 2px 0 0;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    background: var(--surface-muted, #18181b);
    border-top: 1px solid var(--card-border, #26262a);
  }

  .btn-cancel {
    background: transparent;
    color: var(--text-muted, #94a3b8);
    border: 1px solid var(--card-border, #3f3f46);
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-cancel:hover:not(:disabled) {
    color: var(--text-main, #f8fafc);
    background: rgba(255, 255, 255, 0.05);
    border-color: #52525b;
  }

  .btn-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-confirm-delete {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #dc2626;
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-confirm-delete:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn-confirm-delete:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  :global(.text-green) { color: #34d399; }
  :global(.text-danger) { color: #f87171; }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>

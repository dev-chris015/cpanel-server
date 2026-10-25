<script>
  import { createEventDispatcher } from 'svelte';
  import { X, Network, Server, Clock, HardDrive, KeyRound, Copy, Check } from 'lucide-svelte';

  export let show = false;
  export let container = null; // Información de container / inspect

  const dispatch = createEventDispatcher();

  let copiedIndex = null;

  function closeModal() {
    dispatch('close');
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }

  // Extraer IP en 'server-net' u otra red encontrada
  $: serverNetIp = (() => {
    if (!container) return '-';
    // Estructura inspect Dockerode: NetworkSettings.Networks
    const networks = container?.NetworkSettings?.Networks || container?.networks || {};
    if (networks['server-net']?.IPAddress) {
      return networks['server-net'].IPAddress;
    }
    // Si no está server-net, tomar la primera red que tenga IP
    for (const [netName, netData] of Object.entries(networks)) {
      if (netData?.IPAddress) {
        return `${netData.IPAddress} (${netName})`;
      }
    }
    return 'No asignada';
  })();

  // Extraer puertos
  $: formattedPorts = (() => {
    if (!container) return [];
    // Caso 1: PortBindings / Ports desde inspect
    const ports = [];
    const portBindings = container?.NetworkSettings?.Ports || container?.HostConfig?.PortBindings || {};
    for (const [containerPort, hostBindings] of Object.entries(portBindings)) {
      if (hostBindings && hostBindings.length > 0) {
        hostBindings.forEach(binding => {
          ports.push(`${binding.HostPort || '*'}:${containerPort}`);
        });
      } else {
        ports.push(`${containerPort} (interno)`);
      }
    }
    // Caso 2: si viene de listContainers
    if (ports.length === 0 && Array.isArray(container?.Ports)) {
      container.Ports.forEach(p => {
        ports.push(`${p.PublicPort ? p.PublicPort + ' -> ' : ''}${p.PrivatePort}/${p.Type}`);
      });
    }
    return ports;
  })();

  // Imagen del contenedor
  $: imageName = container?.Config?.Image || container?.Image || '-';

  // Uptime / StartedAt / State
  $: uptimeInfo = (() => {
    if (!container) return '-';
    const state = container?.State;
    if (typeof state === 'object' && state !== null) {
      if (state.Running) {
        const startedAt = state.StartedAt ? new Date(state.StartedAt) : null;
        if (startedAt && !isNaN(startedAt.getTime())) {
          const diffMs = Date.now() - startedAt.getTime();
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          return `En ejecución hace ${diffHours}h ${diffMins}m (desde ${startedAt.toLocaleString()})`;
        }
        return 'En ejecución';
      }
      return `Detenido (${state.Status || 'exited'})`;
    }
    return container?.Status || '-';
  })();

  // Variables de entorno
  $: envList = (() => {
    if (!container) return [];
    return container?.Config?.Env || [];
  })();

  function copyToClipboard(text, index) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      copiedIndex = index;
      setTimeout(() => {
        copiedIndex = null;
      }, 2000);
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div class="modal-backdrop" on:click|self={closeModal}>
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="header-title-group">
          <Server size={18} class="header-icon" />
          <h3 class="modal-title">
            Inspección: {container?.Name?.replace(/^\//, '') || container?.name || container?.Id?.slice(0, 12) || 'Contenedor'}
          </h3>
        </div>
        <button class="btn-close" on:click={closeModal} title="Cerrar">
          <X size={18} />
        </button>
      </div>

      <div class="modal-body">
        <!-- Detalles Generales y Red -->
        <div class="info-section">
          <h4 class="section-title">
            <Network size={16} class="section-icon" />
            Red y Conectividad
          </h4>
          <div class="info-grid">
            <div class="info-row">
              <span class="info-label">IP en 'server-net':</span>
              <span class="info-value font-mono highlight-ip">{serverNetIp}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Puertos mapeados:</span>
              <div class="ports-list">
                {#if formattedPorts.length > 0}
                  {#each formattedPorts as port}
                    <span class="port-tag font-mono">{port}</span>
                  {/each}
                {:else}
                  <span class="info-value text-muted">Sin puertos expuestos</span>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <!-- Imagen y Estado -->
        <div class="info-section">
          <h4 class="section-title">
            <HardDrive size={16} class="section-icon" />
            Información del Runtime
          </h4>
          <div class="info-grid">
            <div class="info-row">
              <span class="info-label">Imagen:</span>
              <span class="info-value font-mono">{imageName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">ID Contenedor:</span>
              <span class="info-value font-mono text-muted">{container?.Id || '-'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">
                <Clock size={14} class="inline-icon" /> Uptime:
              </span>
              <span class="info-value">{uptimeInfo}</span>
            </div>
          </div>
        </div>

        <!-- Variables de Entorno Enmascaradas -->
        <div class="info-section">
          <h4 class="section-title">
            <KeyRound size={16} class="section-icon" />
            Variables de Entorno ({envList.length})
          </h4>
          {#if envList.length > 0}
            <div class="env-container">
              {#each envList as envVar, index}
                <div class="env-item">
                  <span class="env-text font-mono">{envVar}</span>
                  <button 
                    class="btn-copy-env" 
                    on:click={() => copyToClipboard(envVar, index)}
                    title="Copiar variable"
                  >
                    {#if copiedIndex === index}
                      <Check size={13} class="icon-copied" />
                    {:else}
                      <Copy size={13} />
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="empty-env">No hay variables de entorno registradas.</div>
          {/if}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-primary" on:click={closeModal}>Entendido</button>
      </div>
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
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .modal-dialog {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    width: 100%;
    max-width: 680px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    animation: modal-appear 0.2s ease-out;
  }

  @keyframes modal-appear {
    from {
      opacity: 0;
      transform: scale(0.96);
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
    background: #111827;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .header-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  :global(.header-icon) {
    color: #38bdf8;
  }

  .modal-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: #f8fafc;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .btn-close:hover {
    color: #f1f5f9;
    background: rgba(255, 255, 255, 0.08);
  }

  .modal-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .info-section {
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  :global(.section-icon) {
    color: #38bdf8;
  }

  .info-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .info-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.85rem;
  }

  .info-label {
    color: #94a3b8;
    min-width: 130px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  :global(.inline-icon) {
    color: #64748b;
  }

  .info-value {
    color: #e2e8f0;
    text-align: right;
    word-break: break-all;
  }

  .highlight-ip {
    color: #38bdf8;
    font-weight: 600;
  }

  .ports-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }

  .port-tag {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 0.78rem;
  }

  .font-mono {
    font-family: monospace;
  }

  .text-muted {
    color: #64748b;
  }

  .env-container {
    max-height: 180px;
    overflow-y: auto;
    background: #090e17;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .env-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 4px;
    font-size: 0.78rem;
  }

  .env-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .env-text {
    color: #cbd5e1;
    word-break: break-all;
  }

  .btn-copy-env {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: color 0.15s;
  }

  .btn-copy-env:hover {
    color: #f1f5f9;
  }

  :global(.icon-copied) {
    color: #34d399;
  }

  .empty-env {
    color: #64748b;
    font-size: 0.82rem;
    font-style: italic;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: 12px 20px;
    background: #111827;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .btn-primary {
    background: #0284c7;
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary:hover {
    background: #0369a1;
  }
</style>

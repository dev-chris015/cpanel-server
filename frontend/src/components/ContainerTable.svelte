<script>
  import { 
    Package, RefreshCw, Loader2, AlertTriangle, Box,
    Play, Square, RotateCw, Trash2, FileText, Info, X
  } from 'lucide-svelte';

  export let loading = false;
  export let error = null;
  export let containers = [];
  export let fetchContainers;

  let API_BASE = 'http://localhost:5000/api';
  
  import { onMount } from 'svelte';
  onMount(() => {
    API_BASE = localStorage.getItem('apiBaseUrl') || 'http://localhost:5000/api';
  });

  let actionLoading = {}; 

  // Modals state
  let showLogsModal = false;
  let logsContent = '';
  let logsLoading = false;

  let showInspectModal = false;
  let inspectData = null;
  let inspectLoading = false;

  async function performAction(id, action) {
    if (!confirm(`¿Estás seguro que deseas ejecutar '${action}' en este contenedor?`)) return;
    
    actionLoading[id] = action;
    try {
      const method = action === 'remove' ? 'DELETE' : 'POST';
      const url = action === 'remove' ? `${API_BASE}/containers/${id}` : `${API_BASE}/containers/${id}/${action}`;
      
      const res = await fetch(url, { method });
      const json = await res.json();
      if (!json.success) {
        alert(`Error: ${json.error}`);
      } else {
        await fetchContainers(); // Update list after action
      }
    } catch (err) {
      alert(`Error de red al conectar con el servidor: ${err.message}`);
    } finally {
      actionLoading[id] = null;
    }
  }

  async function viewLogs(id) {
    showLogsModal = true;
    logsLoading = true;
    logsContent = '';
    try {
      const res = await fetch(`${API_BASE}/containers/${id}/logs`);
      const json = await res.json();
      if (json.success) {
        logsContent = json.data || 'El contenedor no ha emitido logs.';
      } else {
        logsContent = `Error al cargar logs: ${json.error}`;
      }
    } catch (err) {
      logsContent = `Error de red: ${err.message}`;
    } finally {
      logsLoading = false;
    }
  }

  async function inspectContainer(id) {
    showInspectModal = true;
    inspectLoading = true;
    inspectData = null;
    try {
      const res = await fetch(`${API_BASE}/containers/${id}/inspect`);
      const json = await res.json();
      if (json.success) {
        inspectData = json.data;
      } else {
        alert(`Error al inspeccionar: ${json.error}`);
        showInspectModal = false;
      }
    } catch (err) {
      alert(`Error de red: ${err.message}`);
      showInspectModal = false;
    } finally {
      inspectLoading = false;
    }
  }

  function closeModals() {
    showLogsModal = false;
    showInspectModal = false;
  }
</script>

<section class="glass-card list-card">
  <div class="card-header-styled space-between">
    <div class="header-left">
      <div class="icon-wrapper purple">
        <Package size={20} />
      </div>
      <div>
        <h3>Contenedores Activos</h3>
        <p class="subtitle">Estado en tiempo real de los servicios y acciones.</p>
      </div>
    </div>
    <button class="btn-icon" on:click={fetchContainers} title="Actualizar lista">
      <RefreshCw size={18} class={loading ? 'spin' : ''} />
    </button>
  </div>

  {#if loading && containers.length === 0}
    <div class="state-container">
      <Loader2 size={40} class="spin text-purple" />
      <p>Sincronizando con Docker...</p>
    </div>
  {:else if error}
    <div class="alert error">
      <AlertTriangle size={20} />
      <span>{error}</span>
    </div>
  {:else if containers.length === 0}
    <div class="state-container">
      <Box size={48} class="text-muted" />
      <p>No hay contenedores creados en este host.</p>
    </div>
  {:else}
    <div class="table-responsive">
      <table class="premium-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nombre</th>
            <th>Imagen</th>
            <th>Estado</th>
            <th>Puertos</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each containers as c}
            <tr>
              <td class="font-mono text-blue">{c.Id.substring(0, 12)}</td>
              <td class="fw-600">{c.Names ? c.Names.join(', ').replace(/^\//, '') : '-'}</td>
              <td>
                <span class="tag dark">{c.Image}</span>
              </td>
              <td>
                <span class="status-badge" class:running={c.State === 'running'}>
                  <span class="pulse-dot" class:active={c.State === 'running'}></span>
                  {c.State}
                </span>
              </td>
              <td class="font-mono text-sm">
                {#if c.Ports && c.Ports.length > 0}
                  <div class="ports-list">
                    {#each c.Ports as p}
                      <span class="port-tag">
                        {p.PublicPort ? `${p.PublicPort}:` : ''}{p.PrivatePort}/{p.Type}
                      </span>
                    {/each}
                  </div>
                {:else}
                  <span class="text-muted">-</span>
                {/if}
              </td>
              <td class="actions-cell">
                <div class="action-buttons">
                  {#if c.State === 'running'}
                    <button class="btn-act stop" title="Detener" on:click={() => performAction(c.Id, 'stop')} disabled={actionLoading[c.Id]}>
                      {#if actionLoading[c.Id] === 'stop'}<Loader2 size={14} class="spin"/>{:else}<Square size={14}/>{/if}
                    </button>
                    <button class="btn-act restart" title="Reiniciar" on:click={() => performAction(c.Id, 'restart')} disabled={actionLoading[c.Id]}>
                      {#if actionLoading[c.Id] === 'restart'}<Loader2 size={14} class="spin"/>{:else}<RotateCw size={14}/>{/if}
                    </button>
                  {:else}
                    <button class="btn-act start" title="Iniciar" on:click={() => performAction(c.Id, 'start')} disabled={actionLoading[c.Id]}>
                      {#if actionLoading[c.Id] === 'start'}<Loader2 size={14} class="spin"/>{:else}<Play size={14}/>{/if}
                    </button>
                  {/if}
                  
                  <button class="btn-act inspect" title="Inspeccionar Detalles" on:click={() => inspectContainer(c.Id)}>
                    <Info size={14}/>
                  </button>
                  <button class="btn-act logs" title="Ver Logs" on:click={() => viewLogs(c.Id)}>
                    <FileText size={14}/>
                  </button>
                  <button class="btn-act remove" title="Eliminar Contenedor" on:click={() => performAction(c.Id, 'remove')} disabled={actionLoading[c.Id]}>
                    {#if actionLoading[c.Id] === 'remove'}<Loader2 size={14} class="spin"/>{:else}<Trash2 size={14}/>{/if}
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<!-- Modals -->
{#if showLogsModal || showInspectModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={closeModals}>
    
    {#if showLogsModal}
      <div class="modal-content logs-modal" on:click|stopPropagation>
        <div class="modal-header">
          <h3>Logs del Contenedor</h3>
          <button class="btn-close" on:click={closeModals}><X size={20}/></button>
        </div>
        <div class="modal-body">
          {#if logsLoading}
            <div class="center-state"><Loader2 size={32} class="spin text-purple" /></div>
          {:else}
            <pre class="terminal-logs">{logsContent}</pre>
          {/if}
        </div>
      </div>
    {/if}

    {#if showInspectModal}
      <div class="modal-content inspect-modal" on:click|stopPropagation>
        <div class="modal-header">
          <h3>Detalles de Inspección</h3>
          <button class="btn-close" on:click={closeModals}><X size={20}/></button>
        </div>
        <div class="modal-body">
          {#if inspectLoading}
            <div class="center-state"><Loader2 size={32} class="spin text-purple" /></div>
          {:else if inspectData}
            <div class="inspect-grid">
              <div class="inspect-section">
                <h4>General</h4>
                <p><strong>ID:</strong> <span class="font-mono text-sm">{inspectData.Id}</span></p>
                <p><strong>Nombre:</strong> {inspectData.Name}</p>
                <p><strong>Imagen:</strong> {inspectData.Config.Image}</p>
                <p><strong>Comando:</strong> <span class="font-mono text-sm">{inspectData.Config.Cmd ? inspectData.Config.Cmd.join(' ') : '-'}</span></p>
                <p><strong>Estado:</strong> {inspectData.State.Status}</p>
              </div>
              
              <div class="inspect-section">
                <h4>Variables de Entorno (Env)</h4>
                <div class="code-list">
                  {#if inspectData.Config.Env && inspectData.Config.Env.length > 0}
                    {#each inspectData.Config.Env as e}
                      <div class="code-item">{e}</div>
                    {/each}
                  {:else}
                    <div class="text-muted text-sm">Sin variables definidas</div>
                  {/if}
                </div>
              </div>
              
              <div class="inspect-section">
                <h4>Montajes (Volumes/Binds)</h4>
                <div class="code-list">
                  {#if inspectData.Mounts && inspectData.Mounts.length > 0}
                    {#each inspectData.Mounts as m}
                      <div class="code-item">{m.Source} -> {m.Destination}</div>
                    {/each}
                  {:else}
                    <div class="text-muted text-sm">Sin montajes configurados</div>
                  {/if}
                </div>
              </div>

              <div class="inspect-section">
                <h4>Redes (Networks)</h4>
                <div class="code-list">
                  {#if inspectData.NetworkSettings.Networks}
                    {#each Object.entries(inspectData.NetworkSettings.Networks) as [net, details]}
                      <div class="code-item"><strong>{net}:</strong> {details.IPAddress || 'Sin IP asignada'}</div>
                    {/each}
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

  </div>
{/if}

<style>
  /* Glass Cards */
  .glass-card {
    background: var(--card-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--card-border);
    border-radius: 20px;
    padding: 1.75rem;
    box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.2);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  .card-header-styled {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .card-header-styled.space-between {
    justify-content: space-between;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .icon-wrapper {
    width: 42px; height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-wrapper.purple {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  .card-header-styled h3 {
    margin: 0 0 0.2rem 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .subtitle {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .btn-icon {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--card-border);
    color: var(--text-main);
    width: 38px; height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-icon:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  /* States */
  .state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 1rem;
    text-align: center;
    gap: 1rem;
  }

  .alert.error {
    margin-top: 1.5rem;
    padding: 1rem;
    background: var(--danger-bg);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 12px;
    color: var(--danger);
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 500;
  }

  /* Tables */
  .table-responsive {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid var(--card-border);
    background: rgba(0, 0, 0, 0.15);
  }

  .premium-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    white-space: nowrap;
  }

  .premium-table th {
    background: rgba(255, 255, 255, 0.03);
    padding: 1rem 1.25rem;
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--card-border);
  }

  .premium-table td {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    font-size: 0.9rem;
    transition: background 0.2s;
    vertical-align: middle;
  }

  .premium-table tr:last-child td {
    border-bottom: none;
  }

  .premium-table tbody tr:hover td {
    background: rgba(255, 255, 255, 0.03);
  }

  /* Actions Cell */
  .actions-cell {
    width: 1%; /* Fit to content */
    white-space: nowrap;
  }

  .action-buttons {
    display: flex;
    gap: 0.4rem;
  }

  .btn-act {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px; height: 32px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-muted);
  }

  .btn-act:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-act.start:hover:not(:disabled) { background: rgba(16, 185, 129, 0.2); color: #34d399; }
  .btn-act.stop:hover:not(:disabled) { background: rgba(249, 115, 22, 0.2); color: #fb923c; }
  .btn-act.restart:hover:not(:disabled) { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
  .btn-act.remove:hover:not(:disabled) { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
  .btn-act.logs:hover:not(:disabled) { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
  .btn-act.inspect:hover:not(:disabled) { background: rgba(14, 165, 233, 0.2); color: #38bdf8; }

  /* Formatting Utils */
  .font-mono { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
  .fw-600 { font-weight: 600; }
  .text-blue { color: #60a5fa; }
  :global(.text-purple) { color: #a78bfa; }
  .text-sm { font-size: 0.8rem !important; }
  .text-muted { color: var(--text-muted); }

  /* Tags & Badges */
  .tag {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .ports-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .port-tag {
    background: rgba(59, 130, 246, 0.1);
    color: #93c5fd;
    border: 1px solid rgba(59, 130, 246, 0.2);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.75rem;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    background: rgba(148, 163, 184, 0.1);
    color: var(--text-muted);
    border: 1px solid rgba(148, 163, 184, 0.2);
  }

  .status-badge.running {
    background: var(--success-bg);
    color: var(--success);
    border-color: rgba(16, 185, 129, 0.3);
  }

  .pulse-dot {
    width: 6px; height: 6px;
    background-color: var(--text-muted);
    border-radius: 50%;
  }

  .pulse-dot.active {
    background-color: var(--success);
    box-shadow: 0 0 6px var(--success);
  }

  /* Modals */
  .modal-backdrop {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  .modal-content {
    background: #0f172a;
    border: 1px solid var(--card-border);
    border-radius: 16px;
    width: 90%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .logs-modal { max-width: 800px; }
  .inspect-modal { max-width: 700px; }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--card-border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 0.2rem;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .btn-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .center-state {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 3rem;
  }

  .terminal-logs {
    background: #080a12;
    color: #cbd5e1;
    padding: 1rem;
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
    max-height: 50vh;
    overflow-y: auto;
  }

  /* Inspect Grid */
  .inspect-grid {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .inspect-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: var(--text-main);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 0.5rem;
  }

  .inspect-section p {
    margin: 0.4rem 0;
    font-size: 0.9rem;
  }

  .inspect-section strong {
    color: var(--text-muted);
    font-weight: 500;
    width: 80px;
    display: inline-block;
  }

  .code-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .code-item {
    background: rgba(255, 255, 255, 0.03);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    word-break: break-all;
    border: 1px solid rgba(255, 255, 255, 0.02);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
</style>

<script>
  import { onMount } from 'svelte';
  import { 
    Play, 
    Square, 
    RotateCw, 
    Pause, 
    PlayCircle, 
    Info, 
    RefreshCw, 
    Search,
    AlertTriangle,
    Layers,
    Activity,
    Plus
  } from 'lucide-svelte';
  import { api } from '../lib/api.js';
  import DeployCard from '../components/DeployCard.svelte';
  import ContainerStatsCard from '../lib/components/ContainerStatsCard.svelte';
  import ContainerInspectModal from '../lib/components/ContainerInspectModal.svelte';

  export let containers = [];
  export let loading = false;
  export let error = null;
  export let fetchContainers;

  export let imageName = '';
  export let containerName = '';
  export let hostPort = '';
  export let containerPort = '';
  export let isDeploying = false;
  export let deployMessage = '';
  export let deployIsError = false;
  export let handleDeploy;

  let searchQuery = '';
  let actionLoading = {};
  let showDeployModal = false;

  // Inspect Modal State
  let showInspectModal = false;
  let inspectContainerData = null;
  let inspectLoading = false;

  // Confirmation Modal State
  let confirmModal = {
    show: false,
    containerId: null,
    containerName: '',
    action: ''
  };

  const actionLabels = {
    start: { title: 'Iniciar', verb: 'iniciar', color: '#10b981' },
    stop: { title: 'Detener', verb: 'detener', color: '#ef4444' },
    restart: { title: 'Reiniciar', verb: 'reiniciar', color: '#3b82f6' },
    pause: { title: 'Pausar', verb: 'pausar', color: '#f59e0b' },
    unpause: { title: 'Reanudar', verb: 'reanudar', color: '#10b981' }
  };

  function requestAction(container, action) {
    const id = container.id || container.Id;
    const name = container.name || container.Names?.[0]?.replace(/^\//, '') || id.slice(0, 12);
    confirmModal = {
      show: true,
      containerId: id,
      containerName: name,
      action
    };
  }

  function closeConfirmModal() {
    confirmModal = {
      show: false,
      containerId: null,
      containerName: '',
      action: ''
    };
  }

  async function executeConfirmedAction() {
    const { containerId, action } = confirmModal;
    closeConfirmModal();
    if (!containerId || !action) return;

    actionLoading[containerId] = action;
    try {
      await api.post(`/containers/${containerId}/${action}`);
      if (fetchContainers) {
        await fetchContainers();
      }
    } catch (err) {
      alert(`Error al ejecutar ${action}: ${err.message}`);
    } finally {
      actionLoading[containerId] = null;
    }
  }

  async function openInspect(container) {
    const id = container.id || container.Id;
    inspectLoading = true;
    showInspectModal = true;
    try {
      const res = await api.get(`/containers/${id}/inspect`);
      if (res && res.success) {
        inspectContainerData = res.data;
      } else {
        inspectContainerData = container;
      }
    } catch (err) {
      inspectContainerData = container;
    } finally {
      inspectLoading = false;
    }
  }

  $: filteredContainers = containers.filter(c => {
    const name = (c.name || c.Names?.[0] || '').toLowerCase();
    const img = (c.image || c.Image || '').toLowerCase();
    const id = (c.id || c.Id || '').toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    return !q || name.includes(q) || img.includes(q) || id.includes(q);
  });
</script>

<div class="containers-view">
  <!-- Action Bar -->
  <div class="action-bar">
    <div class="search-box">
      <Search size={16} class="search-icon" />
      <input 
        type="text" 
        placeholder="Buscar por nombre, imagen o ID..." 
        bind:value={searchQuery}
      />
    </div>

    <div class="bar-actions">
      <button class="btn-refresh" on:click={fetchContainers} disabled={loading} title="Recargar lista">
        <RefreshCw size={16} class={loading ? 'spin' : ''} />
        <span>Actualizar</span>
      </button>

      <button class="btn-deploy-toggle" on:click={() => showDeployModal = !showDeployModal}>
        <Plus size={16} />
        <span>{showDeployModal ? 'Ocultar Despliegue' : 'Nuevo Contenedor'}</span>
      </button>
    </div>
  </div>

  <!-- Deploy Collapse/Modal Area -->
  {#if showDeployModal}
    <div class="deploy-wrapper">
      <DeployCard 
        bind:imageName 
        bind:containerName 
        bind:hostPort 
        bind:containerPort 
        {isDeploying}
        {deployMessage}
        {deployIsError}
        {handleDeploy}
      />
    </div>
  {/if}

  <!-- Error alert if any -->
  {#if error}
    <div class="alert-box">
      <AlertTriangle size={18} />
      <span>{error}</span>
    </div>
  {/if}

  <!-- Containers Grid -->
  {#if filteredContainers.length === 0}
    <div class="empty-state">
      <Layers size={36} class="empty-icon" />
      <h3>No se encontraron contenedores</h3>
      <p class="text-muted">
        {searchQuery ? 'Prueba con otro término de búsqueda.' : 'Despliega un nuevo contenedor para comenzar.'}
      </p>
    </div>
  {:else}
    <div class="containers-card-grid">
      {#each filteredContainers as c}
        {@const id = c.id || c.Id}
        {@const name = c.name || c.Names?.[0]?.replace(/^\//, '') || id.slice(0, 12)}
        {@const state = (c.state || c.State || 'stopped').toLowerCase()}
        {@const isRunning = state === 'running'}
        {@const isPaused = state === 'paused'}
        {@const isLoadingAction = !!actionLoading[id]}

        <div class="container-manage-card">
          <!-- Real-time Stats Card Embedded -->
          <ContainerStatsCard 
            containerId={id}
            containerName={name}
            status={state}
          />

          <!-- Action Buttons Bar -->
          <div class="card-controls">
            <div class="control-actions">
              {#if !isRunning && !isPaused}
                <button 
                  class="btn-action btn-start" 
                  disabled={isLoadingAction}
                  on:click={() => requestAction(c, 'start')}
                  title="Iniciar contenedor"
                >
                  <Play size={14} />
                  <span>Start</span>
                </button>
              {/if}

              {#if isRunning}
                <button 
                  class="btn-action btn-stop" 
                  disabled={isLoadingAction}
                  on:click={() => requestAction(c, 'stop')}
                  title="Detener contenedor"
                >
                  <Square size={14} />
                  <span>Stop</span>
                </button>

                <button 
                  class="btn-action btn-pause" 
                  disabled={isLoadingAction}
                  on:click={() => requestAction(c, 'pause')}
                  title="Pausar contenedor"
                >
                  <Pause size={14} />
                  <span>Pause</span>
                </button>
              {/if}

              {#if isPaused}
                <button 
                  class="btn-action btn-unpause" 
                  disabled={isLoadingAction}
                  on:click={() => requestAction(c, 'unpause')}
                  title="Reanudar contenedor"
                >
                  <PlayCircle size={14} />
                  <span>Unpause</span>
                </button>

                <button 
                  class="btn-action btn-stop" 
                  disabled={isLoadingAction}
                  on:click={() => requestAction(c, 'stop')}
                  title="Detener contenedor"
                >
                  <Square size={14} />
                  <span>Stop</span>
                </button>
              {/if}

              <button 
                class="btn-action btn-restart" 
                disabled={isLoadingAction}
                on:click={() => requestAction(c, 'restart')}
                title="Reiniciar contenedor"
              >
                <RotateCw size={14} class={isLoadingAction ? 'spin' : ''} />
                <span>Restart</span>
              </button>
            </div>

            <!-- Inspect Button -->
            <button 
              class="btn-action btn-inspect" 
              on:click={() => openInspect(c)}
              title="Inspeccionar configuración y red"
            >
              <Info size={14} />
              <span>Inspect</span>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Modal de Confirmación para Acciones -->
{#if confirmModal.show}
  <div class="modal-backdrop" on:click|self={closeConfirmModal}>
    <div class="confirm-dialog">
      <div class="confirm-header">
        <AlertTriangle size={20} color="#f59e0b" />
        <h4>Confirmar Acción</h4>
      </div>
      <p class="confirm-text">
        ¿Estás seguro de que deseas 
        <strong>{actionLabels[confirmModal.action]?.verb || confirmModal.action}</strong> 
        el contenedor <strong>{confirmModal.containerName}</strong>?
      </p>
      <div class="confirm-buttons">
        <button class="btn-cancel" on:click={closeConfirmModal}>Cancelar</button>
        <button 
          class="btn-confirm-action" 
          style="background-color: {actionLabels[confirmModal.action]?.color || '#3b82f6'};"
          on:click={executeConfirmedAction}
        >
          Confirmar {actionLabels[confirmModal.action]?.title || confirmModal.action}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Modal de Inspect -->
<ContainerInspectModal 
  show={showInspectModal}
  container={inspectContainerData}
  on:close={() => { showInspectModal = false; inspectContainerData = null; }}
/>

<style>
  .containers-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .action-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 8px 14px;
    flex: 1;
    max-width: 420px;
  }

  :global(.search-icon) {
    color: #64748b;
  }

  .search-box input {
    background: transparent;
    border: none;
    outline: none;
    color: #f8fafc;
    font-size: 0.85rem;
    width: 100%;
  }

  .bar-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-refresh, .btn-deploy-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
  }

  .btn-refresh:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f8fafc;
  }

  .btn-deploy-toggle {
    background: #0284c7;
    border: none;
    color: white;
  }

  .btn-deploy-toggle:hover {
    background: #0369a1;
  }

  .deploy-wrapper {
    animation: fadeIn 0.2s ease-in;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .alert-box {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 10px;
    padding: 12px 16px;
    color: #f87171;
    font-size: 0.9rem;
  }

  .empty-state {
    text-align: center;
    padding: 3.5rem 1rem;
    background: rgba(15, 23, 42, 0.4);
    border: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  :global(.empty-icon) {
    color: #64748b;
  }

  .empty-state h3 {
    margin: 0;
    color: #e2e8f0;
  }

  .containers-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 1.5rem;
  }

  .container-manage-card {
    background: #182234;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  }

  .card-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #0f172a;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    flex-wrap: wrap;
    gap: 8px;
  }

  .control-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .btn-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .btn-start {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.3);
  }
  .btn-start:hover { background: rgba(16, 185, 129, 0.25); }

  .btn-stop {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.3);
  }
  .btn-stop:hover { background: rgba(239, 68, 68, 0.25); }

  .btn-pause {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border-color: rgba(245, 158, 11, 0.3);
  }
  .btn-pause:hover { background: rgba(245, 158, 11, 0.25); }

  .btn-unpause {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.3);
  }
  .btn-unpause:hover { background: rgba(16, 185, 129, 0.25); }

  .btn-restart {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border-color: rgba(59, 130, 246, 0.3);
  }
  .btn-restart:hover { background: rgba(59, 130, 246, 0.25); }

  .btn-inspect {
    background: rgba(255, 255, 255, 0.05);
    color: #94a3b8;
    border-color: rgba(255, 255, 255, 0.1);
  }
  .btn-inspect:hover {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
    border-color: rgba(56, 189, 248, 0.3);
  }

  /* Modal de Confirmación */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(15, 23, 42, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .confirm-dialog {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 20px;
    width: 100%;
    max-width: 440px;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: fadeIn 0.15s ease-out;
  }

  .confirm-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .confirm-header h4 {
    margin: 0;
    font-size: 1.05rem;
    color: #f8fafc;
  }

  .confirm-text {
    margin: 0;
    font-size: 0.9rem;
    color: #cbd5e1;
    line-height: 1.4;
  }

  .confirm-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 6px;
  }

  .btn-cancel {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
  }

  .btn-confirm-action {
    color: white;
    border: none;
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .text-muted {
    color: #94a3b8;
  }
</style>

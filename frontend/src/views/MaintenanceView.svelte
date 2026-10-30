<script>
  import { onMount } from 'svelte';
  import { 
    Wrench, 
    Trash2, 
    HardDrive, 
    Layers, 
    Box, 
    AlertTriangle, 
    CheckCircle2, 
    RefreshCw, 
    ShieldAlert, 
    ShieldCheck, 
    X,
    Lock,
    Info,
    Database
  } from 'lucide-svelte';
  import { api } from '../lib/api.js';

  let diskUsage = null;
  let loadingUsage = true;
  let usageError = null;

  // Estados de limpieza
  let pruneLoading = {
    containers: false,
    images: false,
    volumes: false
  };

  let actionReport = null; // Reporte de resultado
  let notice = null;

  // Modal para borrado crítico de volúmenes
  let showVolumeModal = false;
  let confirmInputText = '';
  const REQUIRED_CONFIRM_KEY = 'CONFIRMAR-BORRADO';

  $: isConfirmKeyValid = confirmInputText.trim() === REQUIRED_CONFIRM_KEY;

  function showNotice(text, type = 'success', duration = 5000) {
    notice = { text, type };
    setTimeout(() => {
      if (notice?.text === text) notice = null;
    }, duration);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async function fetchDiskUsage() {
    loadingUsage = true;
    usageError = null;
    try {
      const res = await api.get('/system/df');
      if (res && res.success) {
        diskUsage = res.data;
      } else {
        usageError = res?.error || 'No se pudo obtener el diagnóstico de espacio Docker';
      }
    } catch (err) {
      usageError = err.message || 'Error de conexión con el backend';
    } finally {
      loadingUsage = false;
    }
  }

  // 1. Limpiar Contenedores Detenidos
  async function handlePruneContainers() {
    if (!confirm('¿Deseas eliminar todos los contenedores Docker en estado detenido?')) {
      return;
    }

    pruneLoading.containers = true;
    actionReport = null;
    try {
      const res = await api.post('/system/prune/containers', {});
      if (res && res.success) {
        const deleted = res.data?.ContainersDeleted?.length || 0;
        const reclaimed = formatBytes(res.data?.SpaceReclaimed || 0);
        showNotice(`Se limpiaron ${deleted} contenedores detenidos (${reclaimed} liberados).`, 'success');
        actionReport = {
          title: 'Limpieza de Contenedores Detenidos',
          deletedCount: deleted,
          reclaimed,
          details: res.data?.ContainersDeleted || []
        };
        await fetchDiskUsage();
      } else {
        showNotice(res?.error || 'Error al ejecutar limpieza de contenedores.', 'error');
      }
    } catch (err) {
      showNotice(`Error al limpiar contenedores: ${err.message}`, 'error');
    } finally {
      pruneLoading.containers = false;
    }
  }

  // 2. Limpiar Imágenes Huérfanas
  async function handlePruneImages() {
    if (!confirm('¿Deseas eliminar imágenes Docker huérfanas y sin usar (docker image prune -a)?')) {
      return;
    }

    pruneLoading.images = true;
    actionReport = null;
    try {
      const res = await api.post('/system/prune/images', { all: true });
      if (res && res.success) {
        const deleted = res.data?.ImagesDeleted?.length || 0;
        const reclaimed = formatBytes(res.data?.SpaceReclaimed || 0);
        showNotice(`Se eliminaron ${deleted} capas/imágenes huérfanas (${reclaimed} liberados).`, 'success');
        actionReport = {
          title: 'Limpieza de Imágenes Huérfanas',
          deletedCount: deleted,
          reclaimed,
          details: (res.data?.ImagesDeleted || []).map(i => i.Deleted || i.Untagged || 'Capa')
        };
        await fetchDiskUsage();
      } else {
        showNotice(res?.error || 'Error al ejecutar limpieza de imágenes.', 'error');
      }
    } catch (err) {
      showNotice(`Error al limpiar imágenes: ${err.message}`, 'error');
    } finally {
      pruneLoading.images = false;
    }
  }

  // 3. Acción Crítica Protegida: Volúmenes
  function openVolumeModal() {
    confirmInputText = '';
    showVolumeModal = true;
  }

  async function handleExecutePruneVolumes() {
    if (!isConfirmKeyValid) return;

    showVolumeModal = false;
    pruneLoading.volumes = true;
    actionReport = null;

    try {
      const res = await api.post('/system/prune/volumes', {});
      if (res && res.success) {
        const deleted = res.data?.volumesDeleted?.length || 0;
        const skipped = res.data?.protectedVolumesSkipped?.length || 0;
        showNotice(`Limpieza de volúmenes completada: ${deleted} volúmenes eliminados. ${skipped} volúmenes críticos protegidos contra borrado.`, 'success', 7000);
        actionReport = {
          title: 'Limpieza Segura de Volúmenes Docker',
          deletedCount: deleted,
          reclaimed: 'N/A',
          details: res.data?.volumesDeleted || [],
          protected: res.data?.protectedVolumesSkipped || []
        };
        await fetchDiskUsage();
      } else {
        showNotice(res?.error || 'Error al ejecutar limpieza de volúmenes.', 'error');
      }
    } catch (err) {
      showNotice(`Error al limpiar volúmenes: ${err.message}`, 'error');
    } finally {
      pruneLoading.volumes = false;
      confirmInputText = '';
    }
  }

  onMount(() => {
    fetchDiskUsage();
  });
</script>

<div class="maintenance-view-container">
  <!-- Encabezado de la Vista -->
  <div class="view-header">
    <div class="header-left">
      <div class="icon-wrench-box">
        <Wrench size={24} class="text-amber" />
      </div>
      <div>
        <h2>Mantenimiento y Diagnóstico Docker</h2>
        <p class="text-muted">
          Optimización de almacenamiento en disco, remoción de contenedores detenidos, capas huérfanas y salvaguarda de persistencia.
        </p>
      </div>
    </div>

    <button 
      type="button" 
      class="btn-refresh" 
      on:click={fetchDiskUsage} 
      disabled={loadingUsage}
      title="Actualizar diagnóstico de espacio"
    >
      <RefreshCw size={15} class={loadingUsage ? 'spin' : ''} />
      <span>Actualizar Diagnóstico</span>
    </button>
  </div>

  <!-- Notificaciones -->
  {#if notice}
    <div class="notice-card notice-{notice.type}">
      <div class="notice-icon">
        {#if notice.type === 'success'}
          <CheckCircle2 size={18} />
        {:else}
          <AlertTriangle size={18} />
        {/if}
      </div>
      <div class="notice-text">{notice.text}</div>
      <button type="button" class="btn-close-notice" on:click={() => notice = null}>
        <X size={15} />
      </button>
    </div>
  {/if}

  <!-- 1. DIAGNÓSTICO DE ESPACIO EN DOCKER (docker system df) -->
  <section class="section-card">
    <div class="section-title-row">
      <div class="title-with-icon">
        <HardDrive size={18} class="text-cyan" />
        <h3>Diagnóstico de Espacio en Docker</h3>
      </div>
      {#if diskUsage}
        <span class="total-storage-badge font-mono">
          Ocupación Total: {formatBytes(diskUsage.totalSizeBytes || diskUsage.layersSizeBytes)}
        </span>
      {/if}
    </div>

    {#if loadingUsage}
      <div class="state-box">
        <RefreshCw size={24} class="spin text-cyan" />
        <span>Analizando capas de almacenamiento Docker...</span>
      </div>
    {:else if usageError}
      <div class="state-box text-danger">
        <AlertTriangle size={24} />
        <span>{usageError}</span>
      </div>
    {:else if diskUsage}
      <div class="df-grid">
        <!-- Imágenes -->
        <div class="df-card">
          <div class="df-card-head">
            <span class="df-label">
              <Layers size={16} class="text-indigo" />
              Imágenes del Sistema
            </span>
            <span class="df-count font-mono">{diskUsage.raw?.imagesCount ?? 0}</span>
          </div>
          <div class="df-size font-mono">
            {formatBytes(diskUsage.imagesSizeBytes || diskUsage.layersSizeBytes)}
          </div>
          <div class="df-foot text-muted">
            <span>Huérfanas / dangling: <strong>{diskUsage.raw?.danglingImagesCount ?? 0}</strong></span>
          </div>
        </div>

        <!-- Contenedores -->
        <div class="df-card">
          <div class="df-card-head">
            <span class="df-label">
              <Box size={16} class="text-cyan" />
              Espacio en Contenedores
            </span>
            <span class="df-count font-mono">{diskUsage.raw?.containersCount ?? 0}</span>
          </div>
          <div class="df-size font-mono">
            {formatBytes(diskUsage.containersSizeBytes)}
          </div>
          <div class="df-foot text-muted">
            <span>Capa modificable (Read-Write Layer)</span>
          </div>
        </div>

        <!-- Volúmenes -->
        <div class="df-card">
          <div class="df-card-head">
            <span class="df-label">
              <Database size={16} class="text-green" />
              Volúmenes Locales
            </span>
            <span class="df-count font-mono">{diskUsage.raw?.volumesCount ?? 0}</span>
          </div>
          <div class="df-size font-mono">
            {formatBytes(diskUsage.volumesSizeBytes)}
          </div>
          <div class="df-foot text-muted">
            <span>Persistencia en <code class="font-mono">/var/lib/docker/volumes</code></span>
          </div>
        </div>
      </div>
    {/if}
  </section>

  <!-- 2. ACCIONES SEGURAS DE LIMPIEZA -->
  <section class="section-card">
    <div class="section-title-row">
      <div class="title-with-icon">
        <ShieldCheck size={18} class="text-green" />
        <h3>Acciones Seguras de Limpieza</h3>
      </div>
      <span class="subtext">Operaciones inocuas que no destruyen datos persistentes</span>
    </div>

    <div class="actions-grid">
      <!-- Prune Imágenes Huérfanas -->
      <div class="action-card">
        <div class="action-meta">
          <div class="action-name">
            <Layers size={18} class="text-indigo" />
            <h4>Limpiar Imágenes Huérfanas</h4>
          </div>
          <p class="action-desc">
            Ejecuta <code class="font-mono">docker image prune -a</code>. Elimina capas e imágenes que no están asociadas a ningún contenedor existente.
          </p>
        </div>

        <button 
          type="button" 
          class="btn-action-safe"
          on:click={handlePruneImages}
          disabled={pruneLoading.images}
        >
          {#if pruneLoading.images}
            <RefreshCw size={14} class="spin" />
            <span>Eliminando imágenes...</span>
          {:else}
            <Trash2 size={14} />
            <span>Limpiar Imágenes Huérfanas</span>
          {/if}
        </button>
      </div>

      <!-- Prune Contenedores Detenidos -->
      <div class="action-card">
        <div class="action-meta">
          <div class="action-name">
            <Box size={18} class="text-cyan" />
            <h4>Limpiar Contenedores Detenidos</h4>
          </div>
          <p class="action-desc">
            Ejecuta <code class="font-mono">docker container prune</code>. Remueve contenedores apagados o finalizados liberando sus metadatos y capas temporales.
          </p>
        </div>

        <button 
          type="button" 
          class="btn-action-safe"
          on:click={handlePruneContainers}
          disabled={pruneLoading.containers}
        >
          {#if pruneLoading.containers}
            <RefreshCw size={14} class="spin" />
            <span>Eliminando contenedores...</span>
          {:else}
            <Trash2 size={14} />
            <span>Limpiar Contenedores Detenidos</span>
          {/if}
        </button>
      </div>
    </div>
  </section>

  <!-- 3. ACCIÓN CRÍTICA PROTEGIDA: VOLÚMENES -->
  <section class="section-card danger-zone-card">
    <div class="danger-header">
      <div class="danger-title-row">
        <ShieldAlert size={22} class="text-danger" />
        <h3 class="text-danger">Acción Crítica Protegida: Volúmenes</h3>
      </div>
      <span class="danger-badge">Zona Crítica / Alto Riesgo</span>
    </div>

    <div class="danger-warning-banner">
      <AlertTriangle size={20} class="text-danger flex-shrink-0" />
      <div class="warning-text">
        <strong>Atención:</strong> El borrado de volúmenes eliminará permanentemente datos de sitios detenidos (como <code class="font-mono">wp-content</code>, uploads o datos de bases de datos que no estén activas).
      </div>
    </div>

    <div class="danger-action-row">
      <div class="danger-explanation text-muted">
        El sistema cuenta con un filtro de seguridad que protege automáticamente volúmenes con patrones MariaDB, MySQL, WordPress, Postgres, Redis y Portainer. Aun así, se exige confirmación manual explícita.
      </div>

      <button 
        type="button" 
        class="btn-action-danger"
        on:click={openVolumeModal}
        disabled={pruneLoading.volumes}
      >
        <Lock size={15} />
        <span>Limpiar Volúmenes no Utilizados...</span>
      </button>
    </div>
  </section>

  <!-- Reporte de Acciones -->
  {#if actionReport}
    <div class="section-card report-card">
      <div class="report-header">
        <div class="title-with-icon">
          <CheckCircle2 size={18} class="text-green" />
          <h4>Reporte de Mantenimiento: {actionReport.title}</h4>
        </div>
        <button type="button" class="btn-close-notice" on:click={() => actionReport = null}>
          <X size={16} />
        </button>
      </div>

      <div class="report-metrics-row font-mono">
        <span class="report-tag">Elementos afectados: <strong>{actionReport.deletedCount}</strong></span>
        {#if actionReport.reclaimed !== 'N/A'}
          <span class="report-tag">Espacio liberado: <strong>{actionReport.reclaimed}</strong></span>
        {/if}
      </div>

      {#if actionReport.protected && actionReport.protected.length > 0}
        <div class="protected-list-box">
          <span class="protected-title">
            <ShieldCheck size={14} class="text-green" />
            Volúmenes protegidos preservados automáticamente:
          </span>
          <div class="protected-chips">
            {#each actionReport.protected as p}
              <span class="chip-protected font-mono">{p.name || p}</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- MODAL DE CONFIRMACIÓN CRÍTICA DE VOLÚMENES -->
  {#if showVolumeModal}
    <div 
      class="modal-backdrop" 
      on:click|self={() => showVolumeModal = false}
      role="dialog"
      aria-modal="true"
    >
      <div class="modal-dialog-danger">
        <div class="modal-danger-header">
          <div class="modal-title-danger">
            <ShieldAlert size={22} class="text-danger" />
            <h4>Confirmación Crítica de Borrado</h4>
          </div>
          <button type="button" class="btn-close-modal" on:click={() => showVolumeModal = false}>
            <X size={18} />
          </button>
        </div>

        <div class="modal-danger-body">
          <p class="modal-desc-warning">
            Estás a punto de eliminar volúmenes Docker no utilizados. Aunque los volúmenes etiquetados de bases de datos críticas están resguardados por el backend, <strong>los datos huérfanos o de sitios detenidos serán destruidos irreversiblemente</strong>.
          </p>

          <div class="confirm-prompt-box">
            <label for="confirm-key-input" class="confirm-label">
              Escribe exactamente <strong class="key-target font-mono">{REQUIRED_CONFIRM_KEY}</strong> para habilitar el botón de borrado:
            </label>
            <input 
              id="confirm-key-input"
              type="text" 
              bind:value={confirmInputText}
              placeholder={REQUIRED_CONFIRM_KEY}
              class="form-confirm-input font-mono"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="modal-danger-footer">
          <button 
            type="button" 
            class="btn-cancel" 
            on:click={() => showVolumeModal = false}
          >
            Cancelar
          </button>

          <button 
            type="button" 
            class="btn-execute-danger"
            disabled={!isConfirmKeyValid || pruneLoading.volumes}
            on:click={handleExecutePruneVolumes}
          >
            {#if pruneLoading.volumes}
              <RefreshCw size={14} class="spin" />
              <span>Ejecutando limpieza...</span>
            {:else}
              <Trash2 size={14} />
              <span>Confirmar y Purgar Volúmenes</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .maintenance-view-container {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  /* Encabezado */
  .view-header {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 14px;
    padding: 1.25rem 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .icon-wrench-box {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .view-header h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
  }

  .view-header p {
    margin: 0.25rem 0 0;
    font-size: 0.825rem;
  }

  .btn-refresh {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    color: var(--text-main, #f4f4f5);
    padding: 0.5rem 0.95rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh:hover:not(:disabled) {
    background: var(--card-border, #222225);
    color: #ffffff;
  }

  /* Notificaciones */
  .notice-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border-radius: 10px;
    padding: 0.85rem 1.25rem;
  }

  .notice-success {
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #4ade80;
  }

  .notice-error {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .notice-text {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .btn-close-notice {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
  }

  /* Sección General */
  .section-card {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 14px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
  }

  .section-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .title-with-icon {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .title-with-icon h3, .title-with-icon h4 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
  }

  .total-storage-badge {
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.25);
    color: #38bdf8;
    padding: 0.3rem 0.75rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .subtext {
    font-size: 0.8rem;
    color: var(--text-muted, #a1a1aa);
  }

  /* DF Grid */
  .df-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }

  .df-card {
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    border-radius: 10px;
    padding: 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .df-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .df-label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-main, #f4f4f5);
  }

  .df-count {
    font-size: 0.75rem;
    background: var(--bg-dark, #000000);
    border: 1px solid var(--card-border, #222225);
    padding: 0.15rem 0.45rem;
    border-radius: 9999px;
    color: var(--text-muted, #a1a1aa);
  }

  .df-size {
    font-size: 1.35rem;
    font-weight: 800;
    color: var(--text-main, #f4f4f5);
  }

  .df-foot {
    font-size: 0.75rem;
  }

  /* Acciones Seguras */
  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.25rem;
  }

  .action-card {
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    border-radius: 12px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 1rem;
    transition: transform 0.2s, border-color 0.2s;
  }

  .action-card:hover {
    border-color: rgba(56, 189, 248, 0.3);
    transform: translateY(-2px);
  }

  .action-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }

  .action-name h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
  }

  .action-desc {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted, #a1a1aa);
    line-height: 1.45;
  }

  .btn-action-safe {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #38bdf8;
    padding: 0.65rem 1rem;
    border-radius: 8px;
    font-size: 0.825rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-action-safe:hover:not(:disabled) {
    background: rgba(56, 189, 248, 0.25);
    color: #ffffff;
  }

  /* Zona de Peligro / Volúmenes */
  .danger-zone-card {
    border-color: rgba(239, 68, 68, 0.35);
    background: rgba(15, 23, 42, 0.9);
  }

  .danger-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .danger-title-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .danger-title-row h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
  }

  .danger-badge {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #f87171;
    padding: 0.2rem 0.65rem;
    border-radius: 9999px;
    font-size: 0.725rem;
    font-weight: 700;
    letter-spacing: 0.025em;
  }

  .danger-warning-banner {
    background: rgba(239, 68, 68, 0.1);
    border-left: 4px solid #ef4444;
    padding: 0.85rem 1.15rem;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .warning-text {
    font-size: 0.825rem;
    color: #fecaca;
    line-height: 1.45;
  }

  .danger-action-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    padding-top: 0.5rem;
  }

  .danger-explanation {
    max-width: 600px;
    font-size: 0.775rem;
    line-height: 1.45;
  }

  .btn-action-danger {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #f87171;
    padding: 0.65rem 1.25rem;
    border-radius: 8px;
    font-size: 0.825rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-action-danger:hover:not(:disabled) {
    background: #ef4444;
    color: #ffffff;
  }

  /* Reporte */
  .report-card {
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    border-color: rgba(34, 197, 94, 0.3);
  }

  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .report-metrics-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .report-tag {
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.25);
    color: #4ade80;
    padding: 0.3rem 0.65rem;
    border-radius: 6px;
    font-size: 0.775rem;
  }

  .protected-list-box {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: rgba(15, 23, 42, 0.6);
    padding: 0.85rem;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.1);
  }

  .protected-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.775rem;
    color: #cbd5e1;
    font-weight: 600;
  }

  .protected-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .chip-protected {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.2);
    color: #86efac;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-size: 0.725rem;
  }

  /* Modales */
  .modal-backdrop {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1rem;
  }

  .modal-dialog-danger {
    background: var(--card-bg, #121214);
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 14px;
    width: 100%;
    max-width: 520px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
  }

  .modal-danger-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(239, 68, 68, 0.2);
    padding-bottom: 0.75rem;
  }

  .modal-title-danger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .modal-title-danger h4 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #f87171;
  }

  .btn-close-modal {
    background: transparent;
    border: none;
    color: var(--text-muted, #a1a1aa);
    cursor: pointer;
  }

  .modal-danger-body {
    display: flex;
    flex-direction: column;
    gap: 1.15rem;
  }

  .modal-desc-warning {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-main, #f4f4f5);
    line-height: 1.5;
  }

  .confirm-prompt-box {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--surface-muted, #18181b);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    padding: 0.95rem;
  }

  .confirm-label {
    font-size: 0.8rem;
    color: var(--text-main, #f4f4f5);
  }

  .key-target {
    color: #f87171;
    letter-spacing: 0.05em;
  }

  .form-confirm-input {
    width: 100%;
    background: var(--bg-dark, #000000);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    padding: 0.6rem 0.8rem;
    color: #ffffff;
    font-size: 0.9rem;
    font-weight: 700;
    box-sizing: border-box;
  }

  .form-confirm-input:focus {
    outline: none;
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3);
  }

  .modal-danger-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    border-top: 1px solid var(--card-border, #222225);
    padding-top: 0.85rem;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid var(--card-border, #222225);
    color: var(--text-main, #f4f4f5);
    padding: 0.55rem 1rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-execute-danger {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: #dc2626;
    border: none;
    color: #ffffff;
    padding: 0.55rem 1.15rem;
    border-radius: 8px;
    font-size: 0.825rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-execute-danger:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn-execute-danger:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: #475569;
  }

  /* Utilidades */
  .state-box {
    padding: 2.5rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .text-cyan { color: #38bdf8; }
  .text-indigo { color: #818cf8; }
  .text-green { color: #4ade80; }
  .text-amber { color: #fbbf24; }
  .text-danger { color: #ef4444; }
  .text-muted { color: #64748b; }
  .flex-shrink-0 { flex-shrink: 0; }
  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>

<script>
  import { 
    Cpu, 
    Database, 
    Box, 
    Clock,
    Play, 
    Square, 
    RotateCw, 
    HardDrive, 
    Server, 
    Activity, 
    AlertCircle, 
    CheckCircle2,
    ExternalLink,
    Monitor,
    Terminal,
    Copy,
    Check,
    ArrowRight
  } from 'lucide-svelte';
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { api } from '../lib/api.js';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import StatusBadge from '../lib/components/StatusBadge.svelte';

  export let containers = [];
  export let fetchContainers = null;
  export let activeTab = 'dashboard';

  const dispatch = createEventDispatcher();

  let systemMetrics = null;
  let metricsLoading = true;
  let metricsError = null;
  let intervalId = null;

  // Estado para copiar comandos SSH
  let sshCopied = false;
  let copyTimeout = null;

  const VNC_SSH_COMMAND = 'ssh -L 5901:localhost:5901 devchris@acarreados.dev';

  async function loadSystemMetrics() {
    try {
      const res = await api.get('/system/metrics');
      if (res && res.success) {
        systemMetrics = res.data;
        metricsError = null;
      }
    } catch (err) {
      metricsError = err.message || 'Error cargando telemetría del sistema';
    } finally {
      metricsLoading = false;
    }
  }

  function copySshCommand() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(VNC_SSH_COMMAND);
      sshCopied = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        sshCopied = false;
      }, 2000);
    }
  }

  function navigateTo(tab) {
    const targetTab = tab === 'containers' ? 'sites' : tab;
    activeTab = targetTab;
    dispatch('navigate', targetTab);
  }

  onMount(() => {
    loadSystemMetrics();
    intervalId = setInterval(loadSystemMetrics, 4000);
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
    if (copyTimeout) clearTimeout(copyTimeout);
  });

  // Métricas reactivas de Docker
  $: runningContainers = containers.filter(c => (c.State || c.state) === 'running');
  $: pausedContainers = containers.filter(c => (c.State || c.state) === 'paused');
  $: stoppedContainers = containers.filter(c => {
    const s = (c.State || c.state || '').toLowerCase();
    return s !== 'running' && s !== 'paused';
  });

  $: runningCount = runningContainers.length;
  $: pausedCount = pausedContainers.length;
  $: stoppedCount = stoppedContainers.length;
  $: totalCount = containers.length;

  // Desglose de discos (/ y /mnt)
  $: rootDisk = systemMetrics?.storage?.root;
  $: mntDisk = systemMetrics?.storage?.mnt;

  // CPU normalizado
  $: cpuLoad = Number(systemMetrics?.cpu?.currentLoadPercent ?? 0);
  $: cpuCores = systemMetrics?.cpu?.cores || 2;
  $: cpuBrand = systemMetrics?.cpu?.brand || 'Host Processor';

  // RAM normalizada
  $: ramUsedGb = systemMetrics?.memory?.usedGb != null ? Number(systemMetrics.memory.usedGb).toFixed(1) : '--';
  $: ramTotalGb = systemMetrics?.memory?.totalGb != null ? Number(systemMetrics.memory.totalGb).toFixed(1) : '8.0';
  $: ramPercent = Number(systemMetrics?.memory?.usedPercent ?? 0);
</script>

<div class="view-container">
  <!-- 1. MÉTRICAS DEL SERVIDOR HOST -->
  <section class="dashboard-section">
    <div class="section-header-banner">
      <div class="banner-title">
        <Server size={18} class="text-cyan" />
        <h2>Telemetría del Servidor Host</h2>
        <span class="telemetry-badge">
          {#if systemMetrics?.source === 'netdata'}
            <span class="badge-dot dot-live"></span> Netdata Agent
          {:else}
            <span class="badge-dot dot-native"></span> Kernel / SysInfo
          {/if}
        </span>
      </div>

      {#if metricsError}
        <div class="banner-alert" title={metricsError}>
          <AlertCircle size={14} />
          <span>Fallo de sincronización: {metricsError}</span>
        </div>
      {:else}
        <div class="banner-refresh">
          <span class="pulse-indicator"></span>
          <span>Actualización en tiempo real</span>
        </div>
      {/if}
    </div>

    <!-- Grid de Tarjetas MetricCard -->
    <div class="metrics-grid">
      <!-- CPU -->
      <MetricCard 
        title="CPU ({cpuCores} vCPUs)"
        value="{cpuLoad.toFixed(1)}%"
        percent={cpuLoad}
        subtitle="{cpuBrand}"
        icon={Cpu}
      />

      <!-- RAM -->
      <MetricCard 
        title="RAM"
        value="{ramUsedGb} / {ramTotalGb} GB"
        percent={ramPercent}
        subtitle="{systemMetrics?.memory?.freeGb != null ? `${systemMetrics.memory.freeGb} GB libres` : 'Memoria del host'}"
        icon={Database}
      />

      <!-- Disco Raíz / -->
      <MetricCard 
        title="Disco Raíz (/)"
        value="{rootDisk ? `${rootDisk.usedGb} / ${rootDisk.sizeGb} GB` : 'N/A'}"
        percent={rootDisk?.usePercent || 0}
        subtitle="{rootDisk?.availableGb != null ? `${rootDisk.availableGb} GB libres` : 'Sistema principal'}"
        icon={HardDrive}
      />

      <!-- Disco Temporal /mnt -->
      <MetricCard 
        title="Disco Almacén (/mnt)"
        value="{mntDisk ? `${mntDisk.usedGb} / ${mntDisk.sizeGb} GB` : 'No montado'}"
        percent={mntDisk?.usePercent || 0}
        subtitle="{mntDisk?.availableGb != null ? `${mntDisk.availableGb} GB libres` : 'Volumen secundario'}"
        icon={HardDrive}
      />
    </div>
  </section>

  <!-- 2. SERVICIOS EXTERNOS (NETDATA & TIGERVNC) -->
  <section class="dashboard-section">
    <div class="section-title-row">
      <div class="title-with-icon">
        <Activity size={18} class="text-indigo" />
        <h3>Servicios del Sistema y Acceso Remoto</h3>
      </div>
      <span class="section-subtext">Monitoreo granular e infraestructura remota</span>
    </div>

    <div class="services-grid">
      <!-- Tarjeta Netdata -->
      <div class="service-card netdata-card">
        <div class="service-header">
          <div class="service-icon-box netdata-icon">
            <Activity size={22} />
          </div>
          <div class="service-meta">
            <div class="service-title-row">
              <h4>Monitor Netdata</h4>
              <span class="service-status-pill online">
                <span class="dot"></span> Activo
              </span>
            </div>
            <p class="service-desc">
              Telemetría en tiempo real de red, latencia y salud de la máquina virtual.
            </p>
          </div>
        </div>

        <div class="service-actions">
          <a 
            href="https://netdata.acarreados.dev" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="btn-service btn-netdata"
          >
            <span>Abrir Monitor Netdata</span>
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      <!-- Tarjeta TigerVNC -->
      <div class="service-card vnc-card">
        <div class="service-header">
          <div class="service-icon-box vnc-icon">
            <Monitor size={22} />
          </div>
          <div class="service-meta">
            <div class="service-title-row">
              <h4>Escritorio Remoto VNC</h4>
              <span class="service-status-pill secure">
                <span class="dot"></span> Puerto 5901 (SSH)
              </span>
            </div>
            <p class="service-desc">
              Sesión gráfica X11 cifrada mediante túnel SSH para entorno de escritorio.
            </p>
          </div>
        </div>

        <!-- Instrucción de conexión SSH Tunnel -->
        <div class="vnc-instructions-box">
          <div class="cmd-label">Túnel SSH:</div>
          <div class="cmd-row">
            <code class="cmd-text font-mono">{VNC_SSH_COMMAND}</code>
            <button 
              type="button" 
              class="btn-copy" 
              on:click={copySshCommand}
              title="Copiar comando SSH"
            >
              {#if sshCopied}
                <Check size={14} class="text-green" />
                <span class="copy-text text-green">¡Copiado!</span>
              {:else}
                <Copy size={14} />
                <span class="copy-text">Copiar</span>
              {/if}
            </button>
          </div>
          <div class="vnc-tip">
            Conecta tu cliente VNC a <code class="font-mono">localhost:5901</code> tras iniciar el túnel.
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 3. RESUMEN RÁPIDO DE CONTENEDORES Y ACCESOS DIRECTOS -->
  <section class="dashboard-section">
    <div class="section-title-row">
      <div class="title-with-icon">
        <Box size={18} class="text-cyan" />
        <h3>Resumen Rápido de Contenedores</h3>
      </div>
      <div class="header-actions">
        {#if fetchContainers}
          <button 
            type="button" 
            class="btn-action-ghost" 
            on:click={fetchContainers}
            title="Refrescar lista de contenedores"
          >
            <RotateCw size={14} />
            <span>Actualizar</span>
          </button>
        {/if}
        <button 
          type="button" 
          class="btn-action-primary" 
          on:click={() => navigateTo('containers')}
        >
          <span>Ir a Gestión</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>

    <!-- Tarjetas de Conteo Rápido -->
    <div class="docker-summary-cards">
      <!-- Activos -->
      <button 
        type="button" 
        class="docker-count-card card-running" 
        on:click={() => navigateTo('containers')}
      >
        <div class="card-accent accent-running"></div>
        <div class="count-card-inner">
          <div class="count-icon-box bg-running-soft">
            <Play size={20} class="text-green" />
          </div>
          <div class="count-details">
            <span class="count-value font-mono text-green">{runningCount}</span>
            <span class="count-title">Contenedores Activos</span>
          </div>
        </div>
      </button>

      <!-- Pausados -->
      <button 
        type="button" 
        class="docker-count-card card-paused" 
        on:click={() => navigateTo('containers')}
      >
        <div class="card-accent accent-paused"></div>
        <div class="count-card-inner">
          <div class="count-icon-box bg-paused-soft">
            <Clock size={20} class="text-yellow" />
          </div>
          <div class="count-details">
            <span class="count-value font-mono text-yellow">{pausedCount}</span>
            <span class="count-title">Pausados</span>
          </div>
        </div>
      </button>

      <!-- Detenidos -->
      <button 
        type="button" 
        class="docker-count-card card-stopped" 
        on:click={() => navigateTo('containers')}
      >
        <div class="card-accent accent-stopped"></div>
        <div class="count-card-inner">
          <div class="count-icon-box bg-stopped-soft">
            <Square size={20} class="text-slate" />
          </div>
          <div class="count-details">
            <span class="count-value font-mono text-slate">{stoppedCount}</span>
            <span class="count-title">Detenidos</span>
          </div>
        </div>
      </button>

      <!-- Total Registrados -->
      <button 
        type="button" 
        class="docker-count-card card-total" 
        on:click={() => navigateTo('containers')}
      >
        <div class="card-accent accent-total"></div>
        <div class="count-card-inner">
          <div class="count-icon-box bg-total-soft">
            <Box size={20} class="text-cyan" />
          </div>
          <div class="count-details">
            <span class="count-value font-mono text-cyan">{totalCount}</span>
            <span class="count-title">Total Ecosistema</span>
          </div>
        </div>
      </button>
    </div>

    <!-- Barra de Proporción Visual -->
    <div class="proportion-box">
      <div class="proportion-bar">
        {#if totalCount > 0}
          <div 
            class="bar-seg seg-running" 
            style="width: {(runningCount / totalCount) * 100}%"
            title="Activos: {runningCount}"
          ></div>
          <div 
            class="bar-seg seg-paused" 
            style="width: {(pausedCount / totalCount) * 100}%"
            title="Pausados: {pausedCount}"
          ></div>
          <div 
            class="bar-seg seg-stopped" 
            style="width: {(stoppedCount / totalCount) * 100}%"
            title="Detenidos: {stoppedCount}"
          ></div>
        {:else}
          <div class="bar-seg seg-empty" style="width: 100%"></div>
        {/if}
      </div>
      <div class="proportion-legend">
        <span class="leg-item"><span class="leg-dot bg-running"></span> Activos ({runningCount})</span>
        <span class="leg-item"><span class="leg-dot bg-paused"></span> Pausados ({pausedCount})</span>
        <span class="leg-item"><span class="leg-dot bg-stopped"></span> Detenidos ({stoppedCount})</span>
      </div>
    </div>

    <!-- Accesos Directos a Contenedores Recientes / Destacados -->
    <div class="quick-containers-container">
      <div class="quick-header">
        <h4>Acceso Rápido a Contenedores</h4>
        <span class="text-muted text-xs">Haz clic para interactuar o ver logs</span>
      </div>

      {#if containers.length === 0}
        <div class="empty-list-box">No se han detectado contenedores en el host.</div>
      {:else}
        <div class="quick-grid">
          {#each containers.slice(0, 8) as c}
            {@const state = (c.State || c.state || '').toLowerCase()}
            {@const id = c.id || c.Id || ''}
            {@const name = c.name || c.Names?.[0]?.replace(/^\//, '') || id.slice(0, 12)}
            <button 
              type="button"
              class="container-quick-tile" 
              on:click={() => navigateTo('containers')}
            >
              <div class="tile-top">
                <span class="tile-name" title={name}>{name}</span>
                <StatusBadge status={state} />
              </div>
              <div class="tile-bottom">
                <span class="tile-image text-muted font-mono" title={c.image || c.Image}>
                  {c.image || c.Image || 'sin imagen'}
                </span>
                <span class="tile-id font-mono">{id.slice(0, 8)}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>

<style>
  .view-container {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .dashboard-section {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    width: 100%;
    box-sizing: border-box;
  }

  /* Encabezados */
  .section-header-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    padding: 0.85rem 1.25rem;
    border-radius: 12px;
  }

  .banner-title {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  .banner-title h2 {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
    margin: 0;
  }

  .telemetry-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.6rem;
    background: rgba(56, 189, 248, 0.1);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 9999px;
    font-size: 0.725rem;
    font-weight: 600;
  }

  .badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .dot-live {
    background-color: #22c55e;
    box-shadow: 0 0 6px #22c55e;
  }

  .dot-native {
    background-color: #38bdf8;
    box-shadow: 0 0 6px #38bdf8;
  }

  .banner-refresh {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.775rem;
    color: var(--text-muted, #a1a1aa);
  }

  .pulse-indicator {
    width: 7px;
    height: 7px;
    background-color: #22c55e;
    border-radius: 50%;
    animation: livePulse 2s infinite;
  }

  @keyframes livePulse {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
  }

  .banner-alert {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #f87171;
    font-size: 0.775rem;
    background: rgba(239, 68, 68, 0.1);
    padding: 0.3rem 0.75rem;
    border-radius: 6px;
    border: 1px solid rgba(239, 68, 68, 0.2);
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
    gap: 0.65rem;
  }

  .title-with-icon h3 {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
    margin: 0;
  }

  .section-subtext {
    font-size: 0.8rem;
    color: var(--text-muted, #a1a1aa);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .btn-action-ghost {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    color: var(--text-muted, #a1a1aa);
    padding: 0.45rem 0.75rem;
    border-radius: 8px;
    font-size: 0.775rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-action-ghost:hover {
    background: var(--card-border, #222225);
    color: var(--text-main, #f4f4f5);
  }

  .btn-action-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #38bdf8;
    padding: 0.45rem 0.85rem;
    border-radius: 8px;
    font-size: 0.775rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-action-primary:hover {
    background: rgba(56, 189, 248, 0.25);
    transform: translateX(2px);
  }

  /* 1. Metrics Grid */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
  }

  /* 2. Services Grid */
  .services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.25rem;
  }

  .service-card {
    position: relative;
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 14px;
    padding: 1.35rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 1.15rem;
    box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), 
                border-color 0.22s ease, 
                box-shadow 0.22s ease;
    box-sizing: border-box;
    overflow: hidden;
  }

  .service-card:hover {
    box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.5);
    transform: translateY(-2px);
  }

  .netdata-card:hover {
    border-color: rgba(16, 185, 129, 0.35);
  }

  .vnc-card:hover {
    border-color: rgba(99, 102, 241, 0.35);
  }

  .service-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .service-icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    flex-shrink: 0;
  }

  .netdata-icon {
    background: rgba(16, 185, 129, 0.12);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .vnc-icon {
    background: rgba(99, 102, 241, 0.12);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.25);
  }

  .service-meta {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
  }

  .service-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .service-title-row h4 {
    margin: 0;
    font-size: 0.975rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
  }

  .service-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .service-status-pill.online {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.25);
  }

  .service-status-pill.secure {
    background: rgba(99, 102, 241, 0.12);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.25);
  }

  .service-status-pill .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: currentColor;
  }

  .service-desc {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted, #a1a1aa);
    line-height: 1.45;
  }

  .btn-service {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.7rem 1rem;
    border-radius: 10px;
    font-size: 0.825rem;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    box-sizing: border-box;
  }

  .btn-netdata {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
  }

  .btn-netdata:hover {
    background: #10b981;
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
    transform: translateY(-1px);
  }

  /* VNC Instructions Box */
  .vnc-instructions-box {
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    border-radius: 10px;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .cmd-label {
    font-size: 0.725rem;
    color: var(--text-muted, #a1a1aa);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .cmd-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-dark, #000000);
    border: 1px solid var(--card-border, #222225);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    gap: 0.5rem;
    min-width: 0;
  }

  .cmd-text {
    font-size: 0.775rem;
    color: #38bdf8;
    overflow-x: auto;
    white-space: nowrap;
    scrollbar-width: thin;
    flex: 1;
    min-width: 0;
  }

  .btn-copy {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    color: var(--text-main, #f4f4f5);
    padding: 0.35rem 0.65rem;
    border-radius: 6px;
    font-size: 0.725rem;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s;
  }

  .btn-copy:hover {
    background: var(--card-border, #222225);
    color: #ffffff;
  }

  .vnc-tip {
    font-size: 0.725rem;
    color: var(--text-muted, #a1a1aa);
  }

  .vnc-tip code {
    color: #93c5fd;
    background: rgba(148, 163, 184, 0.1);
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
  }

  /* 3. Docker Summary Section */
  .docker-summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 1rem;
  }

  .docker-count-card {
    position: relative;
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 14px;
    padding: 1.15rem 1rem;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), 
                border-color 0.22s ease, 
                box-shadow 0.22s ease;
    box-sizing: border-box;
    overflow: hidden;
  }

  .docker-count-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5);
  }

  .card-running:hover { border-color: rgba(34, 197, 94, 0.4); }
  .card-paused:hover { border-color: rgba(234, 179, 8, 0.4); }
  .card-stopped:hover { border-color: rgba(148, 163, 184, 0.4); }
  .card-total:hover { border-color: rgba(56, 189, 248, 0.4); }

  .card-accent {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
  }

  .accent-running { background: linear-gradient(90deg, #10b981, #22c55e); }
  .accent-paused { background: linear-gradient(90deg, #f59e0b, #eab308); }
  .accent-stopped { background: linear-gradient(90deg, #64748b, #94a3b8); }
  .accent-total { background: linear-gradient(90deg, #0284c7, #38bdf8); }

  .count-card-inner {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
  }

  .count-icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    flex-shrink: 0;
  }

  .count-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .count-value {
    font-size: 1.5rem;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .count-title {
    font-size: 0.775rem;
    color: var(--text-muted, #a1a1aa);
    font-weight: 600;
    margin-top: 2px;
  }

  /* Colores de tarjetas resumen */
  .bg-running-soft { background: rgba(34, 197, 94, 0.12); }
  .bg-paused-soft { background: rgba(234, 179, 8, 0.12); }
  .bg-stopped-soft { background: rgba(148, 163, 184, 0.12); }
  .bg-total-soft { background: rgba(56, 189, 248, 0.12); }

  /* Barra de proporción */
  .proportion-box {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 12px;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    box-sizing: border-box;
  }

  .proportion-bar {
    display: flex;
    height: 10px;
    border-radius: 9999px;
    overflow: hidden;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
  }

  .bar-seg {
    height: 100%;
    transition: width 0.4s ease;
  }

  .seg-running { background: #22c55e; }
  .seg-paused { background: #eab308; }
  .seg-stopped { background: #64748b; }
  .seg-empty { background: rgba(148, 163, 184, 0.1); }

  .proportion-legend {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    flex-wrap: wrap;
    font-size: 0.775rem;
    color: var(--text-muted, #a1a1aa);
  }

  .leg-item {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .leg-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .bg-running { background-color: #22c55e; }
  .bg-paused { background-color: #eab308; }
  .bg-stopped { background-color: #64748b; }

  /* Lista rápida de contenedores */
  .quick-containers-container {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 14px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-sizing: border-box;
  }

  .quick-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .quick-header h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
  }

  .quick-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 0.85rem;
  }

  .container-quick-tile {
    position: relative;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    border-radius: 12px;
    padding: 0.95rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), 
                border-color 0.2s ease, 
                box-shadow 0.2s ease, 
                background 0.2s ease;
    box-sizing: border-box;
    overflow: hidden;
  }

  .container-quick-tile:hover {
    background: var(--card-border, #222225);
    border-color: rgba(56, 189, 248, 0.35);
    transform: translateY(-2px);
    box-shadow: 0 6px 18px -3px rgba(0, 0, 0, 0.4);
  }

  .tile-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
  }

  .tile-name {
    font-weight: 700;
    font-size: 0.875rem;
    color: var(--text-main, #f4f4f5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .tile-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    gap: 0.5rem;
  }

  .tile-image {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 70%;
    color: var(--text-muted, #a1a1aa);
  }

  .tile-id {
    color: var(--text-muted, #a1a1aa);
    background: var(--bg-dark, #000000);
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-size: 0.7rem;
    border: 1px solid var(--card-border, #222225);
    flex-shrink: 0;
  }

  .empty-list-box {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted, #a1a1aa);
    font-size: 0.85rem;
  }

  /* Utility classes */
  .text-cyan { color: #38bdf8; }
  .text-indigo { color: #818cf8; }
  .text-green { color: #4ade80; }
  .text-yellow { color: #fde047; }
  .text-slate { color: #94a3b8; }
  .text-muted { color: var(--text-muted, #a1a1aa); }
  .text-xs { font-size: 0.75rem; }
  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  /* MEDIA QUERIES MOBILE Y TABLET */
  @media (max-width: 768px) {
    .metrics-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .services-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .docker-summary-cards {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.65rem;
    }

    .quick-grid {
      grid-template-columns: 1fr;
    }

    .section-header-banner {
      padding: 0.75rem 1rem;
    }

    .proportion-legend {
      gap: 0.75rem;
    }
  }

  @media (max-width: 480px) {
    .docker-summary-cards {
      grid-template-columns: 1fr;
    }

    .docker-count-card {
      padding: 0.85rem;
    }

    .service-card {
      padding: 1rem;
    }

    .quick-containers-container {
      padding: 1rem;
    }

    .proportion-box {
      padding: 0.85rem 1rem;
    }
  }
</style>

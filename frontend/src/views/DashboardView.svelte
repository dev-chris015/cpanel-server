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
    CheckCircle2
  } from 'lucide-svelte';
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../lib/api.js';

  export let containers = [];
  export let fetchContainers;

  let systemMetrics = null;
  let metricsLoading = true;
  let metricsError = null;
  let intervalId = null;

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

  onMount(() => {
    loadSystemMetrics();
    intervalId = setInterval(loadSystemMetrics, 4000);
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });

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

  // Root & Mnt Disks
  $: rootDisk = systemMetrics?.storage?.root;
  $: mntDisk = systemMetrics?.storage?.mnt;
</script>

<div class="view-container">
  <!-- Azure VM Telemetry Banner -->
  <div class="azure-hero-card">
    <div class="azure-badge-row">
      <div class="vm-tag">
        <Server size={15} />
        <span>Azure VM Instance</span>
      </div>
      <div class="specs-pill">
        <span>2 vCPUs Standard</span>
        <span class="sep">•</span>
        <span>8.0 GB RAM</span>
        <span class="sep">•</span>
        <span class="status-live">
          <span class="pulse-dot"></span> LIVE TELEMETRY
        </span>
      </div>
    </div>

    <!-- VM Telemetry Grid -->
    <div class="telemetry-grid">
      <!-- CPU Load -->
      <div class="telemetry-item">
        <div class="item-head">
          <span class="label">
            <Cpu size={16} class="icon-cpu" />
            CPU (2 vCPUs)
          </span>
          <span class="val font-mono">{systemMetrics?.cpu?.currentLoadPercent ?? '--'}%</span>
        </div>
        <div class="progress-bar">
          <div 
            class="fill fill-cpu" 
            style="width: {systemMetrics?.cpu?.currentLoadPercent || 0}%"
          ></div>
        </div>
        <div class="item-sub text-muted">
          <span>{systemMetrics?.cpu?.brand || 'x86_64 Processor'}</span>
          <span>{systemMetrics?.cpu?.speedGhz ? systemMetrics.cpu.speedGhz + ' GHz' : ''}</span>
        </div>
      </div>

      <!-- RAM Usage -->
      <div class="telemetry-item">
        <div class="item-head">
          <span class="label">
            <Database size={16} class="icon-ram" />
            Memoria RAM (8 GB)
          </span>
          <span class="val font-mono">
            {systemMetrics?.memory?.usedGb ?? '--'} / {systemMetrics?.memory?.totalGb ?? 8} GB
          </span>
        </div>
        <div class="progress-bar">
          <div 
            class="fill fill-ram" 
            style="width: {systemMetrics?.memory?.usedPercent || 0}%"
          ></div>
        </div>
        <div class="item-sub text-muted">
          <span>Uso actual: {systemMetrics?.memory?.usedPercent ?? '--'}%</span>
          <span>Disponible: {systemMetrics?.memory?.freeGb ?? '--'} GB</span>
        </div>
      </div>

      <!-- Disco Raíz / -->
      <div class="telemetry-item">
        <div class="item-head">
          <span class="label">
            <HardDrive size={16} class="icon-disk-root" />
            Disco Raíz (/)
          </span>
          <span class="val font-mono">
            {rootDisk ? `${rootDisk.usedGb} / ${rootDisk.sizeGb} GB` : 'N/A'}
          </span>
        </div>
        <div class="progress-bar">
          <div 
            class="fill fill-disk-root" 
            style="width: {rootDisk?.usePercent || 0}%"
          ></div>
        </div>
        <div class="item-sub text-muted">
          <span>Ocupado: {rootDisk?.usePercent ?? 0}%</span>
          <span>Libre: {rootDisk?.availableGb ?? '--'} GB</span>
        </div>
      </div>

      <!-- Disco Temporal /mnt -->
      <div class="telemetry-item">
        <div class="item-head">
          <span class="label">
            <HardDrive size={16} class="icon-disk-mnt" />
            SSD Temp (/mnt)
          </span>
          <span class="val font-mono">
            {mntDisk ? `${mntDisk.usedGb} / ${mntDisk.sizeGb} GB` : 'N/A'}
          </span>
        </div>
        <div class="progress-bar">
          <div 
            class="fill fill-disk-mnt" 
            style="width: {mntDisk?.usePercent || 0}%"
          ></div>
        </div>
        <div class="item-sub text-muted">
          <span>{mntDisk ? `Ocupado: ${mntDisk.usePercent}%` : 'Montaje no detectado'}</span>
          <span>{mntDisk?.availableGb ? `${mntDisk.availableGb} GB libres` : ''}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Resumen Visual del Estado de los Contenedores -->
  <div class="containers-overview-section">
    <div class="section-title-row">
      <div class="title-with-icon">
        <Box size={20} class="icon-box" />
        <h3>Resumen del Ecosistema Docker</h3>
      </div>
      <span class="total-badge">{totalCount} Contenedores Registrados</span>
    </div>

    <!-- Status summary pills / cards -->
    <div class="status-summary-grid">
      <!-- Running -->
      <div class="summary-card card-running">
        <div class="summary-icon-box">
          <Play size={20} />
        </div>
        <div class="summary-data">
          <span class="summary-count font-mono">{runningCount}</span>
          <span class="summary-label">En Ejecución (Running)</span>
        </div>
      </div>

      <!-- Paused -->
      <div class="summary-card card-paused">
        <div class="summary-icon-box">
          <Clock size={20} />
        </div>
        <div class="summary-data">
          <span class="summary-count font-mono">{pausedCount}</span>
          <span class="summary-label">Pausados (Paused)</span>
        </div>
      </div>

      <!-- Stopped -->
      <div class="summary-card card-stopped">
        <div class="summary-icon-box">
          <Square size={20} />
        </div>
        <div class="summary-data">
          <span class="summary-count font-mono">{stoppedCount}</span>
          <span class="summary-label">Detenidos (Stopped)</span>
        </div>
      </div>
    </div>

    <!-- Barra de proporción visual -->
    <div class="proportion-bar-container">
      <div class="proportion-bar">
        {#if totalCount > 0}
          <div 
            class="bar-seg seg-running" 
            style="width: {(runningCount / totalCount) * 100}%"
            title="Running: {runningCount}"
          ></div>
          <div 
            class="bar-seg seg-paused" 
            style="width: {(pausedCount / totalCount) * 100}%"
            title="Paused: {pausedCount}"
          ></div>
          <div 
            class="bar-seg seg-stopped" 
            style="width: {(stoppedCount / totalCount) * 100}%"
            title="Stopped: {stoppedCount}"
          ></div>
        {:else}
          <div class="bar-seg seg-empty" style="width: 100%"></div>
        {/if}
      </div>
      <div class="proportion-legend">
        <span class="leg-item"><span class="leg-dot bg-running"></span> Running ({runningCount})</span>
        <span class="leg-item"><span class="leg-dot bg-paused"></span> Paused ({pausedCount})</span>
        <span class="leg-item"><span class="leg-dot bg-stopped"></span> Stopped ({stoppedCount})</span>
      </div>
    </div>

    <!-- Quick Containers List -->
    <div class="quick-containers-list">
      <h4 class="subhead">Contenedores del Sistema</h4>
      {#if containers.length === 0}
        <div class="empty-list-box">No se han encontrado contenedores Docker en el host.</div>
      {:else}
        <div class="quick-grid">
          {#each containers as c}
            {@const state = (c.State || c.state || '').toLowerCase()}
            <div class="container-mini-card state-{state}">
              <div class="mini-top">
                <span class="mini-name" title={c.name || c.Names?.[0]}>
                  {c.name || c.Names?.[0]?.replace(/^\//, '') || c.Id?.slice(0, 12)}
                </span>
                <span class="mini-badge badge-{state}">{state}</span>
              </div>
              <div class="mini-bottom">
                <span class="mini-image text-muted" title={c.image || c.Image}>
                  {c.image || c.Image}
                </span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .view-container {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  /* Azure VM Telemetry Banner */
  .azure-hero-card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .azure-badge-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    border-bottom: 1px solid var(--card-border);
    padding-bottom: 1rem;
  }

  .vm-tag {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    color: var(--secondary);
    font-size: 1.05rem;
    letter-spacing: 0.02em;
  }

  .specs-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface-muted, rgba(255, 255, 255, 0.03));
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 0.8rem;
    color: var(--text-muted);
    border: 1px solid var(--card-border);
  }

  .sep {
    color: var(--text-muted);
  }

  .status-live {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #34d399;
    font-weight: 600;
    font-size: 0.75rem;
  }

  .pulse-dot {
    width: 7px;
    height: 7px;
    background: #10b981;
    border-radius: 50%;
    box-shadow: 0 0 8px #10b981;
    animation: pulse 1.8s infinite;
  }

  @keyframes pulse {
    0% { transform: scale(0.9); opacity: 0.8; }
    50% { transform: scale(1.3); opacity: 1; }
    100% { transform: scale(0.9); opacity: 0.8; }
  }

  .telemetry-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 1.25rem;
  }

  .telemetry-item {
    background: var(--surface-muted, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .item-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  :global(.icon-cpu) { color: #38bdf8; }
  :global(.icon-ram) { color: #a855f7; }
  :global(.icon-disk-root) { color: #f59e0b; }
  :global(.icon-disk-mnt) { color: #10b981; }

  .val {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-main);
  }

  .progress-bar {
    width: 100%;
    height: 7px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .fill-cpu { background: linear-gradient(90deg, #38bdf8, #0284c7); }
  .fill-ram { background: linear-gradient(90deg, #a855f7, #7c3aed); }
  .fill-disk-root { background: linear-gradient(90deg, #f59e0b, #d97706); }
  .fill-disk-mnt { background: linear-gradient(90deg, #10b981, #059669); }

  .item-sub {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
  }

  /* Containers Overview Section */
  .containers-overview-section {
    background: var(--card-bg, #121215);
    border: 1px solid var(--card-border, #222226);
    border-radius: 16px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .title-with-icon {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  :global(.icon-box) {
    color: #38bdf8;
  }

  .section-title-row h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text-main, #f8fafc);
  }

  .total-badge {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.78rem;
    font-weight: 600;
    border: 1px solid rgba(56, 189, 248, 0.25);
  }

  .status-summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .summary-card {
    border-radius: 12px;
    padding: 1.15rem;
    display: flex;
    align-items: center;
    gap: 14px;
    border: 1px solid transparent;
  }

  .card-running {
    background: rgba(16, 185, 129, 0.08);
    border-color: rgba(16, 185, 129, 0.25);
    color: #34d399;
  }
  .card-running .summary-icon-box { background: rgba(16, 185, 129, 0.15); }

  .card-paused {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.25);
    color: #fbbf24;
  }
  .card-paused .summary-icon-box { background: rgba(245, 158, 11, 0.15); }

  .card-stopped {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.25);
    color: #f87171;
  }
  .card-stopped .summary-icon-box { background: rgba(239, 68, 68, 0.15); }

  .summary-icon-box {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .summary-data {
    display: flex;
    flex-direction: column;
  }

  .summary-count {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .summary-label {
    font-size: 0.78rem;
    color: #94a3b8;
  }

  /* Proportion Bar */
  .proportion-bar-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .proportion-bar {
    width: 100%;
    height: 10px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 9999px;
    overflow: hidden;
    display: flex;
  }

  .bar-seg {
    height: 100%;
    transition: width 0.3s ease;
  }

  .seg-running { background: #10b981; }
  .seg-paused { background: #f59e0b; }
  .seg-stopped { background: #ef4444; }
  .seg-empty { background: rgba(255, 255, 255, 0.1); }

  .proportion-legend {
    display: flex;
    gap: 16px;
    font-size: 0.78rem;
    color: #94a3b8;
  }

  .leg-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .leg-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .bg-running { background: #10b981; }
  .bg-paused { background: #f59e0b; }
  .bg-stopped { background: #ef4444; }

  /* Quick Containers */
  .quick-containers-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .subhead {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .quick-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  .container-mini-card {
    background: var(--surface-muted, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--card-border);
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mini-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .mini-name {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mini-badge {
    padding: 2px 7px;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  .badge-running { background: rgba(16, 185, 129, 0.15); color: #34d399; }
  .badge-paused { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
  .badge-stopped, .badge-exited { background: rgba(239, 68, 68, 0.15); color: #f87171; }

  .mini-bottom {
    overflow: hidden;
  }

  .mini-image {
    font-size: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    font-family: monospace;
    color: var(--text-muted);
  }

  .empty-list-box {
    padding: 20px;
    background: var(--surface-muted, rgba(255, 255, 255, 0.02));
    border-radius: 8px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.85rem;
    border: 1px dashed var(--card-border);
  }

  .font-mono {
    font-family: monospace;
  }

  .text-muted {
    color: var(--text-muted);
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .azure-hero-card,
    .containers-overview-section {
      padding: 1.15rem;
      border-radius: 14px;
    }

    .telemetry-grid {
      grid-template-columns: 1fr;
      gap: 0.85rem;
    }

    .status-summary-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .quick-grid {
      grid-template-columns: 1fr;
    }

    .azure-badge-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.65rem;
    }

    .specs-pill {
      font-size: 0.72rem;
      padding: 5px 10px;
      flex-wrap: wrap;
    }

    .proportion-legend {
      flex-wrap: wrap;
      gap: 10px;
    }
  }
</style>

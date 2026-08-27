<script>
  import { 
    Cpu, 
    Database, 
    Box, 
    Clock,
    Play,
    Square
  } from 'lucide-svelte';
  import DeployCard from '../components/DeployCard.svelte';

  export let containers = [];

  // Deploy props from App.svelte
  export let imageName = '';
  export let containerName = '';
  export let hostPort = '';
  export let containerPort = '';
  export let isDeploying = false;
  export let deployMessage = '';
  export let deployIsError = false;
  export let handleDeploy;

  // Mock server statistics for Phase 2
  let cpuUsage = 14;
  let ramUsage = 42; // percentage

  $: runningCount = containers.filter(c => c.State === 'running').length;
  $: stoppedCount = containers.filter(c => c.State !== 'running').length;
  
  // Get up to 4 recent containers for quick access shortcuts
  $: recentContainers = [...containers].slice(0, 4);
</script>

<div class="view-container">
  <!-- Metrics Widget -->
  <div class="stats-grid">
    <!-- CPU Card -->
    <div class="glass-card stat-card">
      <div class="stat-header">
        <div class="icon-wrapper blue">
          <Cpu size={20} />
        </div>
        <span class="stat-title">Uso de CPU (Docker)</span>
      </div>
      <div class="stat-value">{cpuUsage}%</div>
      <div class="progress-bar-container">
        <div class="progress-bar blue" style="width: {cpuUsage}%"></div>
      </div>
      <div class="stat-footer text-muted">
        <span>Estimado del daemon</span>
      </div>
    </div>

    <!-- RAM Card -->
    <div class="glass-card stat-card">
      <div class="stat-header">
        <div class="icon-wrapper purple">
          <Database size={20} />
        </div>
        <span class="stat-title">Memoria RAM (Docker)</span>
      </div>
      <div class="stat-value">{ramUsage}%</div>
      <div class="progress-bar-container">
        <div class="progress-bar purple" style="width: {ramUsage}%"></div>
      </div>
      <div class="stat-footer text-muted">
        <span>3.36 GB asignados</span>
      </div>
    </div>

    <!-- Active Containers Breakdown Card -->
    <div class="glass-card stat-card">
      <div class="stat-header">
        <div class="icon-wrapper green">
          <Box size={20} />
        </div>
        <span class="stat-title">Contenedores Totales</span>
      </div>
      <div class="stat-value">{containers.length}</div>
      <div class="status-bars">
        <div class="bar-segment running" style="flex: {runningCount || 1}" title="{runningCount} Running"></div>
        <div class="bar-segment stopped" style="flex: {stoppedCount || (containers.length === 0 ? 1 : 0)}" title="{stoppedCount} Stopped"></div>
      </div>
      <div class="stat-footer text-muted">
        <span class="text-green font-semibold">{runningCount} corriendo</span> | 
        <span class="text-orange font-semibold">{stoppedCount} detenidos</span>
      </div>
    </div>
  </div>

  <div class="dashboard-content-grid">
    <!-- Quick Deploy Section Widget -->
    <div class="deploy-section">
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

    <!-- Recent Containers Shortcuts Widget -->
    <div class="glass-card recent-card">
      <div class="card-header-styled">
        <div class="icon-wrapper orange">
          <Clock size={20} />
        </div>
        <div>
          <h3>Accesos Directos</h3>
          <p class="subtitle">Contenedores recientes</p>
        </div>
      </div>
      <div class="recent-list">
        {#if recentContainers.length === 0}
          <div class="empty-state">
            <Box size={32} class="text-muted" />
            <p class="text-muted">No hay contenedores recientes.</p>
          </div>
        {:else}
          {#each recentContainers as rc}
            <div class="recent-item">
              <div class="item-info">
                <span class="item-name">{rc.Names ? rc.Names.join(', ').replace(/^\//, '') : rc.Id.substring(0, 8)}</span>
                <span class="item-image text-muted">{rc.Image}</span>
              </div>
              <div class="item-actions">
                {#if rc.State === 'running'}
                  <button class="btn-action stop" title="Detener (Mock)"><Square size={16}/></button>
                {:else}
                  <button class="btn-action start" title="Iniciar (Mock)"><Play size={16}/></button>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .view-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* Grid layouts */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.5rem;
  }

  .dashboard-content-grid {
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 2rem;
  }

  @media (max-width: 1024px) {
    .dashboard-content-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Cards styling */
  .glass-card {
    background: var(--card-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--card-border);
    border-radius: 20px;
    padding: 1.75rem;
    box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.2);
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .glass-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
    box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.3);
  }

  /* Stat Card Specifics */
  .stat-card {
    display: flex;
    flex-direction: column;
  }

  .stat-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .stat-title {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .stat-value {
    font-size: 2.25rem;
    font-weight: 700;
    margin-bottom: 0.75rem;
    letter-spacing: -0.03em;
  }

  .stat-footer {
    font-size: 0.8rem;
    margin-top: 0.75rem;
  }

  /* Status Bars (Running vs Stopped) */
  .status-bars {
    display: flex;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.05);
    gap: 2px;
  }

  .bar-segment {
    height: 100%;
    transition: flex 0.5s ease;
  }

  .bar-segment.running { background: #10b981; }
  .bar-segment.stopped { background: #f97316; }

  /* Icon Wrappers */
  .icon-wrapper {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-wrapper.blue {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .icon-wrapper.purple {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  .icon-wrapper.orange {
    background: rgba(249, 115, 22, 0.15);
    color: #fdba74;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }

  .icon-wrapper.green {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  /* Progress Bars */
  .progress-bar-container {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    border-radius: 3px;
    transition: width 0.5s ease-in-out;
  }

  .progress-bar.blue { background: #3b82f6; }
  .progress-bar.purple { background: #8b5cf6; }

  /* Card Header */
  .card-header-styled {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .card-header-styled h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .subtitle {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* Recent Containers List */
  .recent-card {
    display: flex;
    flex-direction: column;
  }

  .recent-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    gap: 1rem;
    text-align: center;
  }

  .recent-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.8rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    transition: background 0.2s;
  }

  .recent-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .item-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .item-name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .item-image {
    font-size: 0.8rem;
    font-family: 'JetBrains Mono', monospace;
  }

  .item-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    color: white;
  }

  .btn-action.start {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
  }

  .btn-action.start:hover {
    background: rgba(16, 185, 129, 0.4);
  }

  .btn-action.stop {
    background: rgba(249, 115, 22, 0.2);
    color: #fb923c;
  }

  .btn-action.stop:hover {
    background: rgba(249, 115, 22, 0.4);
  }

  /* Utils */
  .font-semibold {
    font-weight: 600;
  }
  .text-muted {
    color: var(--text-muted);
  }

  :global(.text-green) {
    color: #10b981;
  }
  :global(.text-orange) {
    color: #f97316;
  }
</style>

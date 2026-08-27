<script>
  import { 
    Cpu, 
    Database, 
    Box, 
    Activity, 
    Server, 
    TrendingUp, 
    CheckCircle2 
  } from 'lucide-svelte';

  export let containers = [];

  // Mock server statistics for Phase 1
  let cpuUsage = 14;
  let ramUsage = 42; // percentage
  let diskUsage = 28; // percentage
  let systemUptime = "5d 12h 30m";
</script>

<div class="view-container">
  <div class="stats-grid">
    <!-- CPU Card -->
    <div class="glass-card stat-card">
      <div class="stat-header">
        <div class="icon-wrapper blue">
          <Cpu size={20} />
        </div>
        <span class="stat-title">Uso de CPU</span>
      </div>
      <div class="stat-value">{cpuUsage}%</div>
      <div class="progress-bar-container">
        <div class="progress-bar blue" style="width: {cpuUsage}%"></div>
      </div>
      <div class="stat-footer text-muted">
        <span>4 Cores / 8 Threads</span>
      </div>
    </div>

    <!-- RAM Card -->
    <div class="glass-card stat-card">
      <div class="stat-header">
        <div class="icon-wrapper purple">
          <Database size={20} />
        </div>
        <span class="stat-title">Memoria RAM</span>
      </div>
      <div class="stat-value">{ramUsage}%</div>
      <div class="progress-bar-container">
        <div class="progress-bar purple" style="width: {ramUsage}%"></div>
      </div>
      <div class="stat-footer text-muted">
        <span>3.36 GB / 8.00 GB</span>
      </div>
    </div>

    <!-- Disk Card -->
    <div class="glass-card stat-card">
      <div class="stat-header">
        <div class="icon-wrapper orange">
          <Server size={20} />
        </div>
        <span class="stat-title">Almacenamiento</span>
      </div>
      <div class="stat-value">{diskUsage}%</div>
      <div class="progress-bar-container">
        <div class="progress-bar orange" style="width: {diskUsage}%"></div>
      </div>
      <div class="stat-footer text-muted">
        <span>33.6 GB / 120 GB libres</span>
      </div>
    </div>

    <!-- Active Containers Card -->
    <div class="glass-card stat-card">
      <div class="stat-header">
        <div class="icon-wrapper green">
          <Box size={20} />
        </div>
        <span class="stat-title">Contenedores</span>
      </div>
      <div class="stat-value">{containers.length}</div>
      <div class="progress-bar-container">
        <div class="progress-bar green" style="width: {containers.length > 0 ? Math.min(containers.length * 10, 100) : 0}%"></div>
      </div>
      <div class="stat-footer text-muted">
        <span>{containers.filter(c => c.State === 'running').length} activos en ejecución</span>
      </div>
    </div>
  </div>

  <div class="info-grid">
    <!-- Server Status Info -->
    <div class="glass-card info-card">
      <div class="card-header-styled">
        <div class="icon-wrapper green">
          <Activity size={20} />
        </div>
        <div>
          <h3>Estado del Servidor</h3>
          <p class="subtitle">Información del sistema local.</p>
        </div>
      </div>
      <div class="details-list">
        <div class="details-row">
          <span class="label text-muted">Tiempo de Actividad (Uptime)</span>
          <span class="value font-semibold">{systemUptime}</span>
        </div>
        <div class="details-row">
          <span class="label text-muted">SO Host</span>
          <span class="value font-semibold">Linux Ubuntu 22.04 LTS</span>
        </div>
        <div class="details-row">
          <span class="label text-muted">Versión de Docker</span>
          <span class="value font-semibold">24.0.7</span>
        </div>
        <div class="details-row">
          <span class="label text-muted">Dirección IP Local</span>
          <span class="value font-mono">192.168.1.150</span>
        </div>
      </div>
    </div>

    <!-- Docker Health -->
    <div class="glass-card info-card">
      <div class="card-header-styled">
        <div class="icon-wrapper blue">
          <TrendingUp size={20} />
        </div>
        <div>
          <h3>Rendimiento y Diagnósticos</h3>
          <p class="subtitle">Estado del demonio de Docker.</p>
        </div>
      </div>
      <div class="status-summary">
        <div class="health-indicator">
          <CheckCircle2 size={36} class="text-green animate-pulse" />
          <div>
            <h4 class="font-semibold">Docker está Saludable</h4>
            <p class="text-muted text-sm">El daemon responde correctamente en /var/run/docker.sock</p>
          </div>
        </div>
        <div class="stats-pills-row">
          <div class="stat-pill-mini">
            <span class="text-muted">Redes Docker</span>
            <span class="badge blue">4</span>
          </div>
          <div class="stat-pill-mini">
            <span class="text-muted">Volúmenes</span>
            <span class="badge purple">7</span>
          </div>
          <div class="stat-pill-mini">
            <span class="text-muted">Imágenes</span>
            <span class="badge orange">12</span>
          </div>
        </div>
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

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }

  @media (max-width: 1024px) {
    .info-grid {
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
  .progress-bar.orange { background: #f97316; }
  .progress-bar.green { background: #10b981; }

  /* Info Card Specifics */
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

  .details-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .details-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .details-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .font-semibold {
    font-weight: 600;
  }

  .font-mono {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.9rem;
  }

  .text-muted {
    color: var(--text-muted);
  }

  .text-sm {
    font-size: 0.8rem;
  }

  /* Health & Diagnostics */
  .status-summary {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .health-indicator {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  :global(.text-green) {
    color: #10b981;
  }

  .stats-pills-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .stat-pill-mini {
    flex: 1;
    min-width: 100px;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--card-border);
    padding: 0.6rem 0.8rem;
    border-radius: 10px;
  }

  .stat-pill-mini span {
    font-size: 0.8rem;
  }

  .badge {
    align-self: flex-start;
    padding: 0.15rem 0.5rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .badge.blue {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
  }

  .badge.purple {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
  }

  .badge.orange {
    background: rgba(249, 115, 22, 0.15);
    color: #fdba74;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  :global(.animate-pulse) {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>

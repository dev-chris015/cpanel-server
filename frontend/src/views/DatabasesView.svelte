<script>
  import { onMount, onDestroy } from 'svelte';
  import { 
    Database, 
    Layers, 
    Activity, 
    RefreshCw, 
    HardDrive, 
    Clock, 
    CheckCircle, 
    AlertTriangle,
    Zap
  } from 'lucide-svelte';
  import { api } from '../lib/api.js';

  let telemetry = null;
  let loading = true;
  let error = null;
  let intervalId = null;

  async function fetchTelemetry() {
    try {
      const res = await api.get('/databases/status');
      if (res && res.success) {
        telemetry = res.data;
        error = null;
      } else {
        error = res.error || 'Error al obtener telemetría de MariaDB';
      }
    } catch (err) {
      error = err.message || 'No se pudo conectar al endpoint de bases de datos';
    } finally {
      loading = false;
    }
  }

  function formatUptime(seconds) {
    if (!seconds && seconds !== 0) return '--';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    parts.push(`${mins}m`);
    return parts.join(' ');
  }

  // Identificar si una base de datos es wp_site
  function isWpSite(dbName) {
    return /^wp_site_\d+/i.test(dbName);
  }

  $: wpDatabases = (telemetry?.databases || []).filter(d => isWpSite(d.database));
  $: otherDatabases = (telemetry?.databases || []).filter(d => !isWpSite(d.database));

  onMount(() => {
    fetchTelemetry();
    intervalId = setInterval(fetchTelemetry, 5000);
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });
</script>

<div class="databases-view">
  <!-- Top Status Banner -->
  <div class="banner-card">
    <div class="banner-left">
      <div class="icon-cube">
        <Database size={24} color="#ffffff" />
      </div>
      <div>
        <h3 class="banner-title">Telemetría de Servidor MariaDB</h3>
        <p class="banner-desc">Monitoreo de conexiones, hilos en ejecución y pesos de bases de datos WordPress.</p>
      </div>
    </div>

    <div class="banner-actions">
      <div class="connection-pill" class:connected={telemetry?.connected}>
        <span class="status-dot"></span>
        <span>{telemetry?.connected ? 'Conectado a MariaDB' : 'Desconectado'}</span>
      </div>

      <button class="btn-refresh" on:click={fetchTelemetry} disabled={loading} title="Actualizar datos">
        <RefreshCw size={15} class={loading ? 'spin' : ''} />
        <span>Actualizar</span>
      </button>
    </div>
  </div>

  {#if error}
    <div class="alert-box">
      <AlertTriangle size={18} />
      <span>{error}</span>
    </div>
  {/if}

  <!-- Telemetry Metrics Grid -->
  <div class="metrics-grid">
    <!-- Hilos y Conexiones Activas -->
    <div class="metric-card">
      <div class="metric-head">
        <span class="metric-label">
          <Activity size={16} class="icon-blue" /> Conexiones Activas
        </span>
        <span class="metric-sub font-mono">Max Used: {telemetry?.connections?.maxUsed ?? '--'}</span>
      </div>
      <div class="metric-main">
        <span class="metric-number font-mono">{telemetry?.connections?.active ?? 0}</span>
        <span class="metric-unit">threads conectados</span>
      </div>
      <div class="metric-footer text-muted">
        <span>Hilos en ejecución: <strong>{telemetry?.connections?.running ?? 0}</strong></span>
      </div>
    </div>

    <!-- Uptime del Servicio -->
    <div class="metric-card">
      <div class="metric-head">
        <span class="metric-label">
          <Clock size={16} class="icon-amber" /> Uptime MariaDB
        </span>
      </div>
      <div class="metric-main">
        <span class="metric-number font-mono">{formatUptime(telemetry?.uptimeSeconds)}</span>
      </div>
      <div class="metric-footer text-muted">
        <span>Total de consultas: {telemetry?.totalQueries ? telemetry.totalQueries.toLocaleString() : '--'}</span>
      </div>
    </div>

    <!-- Tamaño Total Almacenado -->
    <div class="metric-card">
      <div class="metric-head">
        <span class="metric-label">
          <HardDrive size={16} class="icon-purple" /> Peso Total Almacenado
        </span>
      </div>
      <div class="metric-main">
        <span class="metric-number font-mono">{telemetry?.totalSizeMb ?? 0}</span>
        <span class="metric-unit">MB</span>
      </div>
      <div class="metric-footer text-muted">
        <span>{telemetry?.databases?.length ?? 0} bases de datos registradas</span>
      </div>
    </div>
  </div>

  <!-- WordPress Sites Database Cards Section -->
  <div class="section-container">
    <div class="section-header">
      <div class="sec-title-group">
        <Zap size={18} class="icon-brand" />
        <h4>Bases de Datos de Sitios WordPress</h4>
      </div>
      <span class="count-pill">{wpDatabases.length} Sitios Detectados</span>
    </div>

    {#if wpDatabases.length === 0}
      <div class="empty-dbs">
        <p>No se encontraron bases de datos con el prefijo <code>wp_site_*</code> actualmente.</p>
      </div>
    {:else}
      <div class="wp-grid">
        {#each wpDatabases as db}
          <div class="wp-card">
            <div class="wp-card-head">
              <div class="wp-badge">WP</div>
              <span class="wp-dbname font-mono">{db.database}</span>
            </div>

            <div class="wp-card-body">
              <span class="wp-label">Peso exacto en disco</span>
              <div class="wp-size-row">
                <span class="wp-size-val font-mono">{db.sizeMb.toFixed(2)}</span>
                <span class="wp-size-unit">MB</span>
              </div>
            </div>

            <div class="wp-progress-bar">
              <div 
                class="wp-progress-fill" 
                style="width: {Math.min(100, Math.max(5, (db.sizeMb / (telemetry?.totalSizeMb || 1)) * 100))}%"
              ></div>
            </div>
            <div class="wp-card-footer">
              <span class="text-muted font-mono">{((db.sizeMb / (telemetry?.totalSizeMb || 1)) * 100).toFixed(1)}% del total</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Other Databases (information_schema, mysql, etc.) -->
  {#if otherDatabases.length > 0}
    <div class="section-container">
      <div class="section-header">
        <div class="sec-title-group">
          <Layers size={18} class="icon-blue" />
          <h4>Otras Bases de Datos del Sistema</h4>
        </div>
        <span class="count-pill">{otherDatabases.length} Adicionales</span>
      </div>

      <div class="other-dbs-table-wrap">
        <table class="dbs-table">
          <thead>
            <tr>
              <th>Base de Datos</th>
              <th>Tamaño (MB)</th>
              <th>Proporción</th>
            </tr>
          </thead>
          <tbody>
            {#each otherDatabases as db}
              <tr>
                <td class="font-mono">{db.database}</td>
                <td class="font-mono font-bold">{db.sizeMb.toFixed(2)} MB</td>
                <td>
                  <div class="table-progress">
                    <div 
                      class="table-fill" 
                      style="width: {Math.min(100, (db.sizeMb / (telemetry?.totalSizeMb || 1)) * 100)}%"
                    ></div>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<style>
  .databases-view {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .banner-card {
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .banner-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .icon-cube {
    background: #0284c7;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
  }

  .banner-title {
    margin: 0 0 4px 0;
    font-size: 1.15rem;
    color: #f8fafc;
  }

  .banner-desc {
    margin: 0;
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .banner-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .connection-pill {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 600;
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .connection-pill.connected {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.3);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }

  .btn-refresh {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #cbd5e1;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f8fafc;
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

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1.25rem;
  }

  .metric-card {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }

  .metric-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .metric-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #94a3b8;
  }

  .metric-sub {
    font-size: 0.75rem;
    color: #64748b;
  }

  :global(.icon-blue) { color: #38bdf8; }
  :global(.icon-amber) { color: #f59e0b; }
  :global(.icon-purple) { color: #a855f7; }
  :global(.icon-brand) { color: #0284c7; }

  .metric-main {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .metric-number {
    font-size: 2rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .metric-unit {
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .metric-footer {
    font-size: 0.78rem;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: 8px;
  }

  /* Section Styles */
  .section-container {
    background: #111827;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sec-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sec-title-group h4 {
    margin: 0;
    font-size: 1.05rem;
    color: #f1f5f9;
  }

  .count-pill {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .wp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.25rem;
  }

  .wp-card {
    background: #1e293b;
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 12px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: transform 0.2s, border-color 0.2s;
  }

  .wp-card:hover {
    transform: translateY(-2px);
    border-color: #38bdf8;
  }

  .wp-card-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .wp-badge {
    background: #0073aa;
    color: white;
    font-size: 0.72rem;
    font-weight: 800;
    padding: 3px 7px;
    border-radius: 6px;
  }

  .wp-dbname {
    font-size: 0.95rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .wp-card-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }

  .wp-label {
    font-size: 0.78rem;
    color: #94a3b8;
  }

  .wp-size-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .wp-size-val {
    font-size: 1.75rem;
    font-weight: 700;
    color: #38bdf8;
  }

  .wp-size-unit {
    font-size: 0.85rem;
    color: #94a3b8;
    font-weight: 600;
  }

  .wp-progress-bar {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 9999px;
    overflow: hidden;
  }

  .wp-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #38bdf8, #0284c7);
    border-radius: 9999px;
  }

  .wp-card-footer {
    display: flex;
    justify-content: flex-end;
    font-size: 0.75rem;
  }

  .other-dbs-table-wrap {
    overflow-x: auto;
  }

  .dbs-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    text-align: left;
  }

  .dbs-table th {
    padding: 10px 12px;
    color: #94a3b8;
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .dbs-table td {
    padding: 10px 12px;
    color: #e2e8f0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .font-bold {
    font-weight: 700;
  }

  .table-progress {
    width: 100px;
    height: 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 9999px;
    overflow: hidden;
  }

  .table-fill {
    height: 100%;
    background: #64748b;
    border-radius: 9999px;
  }

  .empty-dbs {
    padding: 24px;
    text-align: center;
    color: #64748b;
    font-size: 0.9rem;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 8px;
  }

  .empty-dbs code {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .font-mono {
    font-family: monospace;
  }

  .text-muted {
    color: #94a3b8;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }
</style>

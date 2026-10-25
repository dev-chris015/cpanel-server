<script>
  import { onMount, onDestroy } from 'svelte';
  import { socket } from '../socket.js';
  import { Cpu, HardDrive, ArrowDown, ArrowUp, Activity } from 'lucide-svelte';

  export let containerId = '';
  export let containerName = '';
  export let status = 'stopped'; // running, paused, stopped, etc.

  let stats = {
    cpu: { percent: 0, onlineCpus: 1 },
    memory: { usedMb: 0, totalMb: 0, percent: 0, usedBytes: 0, totalBytes: 0 },
    network: { rxMb: 0, txMb: 0, rxBytes: 0, txBytes: 0 }
  };

  let currentSubscribedId = null;

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function handleStatsUpdate(data) {
    if (data && (!data.containerId || data.containerId === containerId)) {
      stats = {
        cpu: data.cpu || stats.cpu,
        memory: data.memory || stats.memory,
        network: data.network || stats.network
      };
    }
  }

  function unsubscribeCurrent() {
    if (currentSubscribedId && socket) {
      socket.emit('unsubscribe-container-stats', { containerId: currentSubscribedId });
      socket.off(`container-stats:${currentSubscribedId}`, handleStatsUpdate);
      currentSubscribedId = null;
    }
  }

  function subscribeStats(id) {
    unsubscribeCurrent();

    if (!id || !socket || status.toLowerCase() !== 'running') {
      stats = {
        cpu: { percent: 0, onlineCpus: 1 },
        memory: { usedMb: 0, totalMb: 0, percent: 0, usedBytes: 0, totalBytes: 0 },
        network: { rxMb: 0, txMb: 0, rxBytes: 0, txBytes: 0 }
      };
      return;
    }

    currentSubscribedId = id;
    socket.on(`container-stats:${id}`, handleStatsUpdate);
    socket.emit('subscribe-container-stats', { containerId: id });
  }

  $: normalizedStatus = (status || 'stopped').toLowerCase();

  $: statusBadgeClass = {
    running: 'badge-running',
    paused: 'badge-paused',
    stopped: 'badge-stopped',
    exited: 'badge-stopped'
  }[normalizedStatus] || 'badge-unknown';

  $: statusLabel = {
    running: 'Running',
    paused: 'Paused',
    stopped: 'Stopped',
    exited: 'Stopped'
  }[normalizedStatus] || normalizedStatus.toUpperCase();

  $: if (containerId && (containerId !== currentSubscribedId || normalizedStatus === 'running')) {
    subscribeStats(containerId);
  }

  onMount(() => {
    if (containerId) {
      subscribeStats(containerId);
    }
  });

  onDestroy(() => {
    unsubscribeCurrent();
  });
</script>

<div class="stats-card">
  <div class="card-header">
    <div class="header-info">
      <h4 class="title" title={containerName || containerId}>
        {containerName || (containerId ? containerId.slice(0, 12) : 'Contenedor')}
      </h4>
      <span class="sub-id">{containerId ? containerId.slice(0, 12) : ''}</span>
    </div>
    <span class="status-badge {statusBadgeClass}">
      <span class="dot"></span>
      {statusLabel}
    </span>
  </div>

  <div class="metrics-grid">
    <!-- Medidor de CPU % -->
    <div class="metric-item">
      <div class="metric-top">
        <span class="label">
          <Cpu size={14} class="metric-icon icon-cpu" />
          CPU
        </span>
        <span class="value font-mono">{stats.cpu.percent}%</span>
      </div>
      <div class="progress-bar-bg">
        <div 
          class="progress-fill fill-cpu" 
          style="width: {Math.min(100, Math.max(0, stats.cpu.percent))}%"
        ></div>
      </div>
      <div class="metric-footer">
        <span>{stats.cpu.onlineCpus || 1} vCPU(s)</span>
      </div>
    </div>

    <!-- Barra de RAM (MB usados / límite) -->
    <div class="metric-item">
      <div class="metric-top">
        <span class="label">
          <HardDrive size={14} class="metric-icon icon-ram" />
          Memoria RAM
        </span>
        <span class="value font-mono">
          {stats.memory.usedMb.toFixed(1)} MB / {stats.memory.totalMb ? stats.memory.totalMb.toFixed(0) + ' MB' : '∞'}
        </span>
      </div>
      <div class="progress-bar-bg">
        <div 
          class="progress-fill fill-ram" 
          style="width: {Math.min(100, Math.max(0, stats.memory.percent))}%"
        ></div>
      </div>
      <div class="metric-footer">
        <span>Uso: {stats.memory.percent}%</span>
      </div>
    </div>

    <!-- Network RX / TX -->
    <div class="metric-item network-item">
      <div class="metric-top">
        <span class="label">
          <Activity size={14} class="metric-icon icon-net" />
          Network I/O
        </span>
      </div>
      <div class="net-stats">
        <div class="net-direction">
          <ArrowDown size={14} class="net-arrow arrow-rx" />
          <span class="net-label">RX:</span>
          <span class="net-val font-mono">{formatBytes(stats.network.rxBytes)}</span>
        </div>
        <div class="net-direction">
          <ArrowUp size={14} class="net-arrow arrow-tx" />
          <span class="net-label">TX:</span>
          <span class="net-val font-mono">{formatBytes(stats.network.txBytes)}</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .stats-card {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s, border-color 0.2s;
  }

  .stats-card:hover {
    border-color: rgba(56, 189, 248, 0.3);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 12px;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #f1f5f9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }

  .sub-id {
    font-size: 0.72rem;
    color: #64748b;
    font-family: monospace;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .badge-running {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  .badge-running .dot {
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
  }

  .badge-paused {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
  .badge-paused .dot {
    background: #f59e0b;
  }

  .badge-stopped {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  .badge-stopped .dot {
    background: #ef4444;
  }

  .badge-unknown {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.3);
  }
  .badge-unknown .dot {
    background: #94a3b8;
  }

  .metrics-grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .metric-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .metric-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: #94a3b8;
    font-weight: 500;
  }

  :global(.icon-cpu) { color: #38bdf8; }
  :global(.icon-ram) { color: #a855f7; }
  :global(.icon-net) { color: #34d399; }

  .value {
    font-size: 0.85rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .font-mono {
    font-family: monospace;
  }

  .progress-bar-bg {
    width: 100%;
    height: 7px;
    background: rgba(255, 255, 255, 0.07);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .fill-cpu {
    background: linear-gradient(90deg, #38bdf8, #0284c7);
  }

  .fill-ram {
    background: linear-gradient(90deg, #a855f7, #7c3aed);
  }

  .metric-footer {
    display: flex;
    justify-content: flex-end;
    font-size: 0.72rem;
    color: #64748b;
  }

  .net-stats {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 8px 12px;
  }

  .net-direction {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
  }

  .net-label {
    color: #94a3b8;
  }

  :global(.arrow-rx) { color: #38bdf8; }
  :global(.arrow-tx) { color: #34d399; }

  .net-val {
    color: #e2e8f0;
    font-weight: 600;
  }
</style>

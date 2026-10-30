<script>
  /**
   * MetricCard.svelte
   * Tarjeta visual para métricas de sistema y contenedores.
   */
  export let title = '';
  export let value = '';
  export let percent = 0;
  export let subtitle = '';
  export let icon = null; // Componente Svelte tipo Lucide (ej. Cpu, Database, HardDrive)

  // Normalizar porcentaje entre 0 y 100
  $: numericPercent = Math.min(100, Math.max(0, Number(percent) || 0));

  // Determinar color de barra según reactividad requerida:
  // verde < 70%, naranja 70-85%, rojo > 85%
  $: statusLevel = numericPercent > 85 
    ? 'danger' 
    : numericPercent >= 70 
      ? 'warning' 
      : 'normal';
</script>

<div class="metric-card level-{statusLevel}">
  <div class="card-glow"></div>
  
  <div class="card-top">
    <div class="header-left">
      {#if icon}
        <div class="icon-box level-{statusLevel}">
          <svelte:component this={icon} size={18} />
        </div>
      {/if}
      <div class="title-wrap">
        <span class="card-title" title={title}>{title}</span>
        {#if subtitle}
          <span class="card-subtitle" title={subtitle}>{subtitle}</span>
        {/if}
      </div>
    </div>
    <div class="percent-badge level-{statusLevel} font-mono">
      {numericPercent.toFixed(1)}%
    </div>
  </div>

  <div class="card-main">
    <div class="card-value font-mono">
      {value}
    </div>
  </div>

  <div class="progress-track" role="progressbar" aria-valuenow={numericPercent} aria-valuemin="0" aria-valuemax="100">
    <div 
      class="progress-fill level-{statusLevel}" 
      style="width: {numericPercent}%"
    ></div>
  </div>
</div>

<style>
  .metric-card {
    position: relative;
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 14px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.95rem;
    box-shadow: 0 4px 18px -4px rgba(0, 0, 0, 0.4);
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), 
                border-color 0.22s ease, 
                box-shadow 0.22s ease;
    overflow: hidden;
    box-sizing: border-box;
  }

  .metric-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 28px -6px rgba(0, 0, 0, 0.55);
  }

  .metric-card.level-normal:hover {
    border-color: rgba(34, 197, 94, 0.35);
  }

  .metric-card.level-warning:hover {
    border-color: rgba(245, 158, 11, 0.4);
  }

  .metric-card.level-danger:hover {
    border-color: rgba(239, 68, 68, 0.45);
  }

  .card-glow {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    opacity: 0;
    transition: opacity 0.25s ease;
  }

  .metric-card:hover .card-glow {
    opacity: 0.9;
  }

  .level-normal .card-glow {
    background: linear-gradient(90deg, transparent, #22c55e, transparent);
  }

  .level-warning .card-glow {
    background: linear-gradient(90deg, transparent, #f59e0b, transparent);
  }

  .level-danger .card-glow {
    background: linear-gradient(90deg, transparent, #ef4444, transparent);
  }

  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    flex: 1;
  }

  .title-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
    flex: 1;
  }

  .icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    flex-shrink: 0;
    transition: all 0.25s ease;
  }

  .icon-box.level-normal {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.25);
  }

  .icon-box.level-warning {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .icon-box.level-danger {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  .card-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.01em;
  }

  .card-subtitle {
    font-size: 0.75rem;
    color: var(--text-muted, #a1a1aa);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .percent-badge {
    padding: 0.2rem 0.55rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .percent-badge.level-normal {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.25);
  }

  .percent-badge.level-warning {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .percent-badge.level-danger {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  .card-main {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .card-value {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--text-main, #f4f4f5);
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  /* Barra de progreso */
  .progress-track {
    width: 100%;
    height: 7px;
    background: var(--surface-muted, #18181b);
    border-radius: 9999px;
    overflow: hidden;
    position: relative;
    border: 1px solid var(--card-border, #222225);
  }

  .progress-fill {
    height: 100%;
    border-radius: 9999px;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease;
  }

  .progress-fill.level-normal {
    background: linear-gradient(90deg, #10b981, #22c55e);
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.45);
  }

  .progress-fill.level-warning {
    background: linear-gradient(90deg, #f59e0b, #eab308);
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.45);
  }

  .progress-fill.level-danger {
    background: linear-gradient(90deg, #ef4444, #f43f5e);
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.55);
  }

  @media (max-width: 480px) {
    .metric-card {
      padding: 1rem;
      gap: 0.8rem;
    }

    .card-value {
      font-size: 1.1rem;
    }

    .icon-box {
      width: 32px;
      height: 32px;
    }
  }
</style>

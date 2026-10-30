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

<div class="metric-card">
  <div class="card-header">
    <div class="header-left">
      {#if icon}
        <div class="icon-box level-{statusLevel}">
          <svelte:component this={icon} size={18} />
        </div>
      {/if}
      <span class="card-title">{title}</span>
    </div>
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

  {#if subtitle}
    <div class="card-footer">
      <span class="subtitle-text">{subtitle}</span>
      <span class="percent-tag level-{statusLevel} font-mono">{numericPercent.toFixed(1)}%</span>
    </div>
  {/if}
</div>

<style>
  .metric-card {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 12px;
    padding: 1.15rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .metric-card:hover {
    border-color: rgba(56, 189, 248, 0.3);
    box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5);
    transform: translateY(-2px);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    flex-shrink: 0;
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  .icon-box.level-normal {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
  }

  .icon-box.level-warning {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  .icon-box.level-danger {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .card-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-muted, #a1a1aa);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-value {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
    white-space: nowrap;
  }

  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  /* Barra de progreso */
  .progress-track {
    width: 100%;
    height: 8px;
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

  /* Colores reactivos: verde < 70%, naranja 70-85%, rojo > 85% */
  .progress-fill.level-normal {
    background: linear-gradient(90deg, #10b981, #22c55e);
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.4);
  }

  .progress-fill.level-warning {
    background: linear-gradient(90deg, #f59e0b, #eab308);
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);
  }

  .progress-fill.level-danger {
    background: linear-gradient(90deg, #ef4444, #f43f5e);
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.5);
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.775rem;
    color: var(--text-muted, #a1a1aa);
    gap: 0.5rem;
  }

  .subtitle-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .percent-tag {
    font-weight: 600;
    font-size: 0.75rem;
  }

  .percent-tag.level-normal {
    color: #4ade80;
  }

  .percent-tag.level-warning {
    color: #fbbf24;
  }

  .percent-tag.level-danger {
    color: #f87171;
  }

  @media (max-width: 480px) {
    .metric-card {
      padding: 0.95rem 1rem;
      gap: 0.65rem;
    }

    .card-value {
      font-size: 0.95rem;
    }

    .card-title {
      font-size: 0.8rem;
    }
  }
</style>

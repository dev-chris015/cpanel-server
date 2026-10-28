<script>
  /**
   * StatusBadge.svelte
   * Badge píldora con punto indicador pulsante reactivo al estado del contenedor.
   */
  export let status = 'stopped';
  export let label = ''; // Etiqueta opcional; si no se provee, se usa el estado normalizado

  // Normalizar status
  $: normalizedStatus = (status || '').toString().toLowerCase().trim();

  // Mapeo a las 4 categorías solicitadas:
  // - running: Verde
  // - stopped / exited: Gris
  // - restarting: Amarillo
  // - error / unhealthy: Rojo
  $: variant = (() => {
    switch (normalizedStatus) {
      case 'running':
      case 'up':
      case 'active':
        return 'running';
      case 'restarting':
      case 'restart':
      case 'starting':
        return 'restarting';
      case 'error':
      case 'unhealthy':
      case 'dead':
      case 'failed':
        return 'error';
      case 'stopped':
      case 'exited':
      case 'paused':
      case 'created':
      default:
        return 'stopped';
    }
  })();

  $: displayText = label || (
    variant === 'running' ? 'Running' :
    variant === 'restarting' ? 'Restarting' :
    variant === 'error' ? (normalizedStatus === 'unhealthy' ? 'Unhealthy' : 'Error') :
    (normalizedStatus === 'paused' ? 'Paused' : 'Stopped')
  );
</script>

<span class="status-badge variant-{variant}">
  <span class="status-dot"></span>
  <span class="status-text">{displayText}</span>
</span>

<style>
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.25rem 0.65rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.025em;
    user-select: none;
    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  }

  /* Dot indicador */
  .status-dot {
    position: relative;
    width: 6.5px;
    height: 6.5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Efecto pulsante */
  .status-dot::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  /* 1. RUNNING (Verde) */
  .variant-running {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.28);
  }
  .variant-running .status-dot {
    background-color: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
  }
  .variant-running .status-dot::after {
    border: 1.5px solid rgba(34, 197, 94, 0.7);
    animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  /* 2. RESTARTING (Amarillo) */
  .variant-restarting {
    background: rgba(234, 179, 8, 0.12);
    color: #fde047;
    border: 1px solid rgba(234, 179, 8, 0.28);
  }
  .variant-restarting .status-dot {
    background-color: #eab308;
    box-shadow: 0 0 6px rgba(234, 179, 8, 0.6);
  }
  .variant-restarting .status-dot::after {
    border: 1.5px solid rgba(234, 179, 8, 0.7);
    animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  /* 3. ERROR / UNHEALTHY (Rojo) */
  .variant-error {
    background: rgba(239, 68, 68, 0.12);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.28);
  }
  .variant-error .status-dot {
    background-color: #ef4444;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
  }
  .variant-error .status-dot::after {
    border: 1.5px solid rgba(239, 68, 68, 0.7);
    animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  /* 4. STOPPED / EXITED (Gris) */
  .variant-stopped {
    background: rgba(148, 163, 184, 0.1);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.2);
  }
  .variant-stopped .status-dot {
    background-color: #64748b;
  }
  .variant-stopped .status-dot::after {
    display: none; /* No pulsa cuando está detenido */
  }

  .status-text {
    white-space: nowrap;
  }

  @keyframes ping {
    0% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 0.8;
    }
    75%, 100% {
      transform: translate(-50%, -50%) scale(2.4);
      opacity: 0;
    }
  }
</style>

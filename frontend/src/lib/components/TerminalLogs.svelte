<script>
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { socket } from '../socket.js';
  import { 
    Trash2, 
    Terminal as TerminalIcon,
    Play,
    Pause,
    Maximize2,
    Minimize2,
    Layers,
    RefreshCw
  } from 'lucide-svelte';

  export let containerId = '';
  export let containerName = '';
  export let containers = [];

  let terminalContainer;
  let term;
  let fitAddon;
  let currentSubscribedId = null;

  // Estados de control
  let isPaused = false;
  let isFullscreen = false;
  let selectedTail = 100;
  const tailOptions = [50, 100, 500];

  function initTerminal() {
    if (!terminalContainer) return;

    term = new Terminal({
      cursorBlink: false,
      fontFamily: 'Fira Code, Menlo, Monaco, Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#05070f',
        foreground: '#f8fafc',
        cursor: '#38bdf8',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        black: '#000000',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f8fafc',
        brightBlack: '#64748b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fde047',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff'
      },
      convertEol: true,
      scrollback: 5000,
      disableStdin: true
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainer);

    try {
      fitAddon.fit();
    } catch (e) {}
  }

  function handleLogData(data) {
    if (term && data && data.log && !isPaused) {
      term.write(data.log);
    }
  }

  function handleLogEnded() {
    if (term) {
      term.writeln('\r\n\x1b[33m--- [Stream de logs finalizado por el contenedor] ---\x1b[0m');
    }
  }

  function handleLogError(err) {
    if (term && (!err.containerId || err.containerId === currentSubscribedId)) {
      term.writeln(`\r\n\x1b[31m[Error de logs]: ${err.error || 'Error desconocido'}\x1b[0m`);
    }
  }

  function unsubscribeCurrent() {
    if (currentSubscribedId && socket) {
      socket.emit('unsubscribe-logs', { containerId: currentSubscribedId });
      socket.off(`container-logs:${currentSubscribedId}`, handleLogData);
      socket.off(`container-logs:${currentSubscribedId}:ended`, handleLogEnded);
      socket.off('logs-error', handleLogError);
      currentSubscribedId = null;
    }
  }

  export function subscribeLogs(id, tail = selectedTail) {
    unsubscribeCurrent();

    if (!id || !socket) {
      if (term) {
        term.clear();
        term.writeln('\x1b[90mSelecciona un contenedor para visualizar sus logs en vivo...\x1b[0m');
      }
      return;
    }

    if (term) {
      term.clear();
      term.writeln(`\x1b[36m--- [Stream de logs en vivo] ${containerName || id.slice(0, 12)} (Tail: ${tail} líneas) ---\x1b[0m\r\n`);
    }

    currentSubscribedId = id;
    isPaused = false;

    socket.on(`container-logs:${id}`, handleLogData);
    socket.on(`container-logs:${id}:ended`, handleLogEnded);
    socket.on('logs-error', handleLogError);

    socket.emit('subscribe-logs', { containerId: id, tail: Number(tail) || 100 });
  }

  export function clearTerminal() {
    if (term) {
      term.clear();
    }
  }

  export function togglePause() {
    isPaused = !isPaused;
    if (term) {
      if (isPaused) {
        term.writeln('\r\n\x1b[33m--- [STREAM PAUSADO] Los nuevos eventos no se imprimirán hasta reanudar ---\x1b[0m');
      } else {
        term.writeln('\r\n\x1b[32m--- [STREAM REANUDADO] ---\x1b[0m');
      }
    }
  }

  export function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    setTimeout(() => {
      fit();
    }, 150);
  }

  function handleTailChange(event) {
    const newTail = Number(event.target.value) || 100;
    selectedTail = newTail;
    if (containerId) {
      subscribeLogs(containerId, newTail);
    }
  }

  export function fit() {
    if (fitAddon) {
      try {
        fitAddon.fit();
      } catch (e) {}
    }
  }

  // Reactividad al cambiar containerId desde el exterior
  $: if (term && containerId !== currentSubscribedId) {
    subscribeLogs(containerId, selectedTail);
  }

  function handleResize() {
    fit();
  }

  onMount(() => {
    initTerminal();
    window.addEventListener('resize', handleResize);

    if (containerId) {
      subscribeLogs(containerId, selectedTail);
    } else if (term) {
      term.writeln('\x1b[90mEsperando selección de contenedor...\x1b[0m');
    }
  });

  onDestroy(() => {
    window.removeEventListener('resize', handleResize);
    unsubscribeCurrent();
    if (term) {
      term.dispose();
      term = null;
    }
  });
</script>

<div class="terminal-logs-card" class:fullscreen={isFullscreen}>
  <div class="terminal-header">
    <div class="header-left">
      <div class="status-indicator" class:active={!!containerId && !isPaused} class:paused={isPaused}></div>
      <TerminalIcon size={16} class="icon-term" />
      <span class="title">
        Logs en Tiempo Real:
        <strong class="target-name">{containerName || (containerId ? containerId.slice(0, 12) : 'Sin seleccionar')}</strong>
      </span>
      {#if isPaused}
        <span class="badge-paused">Pausado</span>
      {/if}
    </div>

    <div class="header-actions">
      <!-- Selector de Líneas Iniciales (Tail) -->
      <div class="tail-selector-box" title="Líneas históricas iniciales a solicitar">
        <span class="tail-label">Tail:</span>
        <select value={selectedTail} on:change={handleTailChange} class="tail-select">
          {#each tailOptions as opt}
            <option value={opt}>{opt} líneas</option>
          {/each}
        </select>
      </div>

      <!-- Botón Pausar / Reanudar -->
      <button 
        type="button"
        class="btn-tool" 
        class:btn-active={isPaused}
        on:click={togglePause} 
        disabled={!containerId}
        title={isPaused ? 'Reanudar streaming de logs' : 'Pausar streaming de logs'}
      >
        {#if isPaused}
          <Play size={14} class="text-green" />
          <span>Reanudar</span>
        {:else}
          <Pause size={14} class="text-amber" />
          <span>Pausar</span>
        {/if}
      </button>

      <!-- Botón Limpiar Consola -->
      <button 
        type="button"
        class="btn-tool" 
        on:click={clearTerminal} 
        title="Limpiar salida actual de la terminal"
      >
        <Trash2 size={14} />
        <span>Limpiar</span>
      </button>

      <!-- Botón Pantalla Completa -->
      <button 
        type="button"
        class="btn-tool" 
        on:click={toggleFullscreen} 
        title={isFullscreen ? 'Salir de pantalla completa' : 'Ver logs en pantalla completa'}
      >
        {#if isFullscreen}
          <Minimize2 size={14} />
          <span>Restaurar</span>
        {:else}
          <Maximize2 size={14} />
          <span>Pantalla Completa</span>
        {/if}
      </button>
    </div>
  </div>

  <div class="terminal-viewport" bind:this={terminalContainer}></div>
</div>

<style>
  .terminal-logs-card {
    display: flex;
    flex-direction: column;
    background: #020617;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 12px;
    overflow: hidden;
    height: 100%;
    min-height: 480px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .terminal-logs-card.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    border-radius: 0;
    border: none;
  }

  .terminal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 1rem;
    background: #09090b;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #e2e8f0;
    font-size: 0.85rem;
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #64748b;
    transition: background-color 0.2s ease, box-shadow 0.2s ease;
  }

  .status-indicator.active {
    background: #22c55e;
    box-shadow: 0 0 8px #22c55e;
  }

  .status-indicator.paused {
    background: #eab308;
    box-shadow: 0 0 8px #eab308;
  }

  :global(.icon-term) {
    color: #38bdf8;
  }

  .target-name {
    color: #38bdf8;
    margin-left: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .badge-paused {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.45rem;
    background: rgba(234, 179, 8, 0.15);
    border: 1px solid rgba(234, 179, 8, 0.3);
    color: #fde047;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  .tail-selector-box {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 6px;
    padding: 0.2rem 0.5rem;
  }

  .tail-label {
    font-size: 0.75rem;
    color: #94a3b8;
    font-weight: 500;
  }

  .tail-select {
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 0.75rem;
    outline: none;
    cursor: pointer;
    font-family: inherit;
  }

  .tail-select option {
    background: #0f172a;
    color: #f8fafc;
  }

  .btn-tool {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    background: rgba(148, 163, 184, 0.1);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 6px;
    color: #cbd5e1;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-tool:hover:not(:disabled) {
    background: rgba(148, 163, 184, 0.2);
    color: #ffffff;
    border-color: rgba(148, 163, 184, 0.3);
  }

  .btn-tool:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-tool.btn-active {
    background: rgba(234, 179, 8, 0.15);
    border-color: rgba(234, 179, 8, 0.4);
    color: #fde047;
  }

  .terminal-viewport {
    flex: 1;
    padding: 0.75rem;
    background: #05070f;
    min-height: 400px;
    overflow: hidden;
  }

  :global(.terminal-viewport .xterm) {
    height: 100%;
  }

  :global(.terminal-viewport .xterm-viewport) {
    background-color: #05070f !important;
  }

  .text-green { color: #4ade80; }
  .text-amber { color: #fbbf24; }
</style>

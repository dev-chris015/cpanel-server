<script>
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { socket } from '../socket.js';
  import { Trash2, Terminal as TerminalIcon } from 'lucide-svelte';

  export let containerId = '';
  export let containerName = '';

  let terminalContainer;
  let term;
  let fitAddon;
  let currentSubscribedId = null;

  function initTerminal() {
    if (!terminalContainer) return;

    term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Fira Code, Menlo, Monaco, Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#0f172a',
        foreground: '#f8fafc',
        cursor: '#38bdf8',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        black: '#0f172a',
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
    } catch (e) {
      // Ignorar si el contenedor no tiene dimensiones aún
    }
  }

  function handleLogData(data) {
    if (term && data && data.log) {
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

  function subscribeLogs(id) {
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
      term.writeln(`\x1b[36m--- Conectando stream de logs: ${containerName || id.slice(0, 12)} ---\x1b[0m\r\n`);
    }

    currentSubscribedId = id;

    socket.on(`container-logs:${id}`, handleLogData);
    socket.on(`container-logs:${id}:ended`, handleLogEnded);
    socket.on('logs-error', handleLogError);

    socket.emit('subscribe-logs', { containerId: id, tail: 150 });
  }

  export function clearTerminal() {
    if (term) {
      term.clear();
    }
  }

  // Reactividad al cambiar containerId
  $: if (term && containerId !== currentSubscribedId) {
    subscribeLogs(containerId);
  }

  function handleResize() {
    if (fitAddon) {
      try {
        fitAddon.fit();
      } catch (e) {}
    }
  }

  onMount(() => {
    initTerminal();
    window.addEventListener('resize', handleResize);

    if (containerId) {
      subscribeLogs(containerId);
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

<div class="terminal-logs-card">
  <div class="terminal-header">
    <div class="header-left">
      <div class="status-indicator" class:active={!!containerId}></div>
      <TerminalIcon size={16} class="icon-term" />
      <span class="title">
        Logs en Tiempo Real:
        <strong class="target-name">{containerName || (containerId ? containerId.slice(0, 12) : 'Sin seleccionar')}</strong>
      </span>
    </div>
    <div class="header-actions">
      <button class="btn-clear" on:click={clearTerminal} title="Limpiar salida de consola">
        <Trash2 size={14} />
        <span>Limpiar</span>
      </button>
    </div>
  </div>

  <div class="terminal-viewport" bind:this={terminalContainer}></div>
</div>

<style>
  .terminal-logs-card {
    display: flex;
    flex-direction: column;
    background: #0b1120;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    overflow: hidden;
    height: 100%;
    min-height: 380px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }

  .terminal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    background: #111827;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
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
    background: #10b981;
    box-shadow: 0 0 8px #10b981;
  }

  :global(.icon-term) {
    color: #38bdf8;
  }

  .target-name {
    color: #38bdf8;
    margin-left: 4px;
    font-family: monospace;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-clear {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #94a3b8;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-clear:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .terminal-viewport {
    flex: 1;
    padding: 12px;
    background: #0f172a;
    min-height: 320px;
    overflow: hidden;
  }

  :global(.terminal-viewport .xterm) {
    height: 100%;
  }

  :global(.terminal-viewport .xterm-viewport) {
    background-color: #0f172a !important;
  }
</style>

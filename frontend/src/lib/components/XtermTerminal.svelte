<script>
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { socket } from '../socket.js';

  export let containerId = '';

  let terminalContainer;
  let term;
  let fitAddon;
  let resizeObserver;
  let onDataDisposable;
  let activeContainerId = null;

  // Manejador de datos entrantes desde el servidor
  function handleTerminalData(data) {
    if (term) {
      term.write(data);
    }
  }

  // Manejador de evento exit recibido desde el servidor
  function handleServerExit(data) {
    if (term) {
      term.writeln('\r\n\x1b[90m[Sesión de terminal finalizada]\x1b[0m\r\n');
    }
  }

  // Manejador de errores
  function handleTerminalError(err) {
    if (term) {
      const msg = typeof err === 'object' && err?.error ? err.error : String(err);
      term.writeln(`\r\n\x1b[31m[Error]: ${msg}\x1b[0m\r\n`);
    }
  }

  function setupTerminal() {
    if (!terminalContainer) return;

    // 1. Inicializar Terminal con tema oscuro de alto contraste
    term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'Fira Code, Menlo, Monaco, Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      convertEol: true,
      scrollback: 5000,
      disableStdin: false,
      theme: {
        background: '#0a0a0c',
        foreground: '#f8fafc',
        cursor: '#38bdf8',
        cursorAccent: '#0a0a0c',
        selectionBackground: 'rgba(56, 189, 248, 0.35)',
        selectionForeground: '#ffffff',
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
      }
    });

    // 2. Registrar FitAddon y abrir en el contenedor DOM
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainer);
    fitAddon.fit();

    // 3. Conectar entrada de usuario: term.onData -> 'terminal:input'
    onDataDisposable = term.onData((data) => {
      if (socket && socket.connected && activeContainerId) {
        socket.emit('terminal:input', {
          containerId: activeContainerId,
          data
        });
      }
    });

    // 4. Iniciar sesión si se proporcionó un containerId
    if (containerId) {
      initSession(containerId);
    }

    // 5. Escuchar cambios de tamaño con ResizeObserver y emitir 'terminal:resize'
    resizeObserver = new ResizeObserver(() => {
      if (!term || !fitAddon || !terminalContainer) return;
      try {
        fitAddon.fit();
        const cols = term.cols;
        const rows = term.rows;
        if (socket && socket.connected && activeContainerId) {
          socket.emit('terminal:resize', {
            containerId: activeContainerId,
            cols,
            rows
          });
        }
      } catch (err) {
        // Ignorar posibles errores en redimensión cuando el contenedor se oculta o desmonta
      }
    });
    resizeObserver.observe(terminalContainer);
  }

  function initSession(id) {
    if (!id || !term || !socket) return;

    activeContainerId = id;

    // Configurar listeners de Socket.IO
    socket.on('terminal:data', handleTerminalData);
    socket.on(`terminal:data:${id}`, handleTerminalData);
    socket.on('terminal:exit', handleServerExit);
    socket.on('terminal:error', handleTerminalError);

    // Ajustar columnas y filas antes de enviar el evento de inicialización
    if (fitAddon) {
      fitAddon.fit();
    }
    const cols = term.cols || 80;
    const rows = term.rows || 24;

    // Emitir terminal:init por Socket.IO con { containerId, cols, rows }
    socket.emit('terminal:init', {
      containerId: id,
      cols,
      rows
    });
  }

  function cleanUpSession() {
    if (socket) {
      if (activeContainerId) {
        // Emitir eventos de salida / cierre
        socket.emit('terminal:exit', { containerId: activeContainerId });
        socket.emit('terminal:close', { containerId: activeContainerId });
      }

      // Remover listeners de socket asociados
      socket.off('terminal:data', handleTerminalData);
      if (activeContainerId) {
        socket.off(`terminal:data:${activeContainerId}`, handleTerminalData);
      }
      socket.off('terminal:exit', handleServerExit);
      socket.off('terminal:error', handleTerminalError);
    }
    activeContainerId = null;
  }

  onMount(() => {
    setupTerminal();
  });

  onDestroy(() => {
    // 1. Desconectar observadores
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    // 2. Disponer handler de entrada de xterm
    if (onDataDisposable) {
      onDataDisposable.dispose();
      onDataDisposable = null;
    }

    // 3. Emitir terminal:exit, cerrar stream y remover listeners de socket
    cleanUpSession();

    // 4. Destruir y liberar recursos de xterm
    if (fitAddon) {
      fitAddon.dispose();
      fitAddon = null;
    }

    if (term) {
      term.dispose();
      term = null;
    }
  });

  // Reaccionar a cambios reactivos de containerId
  $: if (term && containerId !== activeContainerId) {
    cleanUpSession();
    if (containerId) {
      term.reset();
      initSession(containerId);
    }
  }

  export function focus() {
    term?.focus();
  }

  export function clear() {
    term?.clear();
  }

  export function fit() {
    fitAddon?.fit();
  }
</script>

<div class="xterm-wrapper">
  <div bind:this={terminalContainer} class="xterm-viewport"></div>
</div>

<style>
  .xterm-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 280px;
    background-color: #0a0a0c;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .xterm-viewport {
    flex: 1;
    width: 100%;
    height: 100%;
    padding: 8px;
    box-sizing: border-box;
  }

  :global(.xterm-wrapper .xterm) {
    height: 100%;
    padding: 0;
  }

  :global(.xterm-wrapper .xterm-viewport) {
    background-color: #0a0a0c !important;
    scrollbar-width: thin;
    scrollbar-color: rgba(148, 163, 184, 0.2) transparent;
  }

  :global(.xterm-wrapper .xterm-viewport::-webkit-scrollbar) {
    width: 6px;
  }

  :global(.xterm-wrapper .xterm-viewport::-webkit-scrollbar-thumb) {
    background: rgba(148, 163, 184, 0.2);
    border-radius: 3px;
  }

  :global(.xterm-wrapper .xterm-viewport::-webkit-scrollbar-thumb:hover) {
    background: rgba(148, 163, 184, 0.4);
  }
</style>

<script>
  import { onMount } from 'svelte';
  import { 
    Terminal, 
    Layers, 
    RefreshCw, 
    Maximize2, 
    Minimize2,
    Trash2,
    Play,
    Square
  } from 'lucide-svelte';
  import XtermTerminal from '../lib/components/XtermTerminal.svelte';

  export let containers = [];

  let selectedContainerId = '';
  let selectedContainerName = '';
  let isFullscreen = false;
  let terminalRef;

  // Filtrar contenedores activos en ejecución
  $: runningContainers = containers.filter(c => (c.State || c.state) === 'running');

  // Seleccionar automáticamente el primer contenedor activo si no se ha seleccionado ninguno
  $: if (!selectedContainerId && runningContainers.length > 0) {
    const firstRunning = runningContainers[0];
    const id = firstRunning.id || firstRunning.Id;
    const name = firstRunning.name || firstRunning.Names?.[0]?.replace(/^\//, '') || id.slice(0, 12);
    selectedContainerId = id;
    selectedContainerName = name;
  }

  function handleSelectContainer(event) {
    const id = event.target.value;
    selectedContainerId = id;
    const match = containers.find(c => (c.id || c.Id) === id);
    if (match) {
      selectedContainerName = match.name || match.Names?.[0]?.replace(/^\//, '') || id.slice(0, 12);
    } else {
      selectedContainerName = '';
    }
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    setTimeout(() => {
      terminalRef?.fit();
    }, 150);
  }

  function handleClear() {
    terminalRef?.clear();
  }

  function handleReconnect() {
    const current = selectedContainerId;
    selectedContainerId = '';
    setTimeout(() => {
      selectedContainerId = current;
    }, 100);
  }
</script>

<div class="terminal-view-wrapper" class:fullscreen={isFullscreen}>
  <!-- Top bar with selector and actions -->
  <div class="terminal-toolbar">
    <div class="toolbar-left">
      <div class="icon-label">
        <Terminal size={18} class="term-icon" />
        <span class="label-text">Terminal Interactiva (PTY TTY):</span>
      </div>

      <div class="selector-box">
        <Layers size={15} class="select-icon" />
        <select 
          value={selectedContainerId} 
          on:change={handleSelectContainer}
          class="container-select"
        >
          {#if runningContainers.length === 0}
            <option value="">No hay contenedores en ejecución</option>
          {:else}
            <option value="" disabled>Selecciona un contenedor activo...</option>
            {#each runningContainers as c}
              {@const id = c.id || c.Id}
              {@const name = c.name || c.Names?.[0]?.replace(/^\//, '') || id.slice(0, 12)}
              <option value={id}>
                {name} — {id.slice(0, 8)}
              </option>
            {/each}
          {/if}
        </select>
      </div>

      {#if selectedContainerId}
        <span class="status-running-badge">
          <span class="pulse-dot"></span> Online
        </span>
      {/if}
    </div>

    <div class="toolbar-right">
      <!-- Botón Limpiar Pantalla -->
      <button 
        type="button" 
        class="btn-tool" 
        on:click={handleClear}
        title="Limpiar pantalla de la terminal"
      >
        <Trash2 size={15} />
        <span>Limpiar</span>
      </button>

      <!-- Botón Reconectar -->
      <button 
        type="button" 
        class="btn-tool" 
        on:click={handleReconnect}
        title="Reconectar sesión interactiva"
      >
        <RefreshCw size={15} />
        <span>Reconectar</span>
      </button>

      <!-- Botón Pantalla Completa -->
      <button 
        type="button" 
        class="btn-tool" 
        on:click={toggleFullscreen}
        title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
      >
        {#if isFullscreen}
          <Minimize2 size={15} />
          <span>Restaurar</span>
        {:else}
          <Maximize2 size={15} />
          <span>Pantalla Completa</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Terminal Component -->
  <div class="terminal-content-area">
    {#if selectedContainerId}
      <XtermTerminal 
        bind:this={terminalRef}
        containerId={selectedContainerId}
      />
    {:else}
      <div class="empty-terminal-prompt">
        <Terminal size={36} class="text-muted" />
        <p>Selecciona un contenedor en ejecución para iniciar la consola interactiva.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .terminal-view-wrapper {
    display: flex;
    flex-direction: column;
    background: #09090b;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 12px;
    height: 75vh;
    min-height: 520px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .terminal-view-wrapper.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    border-radius: 0;
    border: none;
  }

  .terminal-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #020617;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    padding: 0.65rem 1rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .icon-label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: #f8fafc;
    font-size: 0.85rem;
    font-weight: 600;
  }

  :global(.term-icon) {
    color: #38bdf8;
  }

  .selector-box {
    position: relative;
    display: flex;
    align-items: center;
  }

  :global(.select-icon) {
    position: absolute;
    left: 0.65rem;
    color: #64748b;
    pointer-events: none;
  }

  .container-select {
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #f8fafc;
    font-size: 0.8rem;
    padding: 0.4rem 0.75rem 0.4rem 2rem;
    border-radius: 6px;
    outline: none;
    font-family: inherit;
    cursor: pointer;
  }

  .container-select:focus {
    border-color: #38bdf8;
  }

  .status-running-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.5rem;
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #22c55e;
    box-shadow: 0 0 6px #22c55e;
  }

  .btn-tool {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(148, 163, 184, 0.1);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #cbd5e1;
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
    font-size: 0.775rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-tool:hover {
    background: rgba(148, 163, 184, 0.2);
    color: #ffffff;
    border-color: rgba(148, 163, 184, 0.3);
  }

  .terminal-content-area {
    flex: 1;
    position: relative;
    background: #000000;
    overflow: hidden;
  }

  .empty-terminal-prompt {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: #64748b;
    font-size: 0.9rem;
    padding: 2rem;
    text-align: center;
  }

  .text-muted {
    color: #64748b;
  }
</style>

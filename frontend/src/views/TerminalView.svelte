<script>
  import { onMount } from 'svelte';
  import { Terminal, Layers, RefreshCw, Maximize2, Minimize2 } from 'lucide-svelte';
  import TerminalLogs from '../lib/components/TerminalLogs.svelte';

  export let containers = [];

  let selectedContainerId = '';
  let selectedContainerName = '';
  let isFullscreen = false;
  let terminalLogsRef;

  $: runningContainers = containers.filter(c => (c.State || c.state) === 'running');

  // Auto-select first running or first container if none selected
  $: if (!selectedContainerId && containers.length > 0) {
    const firstRunning = runningContainers[0] || containers[0];
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
  }
</script>

<div class="terminal-view-wrapper" class:fullscreen={isFullscreen}>
  <!-- Top bar with selector and actions -->
  <div class="terminal-toolbar">
    <div class="toolbar-left">
      <div class="icon-label">
        <Terminal size={18} class="term-icon" />
        <span class="label-text">Visor Interactivo de Logs:</span>
      </div>

      <div class="selector-box">
        <Layers size={15} class="select-icon" />
        <select 
          value={selectedContainerId} 
          on:change={handleSelectContainer}
          class="container-select"
        >
          {#if containers.length === 0}
            <option value="">No hay contenedores disponibles</option>
          {:else}
            <option value="" disabled>Selecciona un contenedor...</option>
            {#each containers as c}
              {@const id = c.id || c.Id}
              {@const name = c.name || c.Names?.[0]?.replace(/^\//, '') || id.slice(0, 12)}
              {@const state = (c.state || c.State || '').toLowerCase()}
              <option value={id}>
                {name} ({state}) — {id.slice(0, 8)}
              </option>
            {/each}
          {/if}
        </select>
      </div>
    </div>

    <div class="toolbar-right">
      <button 
        class="btn-tool" 
        on:click={toggleFullscreen}
        title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
      >
        {#if isFullscreen}
          <Minimize2 size={16} />
          <span>Restaurar</span>
        {:else}
          <Maximize2 size={16} />
          <span>Pantalla Completa</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Terminal Component -->
  <div class="terminal-content-area">
    <TerminalLogs 
      bind:this={terminalLogsRef}
      containerId={selectedContainerId}
      containerName={selectedContainerName}
    />
  </div>
</div>

<style>
  .terminal-view-wrapper {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: calc(100vh - 160px);
    min-height: 520px;
  }

  .terminal-view-wrapper.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    background: #0b1120;
    padding: 16px;
    box-sizing: border-box;
  }

  .terminal-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #111827;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 10px 16px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .icon-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #e2e8f0;
  }

  :global(.term-icon) {
    color: #38bdf8;
  }

  .selector-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 6px 12px;
  }

  :global(.select-icon) {
    color: #64748b;
  }

  .container-select {
    background: transparent;
    border: none;
    outline: none;
    color: #38bdf8;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
  }

  .container-select option {
    background: #0f172a;
    color: #f8fafc;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-tool {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #cbd5e1;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-tool:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f8fafc;
  }

  .terminal-content-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>

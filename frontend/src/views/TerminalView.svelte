<script>
  import { onMount, onDestroy } from 'svelte';
  import { Terminal, Trash2, HelpCircle, Activity, Command } from 'lucide-svelte';

  export let containers = [];

  let commandInput = '';
  let terminalHistory = [
    { type: 'system', text: 'Conectado a la sesión de terminal del servidor cPanel' },
    { type: 'system', text: 'Escribe "help" para ver una lista de comandos soportados.' }
  ];

  let logsData = [];
  let logSource = null;

  let terminalEnd;

  let selectedContainer = ''; // '' = Host
  let viewMode = 'console'; // 'console' | 'logs'

  // Host fake commands data
  const mockImages = [
    { repository: 'nginx', tag: 'latest', id: 'a6bd71e48fca', created: '2 weeks ago', size: '187MB' },
    { repository: 'node', tag: '20-alpine', id: '5d8520cf805d', created: '3 days ago', size: '112MB' },
    { repository: 'postgres', tag: '15-alpine', id: '1bbf5335b750', created: '1 month ago', size: '242MB' },
    { repository: 'redis', tag: '7-alpine', id: '3d3cb4a053c0', created: '5 days ago', size: '32.4MB' }
  ];

  function formatDockerPs() {
    if (containers.length === 0) return 'CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES\n(No hay contenedores corriendo)';
    let header = 'CONTAINER ID   IMAGE               STATUS        PORTS               NAMES\n';
    let rows = containers.map(c => {
      let id = c.Id.substring(0, 12).padEnd(14);
      let img = (c.Image.length > 17 ? c.Image.substring(0, 15) + '...' : c.Image).padEnd(20);
      let status = c.State.padEnd(14);
      let portsStr = '';
      if (c.Ports && c.Ports.length > 0) {
        portsStr = c.Ports.map(p => `${p.PublicPort ? p.PublicPort + '->' : ''}${p.PrivatePort}/${p.Type}`).join(', ');
      }
      portsStr = (portsStr.length > 18 ? portsStr.substring(0, 16) + '..' : portsStr).padEnd(20);
      let name = c.Names ? c.Names.join(', ').replace(/^\//, '') : '-';
      return `${id}${img}${status}${portsStr}${name}`;
    }).join('\n');
    return header + rows;
  }

  function formatDockerImages() {
    let header = 'REPOSITORY          TAG                 IMAGE ID            CREATED             SIZE\n';
    let rows = mockImages.map(img => `${img.repository.padEnd(20)}${img.tag.padEnd(20)}${img.id.padEnd(20)}${img.created.padEnd(20)}${img.size}`).join('\n');
    return header + rows;
  }

  function getNeofetchOutput() {
    return `               ##         .              OS: Ubuntu 22.04 LTS x86_64
         ## ## ##        ==              Host: cPanel Server Local
      ## ## ## ## ##    ===              Kernel: Linux 6.5.0-generic
  /"""""\\___/"""\\___/""\\___/            Uptime: 4 days, 18 hours
 ~~~~~~~ {~~ ~~~~ ~~~ ~~~~ ~~~ ~~~       Shell: bash 5.1.16
  \\___________________________/          Terminal: WebTerminal (Svelte)
                                         CPU: 8 vCPUs @ 3.20GHz
                                         RAM: 4096MiB / 16384MiB (25%)
                                         Docker Engine: v24.0.7 (Community)
                                         Containers: ${containers.length} total (${containers.filter(c => c.State === 'running').length} running)`;
  }

  async function handleCommandSubmit() {
    const cmd = commandInput.trim();
    if (!cmd) return;
    let output = '';
    
    if (selectedContainer) {
      // Execute command in container via API
      try {
        const apiBase = localStorage.getItem('apiBaseUrl') || 'http://localhost:5000/api';
        const res = await fetch(`${apiBase}/containers/${selectedContainer}/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd })
        });
        const data = await res.json();
        output = data.success ? data.data : `Error: ${data.error}`;
        if (!output) output = '(Sin salida)';
      } catch (err) {
        output = `Error de conexión: ${err.message}`;
      }
    } else {
      // Host fake commands
      const cleanCmd = cmd.toLowerCase();
      if (cleanCmd === 'clear') {
        terminalHistory = [];
        commandInput = '';
        return;
      } else if (cleanCmd === 'help') {
        output = `Comandos disponibles:
  help           Muestra esta ayuda.
  clear          Limpia la pantalla.
  neofetch       Muestra información técnica del sistema y logo.
  docker ps      Muestra los contenedores Docker en ejecución en tiempo real.
  docker images  Muestra las imágenes locales disponibles.
  docker info    Muestra información básica de la instalación de Docker.
  uptime         Muestra el tiempo que lleva encendido el servidor.`;
      } else if (cleanCmd === 'neofetch') {
        output = getNeofetchOutput();
      } else if (cleanCmd === 'docker ps') {
        output = formatDockerPs();
      } else if (cleanCmd === 'docker images') {
        output = formatDockerImages();
      } else if (cleanCmd === 'docker info') {
        output = `Docker System Info...\n Debug Mode: false`;
      } else if (cleanCmd === 'uptime') {
        output = 'up 5 days, 12:30, load average: 0.12, 0.08, 0.05';
      } else {
        output = `-bash: ${cmd}: comando no encontrado. Escribe 'help' para ver comandos.`;
      }
    }

    terminalHistory = [
      ...terminalHistory,
      { type: 'prompt', cmd: cmd, output: output }
    ];
    commandInput = '';
    scrollToBottom();
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (terminalEnd) terminalEnd.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  function clearConsole() {
    if (viewMode === 'console') {
      terminalHistory = [];
    } else {
      logsData = [];
    }
  }

  function onContainerChange() {
    if (viewMode === 'logs') {
      startLogStream();
    }
  }

  function setViewMode(mode) {
    viewMode = mode;
    if (mode === 'logs' && selectedContainer) {
      startLogStream();
    } else {
      stopLogStream();
    }
    scrollToBottom();
  }

  function startLogStream() {
    stopLogStream();
    if (!selectedContainer) return;
    
    logsData = [{ type: 'system', text: `Conectando al stream de logs de ${selectedContainer}...` }];
    const apiBase = localStorage.getItem('apiBaseUrl') || 'http://localhost:5000/api';
    logSource = new EventSource(`${apiBase}/containers/${selectedContainer}/logs/stream`);
    
    logSource.onmessage = (event) => {
      try {
        const text = JSON.parse(event.data);
        logsData = [...logsData, { type: 'log', text }];
        scrollToBottom();
      } catch(e) {}
    };
    
    logSource.onerror = () => {
      logsData = [...logsData, { type: 'system', text: '[Fin del stream o Error]' }];
      logSource.close();
    };
  }

  function stopLogStream() {
    if (logSource) {
      logSource.close();
      logSource = null;
    }
  }

  onDestroy(() => {
    stopLogStream();
  });

  onMount(() => {
    terminalHistory = [
      ...terminalHistory,
      { type: 'prompt', cmd: 'neofetch', output: getNeofetchOutput() }
    ];
    scrollToBottom();
  });
</script>

<div class="view-container">
  <!-- Controls Bar -->
  <div class="controls-bar glass-card">
    <div class="selector-group">
      <label for="containerSelect">Objetivo:</label>
      <select id="containerSelect" bind:value={selectedContainer} on:change={onContainerChange} class="styled-select">
        <option value="">Host Local (cPanel)</option>
        {#each containers as c}
          <option value={c.Id}>{c.Names ? c.Names[0].replace('/', '') : c.Id.substring(0, 8)} ({c.Image})</option>
        {/each}
      </select>
    </div>

    <div class="mode-toggle">
      <button 
        class="mode-btn {viewMode === 'console' ? 'active' : ''}" 
        on:click={() => setViewMode('console')}>
        <Command size={16} /> Consola
      </button>
      <button 
        class="mode-btn {viewMode === 'logs' ? 'active' : ''}" 
        disabled={!selectedContainer}
        on:click={() => setViewMode('logs')}
        title={!selectedContainer ? 'Selecciona un contenedor primero' : 'Ver logs en tiempo real'}>
        <Activity size={16} /> Logs
      </button>
    </div>
  </div>

  <div class="glass-card terminal-card">
    <div class="terminal-header">
      <div class="window-controls">
        <span class="control-dot close"></span>
        <span class="control-dot minimize"></span>
        <span class="control-dot maximize"></span>
      </div>
      <div class="terminal-title">
        <Terminal size={14} />
        <span>
          {selectedContainer 
            ? `root@${selectedContainer.substring(0, 12)} ${viewMode === 'logs' ? '(Logs)' : '(Console)'}` 
            : 'root@cpanel-pro:~ (Local Server)'}
        </span>
      </div>
      <div class="terminal-actions">
        <button class="btn-clear" on:click={clearConsole} title="Limpiar Terminal">
          <Trash2 size={14} />
        </button>
      </div>
    </div>

    <div class="terminal-body">
      {#if viewMode === 'console'}
        {#each terminalHistory as line}
          {#if line.type === 'system'}
            <div class="line system-line">{line.text}</div>
          {:else if line.type === 'prompt'}
            <div class="line prompt-line">
              <span class="prompt-symbol">{selectedContainer ? 'container' : 'cpanel-server'} ~ $</span>
              <span class="command-text">{line.cmd}</span>
            </div>
            {#if line.output}
              <div class="line output-line">{line.output}</div>
            {/if}
          {/if}
        {/each}
        
        <div class="line prompt-line input-line">
          <span class="prompt-symbol">{selectedContainer ? 'container' : 'cpanel-server'} ~ $</span>
          <form on:submit|preventDefault={handleCommandSubmit} class="cmd-form">
            <!-- svelte-ignore a11y-autofocus -->
            <input 
              type="text" 
              bind:value={commandInput} 
              class="cmd-input" 
              placeholder="Escribe un comando..."
              autofocus 
            />
          </form>
        </div>
      {:else}
        {#each logsData as log}
          <div class="line {log.type === 'system' ? 'system-line' : 'log-line'}">{log.text}</div>
        {/each}
        {#if !selectedContainer}
          <div class="line system-line">Selecciona un contenedor para ver sus logs.</div>
        {/if}
      {/if}
      <div bind:this={terminalEnd}></div>
    </div>
  </div>
</div>

<style>
  .view-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: calc(100vh - 10rem);
    min-height: 500px;
  }

  .controls-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem !important;
  }

  .selector-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .selector-group label {
    font-weight: 500;
    color: var(--text-color);
  }

  .styled-select {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--card-border);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    outline: none;
    font-family: inherit;
    min-width: 250px;
  }

  .styled-select:focus {
    border-color: var(--primary);
  }

  .mode-toggle {
    display: flex;
    background: rgba(15, 23, 42, 0.6);
    border-radius: 6px;
    padding: 0.25rem;
    border: 1px solid var(--card-border);
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-muted);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
  }

  .mode-btn:hover:not(:disabled) {
    color: white;
  }

  .mode-btn.active {
    background: var(--primary);
    color: white;
  }

  .mode-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .terminal-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 !important;
    overflow: hidden;
    background: rgba(8, 10, 18, 0.7) !important;
    border: 1px solid var(--card-border);
  }

  .terminal-header {
    background: rgba(15, 23, 42, 0.8);
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--card-border);
  }

  .window-controls { display: flex; gap: 0.5rem; }
  .control-dot { width: 12px; height: 12px; border-radius: 50%; }
  .control-dot.close { background-color: #ef4444; }
  .control-dot.minimize { background-color: #f59e0b; }
  .control-dot.maximize { background-color: #10b981; }

  .terminal-title {
    display: flex; align-items: center; gap: 0.5rem;
    color: var(--text-muted); font-size: 0.85rem;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .btn-clear {
    background: transparent; border: none; color: var(--text-muted);
    cursor: pointer; display: flex; align-items: center;
    padding: 0.25rem; border-radius: 4px; transition: all 0.2s;
  }
  .btn-clear:hover { color: var(--danger); background: rgba(255, 255, 255, 0.05); }

  .terminal-body {
    flex: 1; padding: 1.5rem; overflow-y: auto;
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 0.9rem; line-height: 1.5; color: #e2e8f0;
  }

  .line { margin-bottom: 0.5rem; white-space: pre-wrap; word-break: break-all; }
  .system-line { color: #60a5fa; }
  .log-line { color: #e2e8f0; font-size: 0.85rem; }
  
  .prompt-line { display: flex; align-items: center; gap: 0.5rem; }
  .prompt-symbol { color: #10b981; font-weight: bold; user-select: none; }
  .command-text { color: #ffffff; font-weight: 500; }
  
  .output-line {
    color: #cbd5e1; margin-left: 0.5rem; margin-bottom: 1rem;
    background: rgba(0, 0, 0, 0.2); padding: 0.5rem 0.75rem;
    border-radius: 6px; border-left: 2px solid rgba(255, 255, 255, 0.1);
  }

  .input-line { margin-bottom: 0; }
  .cmd-form { flex: 1; display: flex; }
  .cmd-input {
    flex: 1; background: transparent; border: none; outline: none;
    color: #ffffff; font-family: inherit; font-size: inherit; padding: 0; margin: 0;
  }
</style>

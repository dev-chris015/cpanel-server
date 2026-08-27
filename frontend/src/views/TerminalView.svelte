<script>
  import { onMount } from 'svelte';
  import { Terminal, Trash2, HelpCircle } from 'lucide-svelte';

  export let containers = [];

  let commandInput = '';
  let terminalHistory = [
    { type: 'system', text: 'Conectado a la sesión de terminal del servidor cPanel Pro.' },
    { type: 'system', text: 'Escribe "help" para ver una lista de comandos soportados.' },
    { type: 'prompt', cmd: 'neofetch', output: '' }
  ];

  let terminalEnd;

  const mockImages = [
    { repository: 'nginx', tag: 'latest', id: 'a6bd71e48fca', created: '2 weeks ago', size: '187MB' },
    { repository: 'node', tag: '20-alpine', id: '5d8520cf805d', created: '3 days ago', size: '112MB' },
    { repository: 'postgres', tag: '15-alpine', id: '1bbf5335b750', created: '1 month ago', size: '242MB' },
    { repository: 'redis', tag: '7-alpine', id: '3d3cb4a053c0', created: '5 days ago', size: '32.4MB' }
  ];

  // Helper to format output in tabular text
  function formatDockerPs() {
    if (containers.length === 0) {
      return 'CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES\n(No hay contenedores corriendo)';
    }

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
    let rows = mockImages.map(img => {
      let repo = img.repository.padEnd(20);
      let tag = img.tag.padEnd(20);
      let id = img.id.padEnd(20);
      let created = img.created.padEnd(20);
      return `${repo}${tag}${id}${created}${img.size}`;
    }).join('\n');
    return header + rows;
  }

  function getNeofetchOutput() {
    return `            .---.            OS: Ubuntu 22.04 LTS x86_64
           /     \\           Host: cPanel Local Server v1.0
          \\\\.@ @.//          Kernel: 5.15.0-88-generic
          /  \\_/  \\          Uptime: 5 days, 12 hours, 30 mins
         //   _   \\\\         Packages: 842 (dpkg)
        //|   |   |\\\\        Shell: bash 5.1.16
       // |===|===| \\\\       Terminal: WebTerminal (Svelte)
      /   |   |   |   \\      CPU: Intel Xeon E5-2670 v3 (8) @ 2.300GHz
     /    |===|===|    \\     GPU: Intel Haswell-E GT2
    /     |   |   |     \\    Memory: 3440MiB / 8192MiB (42%)
   |      |===|===|      |   Docker: Version 24.0.7
   |      |   |   |      |   
   \\_____________________/   ---------------------------
                             Red/Green/Blue/Purple Dashboard UI`;
  }

  function handleCommandSubmit() {
    const cmd = commandInput.trim();
    if (!cmd) return;

    let output = '';
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
      output = `Docker System Info:
 Kernel Version: 5.15.0-88-generic
 Operating System: Ubuntu 22.04 LTS
 OSType: linux
 Architecture: x86_64
 CPUs: 8
 Total Memory: 8.00 GiB
 Docker Root Dir: /var/lib/docker
 Debug Mode: false
 Registry: https://index.docker.io/v1/`;
    } else if (cleanCmd === 'uptime') {
      output = 'up 5 days, 12:30, load average: 0.12, 0.08, 0.05';
    } else {
      output = `-bash: ${cmd}: comando no encontrado. Escribe 'help' para ver los comandos soportados.`;
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
      if (terminalEnd) {
        terminalEnd.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  }

  function clearConsole() {
    terminalHistory = [];
  }

  onMount(() => {
    // Populate the first neofetch output onload
    terminalHistory[2].output = getNeofetchOutput();
    scrollToBottom();
  });
</script>

<div class="view-container">
  <div class="glass-card terminal-card">
    <!-- Window Titlebar -->
    <div class="terminal-header">
      <div class="window-controls">
        <span class="control-dot close"></span>
        <span class="control-dot minimize"></span>
        <span class="control-dot maximize"></span>
      </div>
      <div class="terminal-title">
        <Terminal size={14} />
        <span>root@cpanel-pro:~ (Local Server)</span>
      </div>
      <div class="terminal-actions">
        <button class="btn-clear" on:click={clearConsole} title="Limpiar Terminal">
          <Trash2 size={14} />
        </button>
      </div>
    </div>

    <!-- Terminal Output Stream -->
    <div class="terminal-body">
      {#each terminalHistory as line}
        {#if line.type === 'system'}
          <div class="line system-line">{line.text}</div>
        {:else if line.type === 'prompt'}
          <div class="line prompt-line">
            <span class="prompt-symbol">cpanel-server ~ $</span>
            <span class="command-text">{line.cmd}</span>
          </div>
          {#if line.output}
            <div class="line output-line">{line.output}</div>
          {/if}
        {/if}
      {/each}
      
      <!-- Input line -->
      <div class="line prompt-line input-line">
        <span class="prompt-symbol">cpanel-server ~ $</span>
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
      <div bind:this={terminalEnd}></div>
    </div>
  </div>

  <div class="terminal-tips glass-card">
    <div class="tip-header">
      <HelpCircle size={18} class="text-blue" />
      <h4>Consejos del Sistema</h4>
    </div>
    <p class="text-muted text-sm">
      Esta consola interactúa localmente con el host y lee las APIs reactivas del panel de Docker. Prueba a correr <code>docker ps</code> después de desplegar un contenedor en la vista de Contenedores para ver cómo cambia de manera reactiva la tabla de terminal.
    </p>
  </div>
</div>

<style>
  .view-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    height: calc(100vh - 12rem);
    min-height: 500px;
  }

  .terminal-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 !important; /* Override standard padding */
    overflow: hidden;
    background: rgba(8, 10, 18, 0.7) !important;
    border: 1px solid var(--card-border);
  }

  /* Titlebar styling */
  .terminal-header {
    background: rgba(15, 23, 42, 0.8);
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--card-border);
  }

  .window-controls {
    display: flex;
    gap: 0.5rem;
  }

  .control-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
  }

  .control-dot.close { background-color: #ef4444; }
  .control-dot.minimize { background-color: #f59e0b; }
  .control-dot.maximize { background-color: #10b981; }

  .terminal-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .btn-clear {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 0.25rem;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .btn-clear:hover {
    color: var(--danger);
    background: rgba(255, 255, 255, 0.05);
  }

  /* Output Stream Box */
  .terminal-body {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.5;
    color: #e2e8f0;
  }

  .line {
    margin-bottom: 0.5rem;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .system-line {
    color: #60a5fa;
  }

  .prompt-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .prompt-symbol {
    color: #10b981;
    font-weight: bold;
    user-select: none;
  }

  .command-text {
    color: #ffffff;
    font-weight: 500;
  }

  .output-line {
    color: #cbd5e1;
    margin-left: 0.5rem;
    margin-bottom: 1rem;
    background: rgba(0, 0, 0, 0.2);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border-left: 2px solid rgba(255, 255, 255, 0.1);
  }

  /* Input Form */
  .input-line {
    margin-bottom: 0;
  }

  .cmd-form {
    flex: 1;
    display: flex;
  }

  .cmd-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-family: inherit;
    font-size: inherit;
    padding: 0;
    margin: 0;
  }

  /* Tips section */
  .terminal-tips {
    padding: 1.25rem !important;
  }

  .tip-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .tip-header h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .text-muted {
    color: var(--text-muted);
  }

  .text-sm {
    font-size: 0.85rem;
  }

  :global(.text-blue) {
    color: #3b82f6;
  }

  code {
    background: rgba(255, 255, 255, 0.05);
    padding: 0.15rem 0.35rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 90%;
    color: #a78bfa;
  }
</style>

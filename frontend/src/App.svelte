<script>
  import { onMount } from 'svelte';
  import { Menu, Sun, Moon } from 'lucide-svelte';
  import { api } from './lib/api.js';
  
  import Sidebar from './components/Sidebar.svelte';
  import DashboardView from './views/DashboardView.svelte';
  import ContainersView from './views/ContainersView.svelte';
  import TerminalView from './views/TerminalView.svelte';
  import DatabasesView from './views/DatabasesView.svelte';

  let containers = [];
  let loading = true;
  let error = null;
  let isDeploying = false;
  let sidebarOpen = false;
  
  // Navigation State
  let activeTab = 'dashboard';

  // Theme State: 'dark' | 'light'
  let currentTheme = 'dark';

  // Form inputs for new deploy
  let imageName = '';
  let containerName = '';
  let hostPort = '';
  let containerPort = '';
  let deployMessage = '';
  let deployIsError = false;

  // Reactive view titles and subtitles
  $: viewInfo = {
    dashboard: { title: 'Dashboard', subtitle: 'Telemetría de Azure VM y resumen visual de contenedores.' },
    containers: { title: 'Gestión de Contenedores', subtitle: 'Monitoreo de métricas en caliente, ciclo de vida e inspección técnica.' },
    terminal: { title: 'Terminal de Logs', subtitle: 'Transmisión de registros en tiempo real en consola interactiva.' },
    databases: { title: 'MariaDB Telemetry', subtitle: 'Monitoreo de conexiones, hilos y almacenamiento de bases de datos WordPress.' }
  }[activeTab] || { title: 'cPanel', subtitle: 'Panel de administración' };

  async function fetchContainers() {
    loading = true;
    error = null;
    try {
      const res = await api.get('/containers');
      if (res && res.success) {
        containers = res.data;
      } else {
        error = res?.error || 'Error al obtener la lista de contenedores';
      }
    } catch (err) {
      error = err.message || 'No se pudo conectar con el servidor backend';
    } finally {
      loading = false;
    }
  }

  async function handleDeploy() {
    if (!imageName.trim()) return;
    isDeploying = true;
    deployMessage = '';
    deployIsError = false;
    try {
      const payload = {
        image: imageName.trim(),
        name: containerName.trim() || undefined,
        ports: hostPort && containerPort ? [{ hostPort, containerPort }] : []
      };

      const res = await api.post('/deploy', payload);

      if (res && res.success) {
        deployMessage = `¡Despliegue exitoso! ID: ${(res.data?.id || '').substring(0, 12)}`;
        deployIsError = false;
        imageName = '';
        containerName = '';
        hostPort = '';
        containerPort = '';
        await fetchContainers();
      } else {
        deployMessage = `Error: ${res?.error || 'Error al desplegar'}`;
        deployIsError = true;
      }
    } catch (err) {
      deployMessage = `Error al conectar con el backend: ${err.message}`;
      deployIsError = true;
    } finally {
      isDeploying = false;
    }
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(currentTheme);
  }

  function applyTheme(theme) {
    if (typeof document !== 'undefined') {
      if (theme === 'light') {
        document.body.classList.add('theme-light');
      } else {
        document.body.classList.remove('theme-light');
      }
      localStorage.setItem('cpanel-theme', theme);
    }
  }

  onMount(() => {
    const savedTheme = localStorage.getItem('cpanel-theme') || 'dark';
    currentTheme = savedTheme;
    applyTheme(savedTheme);
    fetchContainers();
  });
</script>

<div class="layout">
  <!-- Mobile Toggle -->
  <button class="mobile-toggle" on:click={toggleSidebar} title="Abrir menú">
    <Menu size={24} />
  </button>

  <!-- Modular Sidebar -->
  <Sidebar {sidebarOpen} bind:activeTab />

  <!-- Main Content -->
  <main class="main-content">
    <header class="topbar">
      <div>
        <h1>{viewInfo.title}</h1>
        <p class="text-muted">{viewInfo.subtitle}</p>
      </div>

      <!-- Theme Switcher Toggle -->
      <div class="topbar-actions">
        <button 
          class="theme-toggle-btn" 
          on:click={toggleTheme} 
          title="Cambiar tema ({currentTheme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'})"
        >
          {#if currentTheme === 'dark'}
            <Sun size={18} class="theme-icon sun-icon" />
            <span class="theme-label">Claro</span>
          {:else}
            <Moon size={18} class="theme-icon moon-icon" />
            <span class="theme-label">Oscuro</span>
          {/if}
        </button>
      </div>
    </header>

    {#if activeTab === 'dashboard'}
      <DashboardView 
        {containers}
        {fetchContainers}
      />
    {:else if activeTab === 'containers'}
      <ContainersView 
        {containers}
        {loading}
        {error}
        {fetchContainers}
        bind:imageName
        bind:containerName
        bind:hostPort
        bind:containerPort
        {isDeploying}
        {deployMessage}
        {deployIsError}
        {handleDeploy}
      />
    {:else if activeTab === 'terminal'}
      <TerminalView {containers} />
    {:else if activeTab === 'databases'}
      <DatabasesView />
    {/if}
  </main>
</div>

<style>
  /* Base Variables and Resets */
  :global(:root) {
    --bg-dark: #090e17;
    --sidebar-bg: #0d1524;
    --card-bg: #111a2e;
    --card-border: rgba(255, 255, 255, 0.08);
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
    --primary: #0284c7;
    --primary-hover: #0369a1;
    --secondary: #38bdf8;
    --success: #10b981;
    --success-bg: rgba(16, 185, 129, 0.1);
    --danger: #ef4444;
    --danger-bg: rgba(239, 68, 68, 0.1);
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background-color: var(--bg-dark);
    color: var(--text-main);
    min-height: 100vh;
    overflow-x: hidden;
    transition: background-color 0.25s ease, color 0.25s ease;
  }

  /* Theme Light */
  :global(body.theme-light) {
    --bg-dark: #f8fafc;
    --sidebar-bg: #ffffff;
    --card-bg: #ffffff;
    --card-border: rgba(0, 0, 0, 0.08);
    --text-main: #0f172a;
    --text-muted: #64748b;
  }

  .layout {
    display: flex;
    min-height: 100vh;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 2rem;
    overflow-y: auto;
    background: var(--bg-dark);
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--card-border);
  }

  .topbar h1 {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0 0 0.4rem 0;
    color: var(--text-main);
  }

  .text-muted {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .theme-toggle-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    padding: 8px 14px;
    border-radius: 20px;
    color: var(--text-main);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .theme-toggle-btn:hover {
    border-color: var(--primary);
  }

  :global(.sun-icon) {
    color: #f59e0b;
  }

  :global(.moon-icon) {
    color: #38bdf8;
  }

  .mobile-toggle {
    display: none;
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 100;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    color: var(--text-main);
    padding: 0.5rem;
    border-radius: 8px;
    cursor: pointer;
  }

  @media (max-width: 1024px) {
    .mobile-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .main-content {
      padding: 1.25rem;
      padding-top: 4.5rem;
    }
  }
</style>

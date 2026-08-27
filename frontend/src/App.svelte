<script>
  import { onMount } from 'svelte';
  import { Menu } from 'lucide-svelte';
  
  import Sidebar from './components/Sidebar.svelte';
  import DashboardView from './views/DashboardView.svelte';
  import ContainersView from './views/ContainersView.svelte';
  import TerminalView from './views/TerminalView.svelte';
  import SettingsView from './views/SettingsView.svelte';

  let containers = [];
  let loading = true;
  let error = null;
  let isDeploying = false;
  let sidebarOpen = false;
  
  // Navigation State
  let activeTab = 'dashboard';

  // Form inputs for new deploy
  let imageName = '';
  let containerName = '';
  let hostPort = '';
  let containerPort = '';
  let deployMessage = '';
  let deployIsError = false;

  let API_BASE = 'http://localhost:5000/api';

  // Reactive view titles and subtitles
  $: viewInfo = {
    dashboard: { title: 'Dashboard', subtitle: 'Resumen del estado de tu servidor local.' },
    containers: { title: 'Contenedores', subtitle: 'Administra y despliega contenedores Docker.' },
    terminal: { title: 'Terminal', subtitle: 'Consola interactiva con el servidor y Docker.' },
    settings: { title: 'Configuración', subtitle: 'Ajustes del sistema y preferencias de la interfaz.' }
  }[activeTab];

  async function fetchContainers() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`${API_BASE}/containers`);
      const json = await res.json();
      if (json.success) {
        containers = json.data;
      } else {
        error = json.error || 'Error al obtener la lista de contenedores';
      }
    } catch (err) {
      error = 'No se pudo conectar con el servidor Backend (Express). Asegúrate de que el backend está corriendo.';
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

      const res = await fetch(`${API_BASE}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        deployMessage = `¡Despliegue exitoso! ID: ${json.data.id.substring(0, 12)}`;
        deployIsError = false;
        imageName = '';
        containerName = '';
        hostPort = '';
        containerPort = '';
        await fetchContainers();
      } else {
        deployMessage = `Error: ${json.error} - ${json.details || ''}`;
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

  onMount(() => {
    API_BASE = localStorage.getItem('apiBaseUrl') || 'http://localhost:5000/api';
    const theme = localStorage.getItem('theme') || 'dark';
    document.body.className = theme === 'light' ? 'theme-light' : '';
    fetchContainers();
  });
</script>

<div class="layout">
  <!-- Mobile Toggle -->
  <button class="mobile-toggle" on:click={toggleSidebar}>
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
    {:else if activeTab === 'settings'}
      <SettingsView />
    {/if}
  </main>
</div>

<style>
  /* Base Variables and Resets */
  :global(:root) {
    --bg-dark: #000000;
    --sidebar-bg: #09090b;
    --card-bg: #121215;
    --card-border: #222226;
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
    --primary: #2563eb;
    --primary-hover: #1d4ed8;
    --secondary: #3b82f6;
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
  }

  /* Theme support */
  :global(body.theme-light) {
    --bg-dark: #f1f5f9;
    --sidebar-bg: rgba(255, 255, 255, 0.8);
    --card-bg: rgba(255, 255, 255, 0.9);
    --card-border: rgba(0, 0, 0, 0.1);
    --text-main: #0f172a;
    --text-muted: #64748b;
  }
  
  :global(body.theme-light .mesh-bg) {
    opacity: 0.5;
  }
  
  :global(body.theme-light .user-profile) {
    background: rgba(0,0,0,0.05);
    border: 1px solid rgba(0,0,0,0.1);
  }

  /* Utils & Animations - globally available */
  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    100% { transform: rotate(360deg); }
  }

  /* Layout Structure */
  .layout {
    display: flex;
    min-height: 100vh;
    position: relative;
    z-index: 1;
  }

  /* Main Content Area */
  .main-content {
    flex: 1;
    padding: 2rem 3rem;
    max-height: 100vh;
    overflow-y: auto;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 2.5rem;
  }

  .topbar h1 {
    font-size: 2rem;
    margin: 0 0 0.25rem 0;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .text-muted {
    color: var(--text-muted);
    margin: 0;
    font-size: 0.95rem;
  }

  .mobile-toggle {
    display: none;
    position: fixed;
    top: 1rem; right: 1rem;
    z-index: 100;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    color: white;
    padding: 0.5rem;
    border-radius: 8px;
    cursor: pointer;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .main-content {
      padding: 1.5rem;
    }
    .mobile-toggle {
      display: block;
    }
  }
</style>

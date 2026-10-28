<script>
  import { onMount } from 'svelte';
  import { Menu, Sun, Moon, LogOut, User } from 'lucide-svelte';
  import { api } from './lib/api.js';
  import { reconnectSocket } from './lib/socket.js';
  
  import Sidebar from './components/Sidebar.svelte';
  import LoginView from './views/LoginView.svelte';
  import DashboardView from './views/DashboardView.svelte';
  import ContainersView from './views/ContainersView.svelte';
  import TerminalView from './views/TerminalView.svelte';
  import DatabasesView from './views/DatabasesView.svelte';
  import ProxyView from './views/ProxyView.svelte';

  // Authentication State
  let isAuthenticated = false;
  let currentUser = null;
  let checkingAuth = true;

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
    proxy: { title: 'Nginx Virtual Hosts', subtitle: 'Gestión declarativa de dominios, proxy inverso y certificados SSL con verificación sintáctica.' },
    terminal: { title: 'Terminal de Logs', subtitle: 'Transmisión de registros en tiempo real en consola interactiva.' },
    databases: { title: 'MariaDB Telemetry', subtitle: 'Monitoreo de conexiones, hilos y almacenamiento de bases de datos WordPress.' }
  }[activeTab] || { title: 'cPanel', subtitle: 'Panel de administración' };

  async function checkAuth() {
    checkingAuth = true;
    const token = api.getToken();

    if (!token) {
      isAuthenticated = false;
      currentUser = null;
      checkingAuth = false;
      return;
    }

    try {
      const res = await api.get('/auth/me');
      if (res && res.success && res.user) {
        isAuthenticated = true;
        currentUser = res.user;
        await fetchContainers();
      } else {
        isAuthenticated = false;
        currentUser = null;
      }
    } catch {
      isAuthenticated = false;
      currentUser = null;
    } finally {
      checkingAuth = false;
    }
  }

  function handleLoginSuccess(event) {
    currentUser = event.detail.user;
    isAuthenticated = true;
    fetchContainers();
  }

  function handleLogout() {
    api.clearToken();
    isAuthenticated = false;
    currentUser = null;
    reconnectSocket();
  }

  async function fetchContainers() {
    if (!isAuthenticated) return;
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

    // Escuchar expiración o revocación de token (401)
    const unsubscribeAuth = api.onUnauthorized(() => {
      isAuthenticated = false;
      currentUser = null;
    });

    checkAuth();

    return () => {
      unsubscribeAuth();
    };
  });
</script>

{#if checkingAuth}
  <div class="auth-loading-screen">
    <div class="auth-spinner"></div>
    <p>Verificando credenciales...</p>
  </div>
{:else if !isAuthenticated}
  <LoginView 
    {currentTheme} 
    {toggleTheme} 
    on:login={handleLoginSuccess} 
  />
{:else}
  <div class="layout">
    <!-- Modular Sidebar -->
    <Sidebar 
      bind:sidebarOpen 
      bind:activeTab 
    />

    <!-- Main Content -->
    <main class="main-content">
      <header class="topbar">
        <div class="topbar-title-section">
          <!-- Botón menú integrado en el header para móvil -->
          <button 
            class="mobile-toggle-btn" 
            on:click={toggleSidebar} 
            title="Abrir menú de navegación"
            aria-label="Abrir menú"
            type="button"
          >
            <Menu size={22} />
          </button>

          <div class="title-meta">
            <h1>{viewInfo.title}</h1>
            <p class="text-muted">{viewInfo.subtitle}</p>
          </div>
        </div>

        <!-- Topbar Actions -->
        <div class="topbar-actions">
          {#if currentUser}
            <div class="user-pill" title="Usuario autenticado">
              <span class="user-avatar-badge">
                <User size={13} />
              </span>
              <span class="username">{currentUser.username}</span>
            </div>
          {/if}

          <!-- Theme Switcher Toggle -->
          <button 
            class="theme-toggle-btn" 
            on:click={toggleTheme} 
            title="Cambiar tema ({currentTheme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'})"
            type="button"
          >
            {#if currentTheme === 'dark'}
              <Sun size={17} class="theme-icon sun-icon" />
              <span class="theme-label">Claro</span>
            {:else}
              <Moon size={17} class="theme-icon moon-icon" />
              <span class="theme-label">Oscuro</span>
            {/if}
          </button>

          <!-- Logout Button -->
          <button 
            class="logout-btn" 
            on:click={handleLogout} 
            title="Cerrar sesión"
            type="button"
          >
            <LogOut size={16} />
            <span class="logout-label">Salir</span>
          </button>
        </div>
      </header>

      {#if activeTab === 'dashboard'}
        <DashboardView 
          {containers}
          {fetchContainers}
          bind:activeTab
          on:navigate={(e) => activeTab = e.detail}
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
      {:else if activeTab === 'proxy'}
        <ProxyView {containers} />
      {:else if activeTab === 'terminal'}
        <TerminalView {containers} />
      {:else if activeTab === 'databases'}
        <DatabasesView />
      {/if}
    </main>
  </div>
{/if}

<style>
  /* Base Variables - True Full Black & Refined Light */
  :global(:root) {
    --bg-dark: #000000;
    --sidebar-bg: #09090b;
    --card-bg: #121214;
    --card-border: #222225;
    --surface-muted: #18181b;
    --text-main: #f4f4f5;
    --text-muted: #a1a1aa;
    --primary: #0284c7;
    --primary-hover: #0369a1;
    --secondary: #38bdf8;
    --success: #10b981;
    --success-bg: rgba(16, 185, 129, 0.12);
    --danger: #ef4444;
    --danger-bg: rgba(239, 68, 68, 0.12);
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
    -webkit-font-smoothing: antialiased;
  }

  /* Theme Light */
  :global(body.theme-light) {
    --bg-dark: #f8fafc;
    --sidebar-bg: #ffffff;
    --card-bg: #ffffff;
    --card-border: #e2e8f0;
    --surface-muted: #f1f5f9;
    --text-main: #0f172a;
    --text-muted: #64748b;
    --primary: #0284c7;
    --primary-hover: #0369a1;
    --secondary: #0284c7;
    --success: #059669;
    --success-bg: rgba(16, 185, 129, 0.1);
    --danger: #dc2626;
    --danger-bg: rgba(239, 68, 68, 0.1);
  }

  .auth-loading-screen {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    background: var(--bg-dark);
    color: var(--text-muted);
    font-size: 0.95rem;
  }

  .auth-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #27272a;
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .layout {
    display: flex;
    min-height: 100vh;
    width: 100%;
    overflow-x: hidden;
    position: relative;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 2rem 2.25rem;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--bg-dark);
    min-width: 0;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--card-border);
    gap: 1rem;
    flex-wrap: wrap;
  }

  .topbar-title-section {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .mobile-toggle-btn {
    display: none;
    align-items: center;
    justify-content: center;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    color: var(--text-main);
    width: 40px;
    height: 40px;
    border-radius: 10px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .mobile-toggle-btn:hover {
    border-color: var(--primary);
  }

  .title-meta {
    min-width: 0;
  }

  .topbar h1 {
    font-size: 1.7rem;
    font-weight: 700;
    margin: 0 0 0.35rem 0;
    color: var(--text-main);
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .text-muted {
    margin: 0;
    font-size: 0.88rem;
    color: var(--text-muted);
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .user-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.82rem;
  }

  .user-avatar-badge {
    background: #0284c7;
    color: #ffffff;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .username {
    font-weight: 600;
    color: var(--text-main);
  }

  .theme-toggle-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    padding: 7px 13px;
    border-radius: 20px;
    color: var(--text-main);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .theme-toggle-btn:hover {
    border-color: var(--primary);
  }

  .logout-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #270d0f;
    border: 1px solid #7f1d1d;
    padding: 7px 13px;
    border-radius: 20px;
    color: #fca5a5;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .logout-btn:hover {
    background: #991b1b;
    border-color: #ef4444;
    color: #ffffff;
  }

  :global(body.theme-light) .logout-btn {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #b91c1c;
  }

  :global(body.theme-light) .logout-btn:hover {
    background: #dc2626;
    color: #ffffff;
  }

  :global(.sun-icon) {
    color: #f59e0b;
  }

  :global(.moon-icon) {
    color: #38bdf8;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Responsive Breakpoints */
  @media (max-width: 1024px) {
    .mobile-toggle-btn {
      display: flex;
    }

    .main-content {
      padding: 1.25rem 1rem;
    }

    .topbar {
      margin-bottom: 1.25rem;
      padding-bottom: 1rem;
    }

    .topbar h1 {
      font-size: 1.35rem;
    }

    .text-muted {
      font-size: 0.8rem;
    }
  }

  @media (max-width: 640px) {
    .main-content {
      padding: 1rem 0.75rem;
    }

    .topbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .topbar-actions {
      justify-content: space-between;
      width: 100%;
    }

    .user-pill {
      padding: 4px 10px;
    }

    .logout-label {
      display: none;
    }
  }
</style>

<script>
  import { onMount } from 'svelte';
  import { 
    Menu, 
    Sun, 
    Moon, 
    LogOut, 
    User, 
    CheckCircle2, 
    AlertTriangle, 
    Info, 
    X 
  } from 'lucide-svelte';
  import { api } from './lib/api.js';
  import { reconnectSocket } from './lib/socket.js';
  
  import Sidebar from './components/Sidebar.svelte';
  import LoginView from './views/LoginView.svelte';
  import DashboardView from './views/DashboardView.svelte';
  import ContainersView from './views/ContainersView.svelte';
  import TerminalView from './views/TerminalView.svelte';
  import DatabasesView from './views/DatabasesView.svelte';
  import ProxyView from './views/ProxyView.svelte';
  import MaintenanceView from './views/MaintenanceView.svelte';

  // Authentication State
  let isAuthenticated = false;
  let currentUser = null;
  let checkingAuth = true;

  let containers = [];
  let loading = true;
  let error = null;
  let isDeploying = false;
  let sidebarOpen = false;
  
  // Navigation State con persistencia
  const VALID_TABS = ['dashboard', 'sites', 'proxy', 'databases', 'terminal', 'maintenance'];
  let activeTab = 'dashboard';

  // Theme State: 'dark' | 'light'
  let currentTheme = 'dark';

  // Form inputs para despliegue de sitios/apps
  let imageName = '';
  let containerName = '';
  let hostPort = '';
  let containerPort = '';
  let deployMessage = '';
  let deployIsError = false;

  // Sistema de Toasts Globales
  let toasts = [];

  export function addToast(message, type = 'success', duration = 4500) {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  function removeToast(id) {
    toasts = toasts.filter(t => t.id !== id);
  }

  // Reactividad para títulos y subtítulos de los 6 módulos
  $: viewInfo = {
    dashboard: { 
      title: 'Dashboard', 
      subtitle: 'Telemetría integral de Azure VM, servicios de monitoreo y ecosistema de contenedores.' 
    },
    sites: { 
      title: 'Sitios Web y Contenedores', 
      subtitle: 'Monitoreo de métricas en caliente, ciclo de vida de aplicaciones y nuevos despliegues.' 
    },
    proxy: { 
      title: 'Proxy Nginx y Virtual Hosts', 
      subtitle: 'Gestión declarativa de dominios, proxy inverso y certificados SSL con verificación sintáctica.' 
    },
    databases: { 
      title: 'Bases de Datos MariaDB', 
      subtitle: 'Administración de esquemas, respaldos SQL descargables y gestión de usuarios seguros.' 
    },
    terminal: { 
      title: 'Terminal Shell Interactiva', 
      subtitle: 'Consola interactiva PTY TTY en tiempo real con conexión WebSocket.' 
    },
    maintenance: { 
      title: 'Mantenimiento del Sistema', 
      subtitle: 'Diagnóstico de almacenamiento Docker, limpieza de imágenes huérfanas y salvaguarda de volúmenes.' 
    }
  }[activeTab] || { title: 'cPanel', subtitle: 'Panel de administración' };

  // Sincronizar activeTab con URL Hash y localStorage
  function setTab(newTab) {
    if (!VALID_TABS.includes(newTab)) return;
    activeTab = newTab;
    if (typeof window !== 'undefined') {
      window.location.hash = `#${newTab}`;
      localStorage.setItem('cpanel_active_tab', newTab);
    }
  }

  function syncTabFromUrlOrStorage() {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    const legacyMap = { containers: 'sites' };
    const resolvedHash = legacyMap[hash] || hash;

    if (VALID_TABS.includes(resolvedHash)) {
      activeTab = resolvedHash;
    } else {
      const stored = localStorage.getItem('cpanel_active_tab');
      const resolvedStored = legacyMap[stored] || stored;
      if (VALID_TABS.includes(resolvedStored)) {
        activeTab = resolvedStored;
      } else {
        activeTab = 'dashboard';
      }
      window.location.hash = `#${activeTab}`;
    }
  }

  $: if (activeTab) {
    if (typeof window !== 'undefined') {
      const currentHash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (currentHash !== activeTab) {
        window.location.hash = `#${activeTab}`;
      }
      localStorage.setItem('cpanel_active_tab', activeTab);
    }
  }

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

  async function fetchContainers() {
    loading = true;
    error = null;
    try {
      const res = await api.get('/containers');
      if (res && res.success) {
        containers = res.data;
      } else {
        error = res?.error || 'Error al obtener contenedores';
      }
    } catch (err) {
      error = err.message || 'No se pudo conectar al backend';
    } finally {
      loading = false;
    }
  }

  function handleLoginSuccess(event) {
    const { token, user } = event.detail;
    api.setToken(token);
    reconnectSocket(token);
    currentUser = user;
    isAuthenticated = true;
    fetchContainers();
    addToast(`Bienvenido de nuevo, ${user.username}`, 'success');
  }

  function handleLogout() {
    api.clearToken();
    reconnectSocket(null);
    isAuthenticated = false;
    currentUser = null;
    containers = [];
    addToast('Sesión cerrada correctamente', 'info');
  }

  async function handleDeploy(customPayload = null) {
    let payload = null;

    if (customPayload && typeof customPayload === 'object' && customPayload.image) {
      payload = customPayload;
    } else {
      if (!imageName.trim()) {
        deployMessage = 'Por favor ingresa un nombre de imagen válido.';
        deployIsError = true;
        return;
      }

      payload = {
        image: imageName.trim(),
        name: containerName.trim() || undefined,
        network: 'server-net',
        ports: hostPort && containerPort ? [{ hostPort: parseInt(hostPort, 10), containerPort: parseInt(containerPort, 10) }] : []
      };
    }

    isDeploying = true;
    deployMessage = '';
    deployIsError = false;

    try {
      const res = await api.post('/deploy', payload);

      if (res && res.success) {
        const deployedName = payload.name || payload.image;
        deployMessage = `¡Despliegue exitoso de ${deployedName}! ID: ${(res.data?.id || '').substring(0, 12)}`;
        deployIsError = false;
        imageName = '';
        containerName = '';
        hostPort = '';
        containerPort = '';
        await fetchContainers();
        addToast(payload.type === 'wordpress' ? 'Sitio WordPress creado y desplegado con éxito' : 'Contenedor desplegado exitosamente', 'success');
      } else {
        deployMessage = `Error: ${res?.error || 'Error al desplegar'}`;
        deployIsError = true;
        addToast(deployMessage, 'error');
      }
    } catch (err) {
      deployMessage = `Error al conectar con el backend: ${err.message}`;
      deployIsError = true;
      addToast(deployMessage, 'error');
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

    syncTabFromUrlOrStorage();

    const handleHashChange = () => syncTabFromUrlOrStorage();
    window.addEventListener('hashchange', handleHashChange);

    // Escuchar eventos globales de toast emitidos desde cualquier vista
    const handleGlobalToast = (e) => {
      if (e.detail?.message) {
        addToast(e.detail.message, e.detail.type || 'success', e.detail.duration || 4500);
      }
    };
    window.addEventListener('cpanel:toast', handleGlobalToast);

    // Escuchar expiración o revocación de token (401)
    const unsubscribeAuth = api.onUnauthorized(() => {
      isAuthenticated = false;
      currentUser = null;
      addToast('Tu sesión ha expirado. Por favor inicia sesión nuevamente.', 'error');
    });

    checkAuth();

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('cpanel:toast', handleGlobalToast);
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

      <!-- Enrutamiento condicional de las 6 vistas -->
      <div class="view-viewport">
        {#if activeTab === 'dashboard'}
          <DashboardView 
            {containers}
            {fetchContainers}
            bind:activeTab
            on:navigate={(e) => setTab(e.detail)}
          />
        {:else if activeTab === 'sites'}
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
            onDeploy={handleDeploy}
          />
        {:else if activeTab === 'proxy'}
          <ProxyView {containers} />
        {:else if activeTab === 'databases'}
          <DatabasesView />
        {:else if activeTab === 'terminal'}
          <TerminalView {containers} />
        {:else if activeTab === 'maintenance'}
          <MaintenanceView />
        {/if}
      </div>
    </main>
  </div>
{/if}

<!-- Contenedor Global de Toasts -->
{#if toasts.length > 0}
  <div class="toasts-container" role="status" aria-live="polite">
    {#each toasts as t (t.id)}
      <div class="toast-item toast-{t.type}">
        <div class="toast-icon">
          {#if t.type === 'success'}
            <CheckCircle2 size={16} />
          {:else if t.type === 'error'}
            <AlertTriangle size={16} />
          {:else}
            <Info size={16} />
          {/if}
        </div>
        <div class="toast-message">{t.message}</div>
        <button type="button" class="btn-close-toast" on:click={() => removeToast(t.id)}>
          <X size={14} />
        </button>
      </div>
    {/each}
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
    --secondary: #0ea5e9;
    --success: #10b981;
    --success-bg: rgba(16, 185, 129, 0.1);
    --danger: #ef4444;
    --danger-bg: rgba(239, 68, 68, 0.1);
  }

  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
      Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
    background-color: var(--bg-dark);
    color: var(--text-main);
    min-height: 100vh;
    transition: background-color 0.25s ease, color 0.25s ease;
  }

  .auth-loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: var(--bg-dark);
    color: var(--text-muted);
    gap: 1.5rem;
  }

  .auth-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .layout {
    display: flex;
    min-height: 100vh;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    background-color: var(--bg-dark);
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 2rem;
    border-bottom: 1px solid var(--card-border);
    background: var(--bg-dark);
    position: sticky;
    top: 0;
    z-index: 40;
    backdrop-filter: blur(10px);
  }

  .topbar-title-section {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .mobile-toggle-btn {
    display: none;
    background: transparent;
    border: none;
    color: var(--text-main);
    cursor: pointer;
    padding: 0.4rem;
    border-radius: 8px;
  }

  .title-meta h1 {
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0;
    color: var(--text-main);
  }

  .title-meta p {
    font-size: 0.825rem;
    color: var(--text-muted);
    margin: 0.2rem 0 0;
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .user-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--surface-muted);
    border: 1px solid var(--card-border);
    padding: 0.35rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .user-avatar-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border-radius: 50%;
  }

  .theme-toggle-btn, .logout-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: var(--surface-muted);
    border: 1px solid var(--card-border);
    color: var(--text-main);
    padding: 0.45rem 0.85rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .theme-toggle-btn:hover {
    background: var(--card-border);
    color: var(--text-main);
  }

  .sun-icon {
    color: #f59e0b;
  }

  .moon-icon {
    color: #38bdf8;
  }

  .logout-btn:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .view-viewport {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  /* Toasts Globales */
  .toasts-container {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    z-index: 100000;
    max-width: 380px;
  }

  .toast-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1.15rem;
    border-radius: 10px;
    font-size: 0.825rem;
    font-weight: 500;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .toast-success {
    background: #064e3b;
    border: 1px solid #059669;
    color: #a7f3d0;
  }

  .toast-error {
    background: #7f1d1d;
    border: 1px solid #dc2626;
    color: #fecaca;
  }

  .toast-info {
    background: #0c4a6e;
    border: 1px solid #0284c7;
    color: #bae6fd;
  }

  .toast-icon {
    flex-shrink: 0;
  }

  .toast-message {
    flex: 1;
    line-height: 1.4;
  }

  .btn-close-toast {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    padding: 2px;
  }

  .btn-close-toast:hover {
    opacity: 1;
  }

  @keyframes toastSlideIn {
    from {
      transform: translateY(12px) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 900px) {
    .mobile-toggle-btn {
      display: flex;
    }

    .topbar {
      padding: 1rem 1.25rem;
    }

    .view-viewport {
      padding: 1.25rem 1rem;
    }

    .theme-label, .logout-label {
      display: none;
    }

    .toasts-container {
      bottom: 1rem;
      right: 1rem;
      left: 1rem;
      max-width: none;
    }
  }
</style>

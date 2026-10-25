<script>
  import { 
    Server, 
    Activity, 
    Terminal, 
    Package,
    Database,
    Cpu,
    User,
    LogOut,
    X
  } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';

  export let sidebarOpen = false;
  export let activeTab = 'dashboard';
  export let currentUser = null;
  export let onLogout = null;

  const dispatch = createEventDispatcher();

  function closeSidebar() {
    sidebarOpen = false;
  }

  function handleNav(tab) {
    activeTab = tab;
    closeSidebar();
  }

  function handleLogoutClick() {
    closeSidebar();
    if (typeof onLogout === 'function') {
      onLogout();
    } else {
      dispatch('logout');
    }
  }
</script>

<!-- Backdrop para cerrar en móvil -->
{#if sidebarOpen}
  <div 
    class="sidebar-backdrop" 
    on:click={closeSidebar} 
    role="presentation"
  ></div>
{/if}

<aside class="sidebar" class:open={sidebarOpen}>
  <div class="sidebar-header">
    <div class="logo">
      <div class="logo-icon-bg">
        <Server size={22} color="#ffffff" />
      </div>
      <h2>cPanel</h2>
    </div>

    <!-- Botón cerrar exclusivo de móvil -->
    <button 
      class="sidebar-close-btn" 
      on:click={closeSidebar} 
      title="Cerrar menú"
      type="button"
    >
      <X size={20} />
    </button>
  </div>

  <nav class="sidebar-nav">
    <ul>
      <li class:active={activeTab === 'dashboard'}>
        <a href="#dashboard" on:click|preventDefault={() => handleNav('dashboard')}>
          <Activity size={18} />
          <span>Dashboard</span>
        </a>
      </li>
      <li class:active={activeTab === 'containers'}>
        <a href="#containers" on:click|preventDefault={() => handleNav('containers')}>
          <Package size={18} />
          <span>Contenedores</span>
        </a>
      </li>
      <li class:active={activeTab === 'terminal'}>
        <a href="#terminal" on:click|preventDefault={() => handleNav('terminal')}>
          <Terminal size={18} />
          <span>Terminal de Logs</span>
        </a>
      </li>
      <li class:active={activeTab === 'databases'}>
        <a href="#databases" on:click|preventDefault={() => handleNav('databases')}>
          <Database size={18} />
          <span>MariaDB Telemetry</span>
        </a>
      </li>
    </ul>
  </nav>

  <div class="sidebar-footer">
    <!-- Sección de usuario activo y botón Cerrar Sesión -->
    <div class="sidebar-user-card">
      <div class="user-info-row">
        <div class="user-avatar">
          <User size={16} />
        </div>
        <div class="user-meta">
          <span class="user-name">{currentUser?.username || 'Admin'}</span>
          <span class="user-role">{currentUser?.role || 'Superadmin'}</span>
        </div>
      </div>
      <button 
        class="sidebar-logout-btn" 
        on:click={handleLogoutClick} 
        title="Cerrar sesión"
        type="button"
      >
        <LogOut size={15} />
        <span>Cerrar Sesión</span>
      </button>
    </div>

    <div class="status-pill">
      <span class="dot"></span>
      <Cpu size={14} />
      Docker & DB Online
    </div>
  </div>
</aside>

<style>
  .sidebar-backdrop {
    display: none;
  }

  .sidebar {
    width: 260px;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--card-border);
    display: flex;
    flex-direction: column;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 50;
    box-sizing: border-box;
  }

  .sidebar-header {
    padding: 1.75rem 1.25rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sidebar-close-btn {
    display: none;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    transition: all 0.15s ease;
  }

  .sidebar-close-btn:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.08);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon-bg {
    background: var(--primary);
    width: 36px; 
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 15px rgba(2, 132, 199, 0.35);
  }

  .logo h2 {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-main);
    letter-spacing: -0.01em;
  }

  .sidebar-nav {
    flex: 1;
    padding: 0.5rem 0.85rem;
    overflow-y: auto;
  }

  .sidebar-nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .sidebar-nav li a {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.92rem;
    font-weight: 500;
    border-radius: 10px;
    transition: all 0.15s ease;
  }

  .sidebar-nav li a:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.04);
  }

  :global(body.theme-light) .sidebar-nav li a:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  .sidebar-nav li.active a {
    color: #ffffff;
    background: var(--primary);
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
  }

  .sidebar-footer {
    padding: 1rem 0.85rem;
    border-top: 1px solid var(--card-border);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sidebar-user-card {
    background: var(--surface-muted, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .user-info-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(2, 132, 199, 0.15);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .user-meta {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .user-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-role {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .sidebar-logout-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.65rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
    color: #ef4444;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .sidebar-logout-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--surface-muted, rgba(255, 255, 255, 0.03));
    padding: 0.5rem 0.75rem;
    border-radius: 20px;
    font-size: 0.78rem;
    color: var(--text-muted);
    border: 1px solid var(--card-border);
  }

  .dot {
    width: 8px;
    height: 8px;
    background: var(--success);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--success);
  }

  @media (max-width: 1024px) {
    .sidebar-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 90;
      animation: fadeInBackdrop 0.2s ease-out;
    }

    .sidebar {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      width: 280px;
      max-width: 85vw;
      transform: translateX(-100%);
      z-index: 100;
      box-shadow: 0 0 35px rgba(0, 0, 0, 0.8);
    }

    .sidebar.open {
      transform: translateX(0);
    }

    .sidebar-close-btn {
      display: flex;
    }
  }

  @keyframes fadeInBackdrop {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>

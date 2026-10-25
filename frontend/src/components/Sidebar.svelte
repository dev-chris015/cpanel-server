<script>
  import { 
    Server, 
    Activity, 
    Terminal, 
    Package,
    Database,
    Cpu,
    User,
    LogOut
  } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';

  export let sidebarOpen = false;
  export let activeTab = 'dashboard';
  export let currentUser = null;
  export let onLogout = null;

  const dispatch = createEventDispatcher();

  function handleLogoutClick() {
    if (typeof onLogout === 'function') {
      onLogout();
    } else {
      dispatch('logout');
    }
  }
</script>

<aside class="sidebar" class:open={sidebarOpen}>
  <div class="sidebar-header">
    <div class="logo">
      <div class="logo-icon-bg">
        <Server size={22} color="#ffffff" />
      </div>
      <h2>cPanel</h2>
    </div>
  </div>

  <nav class="sidebar-nav">
    <ul>
      <li class:active={activeTab === 'dashboard'}>
        <a href="#dashboard" on:click|preventDefault={() => activeTab = 'dashboard'}>
          <Activity size={18} />
          <span>Dashboard</span>
        </a>
      </li>
      <li class:active={activeTab === 'containers'}>
        <a href="#containers" on:click|preventDefault={() => activeTab = 'containers'}>
          <Package size={18} />
          <span>Contenedores</span>
        </a>
      </li>
      <li class:active={activeTab === 'terminal'}>
        <a href="#terminal" on:click|preventDefault={() => activeTab = 'terminal'}>
          <Terminal size={18} />
          <span>Terminal de Logs</span>
        </a>
      </li>
      <li class:active={activeTab === 'databases'}>
        <a href="#databases" on:click|preventDefault={() => activeTab = 'databases'}>
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
  .sidebar {
    width: 260px;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--card-border);
    display: flex;
    flex-direction: column;
    transition: transform 0.3s ease;
    z-index: 50;
  }

  .sidebar-header {
    padding: 2rem 1.5rem;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon-bg {
    background: var(--primary);
    width: 36px; height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
  }

  .logo h2 {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
  }

  .sidebar-nav {
    flex: 1;
    padding: 0 1rem;
  }

  .sidebar-nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sidebar-nav li a {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.95rem;
    font-weight: 500;
    border-radius: 10px;
    transition: all 0.2s ease;
  }

  .sidebar-nav li a:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.05);
  }

  .sidebar-nav li.active a {
    color: #ffffff;
    background: var(--primary);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
  }

  .sidebar-footer {
    padding: 1.25rem 1rem;
    border-top: 1px solid var(--card-border);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sidebar-user-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  :global(body.theme-light) .sidebar-user-card {
    background: rgba(0, 0, 0, 0.02);
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
    font-size: 0.7rem;
    font-weight: 600;
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
    background: rgba(255, 255, 255, 0.03);
    padding: 0.5rem 0.75rem;
    border-radius: 20px;
    font-size: 0.8rem;
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
    .sidebar {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      transform: translateX(-100%);
    }

    .sidebar.open {
      transform: translateX(0);
    }
  }
</style>

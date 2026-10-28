<script>
  import { 
    Server, 
    Activity, 
    Terminal, 
    Package,
    Database,
    Cpu,
    Globe,
    Wrench,
    X
  } from 'lucide-svelte';

  export let sidebarOpen = false;
  export let activeTab = 'dashboard';

  function closeSidebar() {
    sidebarOpen = false;
  }

  function handleNav(tab) {
    activeTab = tab;
    closeSidebar();
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
      <li class:active={activeTab === 'proxy'}>
        <a href="#proxy" on:click|preventDefault={() => handleNav('proxy')}>
          <Globe size={18} />
          <span>Nginx VHosts</span>
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
      <li class:active={activeTab === 'maintenance'}>
        <a href="#maintenance" on:click|preventDefault={() => handleNav('maintenance')}>
          <Wrench size={18} />
          <span>Mantenimiento</span>
        </a>
      </li>
    </ul>
  </nav>

  <div class="sidebar-footer">
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
    background: var(--surface-muted);
  }

  .sidebar-nav li.active a {
    color: #ffffff;
    background: var(--primary);
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
  }

  .sidebar-footer {
    padding: 1.25rem 1rem;
    border-top: 1px solid var(--card-border);
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--surface-muted);
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
  }

  @media (max-width: 1024px) {
    .sidebar-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
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

<script>
  import { 
    Server, 
    Activity, 
    Terminal, 
    Settings, 
    LogOut,
    Package,
    Cpu
  } from 'lucide-svelte';

  export let sidebarOpen = false;
  export let activeTab = 'dashboard';
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
          <span>Terminal</span>
        </a>
      </li>
      <li class:active={activeTab === 'settings'}>
        <a href="#settings" on:click|preventDefault={() => activeTab = 'settings'}>
          <Settings size={18} />
          <span>Configuración</span>
        </a>
      </li>
    </ul>
  </nav>

  <div class="sidebar-footer">
    <div class="status-pill">
      <span class="dot"></span>
      <Cpu size={14} />
      Docker API
    </div>
    <button class="btn-logout">
      <LogOut size={16} />
      Salir
    </button>
  </div>
</aside>

<style>
  .sidebar {
    width: 260px;
    background: var(--sidebar-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
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

  .sidebar-nav a {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.8rem 1rem;
    color: var(--text-muted);
    text-decoration: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .sidebar-nav a:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.05);
  }

  .sidebar-nav li.active a {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.1);
    box-shadow: inset 2px 0 0 var(--primary);
  }

  .sidebar-footer {
    padding: 1.5rem;
    border-top: 1px solid var(--card-border);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .btn-logout {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: transparent;
    color: var(--text-muted);
    border: none;
    padding: 0;
    font-size: 0.9rem;
    cursor: pointer;
    transition: color 0.2s;
  }

  .btn-logout:hover {
    color: var(--danger);
  }

  /* Status Pill */
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
    padding: 0.4rem 0.8rem;
    border-radius: 20px;
    font-size: 0.8rem;
    color: var(--success);
    font-weight: 500;
  }

  .dot {
    width: 6px; height: 6px;
    background-color: var(--success);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--success);
    animation: pulse-dot 2s infinite;
  }

  @keyframes pulse-dot {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.2); }
    100% { opacity: 1; transform: scale(1); }
  }

  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      left: -260px;
      height: 100vh;
    }
    
    .sidebar.open {
      left: 0;
    }
  }
</style>

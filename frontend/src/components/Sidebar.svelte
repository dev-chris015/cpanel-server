<script>
  import { 
    Server, 
    Activity, 
    Terminal, 
    Package,
    Database,
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
    padding: 1.5rem;
    border-top: 1px solid var(--card-border);
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

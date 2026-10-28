<script>
  import { onMount, onDestroy } from 'svelte';
  import { 
    LayoutDashboard, 
    Globe, 
    GitFork, 
    Database, 
    Terminal, 
    Wrench, 
    Server, 
    X,
    Cpu,
    Radio
  } from 'lucide-svelte';
  import { api } from '../lib/api.js';

  export let sidebarOpen = false;
  export let activeTab = 'dashboard';

  let dockerOnline = false;
  let dbOnline = false;
  let pingInterval = null;

  async function checkServicesHealth() {
    try {
      // Ping Docker
      const containersRes = await api.get('/containers');
      dockerOnline = Boolean(containersRes && containersRes.success);
    } catch (e) {
      dockerOnline = false;
    }

    try {
      // Ping MariaDB
      const dbRes = await api.get('/databases/status');
      dbOnline = Boolean(dbRes && dbRes.success && dbRes.data?.connected);
    } catch (e) {
      dbOnline = false;
    }
  }

  function closeSidebar() {
    sidebarOpen = false;
  }

  function handleNav(tab) {
    activeTab = tab;
    closeSidebar();
  }

  onMount(() => {
    checkServicesHealth();
    pingInterval = setInterval(checkServicesHealth, 10000);
  });

  onDestroy(() => {
    if (pingInterval) clearInterval(pingInterval);
  });
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
      <!-- 1. Dashboard -->
      <li class:active={activeTab === 'dashboard'}>
        <a href="#dashboard" on:click|preventDefault={() => handleNav('dashboard')}>
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </a>
      </li>

      <!-- 2. Sitios Web (Gestión de Contenedores y Apps) -->
      <li class:active={activeTab === 'sites'}>
        <a href="#sites" on:click|preventDefault={() => handleNav('sites')}>
          <Globe size={18} />
          <span>Sitios Web</span>
        </a>
      </li>

      <!-- 3. Proxy Nginx (Virtual Hosts y SSL) -->
      <li class:active={activeTab === 'proxy'}>
        <a href="#proxy" on:click|preventDefault={() => handleNav('proxy')}>
          <GitFork size={18} />
          <span>Proxy Nginx</span>
        </a>
      </li>

      <!-- 4. Bases de Datos (MariaDB & Backups) -->
      <li class:active={activeTab === 'databases'}>
        <a href="#databases" on:click|preventDefault={() => handleNav('databases')}>
          <Database size={18} />
          <span>Bases de Datos</span>
        </a>
      </li>

      <!-- 5. Terminal Shell (PTY TTY Interactiva) -->
      <li class:active={activeTab === 'terminal'}>
        <a href="#terminal" on:click|preventDefault={() => handleNav('terminal')}>
          <Terminal size={18} />
          <span>Terminal Shell</span>
        </a>
      </li>

      <!-- 6. Mantenimiento (Diagnóstico y Prune) -->
      <li class:active={activeTab === 'maintenance'}>
        <a href="#maintenance" on:click|preventDefault={() => handleNav('maintenance')}>
          <Wrench size={18} />
          <span>Mantenimiento</span>
        </a>
      </li>
    </ul>
  </nav>

  <!-- Footer de estado con ping activo de Docker y Base de datos -->
  <div class="sidebar-footer">
    <div class="pings-container">
      <div class="ping-item" class:online={dockerOnline} title={dockerOnline ? 'Docker Daemon en línea' : 'Docker Daemon inaccesible'}>
        <span class="ping-dot"></span>
        <span class="ping-text font-mono">Docker: {dockerOnline ? 'ONLINE' : 'OFFLINE'}</span>
      </div>

      <div class="ping-item" class:online={dbOnline} title={dbOnline ? 'MariaDB conectada' : 'MariaDB desconectada'}>
        <span class="ping-dot"></span>
        <span class="ping-text font-mono">MariaDB: {dbOnline ? 'ONLINE' : 'OFFLINE'}</span>
      </div>
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
    background: var(--surface-muted);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo-icon-bg {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
  }

  .logo h2 {
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text-main);
    margin: 0;
  }

  .sidebar-nav {
    flex: 1;
    padding: 0.5rem 0.75rem;
  }

  .sidebar-nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sidebar-nav li a {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 10px;
    transition: all 0.15s ease;
  }

  .sidebar-nav li a:hover {
    color: var(--text-main);
    background: var(--surface-muted);
  }

  .sidebar-nav li.active a {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
    font-weight: 600;
    border: 1px solid rgba(56, 189, 248, 0.25);
  }

  .sidebar-footer {
    padding: 1.25rem 1rem;
    border-top: 1px solid var(--card-border);
  }

  .pings-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: rgba(2, 6, 23, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 10px;
    padding: 0.65rem 0.85rem;
  }

  .ping-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .ping-dot {
    width: 6.5px;
    height: 6.5px;
    border-radius: 50%;
    background-color: #ef4444;
    flex-shrink: 0;
    transition: background-color 0.3s;
  }

  .ping-item.online .ping-dot {
    background-color: #22c55e;
    box-shadow: 0 0 6px #22c55e;
  }

  .ping-item.online .ping-text {
    color: #cbd5e1;
  }

  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  @media (max-width: 900px) {
    .sidebar-backdrop {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      z-index: 45;
    }

    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      height: 100vh;
      transform: translateX(-100%);
    }

    .sidebar.open {
      transform: translateX(0);
    }

    .sidebar-close-btn {
      display: flex;
    }
  }
</style>

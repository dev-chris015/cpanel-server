<script>
  import { onMount } from 'svelte';
  import { 
    Server, 
    Rocket, 
    Package, 
    RefreshCw, 
    AlertTriangle, 
    CheckCircle2, 
    XCircle, 
    Box, 
    Globe, 
    Layers,
    Cpu,
    Loader2,
    Activity,
    Terminal,
    Settings,
    LogOut,
    Menu
  } from 'lucide-svelte';

  let containers = [];
  let loading = true;
  let error = null;
  let isDeploying = false;
  let sidebarOpen = false;

  // Form inputs for new deploy
  let imageName = '';
  let containerName = '';
  let hostPort = '';
  let containerPort = '';
  let deployMessage = '';

  const API_BASE = 'http://localhost:5000/api';

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
        deployMessage = `🚀 ¡Despliegue exitoso! ID: ${json.data.id.substring(0, 12)}`;
        imageName = '';
        containerName = '';
        hostPort = '';
        containerPort = '';
        await fetchContainers();
      } else {
        deployMessage = `❌ Error: ${json.error} - ${json.details || ''}`;
      }
    } catch (err) {
      deployMessage = `❌ Error al conectar con el backend: ${err.message}`;
    } finally {
      isDeploying = false;
    }
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  onMount(() => {
    fetchContainers();
  });
</script>

<div class="layout">
  <!-- Mesh background -->
  <div class="mesh-bg"></div>
  <div class="mesh-blob blob-1"></div>
  <div class="mesh-blob blob-2"></div>

  <!-- Mobile Toggle -->
  <button class="mobile-toggle" on:click={toggleSidebar}>
    <Menu size={24} />
  </button>

  <!-- Sidebar -->
  <aside class="sidebar" class:open={sidebarOpen}>
    <div class="sidebar-header">
      <div class="logo">
        <div class="logo-icon-bg">
          <Server size={22} color="#ffffff" />
        </div>
        <h2>cPanel <span class="text-gradient">Pro</span></h2>
      </div>
    </div>

    <nav class="sidebar-nav">
      <ul>
        <li class="active">
          <a href="#dashboard">
            <Activity size={18} />
            <span>Dashboard</span>
          </a>
        </li>
        <li>
          <a href="#containers">
            <Package size={18} />
            <span>Contenedores</span>
          </a>
        </li>
        <li>
          <a href="#terminal">
            <Terminal size={18} />
            <span>Terminal</span>
          </a>
        </li>
        <li>
          <a href="#settings">
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

  <!-- Main Content -->
  <main class="main-content">
    <header class="topbar">
      <div>
        <h1>Dashboard</h1>
        <p class="text-muted">Resumen del estado de tu servidor local.</p>
      </div>
      <div class="user-profile">
        <div class="avatar">A</div>
        <span class="user-name">Admin User</span>
      </div>
    </header>

    <div class="dashboard-grid">
      <!-- Deploy Panel -->
      <section class="glass-card deploy-card">
        <div class="card-header-styled">
          <div class="icon-wrapper blue">
            <Rocket size={20} />
          </div>
          <div>
            <h3>Desplegar Contenedor</h3>
            <p class="subtitle">Baja una imagen y levanta el servicio al instante.</p>
          </div>
        </div>

        <form on:submit|preventDefault={handleDeploy} class="deploy-form">
          <div class="input-group">
            <div class="input-icon">
              <Layers size={16} />
            </div>
            <input 
              id="image" 
              type="text" 
              bind:value={imageName} 
              placeholder="Imagen Docker (ej. nginx:latest)" 
              required 
            />
          </div>

          <div class="input-group">
            <div class="input-icon">
              <Box size={16} />
            </div>
            <input 
              id="name" 
              type="text" 
              bind:value={containerName} 
              placeholder="Nombre del Contenedor (Opcional)" 
            />
          </div>

          <div class="form-row">
            <div class="input-group">
              <div class="input-icon">
                <Globe size={16} />
              </div>
              <input 
                id="hostPort" 
                type="number" 
                bind:value={hostPort} 
                placeholder="Puerto Host (8080)" 
              />
            </div>
            <div class="input-group">
              <div class="input-icon">
                <Server size={16} />
              </div>
              <input 
                id="containerPort" 
                type="number" 
                bind:value={containerPort} 
                placeholder="Puerto Contenedor (80)" 
              />
            </div>
          </div>

          <button type="submit" class="btn-gradient" disabled={isDeploying}>
            {#if isDeploying}
              <Loader2 size={18} class="spin" /> Inicializando...
            {:else}
              <Rocket size={18} /> Desplegar Ahora
            {/if}
          </button>
        </form>

        {#if deployMessage}
          <div class="alert" class:error={deployMessage.includes('❌')}>
            {#if deployMessage.includes('❌')}
              <XCircle size={18} />
            {:else}
              <CheckCircle2 size={18} />
            {/if}
            <span>{deployMessage.replace(/^[🚀❌]\s*/, '')}</span>
          </div>
        {/if}
      </section>

      <!-- Container List Panel -->
      <section class="glass-card list-card">
        <div class="card-header-styled space-between">
          <div class="header-left">
            <div class="icon-wrapper purple">
              <Package size={20} />
            </div>
            <div>
              <h3>Contenedores Activos</h3>
              <p class="subtitle">Estado en tiempo real de los servicios.</p>
            </div>
          </div>
          <button class="btn-icon" on:click={fetchContainers} title="Actualizar lista">
            <RefreshCw size={18} class={loading ? 'spin' : ''} />
          </button>
        </div>

        {#if loading}
          <div class="state-container">
            <Loader2 size={40} class="spin text-purple" />
            <p>Sincronizando con Docker...</p>
          </div>
        {:else if error}
          <div class="alert error">
            <AlertTriangle size={20} />
            <span>{error}</span>
          </div>
        {:else if containers.length === 0}
          <div class="state-container">
            <Box size={48} class="text-muted" />
            <p>No hay contenedores corriendo en este momento.</p>
          </div>
        {:else}
          <div class="table-responsive">
            <table class="premium-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Imagen</th>
                  <th>Estado</th>
                  <th>Puertos</th>
                </tr>
              </thead>
              <tbody>
                {#each containers as c}
                  <tr>
                    <td class="font-mono text-blue">{c.Id.substring(0, 12)}</td>
                    <td class="fw-600">{c.Names ? c.Names.join(', ').replace(/^\//, '') : '-'}</td>
                    <td>
                      <span class="tag dark">{c.Image}</span>
                    </td>
                    <td>
                      <span class="status-badge" class:running={c.State === 'running'}>
                        <span class="pulse-dot" class:active={c.State === 'running'}></span>
                        {c.State}
                      </span>
                    </td>
                    <td class="font-mono text-sm">
                      {#if c.Ports && c.Ports.length > 0}
                        <div class="ports-list">
                          {#each c.Ports as p}
                            <span class="port-tag">
                              {p.PublicPort ? `${p.PublicPort}:` : ''}{p.PrivatePort}/{p.Type}
                            </span>
                          {/each}
                        </div>
                      {:else}
                        <span class="text-muted">-</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    </div>
  </main>
</div>

<style>
  /* Base Variables and Resets */
  :global(:root) {
    --bg-dark: #09090b;
    --sidebar-bg: rgba(15, 23, 42, 0.4);
    --card-bg: rgba(30, 41, 59, 0.5);
    --card-border: rgba(255, 255, 255, 0.08);
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
    --primary: #3b82f6;
    --primary-hover: #2563eb;
    --secondary: #8b5cf6;
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

  /* Layout Structure */
  .layout {
    display: flex;
    min-height: 100vh;
    position: relative;
    z-index: 1;
  }

  /* Background Mesh and Blobs */
  .mesh-bg {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: 
      radial-gradient(circle at 15% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
      radial-gradient(circle at 85% 30%, rgba(139, 92, 246, 0.08) 0%, transparent 50%);
    z-index: -2;
  }

  .mesh-blob {
    position: fixed;
    border-radius: 50%;
    filter: blur(80px);
    z-index: -1;
    opacity: 0.5;
    animation: float 20s infinite ease-in-out alternate;
  }

  .blob-1 {
    top: -10%; left: -10%;
    width: 500px; height: 500px;
    background: rgba(37, 99, 235, 0.15);
  }

  .blob-2 {
    bottom: -10%; right: -5%;
    width: 600px; height: 600px;
    background: rgba(124, 58, 237, 0.15);
    animation-delay: -10s;
  }

  @keyframes float {
    0% { transform: translate(0, 0) scale(1); }
    100% { transform: translate(30px, 50px) scale(1.1); }
  }

  /* Sidebar Styles */
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
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    width: 36px; height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
  }

  .logo h2 {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
  }

  .text-gradient {
    background: linear-gradient(90deg, #60a5fa, #c084fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
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

  .user-profile {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--card-border);
    border-radius: 50px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .user-profile:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .avatar {
    width: 32px; height: 32px;
    background: linear-gradient(135deg, #f59e0b, #ef4444);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: white;
  }

  .user-name {
    font-size: 0.9rem;
    font-weight: 500;
  }

  /* Dashboard Grid */
  .dashboard-grid {
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 2rem;
  }

  /* Glass Cards */
  .glass-card {
    background: var(--card-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--card-border);
    border-radius: 20px;
    padding: 1.75rem;
    box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.2);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  .glass-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
    box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.3);
  }

  .card-header-styled {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .card-header-styled.space-between {
    justify-content: space-between;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .icon-wrapper {
    width: 42px; height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-wrapper.blue {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .icon-wrapper.purple {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  .card-header-styled h3 {
    margin: 0 0 0.2rem 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .subtitle {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* Form & Inputs (Floating style with icons) */
  .deploy-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .input-group {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-icon {
    position: absolute;
    left: 1rem;
    color: var(--text-muted);
    pointer-events: none;
    transition: color 0.2s;
  }

  .input-group input {
    width: 100%;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--card-border);
    color: var(--text-main);
    padding: 0.9rem 1rem 0.9rem 2.8rem;
    border-radius: 12px;
    font-size: 0.95rem;
    transition: all 0.2s ease;
    box-sizing: border-box;
  }

  .input-group input:focus {
    outline: none;
    border-color: var(--primary);
    background: rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }

  .input-group input:focus + .input-icon,
  .input-group input:not(:placeholder-shown) ~ .input-icon {
    color: var(--primary);
  }

  .input-group input::placeholder {
    color: #475569;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  /* Buttons */
  .btn-gradient {
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    color: white;
    border: none;
    padding: 1rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    margin-top: 0.5rem;
  }

  .btn-gradient:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(59, 130, 246, 0.5);
  }

  .btn-gradient:active:not(:disabled) {
    transform: translateY(0);
  }

  .btn-gradient:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    filter: grayscale(0.5);
  }

  .btn-icon {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--card-border);
    color: var(--text-main);
    width: 38px; height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-icon:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  /* Alerts & States */
  .alert {
    margin-top: 1.5rem;
    padding: 1rem;
    background: var(--success-bg);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 12px;
    color: var(--success);
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 500;
  }

  .alert.error {
    background: var(--danger-bg);
    border-color: rgba(239, 68, 68, 0.3);
    color: var(--danger);
  }

  .state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 1rem;
    text-align: center;
    gap: 1rem;
  }

  /* Tables */
  .table-responsive {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid var(--card-border);
    background: rgba(0, 0, 0, 0.15);
  }

  .premium-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    white-space: nowrap;
  }

  .premium-table th {
    background: rgba(255, 255, 255, 0.03);
    padding: 1rem 1.25rem;
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--card-border);
  }

  .premium-table td {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    font-size: 0.9rem;
    transition: background 0.2s;
  }

  .premium-table tr:last-child td {
    border-bottom: none;
  }

  .premium-table tbody tr:hover td {
    background: rgba(255, 255, 255, 0.03);
  }

  .font-mono {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .fw-600 {
    font-weight: 600;
  }

  .text-blue { color: #60a5fa; }
  .text-purple { color: #a78bfa; }
  .text-sm { font-size: 0.8rem !important; }

  /* Tags & Badges */
  .tag {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .ports-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .port-tag {
    background: rgba(59, 130, 246, 0.1);
    color: #93c5fd;
    border: 1px solid rgba(59, 130, 246, 0.2);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.75rem;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    background: rgba(148, 163, 184, 0.1);
    color: var(--text-muted);
    border: 1px solid rgba(148, 163, 184, 0.2);
  }

  .status-badge.running {
    background: var(--success-bg);
    color: var(--success);
    border-color: rgba(16, 185, 129, 0.3);
  }

  .pulse-dot {
    width: 6px; height: 6px;
    background-color: var(--text-muted);
    border-radius: 50%;
  }

  .pulse-dot.active {
    background-color: var(--success);
    box-shadow: 0 0 6px var(--success);
  }

  /* Utils & Animations */
  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    100% { transform: rotate(360deg); }
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
  @media (max-width: 1024px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
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

    .main-content {
      padding: 1.5rem;
    }

    .mobile-toggle {
      display: block;
    }
  }
</style>

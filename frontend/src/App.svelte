<script>
  import { onMount } from 'svelte';

  let containers = [];
  let loading = true;
  let error = null;
  let isDeploying = false;

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

  onMount(() => {
    fetchContainers();
  });
</script>

<main class="app-container">
  <header class="navbar">
    <div class="brand">
      <div class="logo-icon">⚡</div>
      <h1>cPanel Server Control</h1>
    </div>
    <div class="status-pill">
      <span class="dot"></span>
      Docker API Connected
    </div>
  </header>

  <div class="dashboard-grid">
    <!-- Panel de Despliegue -->
    <section class="card deploy-card">
      <h2>🚀 Desplegar Nuevo Contenedor</h2>
      <p class="subtitle">Descarga una imagen de Docker Registry y levanta el servicio al instante.</p>

      <form on:submit|preventDefault={handleDeploy} class="deploy-form">
        <div class="form-group">
          <label for="image">Imagen Docker</label>
          <input 
            id="image" 
            type="text" 
            bind:value={imageName} 
            placeholder="ej. nginx:latest, redis:alpine" 
            required 
          />
        </div>

        <div class="form-group">
          <label for="name">Nombre del Contenedor (Opcional)</label>
          <input 
            id="name" 
            type="text" 
            bind:value={containerName} 
            placeholder="ej. mi-web-nginx" 
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="hostPort">Puerto Host</label>
            <input 
              id="hostPort" 
              type="number" 
              bind:value={hostPort} 
              placeholder="8080" 
            />
          </div>
          <div class="form-group">
            <label for="containerPort">Puerto Contenedor</label>
            <input 
              id="containerPort" 
              type="number" 
              bind:value={containerPort} 
              placeholder="80" 
            />
          </div>
        </div>

        <button type="submit" class="btn-primary" disabled={isDeploying}>
          {#if isDeploying}
            <span class="spinner"></span> Desplegando...
          {:else}
            Desplegar Contenedor
          {/if}
        </button>
      </form>

      {#if deployMessage}
        <div class="deploy-alert" class:error={deployMessage.includes('❌')}>
          {deployMessage}
        </div>
      {/if}
    </section>

    <!-- Lista de Contenedores -->
    <section class="card list-card">
      <div class="card-header">
        <h2>📦 Contenedores en Ejecución</h2>
        <button class="btn-refresh" on:click={fetchContainers} title="Actualizar lista">
          🔄 Actualizar
        </button>
      </div>

      {#if loading}
        <div class="loading-state">
          <div class="spinner-large"></div>
          <p>Cargando contenedores desde Docker...</p>
        </div>
      {:else if error}
        <div class="error-banner">
          ⚠️ {error}
        </div>
      {:else if containers.length === 0}
        <div class="empty-state">
          <p>No hay contenedores corriendo actualmente.</p>
        </div>
      {:else}
        <div class="table-wrapper">
          <table>
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
                  <td class="code-text">{c.Id.substring(0, 12)}</td>
                  <td class="font-bold">{c.Names ? c.Names.join(', ').replace(/^\//, '') : '-'}</td>
                  <td><span class="badge-image">{c.Image}</span></td>
                  <td>
                    <span class="status-badge" class:running={c.State === 'running'}>
                      {c.State}
                    </span>
                  </td>
                  <td class="code-text">
                    {#if c.Ports && c.Ports.length > 0}
                      {#each c.Ports as p}
                        <div>{p.PublicPort ? `${p.PublicPort}:` : ''}{p.PrivatePort}/{p.Type}</div>
                      {/each}
                    {:else}
                      -
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

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background-color: #0f172a;
    color: #f8fafc;
    min-height: 100vh;
  }

  .app-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  .navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 2rem;
    border-bottom: 1px solid #1e293b;
    margin-bottom: 2.5rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon {
    font-size: 1.8rem;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    background: linear-gradient(90deg, #ffffff, #94a3b8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #1e293b;
    border: 1px solid #334155;
    padding: 0.4rem 0.9rem;
    border-radius: 9999px;
    font-size: 0.85rem;
    color: #38bdf8;
  }

  .dot {
    width: 8px;
    height: 8px;
    background-color: #22c55e;
    border-radius: 50%;
    box-shadow: 0 0 8px #22c55e;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 2rem;
  }

  @media (max-width: 900px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }

  .card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
  }

  h2 {
    font-size: 1.2rem;
    margin: 0 0 0.5rem 0;
    color: #f1f5f9;
  }

  .subtitle {
    font-size: 0.85rem;
    color: #94a3b8;
    margin: 0 0 1.5rem 0;
  }

  .deploy-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  input {
    background: #0f172a;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 0.75rem 0.9rem;
    border-radius: 8px;
    font-size: 0.9rem;
    transition: border-color 0.2s;
  }

  input:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .btn-primary {
    background: linear-gradient(135deg, #2563eb, #3b82f6);
    color: white;
    font-weight: 600;
    border: none;
    padding: 0.85rem;
    border-radius: 8px;
    cursor: pointer;
    margin-top: 0.5rem;
    transition: transform 0.1s, box-shadow 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-refresh {
    background: #334155;
    color: #f8fafc;
    border: none;
    padding: 0.5rem 0.9rem;
    border-radius: 8px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-refresh:hover {
    background: #475569;
  }

  .deploy-alert {
    margin-top: 1rem;
    padding: 0.8rem;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 8px;
    color: #4ade80;
    font-size: 0.85rem;
    word-break: break-word;
  }

  .deploy-alert.error {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.9rem;
  }

  th {
    background: #0f172a;
    padding: 0.75rem 1rem;
    color: #94a3b8;
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
  }

  td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid #334155;
  }

  .code-text {
    font-family: monospace;
    color: #38bdf8;
  }

  .font-bold {
    font-weight: 600;
  }

  .badge-image {
    background: #0f172a;
    border: 1px solid #334155;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #cbd5e1;
  }

  .status-badge {
    padding: 0.25rem 0.6rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    background: #475569;
    color: #94a3b8;
  }

  .status-badge.running {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.4);
  }

  .loading-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 3rem 1rem;
    color: #94a3b8;
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    padding: 1rem;
    border-radius: 8px;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner-large {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>

<script>
  import { 
    Package, 
    RefreshCw, 
    Loader2,
    AlertTriangle,
    Box
  } from 'lucide-svelte';

  export let loading = false;
  export let error = null;
  export let containers = [];
  export let fetchContainers;
</script>

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

<style>
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

  /* States */
  .state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 1rem;
    text-align: center;
    gap: 1rem;
  }

  .alert.error {
    margin-top: 1.5rem;
    padding: 1rem;
    background: var(--danger-bg);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 12px;
    color: var(--danger);
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 500;
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

  /* Formatting Utils */
  .font-mono {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .fw-600 {
    font-weight: 600;
  }

  /* Fixed global warnings by removing global scopes when not necessary inside component */
  .text-blue { color: #60a5fa; }
  :global(.text-purple) { color: #a78bfa; }
  .text-sm { font-size: 0.8rem !important; }
  .text-muted { color: var(--text-muted); }

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
</style>

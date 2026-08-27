<script>
  import { 
    Rocket, 
    Layers, 
    Box, 
    Globe, 
    Server, 
    Loader2,
    CheckCircle2,
    XCircle
  } from 'lucide-svelte';

  export let isDeploying = false;
  export let deployMessage = '';
  export let deployIsError = false;
  export let handleDeploy;
  export let imageName = '';
  export let containerName = '';
  export let hostPort = '';
  export let containerPort = '';
</script>

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
    <div class="alert" class:error={deployIsError}>
      {#if deployIsError}
        <XCircle size={18} />
      {:else}
        <CheckCircle2 size={18} />
      {/if}
      <span>{deployMessage}</span>
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

  /* Form & Inputs */
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

  /* Fixed CSS selectors for focus states without warnings */
  :global(.input-group input:focus + .input-icon) {
    color: var(--primary);
  }
  
  :global(.input-group input:not(:placeholder-shown) ~ .input-icon) {
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

  /* Alerts */
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
</style>

<script>
  import { onMount } from 'svelte';
  import { 
    Sliders, 
    Check, 
    RefreshCw 
  } from 'lucide-svelte';

  // State configurations
  let backendUrl = 'http://localhost:5000/api';
  let dockerSocket = '/var/run/docker.sock';
  
  let successMessage = '';
  let isSaving = false;

  onMount(() => {
    backendUrl = localStorage.getItem('apiBaseUrl') || 'http://localhost:5000/api';
    dockerSocket = localStorage.getItem('dockerSocket') || '/var/run/docker.sock';
  });

  function handleSaveSettings() {
    isSaving = true;
    successMessage = '';
    
    localStorage.setItem('apiBaseUrl', backendUrl);
    localStorage.setItem('dockerSocket', dockerSocket);

    setTimeout(() => {
      isSaving = false;
      successMessage = 'Configuración guardada exitosamente. Recarga la página si cambiaste la URL de la API.';
    }, 600);
  }

  function handleReset() {
    backendUrl = 'http://localhost:5000/api';
    dockerSocket = '/var/run/docker.sock';
    localStorage.setItem('apiBaseUrl', backendUrl);
    localStorage.setItem('dockerSocket', dockerSocket);
    successMessage = 'Ajustes restablecidos a los valores por defecto.';
  }
</script>

<div class="view-container">
  <div class="settings-grid">
    <!-- Server Settings Form -->
    <div class="glass-card settings-card">
      <div class="card-header-styled">
        <div class="icon-wrapper blue">
          <Sliders size={20} />
        </div>
        <div>
          <h3>Ajustes del Servidor</h3>
          <p class="subtitle">Conexión con el daemon de Docker y el backend del cPanel.</p>
        </div>
      </div>

      <form on:submit|preventDefault={handleSaveSettings} class="settings-form">
        <div class="form-group">
          <label for="backend-url">URL del Backend (API)</label>
          <input 
            type="text" 
            id="backend-url" 
            bind:value={backendUrl} 
            placeholder="http://localhost:5000/api" 
          />
          <span class="field-desc">La URL base de tu API backend (ej. http://localhost:5000/api).</span>
        </div>

        <div class="form-group">
          <label for="docker-socket">Ruta del Socket de Docker</label>
          <input 
            type="text" 
            id="docker-socket" 
            bind:value={dockerSocket} 
            placeholder="/var/run/docker.sock" 
          />
          <span class="field-desc">Ruta al UNIX socket de Docker en el host.</span>
        </div>

        <div class="actions-row">
          <button type="submit" class="btn-primary" disabled={isSaving}>
            {#if isSaving}
              <RefreshCw size={16} class="spin" /> Guardando...
            {:else}
              Guardar Cambios
            {/if}
          </button>
          <button type="button" class="btn-sec" on:click={handleReset}>
            Restablecer
          </button>
        </div>
      </form>

      {#if successMessage}
        <div class="alert success">
          <Check size={18} />
          <span>{successMessage}</span>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .view-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: 1fr;
    max-width: 700px;
  }

  /* Cards styling */
  .glass-card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 20px;
    padding: 1.75rem;
    box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.4);
  }

  .card-header-styled {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.75rem;
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

  .settings-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-main);
  }

  input[type="text"] {
    width: 100%;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--card-border);
    color: var(--text-main);
    padding: 0.75rem 1rem;
    border-radius: 10px;
    font-size: 0.95rem;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  input[type="text"]:focus {
    outline: none;
    border-color: var(--primary);
  }

  .field-desc {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .actions-row {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: background 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-sec {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-main);
    border: 1px solid var(--card-border);
    padding: 0.75rem 1.5rem;
    border-radius: 10px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-sec:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  /* Alerts */
  .alert {
    margin-top: 1.25rem;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }

  .alert.success {
    background: var(--success-bg);
    border: 1px solid rgba(16, 185, 129, 0.2);
    color: var(--success);
  }
</style>

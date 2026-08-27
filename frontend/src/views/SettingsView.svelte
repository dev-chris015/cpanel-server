<script>
  import { onMount } from 'svelte';
  import { 
    Settings, 
    Sliders, 
    Shield, 
    Info, 
    Check, 
    AlertCircle, 
    RefreshCw,
    Moon,
    Sun
  } from 'lucide-svelte';

  // State configurations
  let backendUrl = 'http://localhost:5000/api';
  let dockerSocket = '/var/run/docker.sock';
  let autoRefresh = true;
  let refreshInterval = '5'; // seconds
  let notifyOnDeploy = true;
  let autoPrune = false;
  let theme = 'dark';
  
  let successMessage = '';
  let errorMessage = '';
  let isSaving = false;

  onMount(() => {
    backendUrl = localStorage.getItem('apiBaseUrl') || 'http://localhost:5000/api';
    dockerSocket = localStorage.getItem('dockerSocket') || '/var/run/docker.sock';
    autoRefresh = localStorage.getItem('autoRefresh') !== 'false';
    refreshInterval = localStorage.getItem('refreshInterval') || '5';
    notifyOnDeploy = localStorage.getItem('notifyOnDeploy') !== 'false';
    autoPrune = localStorage.getItem('autoPrune') === 'true';
    theme = localStorage.getItem('theme') || 'dark';
  });

  function handleSaveSettings() {
    isSaving = true;
    successMessage = '';
    errorMessage = '';
    
    localStorage.setItem('apiBaseUrl', backendUrl);
    localStorage.setItem('dockerSocket', dockerSocket);
    localStorage.setItem('autoRefresh', autoRefresh);
    localStorage.setItem('refreshInterval', refreshInterval);
    localStorage.setItem('notifyOnDeploy', notifyOnDeploy);
    localStorage.setItem('autoPrune', autoPrune);
    localStorage.setItem('theme', theme);
    
    document.body.className = theme === 'light' ? 'theme-light' : '';

    setTimeout(() => {
      isSaving = false;
      successMessage = 'Configuración guardada exitosamente. Recarga la página para aplicar la URL de API.';
    }, 800);
  }

  function handleReset() {
    backendUrl = 'http://localhost:5000/api';
    dockerSocket = '/var/run/docker.sock';
    autoRefresh = true;
    refreshInterval = '5';
    notifyOnDeploy = true;
    autoPrune = false;
    theme = 'dark';
    
    document.body.className = '';
    successMessage = 'Ajustes restablecidos. Guarda los cambios si deseas mantenerlos.';
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
          <p class="subtitle">Conexión con el daemon y el backend.</p>
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
          <span class="field-desc">La URL base de tu backend (ej. http://192.168.1.50:5000/api).</span>
        </div>

        <div class="form-group">
          <label for="docker-socket">Ruta del Socket de Docker</label>
          <input 
            type="text" 
            id="docker-socket" 
            bind:value={dockerSocket} 
            placeholder="/var/run/docker.sock" 
          />
          <span class="field-desc">Ruta al UNIX socket de Docker en el host para llamadas de Dockerode.</span>
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
            Reestablecer
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

    <!-- UI Preferences & Extras -->
    <div class="preferences-container">
      <div class="glass-card settings-card">
        <div class="card-header-styled">
          <div class="icon-wrapper purple">
            <Settings size={20} />
          </div>
          <div>
            <h3>Preferencias del Panel</h3>
            <p class="subtitle">Personaliza tu espacio de trabajo.</p>
          </div>
        </div>

        <div class="toggles-list">
          
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title font-semibold">Tema de Interfaz</span>
              <p class="text-muted text-sm">Elige entre Modo Oscuro y Claro.</p>
            </div>
            <div class="theme-selector">
              <button 
                class="theme-btn {theme === 'dark' ? 'active' : ''}" 
                on:click={() => theme = 'dark'}>
                <Moon size={16} /> Oscuro
              </button>
              <button 
                class="theme-btn {theme === 'light' ? 'active' : ''}" 
                on:click={() => theme = 'light'}>
                <Sun size={16} /> Claro
              </button>
            </div>
          </div>

          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title font-semibold">Refresco Automático</span>
              <p class="text-muted text-sm">Actualiza la lista de contenedores en segundo plano.</p>
            </div>
            <label class="switch">
              <input type="checkbox" bind:checked={autoRefresh} />
              <span class="slider"></span>
            </label>
          </div>

          {#if autoRefresh}
            <div class="form-group sub-group animate-slide">
              <label for="interval-select">Intervalo de Refresco (segundos)</label>
              <select id="interval-select" bind:value={refreshInterval} class="custom-select">
                <option value="2">2 segundos</option>
                <option value="5">5 segundos</option>
                <option value="10">10 segundos</option>
                <option value="30">30 segundos</option>
              </select>
            </div>
          {/if}

          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title font-semibold">Notificaciones Desktop</span>
              <p class="text-muted text-sm">Notificar cuando un despliegue termine o falle.</p>
            </div>
            <label class="switch">
              <input type="checkbox" bind:checked={notifyOnDeploy} />
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title font-semibold">Auto-Prune al iniciar</span>
              <p class="text-muted text-sm">Limpia imágenes huérfanas al levantar el servidor.</p>
            </div>
            <label class="switch">
              <input type="checkbox" bind:checked={autoPrune} />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- About card -->
      <div class="glass-card about-card">
        <div class="card-header-styled">
          <div class="icon-wrapper orange">
            <Info size={20} />
          </div>
          <div>
            <h3>Acerca de cPanel</h3>
            <p class="subtitle">Detalles de la versión del panel.</p>
          </div>
        </div>
        <div class="about-details">
          <div class="about-row">
            <span class="text-muted">Versión Frontend</span>
            <span class="font-mono text-gradient">v1.0.0-Beta</span>
          </div>
          <div class="about-row">
            <span class="text-muted">Licencia de Software</span>
            <span>MIT Open Source</span>
          </div>
          <div class="about-row">
            <span class="text-muted">Tecnologías</span>
            <span class="tags-group">
              <span class="mini-tag">Svelte</span>
              <span class="mini-tag">Vite</span>
              <span class="mini-tag">Docker</span>
            </span>
          </div>
        </div>
      </div>
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
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }

  @media (max-width: 900px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }
  }

  .preferences-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* Cards styling */
  .glass-card {
    background: var(--card-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--card-border);
    border-radius: 20px;
    padding: 1.75rem;
    box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.2);
  }

  .card-header-styled {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.75rem;
  }

  .card-header-styled h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .subtitle {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* Icon Wrappers */
  .icon-wrapper {
    width: 38px;
    height: 38px;
    border-radius: 10px;
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

  .icon-wrapper.orange {
    background: rgba(249, 115, 22, 0.15);
    color: #fdba74;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }

  /* Forms & Toggles */
  .settings-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
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
    transition: all 0.2s ease;
  }

  input[type="text"]:focus {
    outline: none;
    border-color: var(--primary);
    background: rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
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
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.7;
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

  /* Switches */
  .toggles-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .toggle-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding-right: 1.5rem;
  }

  .toggle-title {
    font-size: 0.95rem;
  }

  /* Custom Switch Slider */
  .switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: rgba(255, 255, 255, 0.1);
    transition: .3s;
    border-radius: 24px;
    border: 1px solid var(--card-border);
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 16px;
    width: 16px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .3s;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  input:checked + .slider {
    background-color: var(--primary);
    border-color: rgba(59, 130, 246, 0.4);
  }

  input:focus + .slider {
    box-shadow: 0 0 1px var(--primary);
  }

  input:checked + .slider:before {
    transform: translateX(20px);
  }

  .sub-group {
    padding-left: 1rem;
    border-left: 2px solid var(--card-border);
    margin-top: -0.5rem;
  }

  .custom-select {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--card-border);
    color: var(--text-main);
    padding: 0.6rem;
    border-radius: 8px;
    font-size: 0.9rem;
    outline: none;
    cursor: pointer;
  }

  /* About Row Info */
  .about-details {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .about-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .about-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .tags-group {
    display: flex;
    gap: 0.4rem;
  }

  .mini-tag {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--card-border);
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .font-mono {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .font-semibold {
    font-weight: 600;
  }

  .text-gradient {
    color: var(--primary);
    font-weight: 700;
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

  .animate-slide {
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .theme-selector {
    display: flex;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    padding: 0.25rem;
    border: 1px solid var(--card-border);
  }

  .theme-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-muted);
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  .theme-btn:hover {
    color: var(--text-main);
  }

  .theme-btn.active {
    background: var(--primary);
    color: white;
  }
</style>

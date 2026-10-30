<script>
  import { 
    Rocket, 
    Layers, 
    Box, 
    Globe, 
    Server, 
    Loader2,
    CheckCircle2,
    XCircle,
    Database,
    User,
    Key,
    RefreshCw,
    ShieldCheck,
    HardDrive,
    Network,
    Sparkles,
    Copy,
    Check
  } from 'lucide-svelte';

  export let isDeploying = false;
  export let deployMessage = '';
  export let deployIsError = false;
  export let onDeploy = null; // Callback: (payload) => Promise<void>
  export let handleDeploy = null; // Retrocompatibilidad para formularios antiguos

  // Pestaña activa: 'wordpress' o 'custom'
  let activeTab = 'wordpress';

  // --- Campos WordPress ---
  let wpContainerName = 'wp_site_4';
  let wpDbName = 'wp_db_4';
  let wpDbUser = 'wp_user_4';
  let wpDbPassword = '';
  let copiedPassword = false;

  // Reactividad para sincronizar DB y Usuario con el nombre del contenedor si el usuario no los ha modificado manualmente
  let lastWpName = 'wp_site_4';
  function handleWpNameChange() {
    const clean = wpContainerName.trim().replace(/^wp_site_/, '').replace(/^wp_/, '');
    if (clean && (wpDbName === `wp_db_${lastWpName.replace(/^wp_site_/, '').replace(/^wp_/, '')}` || !wpDbName)) {
      wpDbName = `wp_db_${clean}`;
    }
    if (clean && (wpDbUser === `wp_user_${lastWpName.replace(/^wp_site_/, '').replace(/^wp_/, '')}` || !wpDbUser)) {
      wpDbUser = `wp_user_${clean}`;
    }
    lastWpName = wpContainerName;
  }

  // Opciones automáticas calculadas no editables
  $: calculatedVolume = `wp_data_${wpContainerName.trim() || 'default'}:/var/www/html`;
  const WP_DB_HOST = 'mariadb:3306';
  const WP_NETWORK = 'server-net';

  // Generador de contraseñas seguras
  function generateSecurePassword() {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~|}{[]';
    let result = '';
    const randomValues = new Uint32Array(18);
    window.crypto.getRandomValues(randomValues);
    for (let i = 0; i < 18; i++) {
      result += charset[randomValues[i] % charset.length];
    }
    wpDbPassword = result;
  }

  function copyPasswordToClipboard() {
    if (!wpDbPassword) return;
    navigator.clipboard.writeText(wpDbPassword);
    copiedPassword = true;
    setTimeout(() => {
      copiedPassword = false;
    }, 2000);
  }

  // Generar contraseña por defecto al montar
  if (!wpDbPassword) {
    generateSecurePassword();
  }

  // --- Campos Contenedor Personalizado ---
  export let imageName = '';
  export let containerName = '';
  export let hostPort = '';
  export let containerPort = '';

  function handleSubmit() {
    if (activeTab === 'wordpress') {
      const payload = {
        type: 'wordpress',
        image: 'wordpress:latest',
        name: wpContainerName.trim(),
        network: WP_NETWORK,
        binds: [`wp_data_${wpContainerName.trim()}:/var/www/html`],
        env: [
          `WORDPRESS_DB_HOST=${WP_DB_HOST}`,
          `WORDPRESS_DB_NAME=${wpDbName.trim()}`,
          `WORDPRESS_DB_USER=${wpDbUser.trim()}`,
          `WORDPRESS_DB_PASSWORD=${wpDbPassword.trim()}`
        ],
        wordpressConfig: {
          containerName: wpContainerName.trim(),
          dbName: wpDbName.trim(),
          dbUser: wpDbUser.trim(),
          dbPassword: wpDbPassword.trim(),
          dbHost: WP_DB_HOST,
          network: WP_NETWORK,
          volume: `wp_data_${wpContainerName.trim()}:/var/www/html`
        }
      };

      if (onDeploy) {
        onDeploy(payload);
      } else if (handleDeploy) {
        // Fallback pasando la metadata a través de evento
        handleDeploy(payload);
      }
    } else {
      const payload = {
        type: 'custom',
        image: imageName.trim(),
        name: containerName.trim() || undefined,
        network: 'server-net',
        ports: (hostPort && containerPort) ? [{ hostPort: parseInt(hostPort, 10), containerPort: parseInt(containerPort, 10) }] : []
      };

      if (onDeploy) {
        onDeploy(payload);
      } else if (handleDeploy) {
        handleDeploy(payload);
      }
    }
  }
</script>

<section class="glass-card deploy-card">
  <div class="card-header-styled">
    <div class="icon-wrapper blue">
      <Rocket size={22} />
    </div>
    <div class="header-text">
      <h3>Crear y Desplegar Sitio / Contenedor</h3>
      <p class="subtitle">Instalación optimizada de aplicaciones web o contenedores aislados en Docker.</p>
    </div>
  </div>

  <!-- Navegación de Pestañas -->
  <div class="tabs-nav" role="tablist">
    <button 
      type="button"
      role="tab"
      class="tab-btn" 
      class:active={activeTab === 'wordpress'}
      on:click={() => activeTab = 'wordpress'}
    >
      <Sparkles size={16} />
      <span>Sitio WordPress</span>
      <span class="badge-preset">Preset Optimizado</span>
    </button>

    <button 
      type="button"
      role="tab"
      class="tab-btn" 
      class:active={activeTab === 'custom'}
      on:click={() => activeTab = 'custom'}
    >
      <Box size={16} />
      <span>Contenedor Personalizado</span>
    </button>
  </div>

  <form on:submit|preventDefault={handleSubmit} class="deploy-form-wrapper">
    <!-- PESTAÑA 1: SITIO WORDPRESS -->
    {#if activeTab === 'wordpress'}
      <div class="preset-container">
        <div class="section-badge-info">
          <ShieldCheck size={16} class="text-sky" />
          <span>Configuración automatizada con aislamiento en la red <code>server-net</code> y volumen persistente dedicado.</span>
        </div>

        <div class="form-grid">
          <!-- Nombre del contenedor -->
          <div class="field-group">
            <label for="wp_container">Nombre del Contenedor</label>
            <div class="input-group">
              <div class="input-icon">
                <Box size={16} />
              </div>
              <input 
                id="wp_container" 
                type="text" 
                bind:value={wpContainerName} 
                on:input={handleWpNameChange}
                placeholder="ej. wp_site_4" 
                required 
              />
            </div>
            <span class="help-text">Identificador único del contenedor de WordPress.</span>
          </div>

          <!-- Nombre de BD -->
          <div class="field-group">
            <label for="wp_db">Nombre de Base de Datos</label>
            <div class="input-group">
              <div class="input-icon">
                <Database size={16} />
              </div>
              <input 
                id="wp_db" 
                type="text" 
                bind:value={wpDbName} 
                placeholder="ej. wp_db_4" 
                required 
              />
            </div>
            <span class="help-text">Nombre del esquema en MariaDB.</span>
          </div>

          <!-- Usuario de BD -->
          <div class="field-group">
            <label for="wp_user">Usuario de BD</label>
            <div class="input-group">
              <div class="input-icon">
                <User size={16} />
              </div>
              <input 
                id="wp_user" 
                type="text" 
                bind:value={wpDbUser} 
                placeholder="ej. wp_user_4" 
                required 
              />
            </div>
            <span class="help-text">Usuario con acceso a la base de datos.</span>
          </div>

          <!-- Contraseña de BD -->
          <div class="field-group">
            <label for="wp_pass">Contraseña de BD</label>
            <div class="password-group">
              <div class="input-group flex-1">
                <div class="input-icon">
                  <Key size={16} />
                </div>
                <input 
                  id="wp_pass" 
                  type="text" 
                  bind:value={wpDbPassword} 
                  placeholder="Contraseña robusta" 
                  required 
                />
              </div>
              
              <button 
                type="button" 
                class="btn-icon-action" 
                on:click={generateSecurePassword} 
                title="Generar nueva clave segura"
              >
                <RefreshCw size={15} />
                <span>Generar</span>
              </button>

              <button 
                type="button" 
                class="btn-icon-action copy" 
                class:copied={copiedPassword}
                on:click={copyPasswordToClipboard} 
                title="Copiar contraseña"
              >
                {#if copiedPassword}
                  <Check size={15} />
                {:else}
                  <Copy size={15} />
                {/if}
              </button>
            </div>
            <span class="help-text">Clave segura autogenerada criptográficamente.</span>
          </div>
        </div>

        <!-- Opciones automáticas no editables -->
        <div class="readonly-presets-card">
          <div class="presets-title">
            <ShieldCheck size={15} />
            <span>Opciones Automáticas del Sistema (No editables)</span>
          </div>
          
          <div class="preset-tags-grid">
            <div class="preset-tag">
              <span class="tag-label">DB Host:</span>
              <span class="tag-value font-mono">WORDPRESS_DB_HOST={WP_DB_HOST}</span>
            </div>

            <div class="preset-tag">
              <span class="tag-label"><Network size={13} /> Red:</span>
              <span class="tag-value font-mono">{WP_NETWORK}</span>
            </div>

            <div class="preset-tag">
              <span class="tag-label"><HardDrive size={13} /> Volumen:</span>
              <span class="tag-value font-mono">{calculatedVolume}</span>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <!-- PESTAÑA 2: CONTENEDOR PERSONALIZADO -->
      <div class="custom-container">
        <div class="section-badge-info">
          <Box size={16} class="text-sky" />
          <span>Despliega cualquier imagen Docker oficial o personalizada conectada por defecto a la red <code>server-net</code>.</span>
        </div>

        <div class="form-grid">
          <div class="field-group">
            <label for="image">Imagen Docker</label>
            <div class="input-group">
              <div class="input-icon">
                <Layers size={16} />
              </div>
              <input 
                id="image" 
                type="text" 
                bind:value={imageName} 
                placeholder="ej. nginx:alpine, redis:7-alpine" 
                required 
              />
            </div>
            <span class="help-text">Nombre de imagen en Docker Hub o registro privado.</span>
          </div>

          <div class="field-group">
            <label for="name">Nombre del Contenedor</label>
            <div class="input-group">
              <div class="input-icon">
                <Box size={16} />
              </div>
              <input 
                id="name" 
                type="text" 
                bind:value={containerName} 
                placeholder="ej. mi-app-web (opcional)" 
              />
            </div>
            <span class="help-text">Identificador asignado en el daemon de Docker.</span>
          </div>

          <div class="field-group">
            <label for="hostPort">Puerto Host</label>
            <div class="input-group">
              <div class="input-icon">
                <Globe size={16} />
              </div>
              <input 
                id="hostPort" 
                type="number" 
                bind:value={hostPort} 
                placeholder="ej. 8080" 
              />
            </div>
            <span class="help-text">Puerto accesible en la máquina virtual (opcional).</span>
          </div>
          
          <div class="field-group">
            <label for="containerPort">Puerto Contenedor</label>
            <div class="input-group">
              <div class="input-icon">
                <Server size={16} />
              </div>
              <input 
                id="containerPort" 
                type="number" 
                bind:value={containerPort} 
                placeholder="ej. 80" 
              />
            </div>
            <span class="help-text">Puerto interno expuesto por el servicio.</span>
          </div>
        </div>

        <div class="readonly-presets-card">
          <div class="presets-title">
            <Network size={15} />
            <span>Red Docker predeterminada</span>
          </div>
          <div class="preset-tags-grid">
            <div class="preset-tag">
              <span class="tag-label">Red:</span>
              <span class="tag-value font-mono">server-net</span>
            </div>
            <div class="preset-tag">
              <span class="tag-label">Aislamiento:</span>
              <span class="tag-value">Permite comunicación directa con MariaDB y el Proxy Nginx</span>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Botón de Envío -->
    <div class="submit-row">
      <button type="submit" class="btn-gradient-submit" disabled={isDeploying}>
        {#if isDeploying}
          <Loader2 size={18} class="spin" />
          <span>Inicializando y Desplegando...</span>
        {:else}
          <Rocket size={18} />
          <span>{activeTab === 'wordpress' ? 'Crear Sitio WordPress' : 'Desplegar Contenedor'}</span>
        {/if}
      </button>
    </div>
  </form>

  {#if deployMessage}
    <div class="alert" class:error={deployIsError} role="alert">
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
  .glass-card {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 20px;
    padding: 1.75rem;
    box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.2);
    transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
  }

  .glass-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
    box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.3);
  }

  .card-header-styled {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    margin-bottom: 1.5rem;
  }

  .icon-wrapper {
    width: 46px; 
    height: 46px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .icon-wrapper.blue {
    background: #082f49;
    color: #38bdf8;
    border: 1px solid #0284c7;
  }

  :global(body.theme-light) .icon-wrapper.blue {
    background: #e0f2fe;
    color: #0284c7;
    border-color: #bae6fd;
  }

  .header-text h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-main, #f4f4f5);
  }

  .subtitle {
    margin: 0;
    font-size: 0.88rem;
    color: var(--text-muted, #a1a1aa);
  }

  /* Pestañas */
  .tabs-nav {
    display: flex;
    gap: 0.75rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--card-border, #222225);
    margin-bottom: 1.5rem;
  }

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.65rem 1.15rem;
    border-radius: 10px;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    color: var(--text-muted, #a1a1aa);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-main, #f4f4f5);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .tab-btn.active {
    background: #082f49;
    color: #38bdf8;
    border-color: #0284c7;
    box-shadow: 0 0 15px rgba(2, 132, 199, 0.2);
  }

  :global(body.theme-light) .tab-btn.active {
    background: #e0f2fe;
    color: #0284c7;
    border-color: #bae6fd;
    box-shadow: 0 2px 8px rgba(2, 132, 199, 0.15);
  }

  .badge-preset {
    font-size: 0.72rem;
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    padding: 0.15rem 0.45rem;
    border-radius: 6px;
    font-weight: 600;
    border: 1px solid rgba(56, 189, 248, 0.3);
  }

  :global(body.theme-light) .badge-preset {
    background: #e0f2fe;
    color: #0369a1;
    border-color: #7dd3fc;
  }

  /* Formulario y Secciones */
  .deploy-form-wrapper {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section-badge-info {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    background: rgba(2, 132, 199, 0.08);
    border: 1px solid rgba(2, 132, 199, 0.2);
    color: var(--text-muted, #a1a1aa);
    font-size: 0.86rem;
    margin-bottom: 1.25rem;
  }

  .section-badge-info code {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    color: #38bdf8;
    font-family: monospace;
    font-size: 0.85rem;
  }

  :global(body.theme-light) .section-badge-info code {
    background: rgba(255, 255, 255, 0.8);
    color: #0284c7;
  }

  .text-sky {
    color: #38bdf8;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1.25rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .field-group label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-main, #f4f4f5);
  }

  .help-text {
    font-size: 0.76rem;
    color: var(--text-muted, #a1a1aa);
  }

  .input-group {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }

  .input-icon {
    position: absolute;
    left: 0.95rem;
    color: var(--text-muted, #a1a1aa);
    pointer-events: none;
    transition: color 0.2s;
  }

  .input-group input {
    width: 100%;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    color: var(--text-main, #f4f4f5);
    padding: 0.8rem 1rem 0.8rem 2.6rem;
    border-radius: 10px;
    font-size: 0.92rem;
    transition: all 0.2s ease;
    box-sizing: border-box;
  }

  .input-group input:focus {
    outline: none;
    border-color: var(--primary, #0284c7);
    background: transparent;
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.2);
  }

  .input-group input::placeholder {
    color: #52525b;
  }

  .password-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .flex-1 {
    flex: 1;
  }

  .btn-icon-action {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.78rem 0.85rem;
    border-radius: 10px;
    border: 1px solid var(--card-border, #222225);
    background: var(--surface-muted, #18181b);
    color: var(--text-main, #f4f4f5);
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .btn-icon-action:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .btn-icon-action.copied {
    border-color: #10b981;
    color: #10b981;
  }

  /* Opciones Automáticas Card */
  .readonly-presets-card {
    margin-top: 1.25rem;
    background: rgba(0, 0, 0, 0.2);
    border: 1px dashed var(--card-border, #222225);
    border-radius: 12px;
    padding: 1rem 1.25rem;
  }

  :global(body.theme-light) .readonly-presets-card {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  .presets-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted, #a1a1aa);
    margin-bottom: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .preset-tags-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .preset-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    padding: 0.4rem 0.75rem;
    border-radius: 8px;
    font-size: 0.82rem;
  }

  :global(body.theme-light) .preset-tag {
    background: #ffffff;
    border-color: #e2e8f0;
  }

  .tag-label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--text-muted, #a1a1aa);
  }

  .tag-value {
    color: #38bdf8;
    font-weight: 500;
  }

  :global(body.theme-light) .tag-value {
    color: #0284c7;
  }

  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  /* Remove spin buttons from number inputs */
  .input-group input[type="number"]::-webkit-inner-spin-button,
  .input-group input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .input-group input[type="number"] {
    -moz-appearance: textfield;
  }

  /* Submit row */
  .submit-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .btn-gradient-submit {
    background: var(--primary, #0284c7);
    color: white;
    border: none;
    padding: 0.85rem 1.75rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    transition: all 0.2s ease;
    box-shadow: 0 4px 15px rgba(2, 132, 199, 0.25);
  }

  .btn-gradient-submit:hover:not(:disabled) {
    background: var(--primary-hover, #0369a1);
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(2, 132, 199, 0.35);
  }

  .btn-gradient-submit:active:not(:disabled) {
    transform: translateY(0);
  }

  .btn-gradient-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    filter: grayscale(0.5);
  }

  /* Alerts */
  .alert {
    margin-top: 1.25rem;
    padding: 0.9rem 1.15rem;
    background: #064e3b;
    border: 1px solid #059669;
    border-radius: 12px;
    color: #a7f3d0;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 500;
  }

  .alert.error {
    background: #450a0a;
    border-color: #dc2626;
    color: #fecaca;
  }

  :global(body.theme-light) .alert {
    background: #d1fae5;
    border-color: #34d399;
    color: #065f46;
  }

  :global(body.theme-light) .alert.error {
    background: #fee2e2;
    border-color: #f87171;
    color: #991b1b;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @media (max-width: 640px) {
    .glass-card {
      padding: 1.25rem 1rem;
      border-radius: 14px;
    }

    .tabs-nav {
      flex-direction: column;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .submit-row {
      width: 100%;
    }

    .btn-gradient-submit {
      width: 100%;
    }
  }
</style>

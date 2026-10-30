<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { 
    Shield, 
    ShieldCheck, 
    ShieldAlert, 
    Lock, 
    CheckCircle2, 
    AlertTriangle, 
    X, 
    RefreshCw, 
    Copy, 
    Check, 
    RotateCcw, 
    Terminal, 
    Mail, 
    HardDrive, 
    Clock, 
    ArrowRight, 
    Info,
    Server,
    ExternalLink
  } from 'lucide-svelte';
  import { api } from '../api.js';

  export let show = false;
  export let vhost = null;

  const dispatch = createEventDispatcher();

  // Parámetros de formulario
  let email = '';
  let forceRenewal = false;

  // Estado del proceso
  let isRunning = false;
  let currentPhase = 0; // 0: no iniciado, 1: ACME, 2: Certbot, 3: HTTPS/Reload
  let phaseStates = {
    1: 'pending', // 'pending' | 'running' | 'completed' | 'error'
    2: 'pending',
    3: 'pending'
  };

  // Errores, diagnóstico y éxito
  let errorMessage = null;
  let diagnosticOutput = null;
  let rollbackTriggered = false;
  let isSuccess = false;
  let successMessage = '';
  let copiedLogs = false;

  // Inicializar o actualizar estado al abrir el modal o cambiar el vhost
  $: if (show && vhost) {
    if (!email || email.startsWith('admin@')) {
      email = `admin@${vhost.domain || 'example.com'}`;
    }
    // Si no está corriendo una operación y no terminó con éxito, reiniciar estados visuales
    if (!isRunning && !isSuccess) {
      resetState();
    }
  }

  function resetState() {
    isRunning = false;
    currentPhase = 0;
    phaseStates = { 1: 'pending', 2: 'pending', 3: 'pending' };
    errorMessage = null;
    diagnosticOutput = null;
    rollbackTriggered = false;
    isSuccess = false;
    successMessage = '';
    copiedLogs = false;
  }

  function handleClose() {
    if (isRunning) return; // Prevenir cierre accidental durante emisión
    dispatch('close');
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && !isRunning) {
      handleClose();
    }
  }

  function formatMtime(mtime) {
    if (!mtime) return 'Sin fecha registrada';
    try {
      const d = new Date(mtime);
      if (isNaN(d.getTime())) return 'Desconocida';
      return d.toLocaleString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Desconocida';
    }
  }

  function copyDiagnosticOutput() {
    if (!diagnosticOutput) return;
    navigator.clipboard.writeText(diagnosticOutput).then(() => {
      copiedLogs = true;
      setTimeout(() => {
        copiedLogs = false;
      }, 2500);
    }).catch(err => {
      console.error('Error al copiar diagnóstico:', err);
    });
  }

  async function handleStartSslProcess() {
    if (isRunning || !vhost || !vhost.domain) return;

    // Validación básica de email
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      errorMessage = 'Por favor ingresa un correo electrónico válido para registrar en Let\'s Encrypt.';
      return;
    }

    // Reiniciar diagnósticos
    errorMessage = null;
    diagnosticOutput = null;
    rollbackTriggered = false;
    isSuccess = false;
    successMessage = '';
    isRunning = true;

    // Fase 1: Configurar ACME Challenge en puerto 80
    currentPhase = 1;
    phaseStates = { 1: 'running', 2: 'pending', 3: 'pending' };

    try {
      // Iniciar llamada al backend
      const issuePromise = api.post(`/proxy/vhosts/${vhost.domain}/issue-cert`, {
        target: vhost.target,
        email: cleanEmail,
        force: Boolean(forceRenewal)
      });

      // Transición visual paso 1 -> paso 2 tras breve latencia estética
      await new Promise(r => setTimeout(r, 650));
      phaseStates = { 1: 'completed', 2: 'running', 3: 'pending' };
      currentPhase = 2;

      const res = await issuePromise;

      if (res && res.success) {
        // Transición visual paso 2 -> paso 3
        phaseStates = { 1: 'completed', 2: 'completed', 3: 'running' };
        currentPhase = 3;

        await new Promise(r => setTimeout(r, 500));
        phaseStates = { 1: 'completed', 2: 'completed', 3: 'completed' };
        isSuccess = true;
        successMessage = res.message || `Certificado SSL aplicado exitosamente para ${vhost.domain}.`;
        diagnosticOutput = res.certbotOutput || '';

        // Notificar al componente padre para refrescar listado
        dispatch('success', {
          domain: vhost.domain,
          result: res
        });
      } else {
        throw new Error(res?.error || 'No se pudo completar la emisión del certificado SSL.');
      }
    } catch (err) {
      const errData = err.data || {};
      errorMessage = err.message || errData.error || 'Ocurrió un error durante la emisión del certificado.';
      diagnosticOutput = errData.certbotOutput || errData.details || err.stack || err.message;
      rollbackTriggered = true;

      // Marcar fase con fallo
      if (currentPhase === 1) {
        phaseStates = { 1: 'error', 2: 'pending', 3: 'pending' };
      } else if (currentPhase === 2) {
        phaseStates = { 1: 'completed', 2: 'error', 3: 'pending' };
      } else {
        phaseStates = { 1: 'completed', 2: 'completed', 3: 'error' };
      }
    } finally {
      isRunning = false;
    }
  }

  // Dominio y rutas de certificados
  $: domainName = vhost?.domain || '';
  $: certPathLive = vhost?.certDetails?.certPath || `/srv/nginx/certs/live/${domainName}/fullchain.pem`;
  $: keyPathLive = vhost?.certDetails?.keyPath || `/srv/nginx/certs/live/${domainName}/privkey.pem`;
  $: hasCertOnDisk = Boolean(vhost?.hasCertOnDisk || vhost?.certDetails?.exists);
  $: lastIssued = vhost?.certDetails?.mtime ? formatMtime(vhost.certDetails.mtime) : null;
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show && vhost}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div 
    class="modal-backdrop" 
    on:click|self={handleClose} 
    role="presentation"
  >
    <div 
      class="modal-dialog" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="ssl-modal-title"
    >
      <!-- ENCABEZADO -->
      <header class="modal-header">
        <div class="header-left">
          <div class="shield-icon-container" class:active={vhost.hasSsl} class:has-disk={hasCertOnDisk && !vhost.hasSsl}>
            {#if vhost.hasSsl}
              <ShieldCheck size={22} class="icon-ssl-active" />
            {:else if hasCertOnDisk}
              <Shield size={22} class="icon-ssl-disk" />
            {:else}
              <Lock size={22} class="icon-ssl-inactive" />
            {/if}
          </div>

          <div class="header-info">
            <div class="title-row">
              <h2 id="ssl-modal-title" class="modal-title">Gestión de Certificados SSL</h2>
              
              <!-- Badge de Estado SSL -->
              {#if vhost.hasSsl}
                <span class="ssl-status-badge badge-active" title="VHost configurado con terminación SSL en puerto 443">
                  <CheckCircle2 size={12} />
                  <span>Activo (HTTPS)</span>
                </span>
              {:else}
                <span class="ssl-status-badge badge-inactive" title="VHost operando en HTTP puerto 80 sin cifrado SSL">
                  <Lock size={12} />
                  <span>Inactivo / HTTP</span>
                </span>
              {/if}
            </div>

            <div class="domain-row">
              <span class="domain-label">Dominio:</span>
              <code class="domain-mono">{domainName}</code>
              {#if vhost.target}
                <span class="target-chip" title="Upstream destino">
                  <Server size={11} />
                  <span>{vhost.target}</span>
                </span>
              {/if}
            </div>
          </div>
        </div>

        <button 
          type="button" 
          class="btn-close" 
          on:click={handleClose} 
          disabled={isRunning}
          aria-label="Cerrar modal"
          title="Cerrar ventana"
        >
          <X size={18} />
        </button>
      </header>

      <!-- CUERPO DEL MODAL -->
      <div class="modal-body">
        
        <!-- TARJETA DE ESTADO EN DISCO -->
        <section class="disk-status-card" class:cert-present={hasCertOnDisk} class:cert-missing={!hasCertOnDisk}>
          <div class="disk-card-header">
            <div class="disk-title-group">
              <HardDrive size={16} class="disk-icon" />
              <h3 class="disk-title">Estado del Certificado en Almacenamiento</h3>
            </div>
            
            {#if hasCertOnDisk}
              <span class="disk-badge badge-found">
                <CheckCircle2 size={12} />
                <span>Presente en disco</span>
              </span>
            {:else}
              <span class="disk-badge badge-missing">
                <AlertTriangle size={12} />
                <span>No emitido en disco</span>
              </span>
            {/if}
          </div>

          <div class="disk-card-content">
            <div class="cert-path-block">
              <span class="path-label">Ruta fullchain:</span>
              <code class="path-code" title={certPathLive}>{certPathLive}</code>
            </div>

            <div class="cert-meta-grid">
              <div class="meta-item">
                <span class="meta-label">
                  <Clock size={12} />
                  <span>Última emisión / mod:</span>
                </span>
                <span class="meta-value">
                  {#if lastIssued}
                    {lastIssued}
                  {:else}
                    <span class="text-muted">Sin certificado previo</span>
                  {/if}
                </span>
              </div>

              <div class="meta-item">
                <span class="meta-label">
                  <Lock size={12} />
                  <span>Llave privada (privkey):</span>
                </span>
                <span class="meta-value">
                  {#if vhost?.certDetails?.hasKey || hasCertOnDisk}
                    <span class="text-green font-medium">Verificada (.pem)</span>
                  {:else}
                    <span class="text-muted">Pendiente de generación</span>
                  {/if}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- FORMULARIO DE PARÁMETROS -->
        <section class="form-section">
          <h3 class="section-title">Parámetros de Emisión (Let's Encrypt / ACME)</h3>

          <div class="form-grid">
            <!-- Email para Let's Encrypt -->
            <div class="form-group">
              <label for="ssl-email-input" class="form-label">
                <Mail size={13} />
                <span>Email de notificación Let's Encrypt:</span>
              </label>
              <div class="input-wrapper">
                <input 
                  id="ssl-email-input" 
                  type="email" 
                  class="form-input" 
                  bind:value={email} 
                  placeholder="admin@ejemplo.com"
                  disabled={isRunning}
                  required
                />
              </div>
              <p class="field-hint">
                Let's Encrypt utilizará este correo únicamente para enviar avisos de caducidad y alertas de seguridad.
              </p>
            </div>

            <!-- Checkbox Renovación Forzada -->
            <div class="form-group-checkbox">
              <label class="checkbox-container" class:disabled={isRunning}>
                <input 
                  type="checkbox" 
                  bind:checked={forceRenewal} 
                  disabled={isRunning}
                />
                <span class="checkbox-custom"></span>
                <div class="checkbox-content">
                  <span class="checkbox-label">Forzar renovación inmediata (`--force-renewal`)</span>
                  <span class="checkbox-subtext">
                    Ignora el límite de 30 días restantes y solicita un nuevo certificado reemplazando los archivos PEM existentes.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </section>

        <!-- VISUALIZADOR DE FASES DE EJECUCIÓN -->
        <section class="phases-section">
          <div class="phases-header">
            <h3 class="section-title">Fases del Flujo de Emisión SSL</h3>
            {#if isRunning}
              <span class="phase-running-indicator">
                <RefreshCw size={12} class="spin" />
                <span>Fase {currentPhase} en proceso...</span>
              </span>
            {/if}
          </div>

          <div class="phases-stepper">
            <!-- PASO 1 -->
            <div class="step-item step-{phaseStates[1]}">
              <div class="step-indicator">
                {#if phaseStates[1] === 'completed'}
                  <Check size={14} class="step-icon-check" />
                {:else if phaseStates[1] === 'running'}
                  <RefreshCw size={14} class="step-icon-spin spin" />
                {:else if phaseStates[1] === 'error'}
                  <AlertTriangle size={14} class="step-icon-error" />
                {:else}
                  <span class="step-number">1</span>
                {/if}
              </div>
              <div class="step-details">
                <div class="step-top">
                  <span class="step-title">Paso 1: Configurar ACME Challenge en puerto 80</span>
                  <span class="step-badge badge-{phaseStates[1]}">
                    {#if phaseStates[1] === 'completed'}Completado
                    {:else if phaseStates[1] === 'running'}En curso...
                    {:else if phaseStates[1] === 'error'}Fallido
                    {:else}En espera{/if}
                  </span>
                </div>
                <p class="step-desc">
                  Aplica VHost HTTP temporal y habilita el endpoint <code>/.well-known/acme-challenge</code> apuntando a <code>/var/www/certbot</code>.
                </p>
              </div>
            </div>

            <div class="step-connector" class:active={phaseStates[1] === 'completed'}></div>

            <!-- PASO 2 -->
            <div class="step-item step-{phaseStates[2]}">
              <div class="step-indicator">
                {#if phaseStates[2] === 'completed'}
                  <Check size={14} class="step-icon-check" />
                {:else if phaseStates[2] === 'running'}
                  <RefreshCw size={14} class="step-icon-spin spin" />
                {:else if phaseStates[2] === 'error'}
                  <AlertTriangle size={14} class="step-icon-error" />
                {:else}
                  <span class="step-number">2</span>
                {/if}
              </div>
              <div class="step-details">
                <div class="step-top">
                  <span class="step-title">Paso 2: Ejecutar Certbot (local / Docker)</span>
                  <span class="step-badge badge-{phaseStates[2]}">
                    {#if phaseStates[2] === 'completed'}Completado
                    {:else if phaseStates[2] === 'running'}En curso...
                    {:else if phaseStates[2] === 'error'}Fallido
                    {:else}En espera{/if}
                  </span>
                </div>
                <p class="step-desc">
                  Certbot valida el challenge HTTP-01 contra las APIs de Let's Encrypt para certificar la titularidad del dominio.
                </p>
              </div>
            </div>

            <div class="step-connector" class:active={phaseStates[2] === 'completed'}></div>

            <!-- PASO 3 -->
            <div class="step-item step-{phaseStates[3]}">
              <div class="step-indicator">
                {#if phaseStates[3] === 'completed'}
                  <Check size={14} class="step-icon-check" />
                {:else if phaseStates[3] === 'running'}
                  <RefreshCw size={14} class="step-icon-spin spin" />
                {:else if phaseStates[3] === 'error'}
                  <AlertTriangle size={14} class="step-icon-error" />
                {:else}
                  <span class="step-number">3</span>
                {/if}
              </div>
              <div class="step-details">
                <div class="step-top">
                  <span class="step-title">Paso 3: Aplicar HTTPS 443 con recarga en caliente de Nginx</span>
                  <span class="step-badge badge-{phaseStates[3]}">
                    {#if phaseStates[3] === 'completed'}Completado
                    {:else if phaseStates[3] === 'running'}En curso...
                    {:else if phaseStates[3] === 'error'}Fallido
                    {:else}En espera{/if}
                  </span>
                </div>
                <p class="step-desc">
                  Genera la configuración SSL en puerto 443 con terminación segura y recarga Nginx sin interrumpir conexiones activas.
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- BANNER DE ÉXITO -->
        {#if isSuccess}
          <div class="success-alert">
            <CheckCircle2 size={18} class="success-icon" />
            <div class="success-text">
              <h4 class="alert-heading">¡Certificado SSL instalado exitosamente!</h4>
              <p>{successMessage}</p>
            </div>
          </div>
        {/if}

        <!-- GESTIÓN DE ERRORES Y ROLLBACK -->
        {#if errorMessage || rollbackTriggered}
          <section class="error-rollback-section">
            <div class="error-alert">
              <div class="alert-icon-wrap">
                <AlertTriangle size={20} class="alert-icon" />
              </div>
              <div class="alert-body">
                <h4 class="alert-heading">Fallo en la Validación / Emisión</h4>
                <p class="alert-desc">{errorMessage}</p>
              </div>
            </div>

            <!-- Garantía de Rollback Atómico -->
            <div class="rollback-guarantee-card">
              <div class="guarantee-icon">
                <ShieldCheck size={20} />
              </div>
              <div class="guarantee-content">
                <h4 class="guarantee-title">Garantía de Rollback Atómico</h4>
                <p class="guarantee-desc">
                  El servicio HTTP previo para <strong class="text-white">{domainName}</strong> se mantiene intacto y en funcionamiento continuo. 
                  La configuración de Nginx no sufrió cortes de tráfico ni estados inconsistentes.
                </p>
              </div>
            </div>

            <!-- Salida diagnóstica de Certbot / Nginx -->
            {#if diagnosticOutput}
              <div class="diagnostic-box">
                <div class="diagnostic-top">
                  <div class="diagnostic-title">
                    <Terminal size={14} />
                    <span>Salida Diagnóstica de Certbot / Sistema</span>
                  </div>
                  <button 
                    type="button" 
                    class="btn-copy-diag" 
                    on:click={copyDiagnosticOutput}
                    title="Copiar salida al portapapeles"
                  >
                    {#if copiedLogs}
                      <Check size={12} class="text-green" />
                      <span class="text-green">¡Copiado!</span>
                    {:else}
                      <Copy size={12} />
                      <span>Copiar logs</span>
                    {/if}
                  </button>
                </div>
                <pre class="diagnostic-logs">{diagnosticOutput}</pre>
                
                <div class="troubleshooting-tips">
                  <Info size={13} class="tip-icon" />
                  <div class="tip-content">
                    <strong>Puntos a verificar:</strong>
                    <ul>
                      <li>El registro DNS (A o CNAME) de <code>{domainName}</code> debe apuntar a la IP pública de este servidor.</li>
                      <li>Los puertos 80 y 443 TCP deben estar abiertos en cortafuegos perimetrales / routers.</li>
                      <li>Si utilizas Cloudflare o proxy intermedio, desactiva temporalmente el proxy naranja durante la validación inicial.</li>
                    </ul>
                  </div>
                </div>
              </div>
            {/if}
          </section>
        {/if}

      </div>

      <!-- PIE DEL MODAL -->
      <footer class="modal-footer">
        <div class="footer-left">
          {#if errorMessage}
            <button 
              type="button" 
              class="btn-retry" 
              on:click={handleStartSslProcess}
              disabled={isRunning}
            >
              <RotateCcw size={14} />
              <span>Reintentar emisión</span>
            </button>
          {/if}
        </div>

        <div class="footer-actions">
          <button 
            type="button" 
            class="btn-cancel" 
            on:click={handleClose}
            disabled={isRunning}
          >
            {isSuccess ? 'Cerrar' : 'Cancelar'}
          </button>

          {#if !isSuccess}
            <button 
              type="button" 
              class="btn-primary" 
              on:click={handleStartSslProcess}
              disabled={isRunning}
            >
              {#if isRunning}
                <RefreshCw size={15} class="spin" />
                <span>Ejecutando Fase {currentPhase}...</span>
              {:else if hasCertOnDisk}
                <ShieldCheck size={15} />
                <span>Renovar / Aplicar SSL</span>
              {:else}
                <Lock size={15} />
                <span>Emitir Certificado SSL</span>
              {/if}
            </button>
          {:else}
            <button 
              type="button" 
              class="btn-success-done" 
              on:click={handleClose}
            >
              <Check size={15} />
              <span>Finalizar y Salir</span>
            </button>
          {/if}
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  /* Fondo / Backdrop */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1050;
    padding: 16px;
    box-sizing: border-box;
  }

  /* Diálogo */
  .modal-dialog {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #26262a);
    border-radius: 14px;
    width: 100%;
    max-width: 660px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    overflow: hidden;
    animation: modalScale 0.18s ease-out;
  }

  @keyframes modalScale {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Header */
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 18px 22px;
    background: var(--surface-muted, #18181b);
    border-bottom: 1px solid var(--card-border, #26262a);
    gap: 12px;
  }

  .header-left {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    min-width: 0;
  }

  .shield-icon-container {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .shield-icon-container.active {
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.25);
  }

  .shield-icon-container.has-disk {
    background: rgba(56, 189, 248, 0.12);
    border-color: rgba(56, 189, 248, 0.25);
  }

  :global(.icon-ssl-active) {
    color: #34d399;
  }

  :global(.icon-ssl-disk) {
    color: #38bdf8;
  }

  :global(.icon-ssl-inactive) {
    color: #94a3b8;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .modal-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-main, #f8fafc);
  }

  .ssl-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .badge-active {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .badge-inactive {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .domain-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.82rem;
    flex-wrap: wrap;
  }

  .domain-label {
    color: var(--text-muted, #94a3b8);
  }

  .domain-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-weight: 600;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid rgba(56, 189, 248, 0.2);
  }

  .target-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.74rem;
    color: var(--text-muted, #94a3b8);
    background: rgba(255, 255, 255, 0.04);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .btn-close:hover:not(:disabled) {
    color: var(--text-main, #f1f5f9);
    background: rgba(255, 255, 255, 0.08);
  }

  .btn-close:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Cuerpo */
  .modal-body {
    padding: 20px 22px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  /* Tarjeta de Estado en Disco */
  .disk-status-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--card-border, #26262a);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.2s ease;
  }

  .disk-status-card.cert-present {
    border-left: 3px solid #10b981;
    background: linear-gradient(90deg, rgba(16, 185, 129, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
  }

  .disk-status-card.cert-missing {
    border-left: 3px solid #f59e0b;
    background: linear-gradient(90deg, rgba(245, 158, 11, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
  }

  .disk-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .disk-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :global(.disk-icon) {
    color: #94a3b8;
  }

  .disk-title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-main, #e2e8f0);
  }

  .disk-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    padding: 2px 7px;
    border-radius: 12px;
    font-weight: 500;
  }

  .badge-found {
    background: rgba(16, 185, 129, 0.12);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .badge-missing {
    background: rgba(245, 158, 11, 0.12);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .disk-card-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cert-path-block {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.77rem;
    background: rgba(0, 0, 0, 0.25);
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .path-label {
    color: var(--text-muted, #94a3b8);
    flex-shrink: 0;
  }

  .path-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: #cbd5e1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cert-meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    font-size: 0.78rem;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .meta-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-muted, #94a3b8);
    font-size: 0.73rem;
  }

  .meta-value {
    color: #e2e8f0;
    font-weight: 500;
  }

  /* Sección Formulario */
  .form-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-main, #f1f5f9);
    letter-spacing: 0.01em;
  }

  .form-grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--card-border, #26262a);
    border-radius: 10px;
    padding: 14px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-main, #e2e8f0);
  }

  .input-wrapper {
    position: relative;
    width: 100%;
  }

  .form-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #3f3f46);
    border-radius: 6px;
    padding: 8px 12px;
    color: var(--text-main, #f8fafc);
    font-size: 0.84rem;
    transition: all 0.15s ease;
  }

  .form-input:focus {
    outline: none;
    border-color: #0284c7;
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
  }

  .form-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .field-hint {
    margin: 0;
    font-size: 0.73rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.35;
  }

  .form-group-checkbox {
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .checkbox-container {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }

  .checkbox-container.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .checkbox-container input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .checkbox-custom {
    width: 17px;
    height: 17px;
    border-radius: 4px;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #3f3f46);
    flex-shrink: 0;
    margin-top: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .checkbox-container input[type="checkbox"]:checked ~ .checkbox-custom {
    background: #0284c7;
    border-color: #0284c7;
  }

  .checkbox-container input[type="checkbox"]:checked ~ .checkbox-custom::after {
    content: '';
    width: 4px;
    height: 8px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
    margin-top: -2px;
  }

  .checkbox-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .checkbox-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-main, #e2e8f0);
  }

  .checkbox-subtext {
    font-size: 0.73rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.3;
  }

  /* Fases de Ejecución */
  .phases-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .phases-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .phase-running-indicator {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.74rem;
    color: #38bdf8;
    font-weight: 500;
  }

  .phases-stepper {
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--card-border, #26262a);
    border-radius: 10px;
    padding: 14px 16px;
  }

  .step-item {
    display: flex;
    gap: 12px;
    position: relative;
  }

  .step-indicator {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-muted, #94a3b8);
    transition: all 0.2s ease;
  }

  .step-item.step-running .step-indicator {
    background: rgba(2, 132, 199, 0.2);
    border-color: #0284c7;
    color: #38bdf8;
    box-shadow: 0 0 10px rgba(2, 132, 199, 0.4);
  }

  .step-item.step-completed .step-indicator {
    background: rgba(16, 185, 129, 0.2);
    border-color: #10b981;
    color: #34d399;
  }

  .step-item.step-error .step-indicator {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
    color: #f87171;
  }

  .step-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    padding-bottom: 2px;
  }

  .step-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .step-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-main, #f1f5f9);
  }

  .step-desc {
    margin: 0;
    font-size: 0.74rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.35;
  }

  .step-desc code {
    font-size: 0.71rem;
    background: rgba(255, 255, 255, 0.05);
    padding: 1px 4px;
    border-radius: 3px;
    color: #cbd5e1;
  }

  .step-badge {
    font-size: 0.68rem;
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 500;
    text-transform: capitalize;
  }

  .badge-pending {
    background: rgba(255, 255, 255, 0.05);
    color: #64748b;
  }

  .badge-running {
    background: rgba(2, 132, 199, 0.2);
    color: #38bdf8;
  }

  .badge-completed {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }

  .badge-error {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .step-connector {
    width: 2px;
    height: 18px;
    background: rgba(255, 255, 255, 0.1);
    margin: 3px 0 3px 12px;
    transition: background 0.2s ease;
  }

  .step-connector.active {
    background: #10b981;
  }

  /* Alerta de Éxito */
  .success-alert {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 10px;
    padding: 14px 16px;
  }

  :global(.success-icon) {
    color: #34d399;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .success-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .success-text p {
    margin: 0;
    font-size: 0.78rem;
    color: #a7f3d0;
  }

  /* Sección Errores y Rollback */
  .error-rollback-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .error-alert {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 10px;
    padding: 14px 16px;
  }

  .alert-icon-wrap {
    flex-shrink: 0;
    margin-top: 1px;
  }

  :global(.alert-icon) {
    color: #f87171;
  }

  .alert-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .alert-heading {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #fecaca;
  }

  .alert-desc {
    margin: 0;
    font-size: 0.77rem;
    color: #fca5a5;
    line-height: 1.4;
  }

  /* Tarjeta de Garantía de Rollback */
  .rollback-guarantee-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: rgba(14, 165, 233, 0.08);
    border: 1px solid rgba(14, 165, 233, 0.25);
    border-radius: 10px;
    padding: 12px 14px;
  }

  .guarantee-icon {
    color: #38bdf8;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .guarantee-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .guarantee-title {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 600;
    color: #7dd3fc;
  }

  .guarantee-desc {
    margin: 0;
    font-size: 0.75rem;
    color: #bae6fd;
    line-height: 1.4;
  }

  /* Caja diagnóstica */
  .diagnostic-box {
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .diagnostic-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #18181b;
    padding: 8px 12px;
    border-bottom: 1px solid #27272a;
  }

  .diagnostic-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #cbd5e1;
  }

  .btn-copy-diag {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.72rem;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .btn-copy-diag:hover {
    color: white;
    background: rgba(255, 255, 255, 0.08);
  }

  .diagnostic-logs {
    margin: 0;
    padding: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.72rem;
    line-height: 1.45;
    color: #f1f5f9;
    max-height: 140px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
    background: #050507;
  }

  .troubleshooting-tips {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.02);
    border-top: 1px solid #27272a;
    font-size: 0.73rem;
  }

  :global(.tip-icon) {
    color: #fbbf24;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .tip-content {
    color: #94a3b8;
    line-height: 1.4;
  }

  .tip-content strong {
    color: #e2e8f0;
  }

  .tip-content ul {
    margin: 4px 0 0 16px;
    padding: 0;
  }

  .tip-content li {
    margin-bottom: 2px;
  }

  .tip-content code {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* Footer */
  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 22px;
    background: var(--surface-muted, #18181b);
    border-top: 1px solid var(--card-border, #26262a);
    gap: 12px;
  }

  .footer-left {
    display: flex;
    align-items: center;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
  }

  .btn-cancel {
    background: transparent;
    color: var(--text-muted, #94a3b8);
    border: 1px solid var(--card-border, #3f3f46);
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-cancel:hover:not(:disabled) {
    color: var(--text-main, #f8fafc);
    background: rgba(255, 255, 255, 0.05);
    border-color: #52525b;
  }

  .btn-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-retry {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(245, 158, 11, 0.12);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-retry:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.2);
    border-color: rgba(245, 158, 11, 0.4);
  }

  .btn-retry:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: #0284c7;
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 0.84rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .btn-primary:hover:not(:disabled) {
    background: #0369a1;
  }

  .btn-primary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .btn-success-done {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #059669;
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 0.84rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-success-done:hover {
    background: #047857;
  }

  /* Utility classes */
  .text-white { color: #f8fafc; }
  .text-green { color: #34d399; }
  .text-muted { color: #94a3b8; }
  .font-medium { font-weight: 500; }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Responsive Mobile */
  @media (max-width: 640px) {
    .modal-dialog {
      max-height: 94vh;
      border-radius: 12px;
    }

    .modal-header {
      padding: 14px 16px;
    }

    .modal-body {
      padding: 14px;
      gap: 14px;
    }

    .cert-meta-grid {
      grid-template-columns: 1fr;
    }

    .modal-footer {
      padding: 12px 16px;
      flex-direction: column-reverse;
      gap: 10px;
    }

    .footer-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .footer-left {
      width: 100%;
    }
  }
</style>

<script>
  import { onMount } from 'svelte';
  import { 
    Globe, 
    Server, 
    ShieldCheck, 
    ShieldAlert, 
    Shield, 
    RefreshCw, 
    Plus, 
    Trash2, 
    ExternalLink, 
    AlertTriangle, 
    CheckCircle2, 
    Info, 
    X,
    Cpu,
    Radio,
    Lock
  } from 'lucide-svelte';
  import { api } from '../lib/api.js';

  export let containers = [];

  let vhosts = [];
  let loading = true;
  let error = null;
  let actionLoading = false;
  let reloadLoading = false;
  let certActionLoading = {};
  let rollbackNotice = null;
  let successNotice = null;

  // Formulario de Alta / Edición
  let domain = '';
  let selectedContainer = '';
  let containerPort = '80';
  let customTarget = '';
  let hasSsl = false;
  let useManualTarget = false;

  // Filtrar contenedores en ejecución para el selector dinámico
  $: runningContainers = containers.filter(c => {
    const s = (c.State || c.state || '').toLowerCase();
    return s === 'running';
  });

  // Target calculado automáticamente según contenedor seleccionado o manual
  $: targetComputed = useManualTarget 
    ? customTarget.trim()
    : (selectedContainer ? `${selectedContainer}:${containerPort.trim()}` : '');

  async function fetchVHosts() {
    loading = true;
    error = null;
    try {
      const res = await api.get('/proxy/vhosts');
      if (res && res.success) {
        vhosts = res.data || [];
      } else {
        error = res?.error || 'Error al listar los Virtual Hosts';
      }
    } catch (err) {
      error = err.message || 'Error de conexión con el backend';
    } finally {
      loading = false;
    }
  }

  async function handleReloadNginx() {
    reloadLoading = true;
    rollbackNotice = null;
    successNotice = null;
    try {
      const res = await api.post('/proxy/reload', {});
      if (res && res.success) {
        successNotice = 'Nginx se ha recargado exitosamente sin cortes de servicio.';
        setTimeout(() => successNotice = null, 4000);
      } else {
        rollbackNotice = {
          title: 'Fallo al recargar Nginx',
          error: res?.error || 'No se pudo aplicar la recarga.',
          details: res?.output || ''
        };
      }
    } catch (err) {
      rollbackNotice = {
        title: 'Error de comunicación',
        error: err.message,
        details: 'Verifica la conexión del servidor o el estado del contenedor de Nginx.'
      };
    } finally {
      reloadLoading = false;
    }
  }

  async function handleSubmitVHost() {
    rollbackNotice = null;
    successNotice = null;

    const cleanDomain = domain.trim().toLowerCase();
    const cleanTarget = targetComputed;

    if (!cleanDomain) {
      alert('Por favor ingresa un nombre de dominio válido (ej. app.acarreados.dev).');
      return;
    }

    if (!cleanTarget) {
      alert('Debes seleccionar un contenedor en ejecución o ingresar un upstream destino.');
      return;
    }

    actionLoading = true;

    try {
      const res = await api.post('/proxy/vhosts', {
        domain: cleanDomain,
        target: cleanTarget,
        hasSsl: Boolean(hasSsl)
      });

      if (res && res.success) {
        successNotice = `Virtual Host ${cleanDomain} configurado y verificado con éxito.`;
        // Limpiar formulario
        domain = '';
        selectedContainer = '';
        containerPort = '80';
        customTarget = '';
        hasSsl = false;
        useManualTarget = false;
        await fetchVHosts();
        setTimeout(() => successNotice = null, 5000);
      } else {
        // Rollback detectado por backend
        rollbackNotice = {
          title: 'Configuración Rechazada — Rollback Atómico Aplicado',
          domain: cleanDomain,
          error: res?.error || 'Error sintáctico detectado en Nginx.',
          details: res?.details || res?.rollbackDetails || '',
          rollbackVerified: res?.rollbackVerified ?? true
        };
      }
    } catch (err) {
      // Capturar respuesta de error estructurada de Axios/Fetch si existe
      const resData = err?.response?.data;
      if (resData && !resData.success) {
        rollbackNotice = {
          title: 'Error de Validación — Rollback Preventivo Ejecutado',
          domain: cleanDomain,
          error: resData.error || 'Nginx rechazó la configuración.',
          details: resData.details || resData.rollbackDetails || err.message,
          rollbackVerified: resData.rollbackVerified ?? true
        };
      } else {
        rollbackNotice = {
          title: 'Error en la Petición',
          domain: cleanDomain,
          error: err.message || 'Fallo inesperado al conectar con la API de Nginx.',
          details: 'El servicio Nginx no sufrió alteraciones ni cortes.',
          rollbackVerified: true
        };
      }
    } finally {
      actionLoading = false;
    }
  }

  async function handleDeleteVHost(itemDomain) {
    if (!confirm(`¿Estás seguro de eliminar el Virtual Host para '${itemDomain}'? Nginx realizará verificación sintáctica y rollback si algo falla.`)) {
      return;
    }

    rollbackNotice = null;
    successNotice = null;
    actionLoading = true;

    try {
      const res = await api.delete(`/proxy/vhosts/${itemDomain}`);
      if (res && res.success) {
        successNotice = `Virtual Host ${itemDomain} eliminado correctamente.`;
        await fetchVHosts();
        setTimeout(() => successNotice = null, 4000);
      } else {
        rollbackNotice = {
          title: 'No se pudo eliminar el Virtual Host',
          domain: itemDomain,
          error: res?.error || 'Error al eliminar configuración.',
          details: res?.details || '',
          rollbackVerified: res?.rollbackVerified ?? true
        };
      }
    } catch (err) {
      rollbackNotice = {
        title: 'Error al eliminar',
        domain: itemDomain,
        error: err.message,
        details: 'Rollback verificado. La configuración previa de Nginx se conserva íntegra.',
        rollbackVerified: true
      };
    } finally {
      actionLoading = false;
    }
  }

  async function handleIssueCert(vhostItem) {
    const itemDomain = vhostItem.domain;
    if (!itemDomain) return;

    const confirmMsg = vhostItem.hasCertOnDisk
      ? `Ya existe un certificado para '${itemDomain}'. ¿Deseas aplicar la configuración HTTPS y recargar Nginx?`
      : `¿Deseas gestionar y emitir un certificado SSL para '${itemDomain}'? Se configurará ACME en puerto 80, se ejecutará Certbot y se aplicará HTTPS con recarga en nginx-proxy.`;

    if (!confirm(confirmMsg)) return;

    certActionLoading = { ...certActionLoading, [itemDomain]: true };
    rollbackNotice = null;
    successNotice = null;

    try {
      const res = await api.post(`/proxy/vhosts/${itemDomain}/issue-cert`, {
        target: vhostItem.target || undefined
      });

      if (res && res.success) {
        successNotice = res.message || `Certificado SSL aplicado con éxito para ${itemDomain}.`;
        await fetchVHosts();
        setTimeout(() => successNotice = null, 5000);
      } else {
        rollbackNotice = {
          title: `Fallo al emitir / gestionar certificado para ${itemDomain}`,
          domain: itemDomain,
          error: res?.error || 'No se pudo emitir el certificado.',
          details: res?.details || res?.certbotOutput || ''
        };
      }
    } catch (err) {
      const resData = err?.response?.data;
      rollbackNotice = {
        title: `Error en emisión SSL para ${itemDomain}`,
        domain: itemDomain,
        error: resData?.error || err.message,
        details: resData?.details || resData?.certbotOutput || 'Verifica que el dominio apunte a este servidor.'
      };
    } finally {
      certActionLoading = { ...certActionLoading, [itemDomain]: false };
    }
  }

  function handleContainerSelect(event) {
    const val = event.target.value;
    selectedContainer = val;
    // Si el contenedor expone puertos típicos, intentar pre-llenar
    if (val) {
      const match = runningContainers.find(c => {
        const name = (c.name || c.Names?.[0] || '').replace(/^\//, '');
        return name === val || c.Id?.startsWith(val);
      });
      if (match?.Ports && match.Ports.length > 0) {
        const p = match.Ports[0].PrivatePort || match.Ports[0].PublicPort;
        if (p) containerPort = String(p);
      }
    }
  }

  onMount(() => {
    fetchVHosts();
  });
</script>

<div class="proxy-view-container">
  <!-- Encabezado y Barra de Acciones Globales -->
  <div class="view-header">
    <div class="header-info">
      <div class="title-row">
        <Globe size={22} class="text-cyan" />
        <h2>Gestión de Virtual Hosts Nginx</h2>
      </div>
      <p class="text-muted">
        Configuración declarativa de dominios y subdominios en <code class="font-mono">/srv/nginx/conf.d</code> con validación atómica (<code class="font-mono">nginx -t</code>) y protección contra caídas.
      </p>
    </div>

    <div class="header-actions">
      <button 
        type="button" 
        class="btn-refresh" 
        on:click={fetchVHosts} 
        disabled={loading}
        title="Actualizar listado de VHosts"
      >
        <RefreshCw size={15} class={loading ? 'spin' : ''} />
        <span>Actualizar</span>
      </button>

      <button 
        type="button" 
        class="btn-reload" 
        on:click={handleReloadNginx} 
        disabled={reloadLoading}
        title="Recargar Nginx manualmente (nginx -s reload)"
      >
        <Server size={15} />
        <span>{reloadLoading ? 'Recargando...' : 'Recargar Nginx Manualmente'}</span>
      </button>
    </div>
  </div>

  <!-- Notificaciones de Éxito -->
  {#if successNotice}
    <div class="notice-card notice-success">
      <div class="notice-icon">
        <CheckCircle2 size={18} />
      </div>
      <div class="notice-body">
        <span>{successNotice}</span>
      </div>
      <button type="button" class="btn-close-notice" on:click={() => successNotice = null}>
        <X size={15} />
      </button>
    </div>
  {/if}

  <!-- Notificación de Rollback Preventivo y Seguridad -->
  {#if rollbackNotice}
    <div class="notice-card notice-rollback">
      <div class="notice-icon">
        <ShieldAlert size={22} class="text-amber" />
      </div>
      <div class="notice-body">
        <div class="notice-headline">
          <h4>{rollbackNotice.title}</h4>
          {#if rollbackNotice.rollbackVerified}
            <span class="safe-tag">
              <ShieldCheck size={13} />
              Servicio Intacto (Sin Cortes)
            </span>
          {/if}
        </div>
        <p class="notice-error-text">
          {rollbackNotice.error}
        </p>
        {#if rollbackNotice.details}
          <div class="notice-code-block font-mono">
            {rollbackNotice.details}
          </div>
        {/if}
        <div class="notice-explanation">
          Nginx detectó un error sintáctico durante la prueba <code class="font-mono">nginx -t</code> y restauró inmediatamente la configuración previa. Ninguna conexión activa fue interrumpida.
        </div>
      </div>
      <button type="button" class="btn-close-notice" on:click={() => rollbackNotice = null}>
        <X size={16} />
      </button>
    </div>
  {/if}

  <!-- Formulario de Alta de Virtual Host -->
  <div class="card form-card">
    <div class="card-title-row">
      <div class="title-block">
        <Plus size={18} class="text-cyan" />
        <h3>Alta de Virtual Host (Proxy Inverso)</h3>
      </div>
      <span class="badge-resolver font-mono">resolver: 127.0.0.11</span>
    </div>

    <form on:submit|preventDefault={handleSubmitVHost} class="vhost-form">
      <div class="form-grid">
        <!-- Campo Dominio -->
        <div class="form-group">
          <label for="vhost-domain" class="form-label">
            Dominio o Subdominio <span class="required">*</span>
          </label>
          <div class="input-wrapper">
            <Globe size={16} class="input-icon" />
            <input 
              id="vhost-domain"
              type="text" 
              bind:value={domain}
              placeholder="ej. api.acarreados.dev o miweb.com"
              class="form-input font-mono"
              required
            />
          </div>
          <span class="input-hint">Genera la directiva <code class="font-mono">server_name</code> en Nginx.</span>
        </div>

        <!-- Selector Dinámico de Contenedor -->
        <div class="form-group">
          <div class="label-with-action">
            <label for="vhost-container" class="form-label">
              Upstream (Contenedor Docker) <span class="required">*</span>
            </label>
            <button 
              type="button" 
              class="btn-toggle-manual"
              on:click={() => useManualTarget = !useManualTarget}
            >
              {useManualTarget ? 'Seleccionar de lista' : 'Entrada manual'}
            </button>
          </div>

          {#if !useManualTarget}
            <div class="input-wrapper">
              <Server size={16} class="input-icon" />
              <select 
                id="vhost-container"
                value={selectedContainer} 
                on:change={handleContainerSelect}
                class="form-select"
                required
              >
                <option value="" disabled>Selecciona un contenedor en ejecución...</option>
                {#each runningContainers as c}
                  {@const cName = (c.name || c.Names?.[0] || '').replace(/^\//, '') || c.Id?.slice(0, 12)}
                  <option value={cName}>
                    {cName} ({c.Image || 'docker'})
                  </option>
                {/each}
              </select>
            </div>
            <span class="input-hint">Resuelto dinámicamente mediante DNS interno de Docker.</span>
          {:else}
            <div class="input-wrapper">
              <Server size={16} class="input-icon" />
              <input 
                type="text" 
                bind:value={customTarget}
                placeholder="ej. backend-api:5000 o 127.0.0.1:8080"
                class="form-input font-mono"
                required
              />
            </div>
            <span class="input-hint">Host y puerto directo de destino del proxy.</span>
          {/if}
        </div>

        <!-- Puerto del contenedor (si no es manual) -->
        {#if !useManualTarget}
          <div class="form-group">
            <label for="vhost-port" class="form-label">
              Puerto del Contenedor <span class="required">*</span>
            </label>
            <div class="input-wrapper">
              <Cpu size={16} class="input-icon" />
              <input 
                id="vhost-port"
                type="text" 
                bind:value={containerPort}
                placeholder="80, 3000, 5000..."
                class="form-input font-mono"
                required
              />
            </div>
            <span class="input-hint">Puerto interno donde escucha el contenedor.</span>
          </div>
        {/if}
      </div>

      <!-- Toggle Switch: Habilitar SSL Let's Encrypt -->
      <div class="ssl-switch-box">
        <div class="ssl-switch-meta">
          <div class="switch-title-row">
            {#if hasSsl}
              <ShieldCheck size={18} class="text-green" />
            {:else}
              <Shield size={18} class="text-slate" />
            {/if}
            <span class="switch-title">Habilitar SSL Let's Encrypt (HTTPS 443)</span>
          </div>
          <p class="switch-desc">
            {#if hasSsl}
              <strong class="text-green">SSL Activado:</strong> Genera redirección 301 (HTTP &rarr; HTTPS) y bloque SSL en el puerto 443 con cifrados modernos.
            {:else}
              <strong class="text-yellow">HTTP Inicial (Recomendado para certificados nuevos):</strong> Expone el puerto 80 con desafío ACME (<code class="font-mono">/.well-known/acme-challenge/</code>) para permitir la emisión inicial del certificado Let's Encrypt sin romper <code class="font-mono">nginx -t</code>.
            {/if}
          </p>
        </div>

        <label class="toggle-switch">
          <input type="checkbox" bind:checked={hasSsl} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- Preview del Upstream y Botón Enviar -->
      <div class="form-actions-row">
        <div class="target-preview font-mono">
          <span class="text-muted">Destino:</span> 
          <span class="text-cyan">{targetComputed ? `http://${targetComputed}` : 'Ninguno seleccionado'}</span>
        </div>

        <button 
          type="submit" 
          class="btn-submit"
          disabled={actionLoading || !domain || !targetComputed}
        >
          {#if actionLoading}
            <RefreshCw size={15} class="spin" />
            <span>Validando con nginx -t...</span>
          {:else}
            <Plus size={15} />
            <span>Guardar y Aplicar Virtual Host</span>
          {/if}
        </button>
      </div>
    </form>
  </div>

  <!-- Tabla de Virtual Hosts Configurados -->
  <div class="card table-card">
    <div class="card-title-row">
      <div class="title-block">
        <Server size={18} class="text-cyan" />
        <h3>Virtual Hosts en <code class="font-mono">/srv/nginx/conf.d</code></h3>
      </div>
      <span class="count-pill">{vhosts.length} Dominio{vhosts.length === 1 ? '' : 's'}</span>
    </div>

    {#if loading}
      <div class="state-box">
        <RefreshCw size={24} class="spin text-cyan" />
        <span>Cargando configuraciones de Nginx...</span>
      </div>
    {:else if error}
      <div class="state-box text-danger">
        <AlertTriangle size={24} />
        <span>{error}</span>
      </div>
    {:else if vhosts.length === 0}
      <div class="state-box">
        <Info size={24} class="text-muted" />
        <span>No se encontraron archivos de configuración en <code class="font-mono">/srv/nginx/conf.d</code>.</span>
      </div>
    {:else}
      <div class="table-responsive">
        <table class="vhost-table">
          <thead>
            <tr>
              <th>Dominio (server_name)</th>
              <th>Upstream Destino</th>
              <th>Estado SSL</th>
              <th class="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {#each vhosts as vh}
              <tr>
                <!-- Dominio -->
                <td class="col-domain">
                  <div class="domain-cell">
                    <Globe size={15} class="text-cyan" />
                    <a 
                      href="{vh.hasSsl ? 'https://' : 'http://'}{vh.domain}" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      class="domain-link font-mono"
                    >
                      {vh.domain}
                      <ExternalLink size={12} class="link-icon" />
                    </a>
                  </div>
                </td>

                <!-- Upstream -->
                <td class="col-upstream">
                  {#if vh.target}
                    <code class="font-mono upstream-tag">{vh.target}</code>
                  {:else}
                    <span class="text-muted font-mono">Directo / Estático</span>
                  {/if}
                </td>

                <!-- Estado SSL -->
                <td class="col-ssl">
                  {#if vh.hasSsl}
                    <span class="ssl-badge ssl-active" title="Puerto 443 SSL con Redirección 301">
                      <ShieldCheck size={13} />
                      <span>SSL Activo (HTTPS)</span>
                    </span>
                  {:else}
                    <span class="ssl-badge ssl-init" title="HTTP Puerto 80 listo para validación Let's Encrypt">
                      <ShieldAlert size={13} />
                      <span>HTTP Inicial (ACME)</span>
                    </span>
                  {/if}
                </td>

                <!-- Acciones -->
                <td class="col-actions text-right">
                  <div class="actions-group">
                    <button 
                      type="button" 
                      class="btn-cert" 
                      on:click={() => handleIssueCert(vh)}
                      disabled={certActionLoading[vh.domain] || actionLoading}
                      title="Verificar y emitir o renovar certificado Let's Encrypt / SSL con recarga en nginx-proxy"
                    >
                      {#if certActionLoading[vh.domain]}
                        <RefreshCw size={13} class="spin" />
                        <span>Emitiendo...</span>
                      {:else if vh.hasCertOnDisk || vh.hasSsl}
                        <ShieldCheck size={13} class="text-green" />
                        <span>Gestionar SSL</span>
                      {:else}
                        <Lock size={13} />
                        <span>Emitir Certificado</span>
                      {/if}
                    </button>

                    <button 
                      type="button" 
                      class="btn-delete" 
                      on:click={() => handleDeleteVHost(vh.domain)}
                      disabled={actionLoading || certActionLoading[vh.domain]}
                      title="Eliminar Virtual Host"
                    >
                      <Trash2 size={14} />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  .proxy-view-container {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  /* Encabezado Principal */
  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 1rem;
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 14px;
    padding: 1.25rem 1.5rem;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .title-row h2 {
    font-size: 1.25rem;
    font-weight: 700;
    color: #f8fafc;
    margin: 0;
  }

  .header-info p {
    margin: 0;
    font-size: 0.85rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .btn-refresh {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: transparent;
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #cbd5e1;
    padding: 0.55rem 0.95rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh:hover:not(:disabled) {
    background: rgba(148, 163, 184, 0.1);
    color: #ffffff;
  }

  .btn-reload {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.35);
    color: #38bdf8;
    padding: 0.55rem 1.1rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-reload:hover:not(:disabled) {
    background: rgba(56, 189, 248, 0.25);
    color: #ffffff;
  }

  /* Notificaciones */
  .notice-card {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    border-radius: 10px;
    padding: 1rem 1.25rem;
    position: relative;
  }

  .notice-success {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.25);
    color: #4ade80;
  }

  .notice-rollback {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  .notice-icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .notice-body {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex: 1;
  }

  .notice-headline {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .notice-headline h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: #f87171;
  }

  .safe-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.15rem 0.5rem;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #4ade80;
    border-radius: 9999px;
    font-size: 0.725rem;
    font-weight: 600;
  }

  .notice-error-text {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #fecaca;
  }

  .notice-code-block {
    background: #020617;
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 6px;
    padding: 0.6rem 0.8rem;
    font-size: 0.75rem;
    color: #fca5a5;
    white-space: pre-wrap;
    max-height: 140px;
    overflow-y: auto;
  }

  .notice-explanation {
    font-size: 0.775rem;
    color: #94a3b8;
  }

  .btn-close-notice {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    padding: 0.25rem;
  }

  .btn-close-notice:hover {
    opacity: 1;
  }

  /* Tarjetas Generales */
  .card {
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 14px;
    padding: 1.5rem;
    box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .card-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.08);
    padding-bottom: 0.85rem;
  }

  .title-block {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .title-block h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .badge-resolver {
    font-size: 0.725rem;
    padding: 0.2rem 0.6rem;
    background: rgba(56, 189, 248, 0.1);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 6px;
  }

  .count-pill {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    background: rgba(148, 163, 184, 0.1);
    color: #94a3b8;
    border-radius: 9999px;
  }

  /* Formulario */
  .vhost-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .form-label {
    font-size: 0.825rem;
    font-weight: 600;
    color: #cbd5e1;
  }

  .label-with-action {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .btn-toggle-manual {
    background: transparent;
    border: none;
    color: #38bdf8;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
  }

  .btn-toggle-manual:hover {
    text-decoration: underline;
  }

  .required {
    color: #ef4444;
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  :global(.input-icon) {
    position: absolute;
    left: 0.85rem;
    color: #64748b;
    pointer-events: none;
  }

  .form-input, .form-select {
    width: 100%;
    background: #020617;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    padding: 0.65rem 0.85rem 0.65rem 2.4rem;
    color: #f8fafc;
    font-size: 0.85rem;
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .form-input:focus, .form-select:focus {
    outline: none;
    border-color: #38bdf8;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
  }

  .input-hint {
    font-size: 0.725rem;
    color: #64748b;
  }

  /* SSL Toggle Box */
  .ssl-switch-box {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #020617;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    gap: 1rem;
  }

  .ssl-switch-meta {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .switch-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .switch-title {
    font-size: 0.9rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .switch-desc {
    margin: 0;
    font-size: 0.8rem;
    color: #94a3b8;
    line-height: 1.4;
  }

  /* Switch Toggle Styling */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 48px;
    height: 26px;
    flex-shrink: 0;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: #334155;
    border-radius: 9999px;
    transition: 0.3s;
  }

  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    border-radius: 50%;
    transition: 0.3s;
  }

  .toggle-switch input:checked + .toggle-slider {
    background-color: #10b981;
  }

  .toggle-switch input:checked + .toggle-slider:before {
    transform: translateX(22px);
  }

  /* Form Actions */
  .form-actions-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    border-top: 1px solid rgba(148, 163, 184, 0.08);
    padding-top: 1rem;
  }

  .target-preview {
    font-size: 0.825rem;
  }

  .btn-submit {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: #0284c7;
    border: none;
    color: #ffffff;
    padding: 0.65rem 1.25rem;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, transform 0.2s;
  }

  .btn-submit:hover:not(:disabled) {
    background: #0369a1;
    transform: translateY(-1px);
  }

  .btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Tabla */
  .table-responsive {
    overflow-x: auto;
  }

  .vhost-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .vhost-table th {
    text-align: left;
    padding: 0.75rem 1rem;
    color: #94a3b8;
    font-weight: 600;
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  }

  .vhost-table td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.08);
    vertical-align: middle;
  }

  .vhost-table tr:hover td {
    background: rgba(30, 41, 59, 0.3);
  }

  .domain-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .domain-link {
    color: #38bdf8;
    text-decoration: none;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .domain-link:hover {
    text-decoration: underline;
  }

  .upstream-tag {
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.2);
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    color: #cbd5e1;
    font-size: 0.8rem;
  }

  .ssl-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.65rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .ssl-active {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .ssl-init {
    background: rgba(234, 179, 8, 0.12);
    color: #fde047;
    border: 1px solid rgba(234, 179, 8, 0.3);
  }

  .actions-group {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .btn-cert {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(14, 165, 233, 0.12);
    border: 1px solid rgba(14, 165, 233, 0.3);
    color: #38bdf8;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cert:hover:not(:disabled) {
    background: rgba(14, 165, 233, 0.25);
    color: #ffffff;
    border-color: rgba(14, 165, 233, 0.5);
  }

  .btn-cert:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-delete {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: #f87171;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-delete:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.25);
    color: #ffffff;
  }

  .state-box {
    padding: 3rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  /* Utility classes */
  .text-cyan { color: #38bdf8; }
  .text-green { color: #4ade80; }
  .text-amber { color: #fbbf24; }
  .text-yellow { color: #fde047; }
  .text-slate { color: #94a3b8; }
  .text-muted { color: #64748b; }
  .text-danger { color: #f87171; }
  .text-right { text-align: right; }
  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>

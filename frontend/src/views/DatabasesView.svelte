<script>
  import { onMount, onDestroy } from 'svelte';
  import { 
    Database, 
    Layers, 
    Activity, 
    RefreshCw, 
    HardDrive, 
    Clock, 
    CheckCircle, 
    AlertTriangle,
    Zap,
    Download,
    Trash2,
    Plus,
    Users,
    Shield,
    ShieldAlert,
    ShieldCheck,
    FileText,
    Key,
    Lock,
    X,
    FolderArchive,
    Server,
    Globe,
    Copy,
    Check
  } from 'lucide-svelte';
  import { api } from '../lib/api.js';

  export let containers = [];

  // Navegación de pestañas internas: 'schemas' | 'users'
  let activeSubTab = 'schemas';

  // Estados de datos
  let telemetry = null;
  let schemas = [];
  let backups = [];
  let users = [];

  // Estados de carga y feedback
  let loadingTelemetry = true;
  let loadingSchemas = false;
  let loadingBackups = false;
  let loadingUsers = false;
  let actionLoading = false;

  let backupInProgress = {}; // { [schemaName]: boolean }
  let noticeMessage = null; // { type: 'success' | 'error', text: '' }

  // Formulario: Crear Esquema
  let showCreateSchemaModal = false;
  let selectedSite = ''; // 'wp_site_1', etc. o 'independent'
  let newSchemaName = '';
  let newSchemaCharset = 'utf8mb4';
  let newSchemaCollation = 'utf8mb4_unicode_ci';
  let newSchemaUser = '';
  let newSchemaPassword = '';
  let copiedGeneratedPassword = false;

  // Lista de sitios disponibles a partir de los contenedores
  $: availableSites = (containers || []).map(c => {
    const rawName = c.name || (c.Names && c.Names[0]) || '';
    const clean = rawName.replace(/^\//, '');
    return clean;
  }).filter(n => n && !['cpanel-backend', 'cpanel-frontend', 'nginx-proxy', 'mariadb', 'salones_db', 'tlya_redis'].includes(n));

  function generateSecureDbPassword() {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~|}{[]';
    let result = '';
    const randomValues = new Uint32Array(18);
    window.crypto.getRandomValues(randomValues);
    for (let i = 0; i < 18; i++) {
      result += charset[randomValues[i] % charset.length];
    }
    return result;
  }

  function handleSiteSelectionChange(event) {
    const siteVal = event.target.value;
    selectedSite = siteVal;

    if (siteVal && siteVal !== 'independent') {
      // Extraer sufijo o identificador: ej. wp_site_4 -> 4; tienda -> tienda
      const suffixMatch = siteVal.match(/^wp_site_(.+)$/i);
      const suffix = suffixMatch ? suffixMatch[1] : siteVal.replace(/^wp_/, '');

      newSchemaName = `wp_db_${suffix}`;
      newSchemaUser = `wp_user_${suffix}`;
      if (!newSchemaPassword) {
        newSchemaPassword = generateSecureDbPassword();
      }
    } else if (siteVal === 'independent') {
      newSchemaName = '';
      newSchemaUser = '';
      newSchemaPassword = '';
    }
  }

  function handleOpenCreateSchemaModal() {
    selectedSite = '';
    newSchemaName = '';
    newSchemaUser = '';
    newSchemaPassword = '';
    copiedGeneratedPassword = false;
    showCreateSchemaModal = true;
  }

  function copyPasswordToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    copiedGeneratedPassword = true;
    setTimeout(() => { copiedGeneratedPassword = false; }, 2000);
  }

  // Detectar sitio/contenedor asociado a una base de datos
  function getAssociatedSite(dbName) {
    if (!dbName) return null;
    const cleanDb = dbName.toLowerCase();
    if (['information_schema', 'mysql', 'performance_schema', 'sys', 'test'].includes(cleanDb)) {
      return null;
    }

    // Caso 1: wp_db_<id> -> wp_site_<id>
    const wpDbMatch = cleanDb.match(/^wp_db_(.+)$/);
    if (wpDbMatch) {
      const id = wpDbMatch[1];
      const targetSite = `wp_site_${id}`;
      // Verificar si existe en contenedores
      const exists = (containers || []).some(c => {
        const name = (c.name || c.Names?.[0] || '').replace(/^\//, '').toLowerCase();
        return name === targetSite.toLowerCase();
      });
      return {
        name: targetSite,
        matched: exists,
        isWordpress: true
      };
    }

    // Caso 2: Contenedor con nombre coincidente o env var
    for (const c of containers || []) {
      const cName = (c.name || c.Names?.[0] || '').replace(/^\//, '');
      if (cName.toLowerCase().includes(cleanDb) || cleanDb.includes(cName.toLowerCase())) {
        return { name: cName, matched: true, isWordpress: /wordpress/i.test(cName) };
      }
    }

    return null;
  }

  // Formulario: Crear Usuario
  let showCreateUserModal = false;
  let newUsername = '';
  let newUserPassword = '';
  let newUserHost = '%';
  let newUserDatabase = '';
  let newUserPrivileges = ['ALL PRIVILEGES'];

  let intervalId = null;

  function showNotice(text, type = 'success', duration = 4500) {
    noticeMessage = { type, text };
    setTimeout(() => {
      if (noticeMessage?.text === text) {
        noticeMessage = null;
      }
    }, duration);
  }

  // 1. Telemetría de MariaDB
  async function fetchTelemetry() {
    try {
      const res = await api.get('/databases/status');
      if (res && res.success) {
        telemetry = res.data;
      }
    } catch (err) {
      console.warn('Error al consultar telemetría MariaDB:', err.message);
    } finally {
      loadingTelemetry = false;
    }
  }

  // 2. Esquemas (Bases de datos)
  async function fetchSchemas() {
    loadingSchemas = true;
    try {
      const res = await api.get('/databases/schemas');
      if (res && res.success) {
        schemas = res.data || [];
      }
    } catch (err) {
      showNotice(`Error al listar bases de datos: ${err.message}`, 'error');
    } finally {
      loadingSchemas = false;
    }
  }

  // 3. Copias de Seguridad (Backups)
  async function fetchBackups() {
    loadingBackups = true;
    try {
      const res = await api.get('/databases/backups');
      if (res && res.success) {
        backups = res.data || [];
      }
    } catch (err) {
      showNotice(`Error al listar backups: ${err.message}`, 'error');
    } finally {
      loadingBackups = false;
    }
  }

  // 4. Usuarios de MariaDB
  async function fetchUsers() {
    loadingUsers = true;
    try {
      const res = await api.get('/databases/users');
      if (res && res.success) {
        users = res.data || [];
      }
    } catch (err) {
      showNotice(`Error al listar usuarios: ${err.message}`, 'error');
    } finally {
      loadingUsers = false;
    }
  }

  async function refreshAll() {
    await Promise.all([
      fetchTelemetry(),
      fetchSchemas(),
      fetchBackups(),
      fetchUsers()
    ]);
  }

  // Acciones sobre Esquemas
  async function handleCreateSchema() {
    if (!selectedSite) {
      alert('Debes seleccionar un "Sitio / Contenedor Destino" o elegir "Independiente / Ninguno".');
      return;
    }

    const cleanName = newSchemaName.trim().toLowerCase();
    if (!cleanName) {
      alert('Ingresa un nombre para la base de datos.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(cleanName)) {
      alert('El nombre solo puede contener letras, números y guiones bajos (_).');
      return;
    }

    actionLoading = true;
    try {
      const payload = {
        name: cleanName,
        charset: newSchemaCharset,
        collation: newSchemaCollation,
        site: selectedSite !== 'independent' ? selectedSite : null
      };

      if (newSchemaUser.trim() && newSchemaPassword.trim()) {
        payload.username = newSchemaUser.trim();
        payload.password = newSchemaPassword.trim();
        payload.host = '%';
      }

      const res = await api.post('/databases/schemas', payload);

      if (res && res.success) {
        showNotice(res.message || `Base de datos "${cleanName}" creada exitosamente.`, 'success');
        newSchemaName = '';
        newSchemaUser = '';
        newSchemaPassword = '';
        selectedSite = '';
        showCreateSchemaModal = false;
        await fetchSchemas();
        await fetchUsers();
        await fetchTelemetry();
      } else {
        showNotice(res?.error || 'No se pudo crear la base de datos.', 'error');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      showNotice(`Error al crear base de datos: ${msg}`, 'error');
    } finally {
      actionLoading = false;
    }
  }

  async function handleTriggerBackup(schemaName) {
    if (backupInProgress[schemaName]) return;

    backupInProgress[schemaName] = true;
    showNotice(`Generando copia de seguridad para "${schemaName}"...`, 'success', 3000);

    try {
      const res = await api.post('/databases/backups', {
        database: schemaName
      });

      if (res && res.success) {
        showNotice(`¡Backup de "${schemaName}" creado exitosamente!`, 'success');
        await fetchBackups();
      } else {
        showNotice(res?.error || `Error al respaldar "${schemaName}".`, 'error');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      showNotice(`Fallo en el respaldo: ${msg}`, 'error');
    } finally {
      backupInProgress[schemaName] = false;
    }
  }

  // Acciones sobre Backups
  function handleDownloadBackup(filename) {
    const token = api.getToken();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const downloadUrl = `/api/databases/backups/${encodeURIComponent(filename)}/download`;

    // Descarga autenticada mediante Blob
    fetch(downloadUrl, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(err => {
        showNotice(`Error al descargar ${filename}: ${err.message}`, 'error');
      });
  }

  async function handleDeleteBackup(filename) {
    if (!confirm(`¿Eliminar definitivamente el archivo de respaldo "${filename}"?`)) {
      return;
    }

    try {
      const res = await api.delete(`/databases/backups/${encodeURIComponent(filename)}`);
      if (res && res.success) {
        showNotice(`Archivo "${filename}" eliminado correctamente.`, 'success');
        await fetchBackups();
      } else {
        showNotice(res?.error || 'No se pudo eliminar el archivo.', 'error');
      }
    } catch (err) {
      showNotice(`Error al eliminar backup: ${err.message}`, 'error');
    }
  }

  // Acciones sobre Usuarios
  async function handleCreateUser() {
    const user = newUsername.trim();
    const pass = newUserPassword.trim();
    const host = newUserHost.trim() || '%';
    const db = newUserDatabase || undefined;

    if (!user || !pass) {
      alert('El nombre de usuario y la contraseña son obligatorios.');
      return;
    }

    actionLoading = true;
    try {
      const res = await api.post('/databases/users', {
        username: user,
        password: pass,
        host,
        database: db,
        privileges: newUserPrivileges
      });

      if (res && res.success) {
        showNotice(`Usuario '${user}'@'${host}' creado con permisos asignados.`, 'success');
        newUsername = '';
        newUserPassword = '';
        newUserHost = '%';
        newUserDatabase = '';
        showCreateUserModal = false;
        await fetchUsers();
      } else {
        showNotice(res?.error || 'No se pudo crear el usuario.', 'error');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      showNotice(`Error al crear usuario: ${msg}`, 'error');
    } finally {
      actionLoading = false;
    }
  }

  async function handleDeleteUser(userItem) {
    const username = userItem.user;
    const host = userItem.host || '%';

    if (username.toLowerCase() === 'root' || userItem.isSystemUser) {
      alert('Operación protegida: El usuario "root" y usuarios del sistema no pueden ser eliminados.');
      return;
    }

    if (!confirm(`¿Estás seguro de eliminar al usuario '${username}'@'${host}'? Sus privilegios serán revocados automáticamente.`)) {
      return;
    }

    try {
      const res = await api.delete(`/databases/users/${encodeURIComponent(username)}?host=${encodeURIComponent(host)}`);
      if (res && res.success) {
        showNotice(`Usuario '${username}'@'${host}' eliminado.`, 'success');
        await fetchUsers();
      } else {
        showNotice(res?.error || 'No se pudo eliminar el usuario.', 'error');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      showNotice(`Error al eliminar usuario: ${msg}`, 'error');
    }
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  function formatDateTime(isoString) {
    if (!isoString) return '--';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  }

  onMount(() => {
    refreshAll();
    intervalId = setInterval(fetchTelemetry, 6000);
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });
</script>

<div class="databases-view">
  <!-- Encabezado con Switcher de Pestañas -->
  <div class="banner-card">
    <div class="banner-left">
      <div class="icon-cube">
        <Database size={24} color="#ffffff" />
      </div>
      <div>
        <h3 class="banner-title">Módulo Gestor MariaDB</h3>
        <p class="banner-desc">Administración de esquemas, volcados manuales en <code class="font-mono">/srv/backups</code> y control de acceso seguro.</p>
      </div>
    </div>

    <div class="banner-actions">
      <div class="connection-pill" class:connected={telemetry?.connected}>
        <span class="status-dot"></span>
        <span>{telemetry?.connected ? 'MariaDB Online' : 'Desconectado'}</span>
      </div>

      <button 
        type="button" 
        class="btn-refresh" 
        on:click={refreshAll} 
        disabled={loadingSchemas || loadingBackups || loadingUsers}
      >
        <RefreshCw size={15} class={(loadingSchemas || loadingBackups || loadingUsers) ? 'spin' : ''} />
        <span>Actualizar</span>
      </button>
    </div>
  </div>

  <!-- Barra de Notificaciones Globales -->
  {#if noticeMessage}
    <div class="notice-card notice-{noticeMessage.type}">
      <div class="notice-icon">
        {#if noticeMessage.type === 'success'}
          <CheckCircle size={18} />
        {:else}
          <AlertTriangle size={18} />
        {/if}
      </div>
      <div class="notice-text">{noticeMessage.text}</div>
      <button type="button" class="btn-close-notice" on:click={() => noticeMessage = null}>
        <X size={15} />
      </button>
    </div>
  {/if}

  <!-- Pestañas de Navegación del Módulo -->
  <div class="tabs-nav-bar">
    <button 
      type="button"
      class="tab-btn" 
      class:active={activeSubTab === 'schemas'} 
      on:click={() => activeSubTab = 'schemas'}
    >
      <Database size={16} />
      <span>Bases de Datos y Backups</span>
      <span class="badge-count">{schemas.length}</span>
    </button>

    <button 
      type="button"
      class="tab-btn" 
      class:active={activeSubTab === 'users'} 
      on:click={() => activeSubTab = 'users'}
    >
      <Users size={16} />
      <span>Gestión de Usuarios MariaDB</span>
      <span class="badge-count">{users.length}</span>
    </button>
  </div>

  <!-- ========================================================================= -->
  <!-- PESTAÑA 1: BASES DE DATOS Y BACKUPS -->
  <!-- ========================================================================= -->
  {#if activeSubTab === 'schemas'}
    <div class="tab-content-area">
      <!-- 1.1 Tabla de Esquemas -->
      <div class="card">
        <div class="card-header-row">
          <div class="header-title-block">
            <Layers size={18} class="text-cyan" />
            <h4>Esquemas y Bases de Datos</h4>
          </div>

          <button 
            type="button" 
            class="btn-primary" 
            on:click={handleOpenCreateSchemaModal}
          >
            <Plus size={15} />
            <span>Crear Base de Datos</span>
          </button>
        </div>

        {#if loadingSchemas}
          <div class="state-loading">
            <RefreshCw size={22} class="spin text-cyan" />
            <span>Consultando esquemas en information_schema...</span>
          </div>
        {:else if schemas.length === 0}
          <div class="state-empty">No se encontraron bases de datos configuradas.</div>
        {:else}
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nombre de la Base de Datos</th>
                  <th>Sitio / Contenedor Asociado</th>
                  <th>Tamaño</th>
                  <th>Tablas</th>
                  <th>Charset / Collation</th>
                  <th class="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {#each schemas as s}
                  {@const assoc = getAssociatedSite(s.name)}
                  <tr>
                    <td class="col-name">
                      <div class="schema-name-cell">
                        <Database size={15} class="text-cyan" />
                        <span class="font-mono schema-title">{s.name}</span>
                        {#if s.isSystem}
                          <span class="system-badge">Sistema</span>
                        {/if}
                      </div>
                    </td>

                    <td class="col-site">
                      {#if assoc}
                        <div class="site-association-pill" class:site-matched={assoc.matched} title="Asociado al contenedor {assoc.name}">
                          <Server size={12} class="text-cyan" />
                          <span class="font-mono">{assoc.name}</span>
                        </div>
                      {:else if s.isSystem}
                        <span class="text-muted font-mono text-xs">Interno MariaDB</span>
                      {:else}
                        <span class="text-muted font-mono text-xs">Independiente / Global</span>
                      {/if}
                    </td>

                    <td class="col-size font-mono">
                      <span class="size-pill">{s.sizeMb} MB</span>
                    </td>

                    <td class="col-tables font-mono">
                      {s.tablesCount} tablas
                    </td>

                    <td class="col-charset font-mono text-muted text-xs">
                      {s.charset || 'utf8mb4'} / {s.collation || 'utf8mb4_unicode_ci'}
                    </td>

                    <td class="col-actions text-right">
                      <button 
                        type="button" 
                        class="btn-backup" 
                        on:click={() => handleTriggerBackup(s.name)}
                        disabled={backupInProgress[s.name]}
                        title="Generar volcado .sql en /srv/backups"
                      >
                        {#if backupInProgress[s.name]}
                          <RefreshCw size={13} class="spin" />
                          <span>Respaldando...</span>
                        {:else}
                          <FolderArchive size={13} />
                          <span>Hacer Backup</span>
                        {/if}
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <!-- 1.2 Panel de Copias de Seguridad Disponibles -->
      <div class="card">
        <div class="card-header-row">
          <div class="header-title-block">
            <FolderArchive size={18} class="text-green" />
            <h4>Copias de Seguridad Disponibles en <code class="font-mono">/srv/backups/</code></h4>
          </div>
          <span class="count-pill">{backups.length} Archivo{backups.length === 1 ? '' : 's'} .SQL</span>
        </div>

        {#if loadingBackups}
          <div class="state-loading">
            <RefreshCw size={22} class="spin text-green" />
            <span>Escaneando directorio de respaldos...</span>
          </div>
        {:else if backups.length === 0}
          <div class="state-empty">
            <FileText size={24} class="text-muted" />
            <span>No hay archivos .sql en <code class="font-mono">/srv/backups</code>. Realiza un backup para comenzar.</span>
          </div>
        {:else}
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Archivo de Volcado</th>
                  <th>Base de Datos</th>
                  <th>Tamaño Formateado</th>
                  <th>Fecha de Creación</th>
                  <th class="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {#each backups as b}
                  <tr>
                    <td class="col-filename">
                      <div class="file-cell">
                        <FileText size={15} class="text-green" />
                        <span class="font-mono file-name" title={b.fileName}>{b.fileName}</span>
                      </div>
                    </td>

                    <td class="col-db font-mono">
                      <span class="db-tag">{b.dbName || '--'}</span>
                    </td>

                    <td class="col-size font-mono">
                      <strong>{formatFileSize(b.sizeBytes)}</strong>
                    </td>

                    <td class="col-date font-mono text-muted text-xs">
                      {formatDateTime(b.createdAt)}
                    </td>

                    <td class="col-actions text-right">
                      <div class="action-btn-group">
                        <button 
                          type="button" 
                          class="btn-action-download" 
                          on:click={() => handleDownloadBackup(b.fileName)}
                          title="Descargar volcado SQL en el navegador"
                        >
                          <Download size={13} />
                          <span>Descargar</span>
                        </button>

                        <button 
                          type="button" 
                          class="btn-action-delete" 
                          on:click={() => handleDeleteBackup(b.fileName)}
                          title="Eliminar volcado del almacenamiento"
                        >
                          <Trash2 size={13} />
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
  {/if}

  <!-- ========================================================================= -->
  <!-- PESTAÑA 2: GESTIÓN DE USUARIOS MARIADB -->
  <!-- ========================================================================= -->
  {#if activeSubTab === 'users'}
    <div class="tab-content-area">
      <!-- 2.1 Formulario de Alta de Usuario -->
      <div class="card">
        <div class="card-header-row">
          <div class="header-title-block">
            <Users size={18} class="text-cyan" />
            <h4>Crear Nuevo Usuario MariaDB</h4>
          </div>
          <span class="shield-badge">
            <ShieldCheck size={14} class="text-green" />
            GRANT ALL PRIVILEGES
          </span>
        </div>

        <form on:submit|preventDefault={handleCreateUser} class="user-form">
          <div class="form-grid">
            <div class="form-group">
              <label for="new-db-user" class="form-label">
                Nombre de Usuario <span class="required">*</span>
              </label>
              <div class="input-box">
                <Users size={15} class="icon-input" />
                <input 
                  id="new-db-user"
                  type="text" 
                  bind:value={newUsername} 
                  placeholder="ej. wp_user" 
                  class="form-control font-mono"
                  required
                />
              </div>
            </div>

            <div class="form-group">
              <label for="new-db-pass" class="form-label">
                Contraseña <span class="required">*</span>
              </label>
              <div class="input-box">
                <Key size={15} class="icon-input" />
                <input 
                  id="new-db-pass"
                  type="password" 
                  bind:value={newUserPassword} 
                  placeholder="••••••••••••" 
                  class="form-control font-mono"
                  required
                />
              </div>
            </div>

            <div class="form-group">
              <label for="new-db-host" class="form-label">
                Host Permitido <span class="required">*</span>
              </label>
              <div class="input-box">
                <HardDrive size={15} class="icon-input" />
                <input 
                  id="new-db-host"
                  type="text" 
                  bind:value={newUserHost} 
                  placeholder="% (cualquiera) o 172.%.%.%" 
                  class="form-control font-mono"
                  required
                />
              </div>
            </div>

            <div class="form-group">
              <label for="new-db-schema" class="form-label">
                Conceder Permisos sobre Esquema
              </label>
              <div class="input-box">
                <Database size={15} class="icon-input" />
                <select 
                  id="new-db-schema"
                  bind:value={newUserDatabase} 
                  class="form-control form-select"
                >
                  <option value="">Todas las bases de datos (*.*)</option>
                  {#each schemas as s}
                    <option value={s.name}>{s.name} ({s.sizeMb} MB)</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>

          <div class="form-bottom-row">
            <div class="grant-preview text-xs text-muted">
              Se ejecutará: <code class="font-mono text-cyan">GRANT ALL PRIVILEGES ON `{newUserDatabase || '*'}`.* TO '{newUsername || 'user'}'@'{newUserHost || '%'}';</code>
            </div>

            <button 
              type="submit" 
              class="btn-primary" 
              disabled={actionLoading || !newUsername || !newUserPassword}
            >
              {#if actionLoading}
                <RefreshCw size={14} class="spin" />
                <span>Creando usuario...</span>
              {:else}
                <Plus size={14} />
                <span>Crear Usuario y Conceder Permisos</span>
              {/if}
            </button>
          </div>
        </form>
      </div>

      <!-- 2.2 Lista de Usuarios MariaDB -->
      <div class="card">
        <div class="card-header-row">
          <div class="header-title-block">
            <Shield size={18} class="text-cyan" />
            <h4>Cuentas de Usuario en <code class="font-mono">mysql.user</code></h4>
          </div>
          <span class="count-pill">{users.length} Usuarios Registrados</span>
        </div>

        {#if loadingUsers}
          <div class="state-loading">
            <RefreshCw size={22} class="spin text-cyan" />
            <span>Consultando tabla de usuarios de MariaDB...</span>
          </div>
        {:else if users.length === 0}
          <div class="state-empty">No se encontraron usuarios en la base de datos.</div>
        {:else}
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Usuario @ Host</th>
                  <th>Plugin de Autenticación</th>
                  <th>Tipo de Cuenta</th>
                  <th class="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {#each users as u}
                  {@const isRoot = u.user.toLowerCase() === 'root'}
                  {@const isSys = u.isSystemUser}
                  <tr>
                    <td class="col-user">
                      <div class="user-cell">
                        {#if isRoot}
                          <ShieldAlert size={16} class="text-amber" />
                        {:else}
                          <Users size={16} class="text-cyan" />
                        {/if}
                        <span class="font-mono user-account-name">
                          <strong>{u.user}</strong>@{u.host}
                        </span>
                      </div>
                    </td>

                    <td class="col-plugin font-mono text-muted text-xs">
                      {u.plugin || 'mysql_native_password'}
                    </td>

                    <td class="col-type">
                      {#if isRoot}
                        <span class="badge-role role-root">Superadministrador (root)</span>
                      {:else if isSys}
                        <span class="badge-role role-system">Sistema</span>
                      {:else}
                        <span class="badge-role role-standard">Estándar</span>
                      {/if}
                    </td>

                    <td class="col-actions text-right">
                      {#if isRoot || isSys}
                        <span class="protected-pill" title="Protección de integridad: No se permite eliminar al superusuario">
                          <Lock size={12} />
                          <span>Protegido</span>
                        </span>
                      {:else}
                        <button 
                          type="button" 
                          class="btn-action-delete" 
                          on:click={() => handleDeleteUser(u)}
                          title="Eliminar usuario y revocar privilegios"
                        >
                          <Trash2 size={13} />
                          <span>Eliminar</span>
                        </button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Modal: Crear Esquema -->
  {#if showCreateSchemaModal}
    <div 
      class="modal-backdrop" 
      on:click|self={() => showCreateSchemaModal = false}
      role="dialog"
      aria-modal="true"
    >
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <Database size={18} class="text-cyan" />
            <h4>Nueva Base de Datos</h4>
          </div>
          <button type="button" class="btn-close-modal" on:click={() => showCreateSchemaModal = false}>
            <X size={18} />
          </button>
        </div>

        <form on:submit|preventDefault={handleCreateSchema} class="modal-form">
          <!-- 1. Sitio / Contenedor Destino (Requerido) -->
          <div class="form-group">
            <label for="create-db-site" class="form-label">
              Sitio / Contenedor Destino <span class="required">*</span>
            </label>
            <div class="input-box">
              <Server size={15} class="icon-input" />
              <select 
                id="create-db-site"
                class="form-control"
                value={selectedSite}
                on:change={handleSiteSelectionChange}
                required
              >
                <option value="" disabled selected>-- Selecciona un Sitio o elige Independiente --</option>
                {#if availableSites.length > 0}
                  <optgroup label="Sitios / Contenedores en Ejecución">
                    {#each availableSites as siteName}
                      <option value={siteName}>{siteName}</option>
                    {/each}
                  </optgroup>
                {/if}
                <optgroup label="Opciones Adicionales">
                  <option value="independent">Independiente / Ninguno</option>
                </optgroup>
              </select>
            </div>
            <span class="text-xs text-muted">
              Al seleccionar un sitio (ej. <code>wp_site_4</code>), se autocompletarán la BD (<code>wp_db_4</code>) y el usuario (<code>wp_user_4</code>).
            </span>
          </div>

          <!-- 2. Nombre de la Base de Datos -->
          <div class="form-group">
            <label for="create-db-name" class="form-label">
              Nombre de la Base de Datos <span class="required">*</span>
            </label>
            <div class="input-box">
              <Database size={15} class="icon-input" />
              <input 
                id="create-db-name"
                type="text" 
                bind:value={newSchemaName} 
                placeholder="ej. wp_db_1" 
                class="form-control font-mono"
                required
              />
            </div>
            <span class="text-xs text-muted">Solo caracteres alfanuméricos y guiones bajos (_).</span>
          </div>

          <!-- Campos de Usuario y Contraseña Autogenerada si aplica sitio -->
          {#if selectedSite && selectedSite !== 'independent'}
            <div class="autofill-box">
              <div class="form-group">
                <label for="create-db-user" class="form-label">
                  Usuario MariaDB Autocompletado <span class="required">*</span>
                </label>
                <div class="input-box">
                  <Users size={15} class="icon-input" />
                  <input 
                    id="create-db-user"
                    type="text" 
                    bind:value={newSchemaUser} 
                    class="form-control font-mono"
                    required
                  />
                </div>
              </div>

              <div class="form-group">
                <label for="create-db-password" class="form-label">
                  Contraseña Generada Automáticamente <span class="required">*</span>
                </label>
                <div class="input-group-password">
                  <div class="input-box">
                    <Key size={15} class="icon-input" />
                    <input 
                      id="create-db-password"
                      type="text" 
                      bind:value={newSchemaPassword} 
                      class="form-control font-mono"
                      required
                    />
                  </div>
                  <button 
                    type="button" 
                    class="btn-copy-pass"
                    on:click={() => copyPasswordToClipboard(newSchemaPassword)}
                    title="Copiar contraseña al portapapeles"
                  >
                    {#if copiedGeneratedPassword}
                      <Check size={14} class="text-green" />
                      <span>Copiado</span>
                    {:else}
                      <Copy size={14} />
                      <span>Copiar</span>
                    {/if}
                  </button>
                </div>
                <span class="text-xs text-muted">
                  El usuario recibirá privilegios completos (<code>GRANT ALL PRIVILEGES ON `{newSchemaName || 'db'}`.* TO `{newSchemaUser || 'user'}`@'%'</code>).
                </span>
              </div>
            </div>
          {/if}

          <div class="form-grid">
            <div class="form-group">
              <label for="create-db-charset" class="form-label">Charset</label>
              <input 
                id="create-db-charset"
                type="text" 
                bind:value={newSchemaCharset} 
                class="form-control font-mono"
              />
            </div>

            <div class="form-group">
              <label for="create-db-collation" class="form-label">Collation</label>
              <input 
                id="create-db-collation"
                type="text" 
                bind:value={newSchemaCollation} 
                class="form-control font-mono"
              />
            </div>
          </div>

          <div class="modal-actions">
            <button 
              type="button" 
              class="btn-cancel" 
              on:click={() => showCreateSchemaModal = false}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              class="btn-primary" 
              disabled={actionLoading || !newSchemaName.trim() || !selectedSite}
            >
              {actionLoading ? 'Creando...' : 'Crear Base de Datos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  .databases-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* Banner Superior */
  .banner-card {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 14px;
    padding: 1.25rem 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
  }

  .banner-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .icon-cube {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.2), rgba(56, 189, 248, 0.1));
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #38bdf8;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .banner-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
  }

  .banner-desc {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--text-muted, #a1a1aa);
  }

  .banner-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .connection-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    background: var(--surface-muted, #18181b);
    color: var(--text-muted, #a1a1aa);
    border: 1px solid var(--card-border, #222225);
  }

  .connection-pill.connected {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border-color: rgba(34, 197, 94, 0.3);
  }

  .status-dot {
    width: 6.5px;
    height: 6.5px;
    border-radius: 50%;
    background-color: #ef4444;
  }

  .connection-pill.connected .status-dot {
    background-color: #22c55e;
    box-shadow: 0 0 6px #22c55e;
  }

  .btn-refresh {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    color: var(--text-main, #f4f4f5);
    padding: 0.45rem 0.85rem;
    border-radius: 8px;
    font-size: 0.775rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh:hover:not(:disabled) {
    background: var(--card-border, #222225);
    color: #ffffff;
  }

  /* Notificaciones */
  .notice-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border-radius: 10px;
    padding: 0.85rem 1.25rem;
  }

  .notice-success {
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #4ade80;
  }

  .notice-error {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .notice-text {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .btn-close-notice {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
  }

  /* Tabs Navigation Bar */
  .tabs-nav-bar {
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid var(--card-border, #222225);
    padding-bottom: 0.5rem;
  }

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted, #a1a1aa);
    padding: 0.6rem 1.15rem;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    color: var(--text-main, #f4f4f5);
    background: var(--surface-muted, #18181b);
  }

  .tab-btn.active {
    background: var(--card-bg, #121214);
    border-color: rgba(56, 189, 248, 0.3);
    color: #38bdf8;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .badge-count {
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    padding: 0.15rem 0.45rem;
    border-radius: 9999px;
    font-size: 0.7rem;
  }

  .tab-content-area {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* Card Container */
  .card {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 14px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
  }

  .card-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    border-bottom: 1px solid var(--card-border, #222225);
    padding-bottom: 0.85rem;
  }

  .header-title-block {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .header-title-block h4 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
  }

  .count-pill {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.65rem;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    color: var(--text-muted, #a1a1aa);
    border-radius: 9999px;
  }

  .shield-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #4ade80;
    background: rgba(34, 197, 94, 0.1);
    padding: 0.25rem 0.65rem;
    border-radius: 9999px;
    border: 1px solid rgba(34, 197, 94, 0.25);
  }

  /* Botones Generales */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: var(--primary, #0284c7);
    border: none;
    color: #ffffff;
    padding: 0.55rem 1rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover, #0369a1);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-backup {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
    padding: 0.4rem 0.85rem;
    border-radius: 6px;
    font-size: 0.775rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-backup:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.25);
    color: #ffffff;
  }

  .btn-backup:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .action-btn-group {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-action-download {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.25);
    color: #38bdf8;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-action-download:hover {
    background: rgba(56, 189, 248, 0.25);
    color: #ffffff;
  }

  .btn-action-delete {
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

  .btn-action-delete:hover {
    background: rgba(239, 68, 68, 0.25);
    color: #ffffff;
  }

  .protected-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: rgba(148, 163, 184, 0.1);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #94a3b8;
    padding: 0.3rem 0.65rem;
    border-radius: 6px;
    font-size: 0.725rem;
    font-weight: 600;
  }

  /* Tablas de Datos */
  .table-responsive {
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .data-table th {
    text-align: left;
    padding: 0.75rem 1rem;
    color: #94a3b8;
    font-weight: 600;
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  }

  .data-table td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.08);
    vertical-align: middle;
  }

  .data-table tr:hover td {
    background: rgba(30, 41, 59, 0.3);
  }

  .schema-name-cell, .file-cell, .user-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .schema-title, .file-name {
    font-weight: 600;
    color: #f8fafc;
  }

  .system-badge {
    font-size: 0.675rem;
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
  }

  .size-pill {
    background: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.2);
    color: #38bdf8;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .db-tag {
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #cbd5e1;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-size: 0.775rem;
  }

  .badge-role {
    font-size: 0.725rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
  }

  .role-root {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .role-system {
    background: rgba(148, 163, 184, 0.1);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.2);
  }

  .role-standard {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  /* Formulario de Usuarios */
  .user-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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

  .required {
    color: #ef4444;
  }

  .input-box {
    position: relative;
    display: flex;
    align-items: center;
  }

  :global(.icon-input) {
    position: absolute;
    left: 0.85rem;
    color: var(--text-muted, #a1a1aa);
    pointer-events: none;
  }

  .form-control {
    width: 100%;
    background: var(--bg-dark, #000000);
    border: 1px solid var(--card-border, #222225);
    border-radius: 8px;
    padding: 0.6rem 0.85rem 0.6rem 2.4rem;
    color: var(--text-main, #f4f4f5);
    font-size: 0.85rem;
    box-sizing: border-box;
    transition: all 0.2s;
  }

  .form-control:focus {
    outline: none;
    border-color: #38bdf8;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
  }

  .form-bottom-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    border-top: 1px solid rgba(148, 163, 184, 0.08);
    padding-top: 1rem;
  }

  /* Modales */
  .modal-backdrop {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-card {
    background: var(--card-bg, #121214);
    border: 1px solid var(--card-border, #222225);
    border-radius: 14px;
    width: 100%;
    max-width: 480px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--card-border, #222225);
    padding-bottom: 0.75rem;
  }

  .modal-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .modal-title h4 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-main, #f4f4f5);
  }

  .btn-close-modal {
    background: transparent;
    border: none;
    color: var(--text-muted, #a1a1aa);
    cursor: pointer;
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid var(--card-border, #222225);
    color: var(--text-main, #f4f4f5);
    padding: 0.55rem 1rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  /* Estados vacíos y loading */
  .state-loading, .state-empty {
    padding: 3rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--text-muted, #a1a1aa);
    font-size: 0.9rem;
    text-align: center;
  }

  .site-association-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(14, 165, 233, 0.1);
    border: 1px solid rgba(14, 165, 233, 0.25);
    color: #38bdf8;
    padding: 0.2rem 0.55rem;
    border-radius: 6px;
    font-size: 0.775rem;
  }

  .site-matched {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.3);
    color: #4ade80;
  }

  .autofill-box {
    background: var(--surface-muted, #18181b);
    border: 1px dashed rgba(56, 189, 248, 0.3);
    border-radius: 8px;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .input-group-password {
    display: flex;
    gap: 0.5rem;
  }

  .input-group-password .input-box {
    flex: 1;
  }

  .btn-copy-pass {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--surface-muted, #18181b);
    border: 1px solid var(--card-border, #222225);
    color: var(--text-main, #f4f4f5);
    padding: 0 0.85rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-copy-pass:hover {
    background: var(--card-border, #222225);
    color: #ffffff;
  }

  /* Utilidades */
  .text-cyan { color: #38bdf8; }
  .text-green { color: #4ade80; }
  .text-amber { color: #fbbf24; }
  .text-muted { color: #64748b; }
  .text-xs { font-size: 0.75rem; }
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

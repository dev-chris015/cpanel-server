<script>
  import { createEventDispatcher } from 'svelte';
  import { 
    Server, 
    User, 
    Lock, 
    Eye, 
    EyeOff, 
    AlertCircle, 
    Loader2, 
    ArrowRight, 
    ShieldCheck, 
    Sun, 
    Moon 
  } from 'lucide-svelte';
  import { api } from '../lib/api.js';
  import { reconnectSocket } from '../lib/socket.js';

  export let currentTheme = 'dark';
  export let toggleTheme = () => {};

  const dispatch = createEventDispatcher();

  let username = '';
  let password = '';
  let showPassword = false;
  let loading = false;
  let errorMessage = '';

  async function handleLogin() {
    errorMessage = '';

    // Validación básica de campos
    if (!username.trim() && !password.trim()) {
      errorMessage = 'Por favor ingresa tu usuario y contraseña';
      return;
    }
    if (!username.trim()) {
      errorMessage = 'El nombre de usuario es obligatorio';
      return;
    }
    if (!password.trim()) {
      errorMessage = 'La contraseña es obligatoria';
      return;
    }

    loading = true;

    try {
      const response = await api.post('/auth/login', {
        username: username.trim(),
        password: password
      });

      if (response && response.success && response.token) {
        // Guardar token en localStorage
        api.setToken(response.token);
        
        // Reconectar sockets con el nuevo token
        reconnectSocket(response.token);

        // Notificar al componente padre
        dispatch('login', {
          user: response.user,
          token: response.token
        });
      } else {
        errorMessage = response?.error || 'Credenciales inválidas. Verifica usuario y contraseña.';
      }
    } catch (err) {
      if (err.status === 401 || err.status === 400) {
        errorMessage = err.data?.error || 'Usuario o contraseña incorrectos';
      } else {
        errorMessage = err.message || 'Error de conexión con el servidor backend';
      }
    } finally {
      loading = false;
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      handleLogin();
    }
  }
</script>

<div class="login-wrapper">
  <!-- Botón flotante para alternar tema -->
  <div class="theme-bar">
    <button 
      class="theme-btn" 
      on:click={toggleTheme} 
      title="Cambiar tema ({currentTheme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'})"
      type="button"
    >
      {#if currentTheme === 'dark'}
        <Sun size={17} class="theme-icon sun-icon" />
        <span>Claro</span>
      {:else}
        <Moon size={17} class="theme-icon moon-icon" />
        <span>Oscuro</span>
      {/if}
    </button>
  </div>

  <div class="login-card">
    <!-- Header con marca cPanel -->
    <div class="login-header">
      <div class="brand-badge">
        <div class="logo-icon-bg">
          <Server size={28} color="#ffffff" />
        </div>
      </div>
      <h2>cPanel Server</h2>
      <p class="subtitle">Consola de administración e infraestructura de contenedores</p>
    </div>

    <!-- Alerta de Error -->
    {#if errorMessage}
      <div class="error-banner" role="alert">
        <AlertCircle size={18} class="error-icon" />
        <span>{errorMessage}</span>
      </div>
    {/if}

    <!-- Formulario de autenticación -->
    <form class="login-form" on:submit|preventDefault={handleLogin}>
      <!-- Campo Usuario -->
      <div class="form-group">
        <label for="username">Usuario</label>
        <div class="input-container">
          <User size={18} class="field-icon" />
          <input
            id="username"
            type="text"
            bind:value={username}
            placeholder="superadmin"
            disabled={loading}
            autocomplete="username"
            on:keydown={handleKeyDown}
            required
          />
        </div>
      </div>

      <!-- Campo Contraseña -->
      <div class="form-group">
        <label for="password">Contraseña</label>
        <div class="input-container">
          <Lock size={18} class="field-icon" />
          {#if showPassword}
            <input
              id="password"
              type="text"
              bind:value={password}
              placeholder="••••••••"
              disabled={loading}
              autocomplete="current-password"
              on:keydown={handleKeyDown}
              required
            />
          {:else}
            <input
              id="password"
              type="password"
              bind:value={password}
              placeholder="••••••••"
              disabled={loading}
              autocomplete="current-password"
              on:keydown={handleKeyDown}
              required
            />
          {/if}
          <button
            type="button"
            class="eye-btn"
            on:click={() => showPassword = !showPassword}
            tabindex="-1"
            title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
          >
            {#if showPassword}
              <EyeOff size={18} />
            {:else}
              <Eye size={18} />
            {/if}
          </button>
        </div>
      </div>

      <!-- Botón de Envío -->
      <button 
        type="submit" 
        class="submit-btn" 
        disabled={loading}
      >
        {#if loading}
          <Loader2 size={18} class="spinner" />
          <span>Iniciando sesión...</span>
        {:else}
          <span>Acceder al Panel</span>
          <ArrowRight size={18} />
        {/if}
      </button>
    </form>

    <div class="login-footer">
      <div class="security-note">
        <ShieldCheck size={14} />
        <span>Autenticación JWT cifrada con expiración de 7 días</span>
      </div>
    </div>
  </div>
</div>

<style>
  .login-wrapper {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at 50% 15%, rgba(2, 132, 199, 0.15), transparent 50%), var(--bg-dark);
    padding: 1.5rem;
    box-sizing: border-box;
    position: relative;
  }

  .theme-bar {
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
  }

  .theme-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    padding: 8px 14px;
    border-radius: 20px;
    color: var(--text-main);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .theme-btn:hover {
    border-color: var(--primary);
  }

  :global(.sun-icon) {
    color: #f59e0b;
  }

  :global(.moon-icon) {
    color: #38bdf8;
  }

  .login-card {
    width: 100%;
    max-width: 440px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 16px;
    padding: 2.5rem;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(10px);
    box-sizing: border-box;
    transition: all 0.25s ease;
  }

  .login-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .brand-badge {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .logo-icon-bg {
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    width: 56px;
    height: 56px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(2, 132, 199, 0.35);
  }

  .login-header h2 {
    font-size: 1.6rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: var(--text-main);
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: 0.9rem;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.4;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    padding: 0.85rem 1rem;
    border-radius: 10px;
    font-size: 0.88rem;
    margin-bottom: 1.5rem;
    animation: fadeIn 0.2s ease-in-out;
  }

  :global(.error-icon) {
    flex-shrink: 0;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    text-align: left;
  }

  .form-group label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .input-container {
    position: relative;
    display: flex;
    align-items: center;
  }

  :global(.field-icon) {
    position: absolute;
    left: 12px;
    color: var(--text-muted);
    pointer-events: none;
  }

  .input-container input {
    width: 100%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    padding: 0.75rem 2.5rem 0.75rem 2.6rem;
    font-size: 0.95rem;
    color: var(--text-main);
    outline: none;
    transition: all 0.2s ease;
    box-sizing: border-box;
  }

  :global(body.theme-light) .input-container input {
    background: rgba(0, 0, 0, 0.02);
  }

  .input-container input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.2);
    background: transparent;
  }

  .input-container input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .eye-btn {
    position: absolute;
    right: 10px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: color 0.2s ease;
  }

  .eye-btn:hover {
    color: var(--text-main);
  }

  .submit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    margin-top: 0.75rem;
    padding: 0.85rem 1.25rem;
    background: var(--primary);
    color: #ffffff;
    font-size: 0.95rem;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 15px rgba(2, 132, 199, 0.35);
  }

  .submit-btn:hover:not(:disabled) {
    background: var(--primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(2, 132, 199, 0.45);
  }

  .submit-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  .login-footer {
    margin-top: 2rem;
    text-align: center;
    border-top: 1px solid var(--card-border);
    padding-top: 1.25rem;
  }

  .security-note {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 480px) {
    .login-card {
      padding: 1.75rem;
      border-radius: 12px;
    }

    .theme-bar {
      top: 1rem;
      right: 1rem;
    }
  }
</style>

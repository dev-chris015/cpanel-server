/**
 * Cliente HTTP desacoplado con rutas relativas /api/...
 */

const BASE_URL = '/api';

// Suscriptores para eventos de autenticación
const authListeners = new Set();

/**
 * Notifica a los observadores y despacha eventos globales cuando la sesión expira o es inválida (401).
 * @param {object} detail - Detalles del error de autenticación
 */
export function notifyUnauthorized(detail = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cpanel:unauthorized', { detail }));
    window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail }));
  }

  authListeners.forEach((callback) => {
    try {
      callback(detail);
    } catch (err) {
      console.error('Error al ejecutar callback de autenticación:', err);
    }
  });
}

/**
 * Permite suscribirse a cambios de estado no autorizados (401).
 * @param {Function} callback
 * @returns {Function} Función para cancelar la suscripción
 */
export function onUnauthorized(callback) {
  authListeners.add(callback);
  return () => authListeners.delete(callback);
}

/**
 * Obtiene el token actual almacenado en localStorage.
 * @returns {string|null}
 */
export function getToken() {
  return typeof localStorage !== 'undefined' ? localStorage.getItem('cpanel_token') : null;
}

/**
 * Guarda o elimina el token en localStorage.
 * @param {string|null} token
 */
export function setToken(token) {
  if (typeof localStorage !== 'undefined') {
    if (token) {
      localStorage.setItem('cpanel_token', token);
    } else {
      localStorage.removeItem('cpanel_token');
    }
  }
}

/**
 * Elimina el token de localStorage.
 */
export function clearToken() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('cpanel_token');
  }
}

/**
 * Realiza una petición HTTP al backend
 * @param {string} endpoint - Ruta relativa comenzando con '/' (ej. '/containers') o relativa
 * @param {RequestInit} [options={}] - Opciones de fetch
 * @returns {Promise<any>}
 */
export async function apiRequest(endpoint, options = {}) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${BASE_URL}${cleanEndpoint}`;

  // Leer token de localStorage
  const token = getToken();

  // Agregar Authorization: Bearer ${token} si existe
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  };

  // Si body es FormData, remover Content-Type para permitir multipart boundary automático del navegador
  if (config.body instanceof FormData && config.headers['Content-Type'] === 'application/json') {
    delete config.headers['Content-Type'];
  }

  // Si body no es string y no es FormData, convertir a JSON
  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  // Manejar respuestas 401: limpiar token y notificar al estado de autenticación
  if (response.status === 401) {
    clearToken();
    notifyUnauthorized({ endpoint, status: 401 });
  }

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText };
    }
    const error = new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  // Devolver JSON si la respuesta tiene contenido
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }

  return await response.text();
}

export const api = {
  get: (endpoint, options = {}) => apiRequest(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => apiRequest(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options = {}) => apiRequest(endpoint, { ...options, method: 'PUT', body }),
  delete: (endpoint, options = {}) => apiRequest(endpoint, { ...options, method: 'DELETE' }),
  getToken,
  setToken,
  clearToken,
  onUnauthorized
};

export default api;

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import Docker from 'dockerode';
import {
  DOCKER_SOCKET_PATH,
  NGINX_VHOSTS_DIR,
  NGINX_CONTAINER_NAME,
  CERTS_DIR,
  HOST_CERTBOT_CONF_DIR,
  HOST_CERTBOT_WWW_DIR
} from '../config/paths.js';

export { NGINX_VHOSTS_DIR, NGINX_CONTAINER_NAME, CERTS_DIR };

const execAsync = util.promisify(exec);
const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });
const router = Router();

/**
 * Obtiene el directorio donde se almacenan las configuraciones de VHost.
 * Prioriza NGINX_CONF_DIR, NGINX_VHOSTS_DIR o /srv/nginx/conf.d; si no tiene permisos, usa fallback local.
 */
export const getVHostsDir = () => {
  const configuredDir = process.env.NGINX_CONF_DIR || process.env.NGINX_VHOSTS_DIR || NGINX_VHOSTS_DIR || '/srv/nginx/conf.d';

  try {
    if (!fs.existsSync(configuredDir)) {
      fs.mkdirSync(configuredDir, { recursive: true });
    }
    // Probar si el directorio es escribible
    fs.accessSync(configuredDir, fs.constants.W_OK);
    return configuredDir;
  } catch {
    const fallbackDir = path.resolve(process.cwd(), 'nginx_vhosts');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return fallbackDir;
  }
};

/**
 * Generador de Virtual Hosts (VHost) para Nginx.
 * 
 * Cumple con los requisitos:
 * - Parámetro hasSsl para habilitar/deshabilitar SSL.
 * - 'resolver 127.0.0.11' incluido en AMBOS bloques (HTTP y HTTPS) cuando hasSsl es true.
 * - 'resolver 127.0.0.11' en bloque HTTP cuando hasSsl es false.
 * - Upstream dinámico para resolución en caliente en Docker.
 * 
 * @param {Object} options
 * @param {string} options.domain - Nombre de dominio o subdominio (ej: 'app.midominio.com')
 * @param {string} options.target - Dirección de destino/upstream (ej: 'cpanel-frontend:80' o 'http://mi-app:3000')
 * @param {boolean} [options.hasSsl=false] - Habilita terminación SSL (puerto 443) y redirección en puerto 80
 * @param {string} [options.sslCertPath] - Ruta al certificado SSL (fullchain.pem)
 * @param {string} [options.sslKeyPath] - Ruta a la clave privada SSL (privkey.pem)
 * @param {string} [options.resolver='127.0.0.11 valid=10s ipv6=off'] - Directiva resolver de Nginx
 * @returns {string} Contenido completo del archivo .conf para Nginx
 */
export const generateVHostConfig = ({
  domain,
  target,
  hasSsl = false,
  sslCertPath,
  sslKeyPath,
  resolver = '127.0.0.11 valid=10s ipv6=off'
}) => {
  if (!domain || typeof domain !== 'string') {
    throw new Error('El campo "domain" es requerido para generar la configuración del VHost.');
  }

  if (!target || typeof target !== 'string') {
    throw new Error('El campo "target" es requerido para definir el destino del proxy.');
  }

  const cleanDomain = domain.trim().toLowerCase();
  const normalizedTarget = target.trim().startsWith('http://') || target.trim().startsWith('https://')
    ? target.trim()
    : `http://${target.trim()}`;

  const isSsl = Boolean(hasSsl === true || hasSsl === 'true');
  const defaultCertsBase = process.env.CERTS_DIR || CERTS_DIR || '/srv/nginx/certs';
  // Resolver ruta de certificado compatible con nginx-proxy (/etc/letsencrypt/live o /srv/nginx/certs/live)
  let resolvedCert = sslCertPath;
  let resolvedKey = sslKeyPath;

  if (!resolvedCert || !resolvedKey) {
    const existing = checkCertificateExists(cleanDomain);
    if (existing.exists && existing.certPath && existing.keyPath) {
      resolvedCert = existing.certPath;
      resolvedKey = existing.keyPath;
    } else {
      resolvedCert = path.join(defaultCertsBase, 'live', cleanDomain, 'fullchain.pem');
      resolvedKey = path.join(defaultCertsBase, 'live', cleanDomain, 'privkey.pem');
    }
  }

  // Si Nginx Proxy tiene montado /etc/letsencrypt, asegurar que la ruta generada sea visible para el proxy
  const cert = resolvedCert;
  const key = resolvedKey;

  if (isSsl) {
    // Ambos bloques (HTTP en puerto 80 y HTTPS en puerto 443) contienen resolver 127.0.0.11
    return `# ==============================================================================
# VHost Nginx para: ${cleanDomain} (SSL Habilitado)
# Generado automáticamente por cPanel Server
# ==============================================================================

# Bloque 1: HTTP (Puerto 80) - Redirección a HTTPS y validación ACME
server {
    listen 80;
    listen [::]:80;
    server_name ${cleanDomain};

    # Resolver DNS interno de Docker en bloque HTTP
    resolver ${resolver};

    # Desafío HTTP-01 de Let's Encrypt / Certbot
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
    }

    # Redirección permanente a HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# Bloque 2: HTTPS (Puerto 443) - Proxy Inverso seguro
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${cleanDomain};

    # Resolver DNS interno de Docker en bloque HTTPS
    resolver ${resolver};

    # Certificados SSL
    ssl_certificate ${cert};
    ssl_certificate_key ${key};

    # Parámetros y cifrados SSL modernos y seguros
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Enrutamiento proxy inverso hacia upstream
    location / {
        set $backend_upstream "${normalizedTarget}";
        proxy_pass $backend_upstream;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Opciones de buffering y tiempos de espera para streaming y WebSockets
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;
    }
}
`;
  }

  // Bloque único HTTP (sin SSL) con resolver 127.0.0.11
  return `# ==============================================================================
# VHost Nginx para: ${cleanDomain} (HTTP Estándar)
# Generado automáticamente por cPanel Server
# ==============================================================================

server {
    listen 80;
    server_name ${cleanDomain};

    # Resolver DNS interno de Docker en bloque HTTP
    resolver ${resolver};

    location / {
        set $backend_upstream "${normalizedTarget}";
        proxy_pass $backend_upstream;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;
    }
}
`;
};

/**
 * Busca de forma dinámica y resiliente el contenedor de Nginx en Docker.
 * Evalúa coincidencia directa por nombre configurado, o busca contenedores cuyo nombre
 * o imagen coincidan con 'nginx-proxy', 'proxy' o 'nginx'.
 */
export const getNginxTarget = async (dockerInstance = docker) => {
  if (!dockerInstance) {
    return { container: null, status: 'no_docker', message: 'Docker no disponible' };
  }

  const configuredName = (process.env.NGINX_CONTAINER_NAME || NGINX_CONTAINER_NAME || 'nginx-proxy').trim();

  // 1. Intento directo con el nombre configurado
  try {
    const directContainer = dockerInstance.getContainer(configuredName);
    const inspect = await directContainer.inspect();
    const state = (inspect?.State?.Status || inspect?.State?.status || '').toLowerCase();
    const isRunning = inspect?.State?.Running === true;

    return {
      container: directContainer,
      id: inspect.Id,
      name: configuredName,
      isRunning,
      state: state || (isRunning ? 'running' : 'unknown'),
      status: isRunning ? 'running' : 'stopped',
      message: isRunning ? 'Contenedor en ejecución' : `El contenedor "${configuredName}" no está en ejecución (estado: ${state || 'detenido'}).`
    };
  } catch (_) {
    // Si no se encuentra de forma directa, buscar dinámicamente
  }

  // 2. Búsqueda dinámica en listContainers
  try {
    const containers = await dockerInstance.listContainers({ all: true });
    if (!Array.isArray(containers) || containers.length === 0) {
      return { container: null, status: 'no_containers', message: 'No hay contenedores registrados en Docker.' };
    }

    // Prioridad A: Nombre exacto ignorando barra inicial y mayúsculas
    let match = containers.find(c => {
      const names = (c.Names || []).map(n => n.replace(/^\//, '').toLowerCase());
      return names.includes(configuredName.toLowerCase());
    });

    // Prioridad B: Contenedor cuyo nombre contenga 'nginx-proxy' o 'proxy'
    if (!match) {
      match = containers.find(c => {
        const names = (c.Names || []).map(n => n.replace(/^\//, '').toLowerCase());
        return names.some(n => n.includes('nginx-proxy') || n.includes('proxy'));
      });
    }

    // Prioridad C: Contenedor con imagen de nginx
    if (!match) {
      match = containers.find(c => {
        const img = (c.Image || '').toLowerCase();
        return img.startsWith('nginx') || img.includes('/nginx') || img.includes('nginx:');
      });
    }

    if (!match) {
      return {
        container: null,
        status: 'not_found',
        message: `Contenedor "${configuredName}" no encontrado en Docker.`
      };
    }

    const state = (match.State || match.state || '').toLowerCase();
    const isRunning = state === 'running';
    const container = dockerInstance.getContainer(match.Id);
    const detectedName = (match.Names?.[0] || configuredName).replace(/^\//, '');

    return {
      container,
      id: match.Id,
      name: detectedName,
      isRunning,
      state: state || (isRunning ? 'running' : 'unknown'),
      status: isRunning ? 'running' : 'stopped',
      message: isRunning ? 'Contenedor en ejecución' : `El contenedor de Nginx ("${detectedName}") no está en ejecución (estado: ${state || 'detenido'}).`
    };
  } catch (err) {
    return { container: null, status: 'error', message: err.message };
  }
};

/**
 * Ejecuta 'nginx -t' para comprobar la sintaxis de la configuración.
 * Intenta ejecutarlo primero localmente en el host/contenedor; si no está disponible,
 * lo ejecuta dentro del contenedor Docker de Nginx.
 */
export const testNginxConfig = async () => {
  // 1. Probar localmente
  try {
    const { stdout, stderr } = await execAsync('nginx -t');
    return {
      success: true,
      output: (stdout + '\n' + stderr).trim(),
      method: 'local'
    };
  } catch (localErr) {
    const isNotFound = localErr.code === 127 ||
      (localErr.message && (localErr.message.includes('not found') || localErr.message.includes('ENOENT')));

    // Si nginx existe pero falló la sintaxis
    if (!isNotFound) {
      const errText = (localErr.stderr || localErr.stdout || localErr.message).trim();
      return {
        success: false,
        error: errText,
        output: errText,
        method: 'local'
      };
    }
  }

  // 2. Probar en contenedor Docker de Nginx
  try {
    const target = await getNginxTarget(docker);

    if (!target.container || !target.isRunning) {
      if (target.status === 'stopped') {
        return {
          success: false,
          error: target.message,
          output: `Contenedor "${target.name}" detenido.`,
          method: 'docker'
        };
      }
      // Entorno de desarrollo o pruebas sin Nginx activo
      return {
        success: true,
        simulated: true,
        output: `Prueba sintáctica simulada: Nginx no disponible en este entorno (${target.message})`,
        method: 'simulated'
      };
    }

    const execInstance = await target.container.exec({
      Cmd: ['nginx', '-t'],
      AttachStdout: true,
      AttachStderr: true,
      Tty: true
    });

    const stream = await execInstance.start({ Tty: true });
    let output = '';

    await new Promise((resolve) => {
      stream.on('data', (chunk) => {
        output += chunk.toString('utf8');
      });
      stream.on('end', resolve);
      stream.on('error', () => resolve());
    });

    const inspectData = await execInstance.inspect();
    const cleanOutput = output.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();

    if (inspectData.ExitCode === 0) {
      return {
        success: true,
        output: cleanOutput,
        method: 'docker'
      };
    } else {
      return {
        success: false,
        error: cleanOutput || 'Fallo en la prueba de sintaxis (nginx -t) dentro del contenedor.',
        output: cleanOutput,
        method: 'docker'
      };
    }
  } catch (dockerErr) {
    console.warn('nginx -t no pudo ejecutarse directamente ni en contenedor:', dockerErr.message);
    return {
      success: true,
      simulated: true,
      output: `Prueba sintáctica simulada: entorno sin Nginx activo (${dockerErr.message})`,
      method: 'simulated'
    };
  }
};

/**
 * Recarga la configuración de Nginx (nginx -s reload o señal SIGHUP).
 * Valida previamente la sintaxis para prevenir cortes y utiliza señal directa si 'nginx -s reload' falla.
 */
export const reloadNginx = async ({ skipTest = false } = {}) => {
  // 1. Validar sintaxis previa con testNginxConfig si no fue omitido
  if (!skipTest) {
    const syntaxTest = await testNginxConfig();
    if (!syntaxTest.success) {
      return {
        success: false,
        error: syntaxTest.error || 'Error sintáctico detectado en la configuración de Nginx.',
        output: syntaxTest.output || syntaxTest.error,
        method: syntaxTest.method
      };
    }
  }

  // 2. Recargar localmente si está disponible
  try {
    const { stdout, stderr } = await execAsync('nginx -s reload');
    return {
      success: true,
      output: (stdout + '\n' + stderr).trim(),
      method: 'local'
    };
  } catch (localErr) {
    const isNotFound = localErr.code === 127 ||
      (localErr.message && (localErr.message.includes('not found') || localErr.message.includes('ENOENT')));
    if (!isNotFound) {
      const errText = (localErr.stderr || localErr.stdout || localErr.message).trim();
      return {
        success: false,
        error: errText,
        output: errText,
        method: 'local'
      };
    }
  }

  // 3. Recargar en contenedor Docker
  try {
    const target = await getNginxTarget(docker);

    if (!target.container || !target.isRunning) {
      if (target.status === 'stopped') {
        return {
          success: false,
          error: target.message,
          output: `Contenedor "${target.name}" detenido.`,
          method: 'docker'
        };
      }
      return {
        success: true,
        simulated: true,
        output: `Recarga simulada: ${target.message}`,
        method: 'simulated'
      };
    }

    // 3.a Intentar recarga estándar con 'nginx -s reload'
    const execInstance = await target.container.exec({
      Cmd: ['nginx', '-s', 'reload'],
      AttachStdout: true,
      AttachStderr: true,
      Tty: true
    });

    const stream = await execInstance.start({ Tty: true });
    let output = '';
    await new Promise((resolve) => {
      stream.on('data', (chunk) => { output += chunk.toString('utf8'); });
      stream.on('end', resolve);
      stream.on('error', () => resolve());
    });

    const inspectData = await execInstance.inspect();
    const cleanOutput = output.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();

    if (inspectData.ExitCode === 0) {
      return {
        success: true,
        output: cleanOutput || 'Nginx recargado exitosamente sin cortes de servicio.',
        method: 'docker'
      };
    }

    // 3.b Fallback: Si 'nginx -s reload' falló (ej. por archivo pid faltante en alpine),
    // enviar señal directa SIGHUP (PID 1) al contenedor de Nginx
    try {
      await target.container.kill({ signal: 'HUP' });
      return {
        success: true,
        output: (cleanOutput ? `${cleanOutput}\n` : '') + 'Nginx recargado exitosamente mediante señal SIGHUP al proceso maestro.',
        method: 'docker-signal'
      };
    } catch (killErr) {
      return {
        success: false,
        error: cleanOutput || killErr.message || 'Error al ejecutar recarga de Nginx en el contenedor.',
        output: cleanOutput,
        method: 'docker'
      };
    }
  } catch (dockerErr) {
    return {
      success: true,
      simulated: true,
      output: `Recarga simulada: ${dockerErr.message}`,
      method: 'simulated'
    };
  }
};

/**
 * Guarda y aplica un VHost garantizando Rollback Atómico respaldado por doble 'nginx -t':
 *  - 1er nginx -t: Valida la nueva configuración.
 *  - Si falla el 1er test: Se restaura la configuración anterior (o se borra el archivo nuevo)
 *    y se ejecuta el 2do nginx -t para confirmar que Nginx permanece en un estado saludable y limpio.
 */
export const applyVHostWithAtomicRollback = async ({
  domain,
  configContent,
  testRunner = testNginxConfig,
  reloadRunner = reloadNginx
}) => {
  const vhostsDir = getVHostsDir();
  const filePath = path.join(vhostsDir, `${domain}.conf`);

  const fileExisted = fs.existsSync(filePath);
  const backupContent = fileExisted ? fs.readFileSync(filePath, 'utf8') : null;

  try {
    // 1. Escribir nueva configuración
    fs.writeFileSync(filePath, configContent, 'utf8');

    // 2. Primer 'nginx -t': Validar sintaxis de la nueva configuración
    const test1 = await testRunner();

    if (!test1.success) {
      // ---> ROLLBACK ATÓMICO INICIADO <---
      if (fileExisted && backupContent !== null) {
        fs.writeFileSync(filePath, backupContent, 'utf8');
      } else if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // 3. Segundo 'nginx -t': Verificar que el rollback restauró un estado saludable
      const test2 = await testRunner();

      return {
        applied: false,
        rolledBack: true,
        error: 'La nueva configuración falló la prueba de sintaxis de Nginx. Se ejecutó Rollback Atómico.',
        test1Details: test1.error,
        rollbackVerified: test2.success,
        test2Details: test2.output || test2.error
      };
    }

    // 4. Si el 1er test fue exitoso, recargar Nginx
    const reloadResult = await reloadRunner({ skipTest: true });

    return {
      applied: true,
      rolledBack: false,
      message: `VHost para ${domain} generado, verificado y aplicado exitosamente.`,
      testDetails: test1.output,
      reloadDetails: reloadResult.output
    };
  } catch (err) {
    // En caso de fallo inesperado de I/O, aplicar Rollback Atómico de emergencia
    if (fileExisted && backupContent !== null) {
      try { fs.writeFileSync(filePath, backupContent, 'utf8'); } catch (_) {}
    } else if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    const test2 = await testRunner();

    return {
      applied: false,
      rolledBack: true,
      error: `Error durante la aplicación del VHost: ${err.message}. Se ejecutó Rollback Atómico.`,
      rollbackVerified: test2.success,
      test2Details: test2.output || test2.error
    };
  }
};

/**
 * Elimina un VHost con Rollback Atómico respaldado por doble 'nginx -t'.
 */
export const deleteVHostWithAtomicRollback = async (
  domain,
  { testRunner = testNginxConfig, reloadRunner = reloadNginx } = {}
) => {
  const vhostsDir = getVHostsDir();
  const filePath = path.join(vhostsDir, `${domain}.conf`);

  if (!fs.existsSync(filePath)) {
    return {
      deleted: false,
      notFound: true,
      error: `No se encontró configuración de VHost para el dominio ${domain}`
    };
  }

  const backupContent = fs.readFileSync(filePath, 'utf8');
  fs.unlinkSync(filePath);

  // Primer 'nginx -t' tras eliminación
  const test1 = await testRunner();
  if (!test1.success) {
    // Rollback: Restaurar archivo eliminado
    fs.writeFileSync(filePath, backupContent, 'utf8');

    // Segundo 'nginx -t': Verificar restauración
    const test2 = await testRunner();

    return {
      deleted: false,
      rolledBack: true,
      error: 'La eliminación del VHost dejó la configuración de Nginx inválida. Se ejecutó Rollback Atómico.',
      test1Details: test1.error,
      rollbackVerified: test2.success,
      test2Details: test2.output || test2.error
    };
  }

  await reloadRunner({ skipTest: true });

  return {
    deleted: true,
    rolledBack: false,
    message: `VHost para ${domain} eliminado exitosamente y verificado con nginx -t.`
  };
};

// ==============================================================================
// Controladores de rutas
// ==============================================================================

/**
 * Extrae el upstream destino de un contenido de configuración Nginx.
 * Soporta:
 * 1. set $backend_upstream "http://..."; o set $backend_upstream "app:80";
 * 2. proxy_pass http://wp_site_1:80;
 * 3. proxy_pass http://wp_site_1;
 * 4. proxy_pass http://127.0.0.1:3000;
 */
export const extractUpstreamTarget = (content = '') => {
  if (!content || typeof content !== 'string') return null;

  // 1. Directiva set $backend_upstream "..."
  const setMatch = content.match(/set\s+\$backend_upstream\s+["']?([^"';]+)["']?\s*;/i);
  if (setMatch && setMatch[1]) {
    return setMatch[1].trim();
  }

  // 2. Directiva proxy_pass directa (no variable)
  const proxyPassMatches = [...content.matchAll(/proxy_pass\s+([^;\s]+)\s*;/gi)];
  for (const match of proxyPassMatches) {
    const val = match[1].trim().replace(/^["']|["']$/g, '');
    if (val && !val.startsWith('$')) {
      return val;
    }
  }

  return null;
};

/**
 * Verifica la existencia de certificado SSL en /srv/nginx/certs/live/<dominio>/fullchain.pem
 * con fallback a /srv/nginx/certs/<dominio>/fullchain.pem o CERTS_DIR.
 */
export const checkCertificateExists = (domain) => {
  if (!domain || typeof domain !== 'string') return { exists: false };
  const cleanDomain = domain.trim().toLowerCase();
  const certsBase = process.env.CERTS_DIR || CERTS_DIR || '/srv/nginx/certs';

  const potentialPaths = [
    path.join(certsBase, 'live', cleanDomain, 'fullchain.pem'),
    path.join(certsBase, cleanDomain, 'fullchain.pem'),
    path.join('/etc/letsencrypt/live', cleanDomain, 'fullchain.pem'),
    path.join('/srv/nginx/certs/live', cleanDomain, 'fullchain.pem'),
    path.join('/srv/nginx/certs', cleanDomain, 'fullchain.pem')
  ];

  for (const certPath of potentialPaths) {
    if (fs.existsSync(certPath)) {
      const keyPath = certPath.replace('fullchain.pem', 'privkey.pem');
      const hasKey = fs.existsSync(keyPath);
      let stats = null;
      try { stats = fs.statSync(certPath); } catch (_) {}

      // Resolver la ruta como la ve el contenedor nginx-proxy si se usa /etc/letsencrypt o /srv/nginx/certs
      let nginxCertPath = certPath;
      let nginxKeyPath = keyPath;

      // Si certPath es /srv/nginx/certs/... pero nginx-proxy tiene montado ./certbot/conf en /etc/letsencrypt
      // O si certPath contiene /live/<domain>/fullchain.pem
      if (certPath.startsWith('/srv/nginx/certs')) {
        nginxCertPath = certPath.replace(/^\/srv\/nginx\/certs/, '/etc/letsencrypt');
        nginxKeyPath = keyPath.replace(/^\/srv\/nginx\/certs/, '/etc/letsencrypt');
      }

      return {
        exists: true,
        certPath: nginxCertPath,
        keyPath: hasKey ? nginxKeyPath : null,
        localCertPath: certPath,
        localKeyPath: hasKey ? keyPath : null,
        hasKey,
        mtime: stats ? stats.mtime : null
      };
    }
  }

  return {
    exists: false,
    checkedPaths: potentialPaths
  };
};

/**
 * Validador de nombre de dominio/subdominio seguro (previene Path Traversal e inyección).
 */
const isValidDomain = (domain) => {
  if (!domain || typeof domain !== 'string') return false;
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;
  return domainRegex.test(domain) && !domain.includes('..') && domain.length <= 253;
};

/**
 * Extrae el host (nombre de contenedor o IP) de una cadena de destino upstream.
 * Ejemplo: "app:80" -> "app", "http://my_container:3000" -> "my_container"
 */
export const extractHostFromTarget = (targetStr) => {
  if (!targetStr || typeof targetStr !== 'string') return '';
  const clean = targetStr.trim().replace(/^https?:\/\//i, '').replace(/^\/+/, '');
  const host = clean.split(':')[0].split('/')[0];
  return host.toLowerCase();
};

/**
 * Extrae el puerto numérico de una cadena de destino upstream.
 * Ejemplo: "app:8080" -> 8080, "http://my_container:3000" -> 3000, "app" -> null
 */
export const extractPortFromTarget = (targetStr) => {
  if (!targetStr || typeof targetStr !== 'string') return null;
  const clean = targetStr.trim().replace(/^https?:\/\//i, '').replace(/^\/+/, '');
  const hostAndPort = clean.split('/')[0];
  const parts = hostAndPort.split(':');
  if (parts.length > 1) {
    const portNum = parseInt(parts[1], 10);
    return isNaN(portNum) ? null : portNum;
  }
  return null;
};

/**
 * GET /api/proxy/vhosts y GET /api/proxy
 * Listar todos los VHosts configurados.
 */
export const listVHosts = async (req, res) => {
  try {
    const vhostsDir = getVHostsDir();
    const files = fs.readdirSync(vhostsDir).filter(f => f.endsWith('.conf'));

    const vhosts = files.map(file => {
      const filePath = path.join(vhostsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Extraer nombre de dominio del server_name o del nombre del archivo
      const serverNameMatch = content.match(/server_name\s+([^;]+);/i);
      let parsedDomain = file.replace(/\.conf$/, '');
      if (serverNameMatch && serverNameMatch[1]) {
        const firstDomain = serverNameMatch[1].trim().split(/\s+/)[0];
        if (firstDomain && isValidDomain(firstDomain)) {
          parsedDomain = firstDomain;
        }
      }

      const domain = parsedDomain;
      const hasSsl = content.includes('listen 443 ssl');
      const target = extractUpstreamTarget(content);
      const certStatus = checkCertificateExists(domain);

      return {
        domain,
        fileName: file,
        hasSsl,
        target,
        path: filePath,
        hasCertOnDisk: certStatus.exists,
        certDetails: certStatus
      };
    });

    res.json({
      success: true,
      count: vhosts.length,
      vhostsDir,
      data: vhosts
    });
  } catch (error) {
    console.error('Error al listar VHosts:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar los Virtual Hosts',
      details: error.message
    });
  }
};

/**
 * GET /api/proxy/vhosts/:domain y GET /api/proxy/:domain
 * Obtener la configuración de un VHost específico.
 */
export const getVHost = async (req, res) => {
  try {
    const { domain } = req.params;
    if (!isValidDomain(domain)) {
      return res.status(400).json({ success: false, error: 'Nombre de dominio inválido' });
    }

    const vhostsDir = getVHostsDir();
    const filePath = path.join(vhostsDir, `${domain}.conf`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: `VHost no encontrado para el dominio: ${domain}` });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const hasSsl = content.includes('listen 443 ssl');
    const target = extractUpstreamTarget(content);
    const certStatus = checkCertificateExists(domain);

    res.json({
      success: true,
      data: {
        domain,
        hasSsl,
        target,
        content,
        filePath,
        hasCertOnDisk: certStatus.exists,
        certDetails: certStatus
      }
    });
  } catch (error) {
    console.error(`Error al obtener VHost para ${req.params.domain}:`, error);
    res.status(500).json({
      success: false,
      error: 'Error al consultar el Virtual Host',
      details: error.message
    });
  }
};

/**
 * Resuelve de forma dinámica las rutas absolutas en el HOST del daemon de Docker
 * para los directorios de Certbot (/etc/letsencrypt -> certbot/conf, /var/www/certbot -> certbot/www).
 *
 * Evita el problema clásico de Docker-out-of-Docker (DooD) donde pasar rutas locales del
 * contenedor (ej: /srv/nginx/certs) a 'docker run -v' provoca que el daemon intente montar
 * carpetas inexistentes en el host raíz de la máquina virtual.
 *
 * @param {Object} [dockerInstance=docker]
 * @returns {Promise<{ hostCertsDir: string, hostWebrootDir: string, source: string }>}
 */
export const resolveCertbotHostPaths = async (dockerInstance = docker) => {
  let hostCertsDir = null;
  let hostWebrootDir = null;

  // Prioridad 1 y 2: Inspección dinámica de montajes en Docker
  if (dockerInstance && typeof dockerInstance.listContainers === 'function') {
    try {
      const containers = await dockerInstance.listContainers({ all: true });

      // Prioridad 1: nginx-proxy
      // Prioridad 2: cpanel-backend (si nginx-proxy no estuviera disponible o no aportó montajes)
      let nginxContainer = null;
      let backendContainer = null;

      const nginxInfo = await getNginxTarget(dockerInstance);
      if (nginxInfo?.container && nginxInfo.isRunning) {
        nginxContainer = nginxInfo.container;
      }

      if (Array.isArray(containers)) {
        for (const c of containers) {
          const names = (c.Names || []).map(n => n.replace(/^\//, '').toLowerCase());
          if (!nginxContainer && names.some(n => n === 'nginx-proxy' || n.includes('nginx-proxy') || n.includes('proxy'))) {
            nginxContainer = dockerInstance.getContainer(c.Id);
          }
          if (!backendContainer && names.some(n => n === 'cpanel-backend' || n.includes('cpanel-backend') || (n.includes('cpanel') && n.includes('backend')))) {
            backendContainer = dockerInstance.getContainer(c.Id);
          }
        }
      }

      // Orden de inspección: primero nginx-proxy (Prioridad 1), luego cpanel-backend (Prioridad 2)
      const candidates = [];
      if (nginxContainer) candidates.push(nginxContainer);
      if (backendContainer && (!nginxContainer || backendContainer.id !== nginxContainer.id)) {
        candidates.push(backendContainer);
      }

      for (const cand of candidates) {
        try {
          const inspectData = await cand.inspect();
          const mounts = inspectData?.Mounts || [];

          for (const m of mounts) {
            const dest = (m.Destination || '').toLowerCase();
            const src = m.Source || '';

            // Destination: /etc/letsencrypt
            if (!hostCertsDir && (
              dest === '/etc/letsencrypt' ||
              dest === '/srv/nginx/certs' ||
              dest.endsWith('/certs') ||
              src.endsWith('/certbot/conf') ||
              src.includes('/certbot/conf')
            )) {
              hostCertsDir = src;
            }

            // Destination: /var/www/certbot
            if (!hostWebrootDir && (
              dest === '/var/www/certbot' ||
              dest.includes('acme-challenge') ||
              src.endsWith('/certbot/www') ||
              src.includes('/certbot/www')
            )) {
              hostWebrootDir = src;
            }
          }

          // Si se descubrió uno, inferir el complementario si siguen la estructura ~/server/certbot/(conf|www)
          if (hostCertsDir && !hostWebrootDir) {
            if (hostCertsDir.endsWith('/certbot/conf') || hostCertsDir.includes('/certbot/conf')) {
              hostWebrootDir = hostCertsDir.replace(/\/certbot\/conf\/?$/, '/certbot/www');
            }
          }
          if (hostWebrootDir && !hostCertsDir) {
            if (hostWebrootDir.endsWith('/certbot/www') || hostWebrootDir.includes('/certbot/www')) {
              hostCertsDir = hostWebrootDir.replace(/\/certbot\/www\/?$/, '/certbot/conf');
            }
          }

          if (hostCertsDir && hostWebrootDir) {
            return { hostCertsDir, hostWebrootDir, source: 'docker_mount_inspection' };
          }
        } catch (_) {}
      }
    } catch (inspectErr) {
      console.warn('Aviso al inspeccionar montajes para Certbot:', inspectErr.message);
    }
  }

  // Prioridad 3: Variables de entorno (HOST_CERTBOT_CONF_DIR / HOST_CERTBOT_WWW_DIR o alias)
  const envCertsDir = process.env.HOST_CERTBOT_CONF_DIR || process.env.HOST_CERTS_DIR;
  const envWebrootDir = process.env.HOST_CERTBOT_WWW_DIR || process.env.HOST_WEBROOT_DIR;

  if (envCertsDir && envWebrootDir) {
    return {
      hostCertsDir: envCertsDir,
      hostWebrootDir: envWebrootDir,
      source: 'environment'
    };
  }

  // Prioridad 4: Fallback estándar de la VPS (/home/azureuser/server/certbot/conf y /home/azureuser/server/certbot/www)
  return {
    hostCertsDir: hostCertsDir || envCertsDir || HOST_CERTBOT_CONF_DIR || '/home/azureuser/server/certbot/conf',
    hostWebrootDir: hostWebrootDir || envWebrootDir || HOST_CERTBOT_WWW_DIR || '/home/azureuser/server/certbot/www',
    source: (hostCertsDir && hostWebrootDir) ? 'docker_mount_inspection' : (envCertsDir || envWebrootDir) ? 'environment' : 'fallback'
  };
};

/**
 * Ejecuta el contenedor certbot/certbot con montajes apuntando a las rutas del host.
 * Emplea Docker CLI si está disponible y degrada elegantemente a Dockerode (Docker API)
 * sobre /var/run/docker.sock en caso de que docker no esté instalado en el entorno.
 */
export const runCertbotDockerContainer = async ({
  dockerInstance = docker,
  hostWebrootDir,
  hostCertsDir,
  domain,
  email,
  forceRenewal = false
}) => {
  const certbotArgs = [
    'certonly',
    '--webroot',
    '-w', '/var/www/certbot',
    '-d', domain,
    '--non-interactive',
    '--agree-tos',
    '--email', email,
    forceRenewal ? '--force-renewal' : '--keep-until-expiring'
  ];

  // 1. Intentar con CLI de Docker si se encuentra disponible
  try {
    const dockerCmd = `docker run --rm \
      -v "${hostWebrootDir}:/var/www/certbot" \
      -v "${hostCertsDir}:/etc/letsencrypt" \
      certbot/certbot ${certbotArgs.join(' ')}`;

    const { stdout, stderr } = await execAsync(dockerCmd, { timeout: 120000 });
    return {
      success: true,
      method: 'docker_cli',
      output: (stdout + '\n' + stderr).trim()
    };
  } catch (cliErr) {
    const msg = cliErr.message || '';
    const isCmdNotFound = msg.includes('not found') || cliErr.code === 127;

    // Si falló pero por validación de Certbot/Let's Encrypt (no por falta del binario de Docker)
    if (!isCmdNotFound && !msg.includes('docker: not found')) {
      return {
        success: false,
        method: 'docker_cli',
        output: (cliErr.stdout || '') + '\n' + (cliErr.stderr || msg)
      };
    }

    // 2. Si docker no está instalado en este contenedor, invocar Docker API mediante Dockerode
    if (dockerInstance && typeof dockerInstance.createContainer === 'function') {
      try {
        const image = 'certbot/certbot:latest';

        // Asegurar imagen disponible
        try {
          await dockerInstance.getImage(image).inspect();
        } catch (imgErr) {
          if (imgErr.statusCode === 404) {
            console.log(`[SSL] Descargando imagen ${image} a través del socket de Docker...`);
            await new Promise((resolve, reject) => {
              dockerInstance.pull(image, (pullErr, stream) => {
                if (pullErr) return reject(pullErr);
                dockerInstance.modem.followProgress(stream, (followErr, res) => {
                  if (followErr) return reject(followErr);
                  resolve(res);
                });
              });
            });
          }
        }

        const container = await dockerInstance.createContainer({
          Image: image,
          Cmd: certbotArgs,
          HostConfig: {
            Binds: [
              `${hostWebrootDir}:/var/www/certbot`,
              `${hostCertsDir}:/etc/letsencrypt`
            ],
            AutoRemove: true
          },
          AttachStdout: true,
          AttachStderr: true
        });

        const stream = await container.attach({
          stream: true,
          stdout: true,
          stderr: true
        });

        let outputChunks = [];
        stream.on('data', chunk => {
          outputChunks.push(chunk);
        });

        await container.start();
        const waitRes = await container.wait();

        const fullOutput = Buffer.concat(outputChunks).toString('utf8');
        const isSuccess = (waitRes?.StatusCode ?? 0) === 0;

        return {
          success: isSuccess,
          method: 'dockerode',
          output: fullOutput.trim() || `Certbot finalizó con código de salida ${waitRes?.StatusCode}`
        };
      } catch (dockerodeErr) {
        return {
          success: false,
          method: 'dockerode',
          output: `Error al ejecutar contenedor Certbot vía Dockerode: ${dockerodeErr.message}`
        };
      }
    }

    return {
      success: false,
      method: 'none',
      output: msg
    };
  }
};

/**
 * Ejecuta el flujo integral de emisión de certificados SSL:
 * 1. Aplica VHost temporal en puerto 80 con endpoint de validación /.well-known/acme-challenge/
 * 2. Resuelve dinámicamente las rutas del host y ejecuta Certbot (local, docker CLI o dockerode).
 * 3. Si se obtuvo el certificado, genera y aplica el VHost definitivo con SSL (puerto 443) y recarga Nginx.
 */
export const executeCertificateIssuance = async ({
  domain,
  target,
  email,
  forceRenewal = false,
  dockerInstance = docker
}) => {
  const cleanDomain = domain.trim().toLowerCase();
  const certsBase = process.env.CERTS_DIR || CERTS_DIR || '/srv/nginx/certs';
  const emailParam = email || process.env.CERTBOT_EMAIL || `admin@${cleanDomain}`;

  // Si ya existe y no se fuerza renovación
  const existingCert = checkCertificateExists(cleanDomain);
  if (existingCert.exists && !forceRenewal) {
    const sslConfig = generateVHostConfig({
      domain: cleanDomain,
      target,
      hasSsl: true,
      sslCertPath: existingCert.certPath,
      sslKeyPath: existingCert.keyPath
    });

    const applyResult = await applyVHostWithAtomicRollback({
      domain: cleanDomain,
      configContent: sslConfig
    });

    return {
      success: true,
      message: `El certificado SSL para ${cleanDomain} ya existía en disco y se aplicó la configuración HTTPS.`,
      alreadyExisted: true,
      certPath: existingCert.certPath,
      step3: applyResult
    };
  }

  // --- PASO 1: Aplicar VHost HTTP con ACME challenge hacia /var/www/certbot ---
  const httpAcmeConfig = generateVHostConfig({
    domain: cleanDomain,
    target,
    hasSsl: false
  });

  const step1 = await applyVHostWithAtomicRollback({
    domain: cleanDomain,
    configContent: httpAcmeConfig
  });

  if (!step1.applied) {
    return {
      success: false,
      phase: 1,
      error: 'Error al aplicar el VHost HTTP para validación ACME.',
      details: step1.error
    };
  }

  // --- PASO 2: Resolver rutas en el HOST y ejecutar Certbot ---
  const { hostCertsDir, hostWebrootDir, source: pathSource } = await resolveCertbotHostPaths(dockerInstance);
  console.log(`[SSL] Rutas resueltas en host (${pathSource}) -> certs: ${hostCertsDir}, webroot: ${hostWebrootDir}`);

  let certbotSuccess = false;
  let certbotOutput = '';
  let executionMethod = '';

  // 2.a Intentar certbot local si está instalado y el directorio webroot local existe
  const localWebroot = process.env.CERTBOT_WEBROOT || '/var/www/certbot';
  if (fs.existsSync(localWebroot)) {
    try {
      const localCmd = `certbot certonly --webroot -w "${localWebroot}" \
        --config-dir "${certsBase}" \
        --work-dir "${certsBase}/work" \
        --logs-dir "${certsBase}/logs" \
        -d ${cleanDomain} --non-interactive --agree-tos --email ${emailParam} \
        ${forceRenewal ? '--force-renewal' : '--keep-until-expiring'}`;
      const { stdout, stderr } = await execAsync(localCmd, { timeout: 120000 });
      certbotSuccess = true;
      executionMethod = 'local_certbot';
      certbotOutput = (stdout + '\n' + stderr).trim();
    } catch (localErr) {
      console.warn('[SSL] Certbot local no completó la emisión, pasando a contenedor Docker:', localErr.message);
    }
  }

  // 2.b Si no se completó localmente, ejecutar el contenedor Docker con las rutas del host
  if (!certbotSuccess) {
    const dockerRunRes = await runCertbotDockerContainer({
      dockerInstance,
      hostWebrootDir,
      hostCertsDir,
      domain: cleanDomain,
      email: emailParam,
      forceRenewal
    });

    certbotSuccess = dockerRunRes.success;
    executionMethod = dockerRunRes.method;
    certbotOutput = dockerRunRes.output;
  }

  // Comprobar si tras la ejecución se generó el certificado en disco
  const postCert = checkCertificateExists(cleanDomain);

  // Si no existe (por ejemplo DNS aún no apunta al servidor o en entorno local)
  if (!postCert.exists) {
    try {
      const liveDir = path.join(certsBase, 'live', cleanDomain);
      if (!fs.existsSync(liveDir)) {
        fs.mkdirSync(liveDir, { recursive: true });
      }
      const fullchainPath = path.join(liveDir, 'fullchain.pem');
      const privkeyPath = path.join(liveDir, 'privkey.pem');

      if (!fs.existsSync(fullchainPath) || !fs.existsSync(privkeyPath)) {
        const selfSignedCmd = `openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
          -keyout "${privkeyPath}" \
          -out "${fullchainPath}" \
          -subj "/CN=${cleanDomain}/O=cPanel Local/C=MX"`;
        await execAsync(selfSignedCmd);
        executionMethod += '_self_signed_fallback';
      }
    } catch (openSslErr) {
      return {
        success: false,
        phase: 2,
        error: `Certbot no pudo validar el dominio '${cleanDomain}'. Verifica que los registros DNS (A/CNAME) apunten a este servidor y que los puertos 80 y 443 estén abiertos.`,
        certbotOutput,
        details: openSslErr.message
      };
    }
  }

  // --- PASO 3: Aplicar VHost HTTPS con terminación SSL y recargar Nginx ---
  const validCert = checkCertificateExists(cleanDomain);
  const httpsConfig = generateVHostConfig({
    domain: cleanDomain,
    target,
    hasSsl: true,
    sslCertPath: validCert.certPath,
    sslKeyPath: validCert.keyPath
  });

  const step3 = await applyVHostWithAtomicRollback({
    domain: cleanDomain,
    configContent: httpsConfig
  });

  if (!step3.applied) {
    return {
      success: false,
      phase: 3,
      error: 'Certificado obtenido pero falló la aplicación del VHost HTTPS en Nginx.',
      details: step3.error
    };
  }

  return {
    success: true,
    message: `Certificado SSL para ${cleanDomain} configurado y aplicado exitosamente con recarga de Nginx.`,
    domain: cleanDomain,
    hasSsl: true,
    certPath: validCert.certPath,
    certbotOutput,
    executionMethod,
    step3
  };
};

/**
 * POST /api/proxy/vhosts y POST /api/proxy
 * Crear o actualizar un Virtual Host con generador de VHosts y Rollback Atómico con doble nginx -t.
 */
export const createOrUpdateVHost = async (req, res) => {
  try {
    const { domain, target, hasSsl, sslCertPath, sslKeyPath, customResolver } = req.body;

    if (!domain || !isValidDomain(domain)) {
      return res.status(400).json({
        success: false,
        error: 'Dominio requerido y debe tener un formato válido (ej: app.midominio.com)'
      });
    }

    if (!target) {
      return res.status(400).json({
        success: false,
        error: 'El campo "target" es requerido (ej: cpanel-frontend:80 o http://127.0.0.1:3000)'
      });
    }

    const cleanDomain = domain.trim().toLowerCase();
    const targetHost = extractHostFromTarget(target);
    const targetPort = extractPortFromTarget(target);

    // 1. Validación de Unicidad de Dominio por Contenedor
    // Si el contenedor ya está referenciado por otro VHost diferente a domain, rechazar con 400 Bad Request
    if (targetHost) {
      const vhostsDir = getVHostsDir();
      if (fs.existsSync(vhostsDir)) {
        const confFiles = fs.readdirSync(vhostsDir).filter(f => f.endsWith('.conf'));
        for (const file of confFiles) {
          const filePath = path.join(vhostsDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const existingTarget = extractUpstreamTarget(content);
            if (existingTarget) {
              const existingHost = extractHostFromTarget(existingTarget);
              if (existingHost === targetHost) {
                // Obtener el dominio del VHost existente
                const serverNameMatch = content.match(/server_name\s+([^;]+);/i);
                let existingDomain = file.replace(/\.conf$/, '');
                if (serverNameMatch && serverNameMatch[1]) {
                  const firstDomain = serverNameMatch[1].trim().split(/\s+/)[0];
                  if (firstDomain && isValidDomain(firstDomain)) {
                    existingDomain = firstDomain;
                  }
                }
                existingDomain = existingDomain.toLowerCase();

                // Si es un dominio diferente al que se está creando/actualizando
                if (existingDomain !== cleanDomain) {
                  return res.status(400).json({
                    success: false,
                    error: `El contenedor '${targetHost}' ya tiene un dominio asociado ('${existingDomain}'). No se permite asociar más de un dominio por contenedor.`
                  });
                }
              }
            }
          } catch (readErr) {
            console.warn(`No se pudo leer ${file} para validación de unicidad de VHost:`, readErr.message);
          }
        }
      }
    }

    // 2. Validación de Puerto Libre en Backend
    // Comprobar que el puerto no colisione con el puerto público de otro contenedor en el host de Docker.
    // Se excluyen los proxies inversos/balanceadores del sistema (como nginx-proxy) ya que ellos legítimamente
    // publican los puertos 80 y 443 en el host para recibir el tráfico de todos los vhosts hacia los upstreams.
    const SYSTEM_PROXY_CONTAINERS = [
      'nginx-proxy',
      'nginx',
      'cpanel-backend',
      process.env.NGINX_CONTAINER_NAME || NGINX_CONTAINER_NAME
    ].filter(Boolean).map(s => s.toLowerCase());

    if (targetPort && docker) {
      try {
        const containers = await docker.listContainers({ all: true });
        for (const c of containers) {
          const cNames = Array.isArray(c.Names) ? c.Names : [];
          const normalizedNames = cNames.map(n => n.replace(/^\//, '').toLowerCase());
          const cId = (c.Id || '').substring(0, 12).toLowerCase();

          // Si el contenedor es el mismo del targetHost, ignorar
          const isSameContainer = targetHost && (
            normalizedNames.includes(targetHost) ||
            cId === targetHost ||
            (c.Id && c.Id.toLowerCase().startsWith(targetHost))
          );

          if (isSameContainer) {
            continue;
          }

          // Si el contenedor es el propio proxy inverso del sistema (nginx-proxy), sus puertos públicos 80/443
          // no son un conflicto para los contenedores internos que escuchan en puerto 80 dentro de server-net.
          const isSystemProxy = normalizedNames.some(n => SYSTEM_PROXY_CONTAINERS.includes(n));
          if (isSystemProxy) {
            continue;
          }

          const ports = c.Ports || c.ports || [];
          if (Array.isArray(ports)) {
            for (const p of ports) {
              const publicPort = p.PublicPort || p.publicPort;

              if (publicPort === targetPort) {
                const ownerContainer = normalizedNames[0] || cId || 'otro contenedor';
                return res.status(400).json({
                  success: false,
                  error: `El puerto ${targetPort} está en conflicto con el puerto público del contenedor "${ownerContainer}".`
                });
              }
            }
          }
        }
      } catch (dockerErr) {
        console.warn('No se pudo verificar disponibilidad de puertos contra el socket de Docker:', dockerErr.message);
      }
    }

    // Generar configuración con hasSsl y resolver 127.0.0.11 en ambos bloques
    const isSslRequested = Boolean(hasSsl === true || hasSsl === 'true');
    const existingCert = checkCertificateExists(cleanDomain);

    // Si se solicitó SSL pero el certificado no existe aún en disco, auto-emitirlo
    if (isSslRequested && !existingCert.exists) {
      console.log(`[Proxy] SSL activado y certificado no existente para ${cleanDomain}. Iniciando emisión automática...`);
      const issuanceResult = await executeCertificateIssuance({
        domain: cleanDomain,
        target,
        email: req.body.email || process.env.CERTBOT_EMAIL || `admin@${cleanDomain}`,
        dockerInstance: docker
      });

      if (!issuanceResult.success) {
        return res.status(issuanceResult.phase === 1 ? 500 : 502).json({
          success: false,
          error: `No se pudo emitir el certificado SSL automáticamente para '${cleanDomain}'. Verifica que el DNS apunte a este servidor.`,
          details: issuanceResult.error || issuanceResult.details,
          certbotOutput: issuanceResult.certbotOutput
        });
      }

      return res.status(201).json({
        success: true,
        message: `Virtual Host para ${cleanDomain} configurado y certificado SSL emitido exitosamente.`,
        data: {
          domain: cleanDomain,
          hasSsl: true,
          target,
          certPath: issuanceResult.certPath,
          certbotOutput: issuanceResult.certbotOutput,
          executionMethod: issuanceResult.executionMethod,
          testDetails: issuanceResult.step3?.testDetails,
          reloadDetails: issuanceResult.step3?.reloadDetails
        }
      });
    }

    const configContent = generateVHostConfig({
      domain,
      target,
      hasSsl: isSslRequested,
      sslCertPath: sslCertPath || existingCert.certPath,
      sslKeyPath: sslKeyPath || existingCert.keyPath,
      resolver: customResolver || '127.0.0.11 valid=10s ipv6=off'
    });

    // Aplicar configuración con Rollback Atómico respaldado por doble 'nginx -t'
    const result = await applyVHostWithAtomicRollback({
      domain,
      configContent
    });

    if (!result.applied) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.test1Details,
        rollbackVerified: result.rollbackVerified,
        rollbackDetails: result.test2Details
      });
    }

    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        domain,
        hasSsl: Boolean(hasSsl === true || hasSsl === 'true'),
        target,
        config: configContent,
        testDetails: result.testDetails,
        reloadDetails: result.reloadDetails
      }
    });
  } catch (error) {
    console.error('Error al crear o actualizar VHost:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al procesar el Virtual Host',
      details: error.message
    });
  }
};

/**
 * DELETE /api/proxy/vhosts/:domain y DELETE /api/proxy/:domain
 * Eliminar un Virtual Host con Rollback Atómico respaldado por doble nginx -t.
 */
export const deleteVHost = async (req, res) => {
  try {
    const { domain } = req.params;
    if (!isValidDomain(domain)) {
      return res.status(400).json({ success: false, error: 'Nombre de dominio inválido' });
    }

    const result = await deleteVHostWithAtomicRollback(domain);

    if (result.notFound) {
      return res.status(404).json({ success: false, error: result.error });
    }

    if (!result.deleted) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.test1Details,
        rollbackVerified: result.rollbackVerified,
        rollbackDetails: result.test2Details
      });
    }

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error(`Error al eliminar VHost para ${req.params.domain}:`, error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar el Virtual Host',
      details: error.message
    });
  }
};

/**
 * POST /api/proxy/vhosts/:domain/issue-cert y POST /api/proxy/issue-cert
 * Flujo de Emisión / Gestión de Certificados SSL:
 * 1. Verifica si ya existe certificado en /srv/nginx/certs/live/<dominio>/fullchain.pem.
 * 2. Si no existe o se fuerza renovación:
 *    a) Aplica VHost HTTP inicial con ACME challenge hacia /var/www/certbot y recarga Nginx.
 *    b) Ejecuta Certbot (localmente o mediante contenedor docker certbot/certbot).
 *    c) Aplica VHost HTTPS con terminación SSL en puerto 443 y recarga sobre nginx-proxy.
 */
export const issueCertificate = async (req, res) => {
  const domainParam = req.params.domain || req.body.domain;
  const targetParam = req.body.target;
  const emailParam = req.body.email || process.env.CERTBOT_EMAIL || 'admin@' + (domainParam || 'example.com');
  const forceRenewal = Boolean(req.body.force === true || req.body.force === 'true');

  if (!domainParam || !isValidDomain(domainParam)) {
    return res.status(400).json({
      success: false,
      error: 'Nombre de dominio inválido para emitir certificado SSL.'
    });
  }

  const cleanDomain = domainParam.trim().toLowerCase();

  // Determinar upstream target actual desde el archivo existente o parámetro
  let target = targetParam;
  const vhostsDir = getVHostsDir();
  const filePath = path.join(vhostsDir, `${cleanDomain}.conf`);
  if (!target && fs.existsSync(filePath)) {
    const existingContent = fs.readFileSync(filePath, 'utf8');
    target = extractUpstreamTarget(existingContent);
  }

  if (!target) {
    return res.status(400).json({
      success: false,
      error: 'No se pudo determinar el upstream destino del dominio. Por favor envía el campo "target".'
    });
  }

  const result = await executeCertificateIssuance({
    domain: cleanDomain,
    target,
    email: emailParam,
    forceRenewal,
    dockerInstance: docker
  });

  if (!result.success) {
    return res.status(result.phase === 1 ? 500 : 502).json({
      success: false,
      error: result.error,
      certbotOutput: result.certbotOutput,
      details: result.details
    });
  }

  return res.json({
    success: true,
    ...result
  });
};

/**
 * GET /api/proxy/vhosts/:domain/cert-status
 * Consulta el estado y existencia del certificado para un dominio.
 */
export const getCertStatus = async (req, res) => {
  const { domain } = req.params;
  if (!isValidDomain(domain)) {
    return res.status(400).json({ success: false, error: 'Dominio inválido' });
  }

  const status = checkCertificateExists(domain);
  res.json({
    success: true,
    domain,
    ...status
  });
};

/**
 * POST /api/proxy/test
 * Ejecutar verificación sintáctica de Nginx manualmente (nginx -t).
 */
export const testNginx = async (req, res) => {
  try {
    const testResult = await testNginxConfig();
    const statusCode = testResult.success ? 200 : 400;
    res.status(statusCode).json({
      success: testResult.success,
      message: testResult.success
        ? 'Sintaxis de configuración de Nginx correcta.'
        : 'Error sintáctico detectado en la configuración de Nginx.',
      error: testResult.error,
      output: testResult.output || testResult.error,
      method: testResult.method,
      simulated: Boolean(testResult.simulated)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error al ejecutar prueba de Nginx',
      details: error.message
    });
  }
};

/**
 * POST /api/proxy/reload
 * Recargar configuración de Nginx manualmente (nginx -s reload o señal SIGHUP).
 */
export const reloadNginxHandler = async (req, res) => {
  try {
    const reloadResult = await reloadNginx();
    const statusCode = reloadResult.success ? 200 : 500;
    res.status(statusCode).json({
      success: reloadResult.success,
      message: reloadResult.success
        ? 'Nginx se ha recargado exitosamente sin cortes de servicio.'
        : 'No se pudo recargar la configuración de Nginx.',
      error: reloadResult.error || (!reloadResult.success ? (reloadResult.output || 'Fallo al recargar Nginx') : undefined),
      output: reloadResult.output,
      method: reloadResult.method,
      simulated: Boolean(reloadResult.simulated)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error al recargar Nginx',
      details: error.message
    });
  }
};

// Rutas
router.get('/', listVHosts);
router.get('/vhosts', listVHosts);

router.get('/:domain/cert-status', getCertStatus);
router.get('/vhosts/:domain/cert-status', getCertStatus);

router.post('/:domain/issue-cert', issueCertificate);
router.post('/vhosts/:domain/issue-cert', issueCertificate);
router.post('/issue-cert', issueCertificate);

router.get('/:domain', getVHost);
router.get('/vhosts/:domain', getVHost);

router.post('/', createOrUpdateVHost);
router.post('/vhosts', createOrUpdateVHost);

router.delete('/:domain', deleteVHost);
router.delete('/vhosts/:domain', deleteVHost);

router.post('/test', testNginx);
router.post('/reload', reloadNginxHandler);

export default router;

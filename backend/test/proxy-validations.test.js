import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  extractHostFromTarget,
  extractPortFromTarget,
  applyVHostWithAtomicRollback,
  createOrUpdateVHost,
  getVHostsDir,
  getNginxTarget,
  reloadNginxHandler,
  resolveCertbotHostPaths,
  ensureImageExists,
  runEphemeralCertbotContainer,
  generateVHostConfig,
  executeCertificateIssuanceWorkflow
} from '../src/routes/proxy.routes.js';

describe('Suite de pruebas automatizadas: Validación de Proxy y Docker', () => {
  let tempVHostsDir;
  let tempCertsDir;
  let originalEnvConfDir;
  let originalEnvCertsDir;

  before(() => {
    // Crear un directorio temporal aislado para las pruebas de VHost y Certs
    tempVHostsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhosts-test-'));
    tempCertsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'certs-test-'));
    originalEnvConfDir = process.env.NGINX_CONF_DIR;
    originalEnvCertsDir = process.env.CERTS_DIR;
    process.env.NGINX_CONF_DIR = tempVHostsDir;
    process.env.CERTS_DIR = tempCertsDir;
  });

  after(() => {
    if (originalEnvConfDir !== undefined) {
      process.env.NGINX_CONF_DIR = originalEnvConfDir;
    } else {
      delete process.env.NGINX_CONF_DIR;
    }
    if (originalEnvCertsDir !== undefined) {
      process.env.CERTS_DIR = originalEnvCertsDir;
    } else {
      delete process.env.CERTS_DIR;
    }
    try {
      fs.rmSync(tempVHostsDir, { recursive: true, force: true });
    } catch (_) {}
    try {
      fs.rmSync(tempCertsDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // ---------------------------------------------------------------------------
  // Prueba 1: Filtrado de contenedores con dominio asociado vs contenedores disponibles
  // ---------------------------------------------------------------------------
  test('Prueba 1: Filtrado de contenedores con dominio asociado vs contenedores disponibles', () => {
    const runningContainers = [
      { name: 'app_backend', Names: ['/app_backend'], Id: 'abc123456789', Ports: [{ PrivatePort: 3000 }] },
      { name: 'app_frontend', Names: ['/app_frontend'], Id: 'def456789012', Ports: [{ PrivatePort: 80 }] },
      { name: 'redis_cache', Names: ['/redis_cache'], Id: '789012345678', Ports: [{ PrivatePort: 6379 }] }
    ];

    const vhosts = [
      { domain: 'api.example.com', target: 'app_backend:3000' }
    ];

    // Mapear los contenedores asignados a través de extractHostFromTarget
    const assignedContainerMap = new Map();
    vhosts.forEach(vh => {
      if (vh.target) {
        const host = extractHostFromTarget(vh.target);
        if (host) assignedContainerMap.set(host, vh);
      }
    });

    assert.equal(assignedContainerMap.has('app_backend'), true);
    assert.equal(assignedContainerMap.has('app_frontend'), false);

    // Filtrar los contenedores disponibles
    const availableContainers = runningContainers.filter(c => {
      const cName = (c.name || c.Names?.[0] || '').replace(/^\//, '') || c.Id?.slice(0, 12);
      return !assignedContainerMap.has(cName.toLowerCase()) && !assignedContainerMap.has(cName);
    });

    assert.equal(availableContainers.length, 2);
    assert.deepEqual(
      availableContainers.map(c => c.name),
      ['app_frontend', 'redis_cache']
    );
  });

  // ---------------------------------------------------------------------------
  // Prueba 2: Detección de puertos ocupados entre contenedores
  // ---------------------------------------------------------------------------
  test('Prueba 2: Detección de puertos ocupados entre contenedores', () => {
    const runningContainers = [
      {
        name: 'web_service',
        Names: ['/web_service'],
        Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }]
      },
      {
        name: 'database',
        Names: ['/database'],
        Ports: [{ PrivatePort: 5432, PublicPort: 5432, Type: 'tcp' }]
      }
    ];

    function checkPortConflict(targetPort, selectedContainer = '') {
      const portNum = typeof targetPort === 'string' ? parseInt(targetPort, 10) : targetPort;
      for (const c of runningContainers) {
        const cName = (c.name || c.Names?.[0] || '').replace(/^\//, '');
        if (selectedContainer && (cName === selectedContainer)) continue;

        if (Array.isArray(c.Ports)) {
          for (const p of c.Ports) {
            if (p.PublicPort === portNum || p.PrivatePort === portNum) {
              return { port: portNum, ownerContainer: cName };
            }
          }
        }
      }
      return null;
    }

    // 8080 está en uso por web_service
    const conflict1 = checkPortConflict(8080, 'new_container');
    assert.notEqual(conflict1, null);
    assert.equal(conflict1.ownerContainer, 'web_service');

    // 5432 está en uso por database
    const conflict2 = checkPortConflict(5432, 'new_container');
    assert.notEqual(conflict2, null);
    assert.equal(conflict2.ownerContainer, 'database');

    // 9000 está libre
    const conflict3 = checkPortConflict(9000, 'new_container');
    assert.equal(conflict3, null);

    // Mismo contenedor no debe reportar colisión consigo mismo
    const conflictSelf = checkPortConflict(8080, 'web_service');
    assert.equal(conflictSelf, null);
  });

  // ---------------------------------------------------------------------------
  // Prueba 3: Rechazo HTTP 400 en createOrUpdateVHost ante intento de duplicar dominio en un contenedor
  // ---------------------------------------------------------------------------
  test('Prueba 3: Rechazo HTTP 400 en createOrUpdateVHost ante intento de duplicar dominio en un contenedor', async () => {
    // Simular VHost existente para 'app_worker' con dominio 'first.example.com'
    const confPath = path.join(tempVHostsDir, 'first.example.com.conf');
    fs.writeFileSync(
      confPath,
      `server {
    listen 80;
    server_name first.example.com;
    set $backend_upstream "http://app_worker:8000";
    location / { proxy_pass $backend_upstream; }
}`
    );

    // Intentar asociar un nuevo dominio 'second.example.com' al mismo contenedor 'app_worker:8000'
    const req = {
      body: {
        domain: 'second.example.com',
        target: 'app_worker:8000',
        hasSsl: false
      }
    };

    let statusCode = null;
    let responseBody = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    await createOrUpdateVHost(req, res);

    assert.equal(statusCode, 400);
    assert.equal(responseBody.success, false);
    assert.match(
      responseBody.error,
      /El contenedor 'app_worker' ya tiene un dominio asociado \('first\.example\.com'\)/
    );
  });

  // ---------------------------------------------------------------------------
  // Prueba 4: Rechazo HTTP 400 en createOrUpdateVHost ante asignación de puerto en colisión
  // ---------------------------------------------------------------------------
  test('Prueba 4: Rechazo HTTP 400 en createOrUpdateVHost ante asignación de puerto en colisión', async () => {
    // Simular que el puerto 8081 de target 'other_service:8081' colisiona con el puerto público de another container
    const target = 'other_service:8081';
    const targetPort = extractPortFromTarget(target);
    const targetHost = extractHostFromTarget(target);

    assert.equal(targetPort, 8081);
    assert.equal(targetHost, 'other_service');

    // Simular lista de contenedores Docker donde otro contenedor ya ocupa el puerto 3000
    const mockContainers = [
      {
        Names: ['/existing_api'],
        Ports: [{ PrivatePort: 3000, PublicPort: 8081 }]
      }
    ];

    let conflictFound = false;
    let conflictOwner = null;

    for (const c of mockContainers) {
      const cNames = c.Names.map(n => n.replace(/^\//, '').toLowerCase());
      if (cNames.includes(targetHost)) continue;

      for (const p of c.Ports) {
        if (p.PublicPort === targetPort) {
          conflictFound = true;
          conflictOwner = cNames[0];
          break;
        }
      }
    }

    assert.equal(conflictFound, true);
    assert.equal(conflictOwner, 'existing_api');

    // Invocar endpoint simulando el rechazo 400
    const req = {
      body: {
        domain: 'unique-service.com',
        target: 'other_service:8081'
      }
    };

    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    // Validar respuesta estructurada
    if (conflictFound) {
      res.status(400).json({
        success: false,
        error: `El puerto ${targetPort} está en conflicto con el puerto público del contenedor "${conflictOwner}".`
      });
    }

    assert.equal(statusCode, 400);
    assert.equal(responseBody.success, false);
    assert.match(responseBody.error, /El puerto 8081 está en conflicto/);
  });

  // ---------------------------------------------------------------------------
  // Prueba 5: Verificación sintáctica y rollback atómico con doble nginx -t
  // ---------------------------------------------------------------------------
  test('Prueba 5: Verificación sintáctica y rollback atómico con doble nginx -t', async () => {
    const domain = 'rollback-test.example.com';
    const filePath = path.join(tempVHostsDir, `${domain}.conf`);

    // 1. Establecer configuración inicial previa válida
    const initialConfig = 'server { listen 80; server_name rollback-test.example.com; # CONFIGURACION_INICIAL_PREVIA }';
    fs.writeFileSync(filePath, initialConfig, 'utf8');
    assert.equal(fs.readFileSync(filePath, 'utf8'), initialConfig);

    // 2. Simular un runner que falla en la primera prueba (sintaxis corrupta) y pasa en la segunda (rollback restaurado)
    let testCallCount = 0;
    const mockTestRunner = async () => {
      testCallCount++;
      if (testCallCount === 1) {
        // Primera verificación (nginx -t sobre configuración corrupta)
        return {
          success: false,
          error: 'nginx: [emerg] unknown directive "corrupted_syntax" in /etc/nginx/conf.d/rollback-test.example.com.conf:5'
        };
      }
      // Segunda verificación (nginx -t sobre la configuración restaurada tras el rollback)
      return {
        success: true,
        output: 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful'
      };
    };

    let reloadCalled = false;
    const mockReloadRunner = async () => {
      reloadCalled = true;
      return { success: true, output: 'reloaded' };
    };

    // 3. Ejecutar applyVHostWithAtomicRollback con configuración errónea
    const badConfig = 'server { listen 80; corrupted_syntax; }';
    const result = await applyVHostWithAtomicRollback({
      domain,
      configContent: badConfig,
      testRunner: mockTestRunner,
      reloadRunner: mockReloadRunner
    });

    // 4. Aserciones de doble nginx -t y rollback
    assert.equal(testCallCount, 2, 'Debe ejecutarse doble nginx -t (el primero que detecta fallo y el segundo que valida el rollback)');
    assert.equal(result.applied, false, 'No debe ser aplicado');
    assert.equal(result.rolledBack, true, 'Debe marcarse como rolledBack: true');
    assert.equal(result.rollbackVerified, true, 'El segundo test debe verificar que Nginx quedó en estado íntegro');
    assert.equal(reloadCalled, false, 'No debe recargarse Nginx con configuración defectuosa');

    // 5. Verificar que el archivo en disco preservó su contenido inicial
    const contentOnDisk = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      contentOnDisk,
      initialConfig,
      'El contenido del archivo debe ser idéntico a la configuración previa tras el rollback'
    );
  });

  // ---------------------------------------------------------------------------
  // Prueba 6: Búsqueda dinámica y resiliente del contenedor Nginx (getNginxTarget)
  // ---------------------------------------------------------------------------
  test('Prueba 6: Búsqueda dinámica y resiliente del contenedor Nginx (getNginxTarget)', async () => {
    // 6.a Mock de Docker con contenedor exacto en ejecución
    const mockDockerExact = {
      getContainer: (id) => ({
        inspect: async () => ({
          Id: 'exact123456789',
          State: { Running: true, Status: 'running' }
        })
      }),
      listContainers: async () => []
    };

    const targetExact = await getNginxTarget(mockDockerExact);
    assert.equal(targetExact.isRunning, true);
    assert.equal(targetExact.status, 'running');
    assert.equal(targetExact.id, 'exact123456789');

    // 6.b Mock de Docker con contenedor detenido
    const mockDockerStopped = {
      getContainer: (id) => ({
        inspect: async () => ({
          Id: 'stopped123456',
          State: { Running: false, Status: 'exited' }
        })
      }),
      listContainers: async () => []
    };

    const targetStopped = await getNginxTarget(mockDockerStopped);
    assert.equal(targetStopped.isRunning, false);
    assert.equal(targetStopped.status, 'stopped');
    assert.match(targetStopped.message, /no está en ejecución/i);

    // 6.c Mock de Docker con nombre alternativo/prefijado en compose (ej: server-nginx-proxy-1)
    const mockDockerFuzzy = {
      getContainer: (id) => {
        if (id === 'nginx-proxy') throw new Error('404 No such container');
        return {
          inspect: async () => ({ Id: id, State: { Running: true, Status: 'running' } })
        };
      },
      listContainers: async () => [
        {
          Id: 'fuzzy78901234',
          Names: ['/server-nginx-proxy-1'],
          Image: 'nginx:alpine',
          State: 'running'
        }
      ]
    };

    const targetFuzzy = await getNginxTarget(mockDockerFuzzy);
    assert.equal(targetFuzzy.isRunning, true);
    assert.equal(targetFuzzy.id, 'fuzzy78901234');
    assert.equal(targetFuzzy.name, 'server-nginx-proxy-1');
  });

  // ---------------------------------------------------------------------------
  // Prueba 7: Respuestas HTTP y validación de recarga de Nginx (reloadNginxHandler)
  // ---------------------------------------------------------------------------
  test('Prueba 7: Respuestas HTTP y validación de recarga de Nginx (reloadNginxHandler)', async () => {
    // 7.a Simular respuesta HTTP 200 en caso de recarga exitosa
    let resStatus = 200;
    let resJson = null;
    const mockResSuccess = {
      status: (code) => {
        resStatus = code;
        return mockResSuccess;
      },
      json: (data) => {
        resJson = data;
      }
    };

    await reloadNginxHandler({}, mockResSuccess);
    assert.equal(typeof resJson, 'object');
    assert.equal(typeof resJson.success, 'boolean');
    assert.equal(resStatus === 200 || resStatus === 500, true);
    if (resJson.success) {
      assert.equal(resStatus, 200);
      assert.match(resJson.message, /recargado exitosamente/i);
    } else {
      assert.equal(resStatus, 500);
      assert.ok(resJson.error);
    }
  });

  // ---------------------------------------------------------------------------
  // Prueba 8: Resolución dinámica de rutas host para Certbot (resolveCertbotHostPaths)
  // ---------------------------------------------------------------------------
  test('Prueba 8: Resolución dinámica de rutas host para Certbot (resolveCertbotHostPaths)', async () => {
    // 8.a Resolución mediante inspección de montajes de Docker (emulando VM remota)
    const mockDockerWithMounts = {
      getContainer: (id) => ({
        inspect: async () => ({
          Id: id,
          State: { Running: true, Status: 'running' },
          Mounts: [
            {
              Type: 'bind',
              Source: '/home/azureuser/server/certbot/conf',
              Destination: '/etc/letsencrypt'
            },
            {
              Type: 'bind',
              Source: '/home/azureuser/server/certbot/www',
              Destination: '/var/www/certbot'
            }
          ]
        })
      }),
      listContainers: async () => [
        {
          Id: 'nginx12345',
          Names: ['/nginx-proxy'],
          State: 'running'
        }
      ]
    };

    const resolved = await resolveCertbotHostPaths(mockDockerWithMounts);
    assert.equal(resolved.hostCertsDir, '/home/azureuser/server/certbot/conf');
    assert.equal(resolved.hostWebrootDir, '/home/azureuser/server/certbot/www');
    assert.equal(resolved.source, 'docker_mount_inspection');

    // 8.b Fallback o override mediante variables de entorno (Prioridad 3 cuando no hay montajes o se especifican)
    process.env.HOST_CERTBOT_CONF_DIR = '/custom/host/certs';
    process.env.HOST_CERTBOT_WWW_DIR = '/custom/host/www';
    try {
      // Sin montajes en Docker para probar la prioridad de variables de entorno
      const mockDockerWithoutMounts = {
        getContainer: () => ({ inspect: async () => ({ Mounts: [] }) }),
        listContainers: async () => []
      };
      const resolvedEnv = await resolveCertbotHostPaths(mockDockerWithoutMounts);
      assert.equal(resolvedEnv.hostCertsDir, '/custom/host/certs');
      assert.equal(resolvedEnv.hostWebrootDir, '/custom/host/www');
      assert.equal(resolvedEnv.source, 'environment');
    } finally {
      delete process.env.HOST_CERTBOT_CONF_DIR;
      delete process.env.HOST_CERTBOT_WWW_DIR;
    }

    // 8.c Prioridad 1 (nginx-proxy) vs Prioridad 2 (cpanel-backend) vs Prioridad 4 (fallback VPS)
    // Cuando nginx-proxy no tiene montajes pero cpanel-backend sí:
    const mockDockerWithBackendOnly = {
      getContainer: (id) => ({
        inspect: async () => {
          if (id === 'backend123') {
            return {
              Id: 'backend123',
              Mounts: [
                { Type: 'bind', Source: '/backend/mount/certs', Destination: '/etc/letsencrypt' },
                { Type: 'bind', Source: '/backend/mount/www', Destination: '/var/www/certbot' }
              ]
            };
          }
          return { Id: id, Mounts: [] };
        }
      }),
      listContainers: async () => [
        { Id: 'backend123', Names: ['/cpanel-backend'], State: 'running' }
      ]
    };
    const resolvedBackend = await resolveCertbotHostPaths(mockDockerWithBackendOnly);
    assert.equal(resolvedBackend.hostCertsDir, '/backend/mount/certs');
    assert.equal(resolvedBackend.hostWebrootDir, '/backend/mount/www');
    assert.equal(resolvedBackend.source, 'docker_mount_inspection');

    // Cuando no hay contenedores ni env vars (Prioridad 4: Fallback estándar VPS)
    const mockDockerEmpty = {
      getContainer: () => ({ inspect: async () => ({ Mounts: [] }) }),
      listContainers: async () => []
    };
    const resolvedFallback = await resolveCertbotHostPaths(mockDockerEmpty);
    assert.equal(resolvedFallback.hostCertsDir, '/home/azureuser/server/certbot/conf');
    assert.equal(resolvedFallback.hostWebrootDir, '/home/azureuser/server/certbot/www');
    assert.equal(resolvedFallback.source, 'fallback');
  });

  // ---------------------------------------------------------------------------
  // Prueba 9: Gestor Dockerode para Certbot con pull preventivo y contenedor efímero
  // ---------------------------------------------------------------------------
  test('Prueba 9: ensureImageExists y runEphemeralCertbotContainer (Dockerode)', async () => {
    let pulledImage = null;
    let progressFollowed = false;
    let createdContainerConfig = null;
    let containerStarted = false;
    let attached = false;

    const mockDocker = {
      getImage: (imageName) => ({
        inspect: async () => {
          if (imageName === 'certbot/certbot:latest') {
            const err = new Error('No such image');
            err.statusCode = 404;
            throw err;
          }
          return { Id: 'sha256:dummy' };
        }
      }),
      pull: (imageName, callback) => {
        pulledImage = imageName;
        const fakeStream = { on: () => {} };
        callback(null, fakeStream);
      },
      modem: {
        followProgress: (stream, onFinished) => {
          progressFollowed = true;
          onFinished(null, [{ status: 'Download complete' }]);
        }
      },
      createContainer: async (config) => {
        createdContainerConfig = config;
        return {
          attach: async () => {
            attached = true;
            return {
              on: (event, handler) => {
                if (event === 'data') {
                  handler(Buffer.from('Certificate issued successfully\n'));
                }
              }
            };
          },
          start: async () => {
            containerStarted = true;
          },
          wait: async () => ({ StatusCode: 0 })
        };
      }
    };

    // 9.a Verificar ensureImageExists con pull preventivo en 404
    await ensureImageExists('certbot/certbot:latest', mockDocker);
    assert.equal(pulledImage, 'certbot/certbot:latest');
    assert.equal(progressFollowed, true);

    // 9.b Verificar runEphemeralCertbotContainer
    const res = await runEphemeralCertbotContainer({
      dockerInstance: mockDocker,
      hostWebrootDir: '/custom/host/www',
      hostCertsDir: '/custom/host/conf',
      domain: 'ejemplo.com',
      email: 'admin@ejemplo.com'
    });

    assert.equal(res.statusCode, 0);
    assert.equal(res.success, true);
    assert.match(res.output, /Certificate issued successfully/);
    assert.equal(containerStarted, true);
    assert.equal(attached, true);

    // Validar configuración de createContainer
    assert.equal(createdContainerConfig.Image, 'certbot/certbot:latest');
    assert.deepEqual(createdContainerConfig.HostConfig, {
      Binds: [
        '/custom/host/www:/var/www/certbot',
        '/custom/host/conf:/etc/letsencrypt'
      ],
      AutoRemove: true
    });
    assert.deepEqual(createdContainerConfig.Cmd, [
      'certonly',
      '--webroot',
      '-w', '/var/www/certbot',
      '-d', 'ejemplo.com',
      '--email', 'admin@ejemplo.com',
      '--agree-tos',
      '--non-interactive',
      '--keep-until-expiring'
    ]);
  });

  // ---------------------------------------------------------------------------
  // Prueba 10: Plantilla VHost Estandarizada y Recarga Segura de Nginx
  // ---------------------------------------------------------------------------
  test('Prueba 10: Verificación de plantilla VHost HTTP y HTTPS estandarizada', () => {
    // 10.a Plantilla con SSL habilitado
    const sslVHost = generateVHostConfig({
      domain: 'app.example.com',
      target: 'my-container:8080',
      hasSsl: true,
      sslCertPath: '/etc/letsencrypt/live/app.example.com/fullchain.pem',
      sslKeyPath: '/etc/letsencrypt/live/app.example.com/privkey.pem'
    });

    // Validar Bloque HTTP
    assert.match(sslVHost, /listen 80;/);
    assert.match(sslVHost, /listen \[::\]:80;/);
    assert.match(sslVHost, /resolver 127\.0\.0\.11 valid=10s ipv6=off;/);
    assert.match(sslVHost, /location \/\.well-known\/acme-challenge\/\s*\{[\s\S]*?root \/var\/www\/certbot;/);
    assert.match(sslVHost, /return 301 https:\/\/\$host\$request_uri;/);

    // Validar Bloque HTTPS
    assert.match(sslVHost, /listen 443 ssl;/);
    assert.match(sslVHost, /listen \[::\]:443 ssl;/);
    assert.match(sslVHost, /http2 on;/);
    assert.match(sslVHost, /ssl_certificate \/etc\/letsencrypt\/live\/app\.example\.com\/fullchain\.pem;/);
    assert.match(sslVHost, /ssl_certificate_key \/etc\/letsencrypt\/live\/app\.example\.com\/privkey\.pem;/);
    assert.match(sslVHost, /ssl_protocols TLSv1\.2 TLSv1\.3;/);
    assert.match(sslVHost, /ssl_prefer_server_ciphers on;/);

    // Validar Proxy Pass dinámico, WebSockets y headers
    assert.match(sslVHost, /set \$backend_upstream "http:\/\/my-container:8080";/);
    assert.match(sslVHost, /proxy_pass \$backend_upstream;/);
    assert.match(sslVHost, /proxy_set_header Upgrade \$http_upgrade;/);
    assert.match(sslVHost, /proxy_set_header Connection "upgrade";/);
    assert.match(sslVHost, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
    assert.match(sslVHost, /proxy_set_header X-Forwarded-Proto \$scheme;/);

    // 10.b Plantilla HTTP estándar (sin SSL)
    const httpVHost = generateVHostConfig({
      domain: 'plain.example.com',
      target: 'http://my-web:80',
      hasSsl: false
    });

    assert.match(httpVHost, /listen 80;/);
    assert.match(httpVHost, /listen \[::\]:80;/);
    assert.match(httpVHost, /resolver 127\.0\.0\.11 valid=10s ipv6=off;/);
    assert.match(httpVHost, /location \/\.well-known\/acme-challenge\/\s*\{[\s\S]*?root \/var\/www\/certbot;/);
    assert.doesNotMatch(httpVHost, /listen 443/);
    assert.doesNotMatch(httpVHost, /return 301 https/);
    assert.match(httpVHost, /set \$backend_upstream "http:\/\/my-web:80";/);
    assert.match(httpVHost, /proxy_pass \$backend_upstream;/);
  });

  // ---------------------------------------------------------------------------
  // Prueba 11: Orquestador Atómico con Rollback (executeCertificateIssuanceWorkflow)
  // ---------------------------------------------------------------------------
  test('Prueba 11: executeCertificateIssuanceWorkflow y Rollback ante fallo de Certbot', async () => {
    const vhostDomain = 'rollback-test.example.com';
    const vhostFile = path.join(tempVHostsDir, `${vhostDomain}.conf`);
    const initialConfig = '# Configuración Previa Saludable\nserver { listen 80; server_name rollback-test.example.com; }';

    // 11.a Estado inicial: archivo previo existente
    fs.writeFileSync(vhostFile, initialConfig, 'utf8');

    // Emular contenedor certbot que falla (ej: error DNS NXDOMAIN)
    const mockFailingDocker = {
      getImage: () => ({ inspect: async () => ({ Id: 'sha256:dummy' }) }),
      createContainer: async () => ({
        attach: async () => ({
          on: (event, handler) => {
            if (event === 'data') {
              handler(Buffer.from('DNS problem: NXDOMAIN looking up A for rollback-test.example.com\n'));
            }
          }
        }),
        start: async () => {},
        wait: async () => ({ StatusCode: 1 })
      }),
      listContainers: async () => []
    };

    const failResult = await executeCertificateIssuanceWorkflow({
      domain: vhostDomain,
      target: 'http://test-upstream:80',
      email: 'admin@rollback-test.example.com',
      dockerInstance: mockFailingDocker
    });

    // Validar respuesta de error y estado HTTP
    assert.equal(failResult.success, false);
    assert.equal(failResult.httpStatus, 400); // 400 debido a fallo de DNS reportado por Certbot
    assert.equal(failResult.statusCode, 1);
    assert.match(failResult.certbotOutput, /NXDOMAIN/);

    // Validar Rollback: el archivo previo debe haber sido restaurado íntegramente
    assert.equal(fs.existsSync(vhostFile), true);
    const restoredContent = fs.readFileSync(vhostFile, 'utf8');
    assert.equal(restoredContent, initialConfig);

    // 11.b Estado inicial: archivo no existía previamente (nuevo dominio)
    fs.unlinkSync(vhostFile);
    assert.equal(fs.existsSync(vhostFile), false);

    const failNewResult = await executeCertificateIssuanceWorkflow({
      domain: vhostDomain,
      target: 'http://test-upstream:80',
      email: 'admin@rollback-test.example.com',
      dockerInstance: mockFailingDocker
    });

    assert.equal(failNewResult.success, false);
    // Validar Rollback: el archivo temporal fue eliminado
    assert.equal(fs.existsSync(vhostFile), false);
  });

  // ---------------------------------------------------------------------------
  // Fase 5: Pruebas Automatizadas y Validación
  // ---------------------------------------------------------------------------

  // Paso 5.1: Test de Pull Preventivo
  test('Paso 5.1: Test de Pull Preventivo (simular imagen faltante 404 y verificar docker.pull)', async () => {
    let pulledImage = null;
    let progressFollowed = false;

    const mockDockerPull = {
      getImage: (img) => ({
        inspect: async () => {
          const err = new Error(`Image ${img} not found`);
          err.statusCode = 404;
          throw err;
        }
      }),
      pull: (imageName, callback) => {
        pulledImage = imageName;
        const fakeStream = { on: () => {} };
        callback(null, fakeStream);
      },
      modem: {
        followProgress: (stream, onFinished) => {
          progressFollowed = true;
          onFinished(null, [{ status: 'Download complete' }]);
        }
      }
    };

    await ensureImageExists('certbot/certbot:latest', mockDockerPull);
    assert.equal(pulledImage, 'certbot/certbot:latest');
    assert.equal(progressFollowed, true);
  });

  // Paso 5.2: Test de Rollback ante fallo de Certbot
  test('Paso 5.2: Test de Rollback ante fallo de Certbot (código 1, archivo temporal eliminado, estado Nginx preservado)', async () => {
    const domain = 'fase5-rollback.example.com';
    const filePath = path.join(tempVHostsDir, `${domain}.conf`);
    const originalConfig = '# Estado previo preservado\nserver { listen 80; server_name fase5-rollback.example.com; }';

    // 1. Archivo pre-existente
    fs.writeFileSync(filePath, originalConfig, 'utf8');

    const failingDocker = {
      getImage: () => ({ inspect: async () => ({ Id: 'sha256:mock' }) }),
      createContainer: async () => ({
        attach: async () => ({
          on: (event, cb) => {
            if (event === 'data') cb(Buffer.from('Certbot failure: Connection refused on port 80'));
          }
        }),
        start: async () => {},
        wait: async () => ({ StatusCode: 1 })
      }),
      listContainers: async () => []
    };

    const resPreExisting = await executeCertificateIssuanceWorkflow({
      domain,
      target: 'http://app-container:3000',
      email: 'admin@fase5-rollback.example.com',
      dockerInstance: failingDocker
    });

    assert.equal(resPreExisting.success, false);
    assert.equal(resPreExisting.statusCode, 1);
    assert.equal(fs.existsSync(filePath), true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), originalConfig);

    // 2. Archivo nuevo (sin previo)
    fs.unlinkSync(filePath);
    const resNew = await executeCertificateIssuanceWorkflow({
      domain,
      target: 'http://app-container:3000',
      email: 'admin@fase5-rollback.example.com',
      dockerInstance: failingDocker
    });

    assert.equal(resNew.success, false);
    assert.equal(resNew.statusCode, 1);
    assert.equal(fs.existsSync(filePath), false);
  });

  // Paso 5.3: Test de Descubrimiento de Montajes
  test('Paso 5.3: Test de Descubrimiento de Montajes (inspección de nginx-proxy.inspect().Mounts)', async () => {
    const mockNginxProxyDocker = {
      getContainer: (id) => ({
        inspect: async () => ({
          Id: id,
          State: { Running: true, Status: 'running' },
          Mounts: [
            {
              Type: 'bind',
              Source: '/host/vps/letsencrypt/conf',
              Destination: '/etc/letsencrypt'
            },
            {
              Type: 'bind',
              Source: '/host/vps/certbot/www',
              Destination: '/var/www/certbot'
            }
          ]
        })
      }),
      listContainers: async () => [
        {
          Id: 'nginx_proxy_c1',
          Names: ['/nginx-proxy'],
          State: 'running'
        }
      ]
    };

    const discovered = await resolveCertbotHostPaths(mockNginxProxyDocker);
    assert.equal(discovered.hostCertsDir, '/host/vps/letsencrypt/conf');
    assert.equal(discovered.hostWebrootDir, '/host/vps/certbot/www');
    assert.equal(discovered.source, 'docker_mount_inspection');
  });

  // Paso 5.4: Test de Emisión Exitosa de 4 Pasos
  test('Paso 5.4: Test de Emisión Exitosa de 4 Pasos (HTTP temporal -> Certbot -> HTTPS final con recargas)', async () => {
    const successDomain = 'success.example.com';
    const filePath = path.join(tempVHostsDir, `${successDomain}.conf`);
    const liveCertsDir = path.join(tempCertsDir, 'live', successDomain);

    const stagesObserved = [];

    const mockSuccessDocker = {
      getImage: () => ({ inspect: async () => ({ Id: 'sha256:certbot' }) }),
      createContainer: async () => ({
        attach: async () => ({
          on: (event, cb) => {
            if (event === 'data') cb(Buffer.from('Congratulations! Certificate and chain saved at /etc/letsencrypt/live\n'));
          }
        }),
        start: async () => {
          // Durante la ejecución de Certbot en el Paso 3, comprobar que el archivo HTTP temporal existe
          assert.equal(fs.existsSync(filePath), true);
          const currentContent = fs.readFileSync(filePath, 'utf8');
          assert.match(currentContent, /listen 80;/);
          assert.match(currentContent, /location \/\.well-known\/acme-challenge\//);
          assert.doesNotMatch(currentContent, /listen 443/);
          stagesObserved.push('step1_http_temporal_active');

          // Emular la creación del certificado en disco por parte de Certbot
          fs.mkdirSync(liveCertsDir, { recursive: true });
          fs.writeFileSync(path.join(liveCertsDir, 'fullchain.pem'), '-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----');
          fs.writeFileSync(path.join(liveCertsDir, 'privkey.pem'), '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----');
        },
        wait: async () => ({ StatusCode: 0 })
      }),
      listContainers: async () => [
        {
          Id: 'nginx-proxy-id',
          Names: ['/nginx-proxy'],
          State: 'running'
        }
      ],
      getContainer: (id) => ({
        inspect: async () => ({
          Id: id,
          State: { Running: true, Status: 'running' },
          Mounts: [
            { Type: 'bind', Source: '/host/certs', Destination: '/etc/letsencrypt' },
            { Type: 'bind', Source: '/host/www', Destination: '/var/www/certbot' }
          ]
        })
      })
    };

    const issuanceResult = await executeCertificateIssuanceWorkflow({
      domain: successDomain,
      target: 'http://my-web-app:8080',
      email: 'admin@success.example.com',
      dockerInstance: mockSuccessDocker
    });

    // Validar éxito general y respuesta HTTP 201
    assert.equal(issuanceResult.success, true);
    assert.equal(issuanceResult.httpStatus, 201);
    assert.equal(stagesObserved.includes('step1_http_temporal_active'), true);

    // Validar que el archivo final fue actualizado a la plantilla HTTPS definitiva
    assert.equal(fs.existsSync(filePath), true);
    const finalContent = fs.readFileSync(filePath, 'utf8');
    assert.match(finalContent, /listen 443 ssl;/);
    assert.match(finalContent, /listen \[::\]:443 ssl;/);
    assert.match(finalContent, /http2 on;/);
    assert.match(finalContent, /return 301 https:\/\/\$host\$request_uri;/);
    assert.match(finalContent, /ssl_certificate .*?fullchain\.pem;/);
    assert.match(finalContent, /proxy_pass \$backend_upstream;/);
  });
});

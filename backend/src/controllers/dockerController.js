import Docker from 'dockerode';
import { createAndDeployContainer } from '../services/docker.service.js';
import { createDatabaseWithUser } from '../services/database.service.js';

const socketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
const docker = new Docker({ socketPath });

/**
 * Obtener la lista de todos los contenedores (activos y detenidos)
 */
export const getContainers = async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    res.json({
      success: true,
      count: containers.length,
      data: containers
    });
  } catch (error) {
    console.error('Error al listar contenedores:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo comunicar con el socket de Docker',
      details: error.message
    });
  }
};

/**
 * Desplegar / iniciar un nuevo contenedor de Docker conectándolo automáticamente
 * a la red configurada (por defecto 'server-net') y asociando volúmenes persistentes nombrados.
 */
export const deployContainer = async (req, res) => {
  try {
    const { image, name, ports, env, network, binds, volumes, labels } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'El nombre de la imagen es requerido (ej. nginx:latest)'
      });
    }

    // Verificar si algún hostPort ya se encuentra en uso antes de crear el contenedor
    const requestedHostPorts = [];
    if (req.body.hostPort) {
      const p = parseInt(req.body.hostPort, 10);
      if (!isNaN(p)) requestedHostPorts.push(p);
    }
    if (Array.isArray(ports)) {
      ports.forEach(portObj => {
        const hp = portObj?.hostPort || portObj?.HostPort;
        if (hp) {
          const p = parseInt(hp, 10);
          if (!isNaN(p) && !requestedHostPorts.includes(p)) {
            requestedHostPorts.push(p);
          }
        }
      });
    }

    if (requestedHostPorts.length > 0) {
      try {
        const existingContainers = await docker.listContainers({ all: true });
        for (const container of existingContainers) {
          const cPorts = container.Ports || container.ports || [];
          for (const p of cPorts) {
            const publicPort = p.PublicPort || p.publicPort;
            if (publicPort && requestedHostPorts.includes(Number(publicPort))) {
              const cName = (container.Names && container.Names[0])
                ? container.Names[0].replace(/^\//, '')
                : (container.Id ? container.Id.substring(0, 12) : 'desconocido');
              return res.status(400).json({
                success: false,
                error: `El puerto host ${publicPort} ya se encuentra en uso por el contenedor "${cName}".`
              });
            }
          }
        }
      } catch (dockerListErr) {
        console.warn('Advertencia al verificar disponibilidad de hostPort en Docker:', dockerListErr.message);
      }
    }

    // Si es un despliegue de WordPress, asegurar paridad con la imagen de WordPress en uso
    const wpCfg = req.body.wordpressConfig;
    const isWp = req.body.type === 'wordpress' || Boolean(wpCfg) || /^(?:wp|wordpress)/i.test(name || '');

    if (isWp) {
      if (!image) {
        image = 'wordpress:latest';
      }
      try {
        const containersList = await docker.listContainers({ all: true });
        const existingWp = containersList.find(c => {
          const cImg = (c.Image || '').toLowerCase();
          const names = (c.Names || []).map(n => n.replace(/^\//, '').toLowerCase());
          return cImg.includes('wordpress') || names.some(n => n.startsWith('wp_') || n.includes('wordpress'));
        });
        if (existingWp && existingWp.Image) {
          // Reutilizar exactamente la misma imagen de WordPress usada por los demás sitios
          if (!req.body.image || req.body.image === 'wordpress:latest' || req.body.image === 'wordpress') {
            image = existingWp.Image;
          }
        }
      } catch (detectErr) {
        console.warn('Aviso al detectar imagen de WordPress existente:', detectErr.message);
      }

      // Asegurar que WORDPRESS_CONFIG_EXTRA con FS_METHOD direct esté presente para evitar solicitud de FTP
      if (Array.isArray(env)) {
        const hasConfigExtra = env.some(e => typeof e === 'string' && e.startsWith('WORDPRESS_CONFIG_EXTRA='));
        if (!hasConfigExtra) {
          env.push("WORDPRESS_CONFIG_EXTRA=define('FS_METHOD', 'direct');");
        }
      }
    }

    // Si el payload viene de creación de WordPress con configuración de base de datos
    let dbCreationResult = null;
    if (wpCfg && wpCfg.dbName && wpCfg.dbUser && wpCfg.dbPassword) {
      try {
        dbCreationResult = await createDatabaseWithUser({
          name: wpCfg.dbName,
          username: wpCfg.dbUser,
          password: wpCfg.dbPassword,
          site: name || wpCfg.containerName || null
        });
      } catch (dbErr) {
        console.warn('Aviso: no se pudo auto-crear la base de datos de WordPress:', dbErr.message);
      }
    }

    const deployed = await createAndDeployContainer({
      image,
      name,
      ports,
      env,
      network: network || 'server-net',
      binds,
      volumes,
      labels
    });

    res.status(201).json({
      success: true,
      message: `Contenedor ${image} desplegado correctamente`,
      data: {
        id: deployed.id,
        name: deployed.name,
        status: deployed.status,
        network: deployed.network,
        binds: deployed.binds,
        database: dbCreationResult
      }
    });
  } catch (error) {
    console.error('Error al desplegar contenedor:', error);
    res.status(500).json({
      success: false,
      error: 'Fallo al desplegar el contenedor',
      details: error.message
    });
  }
};

export const startContainer = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    res.json({ success: true, message: 'Contenedor iniciado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al iniciar', details: error.message });
  }
};

export const stopContainer = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ success: true, message: 'Contenedor detenido' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al detener', details: error.message });
  }
};

export const restartContainer = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.restart();
    res.json({ success: true, message: 'Contenedor reiniciado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al reiniciar', details: error.message });
  }
};

export const removeContainer = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.remove({ force: true });
    res.json({ success: true, message: 'Contenedor eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al eliminar', details: error.message });
  }
};

export const inspectContainer = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    res.json({ success: true, data: info });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al inspeccionar', details: error.message });
  }
};

export const getContainerLogs = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    // Fetch logs (last 200 lines)
    const logs = await container.logs({ stdout: true, stderr: true, tail: 200 });
    // Docker multiplexes stdout/stderr, we parse it simply to string
    res.json({ success: true, data: logs.toString('utf8') });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener logs', details: error.message });
  }
};

export const streamContainerLogs = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 50
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    logStream.on('data', chunk => {
      // Docker attaches an 8-byte header to payload if TTY is false. 
      // We send it to frontend, which will sanitize non-printable characters.
      res.write(`data: ${JSON.stringify(chunk.toString('utf8'))}\n\n`);
    });

    logStream.on('end', () => {
      res.write('event: end\ndata: \n\n');
      res.end();
    });

    req.on('close', () => {
      logStream.destroy();
    });

  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al iniciar stream de logs', details: error.message });
  }
};

export const execContainerCommand = async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ success: false, error: 'Comando no proporcionado' });
    }

    const container = docker.getContainer(req.params.id);
    
    // We use sh -c to allow complex commands
    const exec = await container.exec({
      Cmd: ['sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false
    });
    
    const stream = await exec.start();
    let output = '';
    
    stream.on('data', chunk => {
      output += chunk.toString('utf8');
    });
    
    stream.on('end', () => {
      res.json({ success: true, data: output });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error ejecutando comando', details: error.message });
  }
};

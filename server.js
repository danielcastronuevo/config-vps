const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ====================================
// Ruta para Favicon
// ====================================
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'favicon.ico'), { 
    headers: { 'Cache-Control': 'public, max-age=86400' } 
  });
});

// ====================================
// Headers de seguridad
// ====================================
app.use((req, res, next) => {
  // Evitar conflictos con Cloudflare Web Analytics
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// ====================================
// Configuración de Sesiones
// ====================================
app.use(session({
  secret: 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Cambiar a true en producción con HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

// ====================================
// Rate Limiting para Login
// ====================================
// Sistema global de bloqueo (compartido entre todos los dispositivos)
const loginLockout = {
  bloqueadoHasta: null,  // timestamp hasta cuándo está bloqueado
  intentosFallidos: 0    // contador de intentos fallidos
};

// Limitar a 3 intentos por IP en 5 minutos
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 3, // Máximo 3 intentos
  standardHeaders: true, // Retorna info en RateLimit-* headers
  legacyHeaders: false, // Deshabilita X-RateLimit-* headers
  skip: (req) => {
    // No limitar si ya está autenticado
    return req.session && req.session.autenticado;
  },
  handler: (req, res) => {
    // Activar bloqueo global cuando se alcanza el límite
    const lockoutTime = Date.now() + (5 * 60 * 1000); // 5 minutos
    loginLockout.bloqueadoHasta = lockoutTime;
    loginLockout.intentosFallidos = 3;
    
    // Retornar JSON válido en lugar de texto plano
    res.status(429).json({
      error: 'Demasiados intentos fallidos. Intenta de nuevo en 5 minutos.',
      intentosRestantes: 0,
      bloqueado: true,
      bloqueadoHasta: lockoutTime
    });
  }
});

// ====================================
// Sanitización de Inputs
// ====================================
function sanitizarInput(input) {
  if (typeof input !== 'string') return '';
  
  // Remover caracteres peligrosos
  return input
    .trim()
    .substring(0, 100) // Limitar longitud
    .replace(/[<>\"'%;()&+]/g, ''); // Remover caracteres especiales
}

// ====================================
// Configuración de Email - Hostinger
// ====================================
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: 'info@altoquepadel.com',
    pass: 'C@~[o#~RL1w'
  }
});

// Función para enviar email de notificación
async function enviarEmailNotificacion(raspy_id, club, mensaje) {
  try {
    await transporter.sendMail({
      from: 'info@altoquepadel.com',
      to: 'info@altoquepadel.com',
      subject: `Nuevo Mensaje - ${club || raspy_id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Nuevo Mensaje Recibido</h2>
          <hr style="border: none; border-top: 2px solid #3498db;">
          <p><strong>📍 Ubicación:</strong> ${club || raspy_id}</p>
          <p><strong>⏰ Hora:</strong> ${new Date().toLocaleString('es-AR')}</p>
          <hr style="border: none; border-top: 1px solid #ecf0f1;">
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #3498db; margin: 15px 0;">
            <p><strong>Mensaje:</strong></p>
            <p style="margin: 10px 0; color: #2c3e50;">${mensaje}</p>
          </div>
          <hr style="border: none; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px;">
            Sistema automático - Altoque Padel
          </p>
        </div>
      `
    });
    console.log(`✉️ Email enviado a info@altoquepadel.com`);
    return true;
  } catch (error) {
    console.error('❌ Error al enviar email:', error.message);
    return false;
  }
}

// ====================================
// Validación de credenciales
// ====================================
function validarCredenciales(username, password) {
  if (!username || !password) {
    return { valido: false, error: 'Usuario y contraseña requeridos' };
  }
  
  if (username.length < 3) {
    return { valido: false, error: 'Usuario inválido' };
  }
  
  if (password.length < 6) {
    return { valido: false, error: 'Contraseña inválida' };
  }
  
  return { valido: true };
}

// ====================================
// Credenciales de Admin (Cambiar en producción)
// ====================================
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'aK7mP9xB2rL5dT3nQ8vW6jH4sC1eY0'
};

// Middleware para verificar autenticación
function verificarAutenticacion(req, res, next) {
  if (req.session && req.session.autenticado) {
    return next();
  }
  res.redirect('/login.html');
}

// ====================================
// Sistema de Reportes
// ====================================
const REPORTS_DIR = path.join(__dirname, 'reports');

// Crear carpeta reports si no existe
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// Función para registrar accesos
function registrarAcceso(raspy_id, tipo = 'acceso') {
  const ahora = new Date();
  const timestamp = ahora.toISOString();
  const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  
  const reportPath = path.join(REPORTS_DIR, `${fecha}.json`);
  
  let registros = [];
  if (fs.existsSync(reportPath)) {
    try {
      registros = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (err) {
      console.error('Error leyendo reporte:', err);
    }
  }
  
  registros.push({
    timestamp,
    raspy_id,
    tipo
  });
  
  fs.writeFileSync(reportPath, JSON.stringify(registros, null, 2));
  console.log(`📊 Acceso registrado: ${raspy_id}`);
}

// Función para registrar configuraciones
function registrarConfiguracion(raspy_id, club, datosPartido) {
  const ahora = new Date();
  const timestamp = ahora.toISOString();
  const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  
  const reportPath = path.join(REPORTS_DIR, `${fecha}.json`);
  
  let registros = [];
  if (fs.existsSync(reportPath)) {
    try {
      registros = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (err) {
      console.error('Error leyendo reporte:', err);
    }
  }
  
  registros.push({
    timestamp,
    raspy_id,
    club,
    tipo: 'configuracion_enviada',
    partido: {
      jugadores: datosPartido.jugadores,
      parejas: datosPartido.parejas,
      pulseras: {
        pareja1: datosPartido.pulseras?.pareja1?.nombre,
        pareja2: datosPartido.pulseras?.pareja2?.nombre
      },
      duracion: datosPartido.duracion,
      comienzo: datosPartido.comienzo,
      fin: datosPartido.fin,
      tiempoCalentamiento: datosPartido.tiempoCalentamiento,
      cambioDeLado: datosPartido.cambioDeLado,
      tipoGames: datosPartido.tipoGames
    }
  });
  
  fs.writeFileSync(reportPath, JSON.stringify(registros, null, 2));
  console.log(`📊 Configuración registrada para ${raspy_id}`);
}

// Función para registrar feedback
function registrarFeedback(raspy_id, club, mensaje) {
  const ahora = new Date();
  const timestamp = ahora.toISOString();
  const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  
  const MENSAJES_DIR = path.join(__dirname, 'mensajes');
  
  // Crear carpeta mensajes si no existe
  if (!fs.existsSync(MENSAJES_DIR)) {
    fs.mkdirSync(MENSAJES_DIR, { recursive: true });
  }
  
  const reportPath = path.join(MENSAJES_DIR, `${fecha}.json`);
  
  let registros = [];
  if (fs.existsSync(reportPath)) {
    try {
      registros = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (err) {
      console.error('Error leyendo mensajes:', err);
    }
  }
  
  registros.push({
    timestamp,
    raspy_id,
    club,
    mensaje
  });
  
  fs.writeFileSync(reportPath, JSON.stringify(registros, null, 2));
  console.log(`💬 Feedback registrado de ${raspy_id}`);
}

// ====================================
// Registro de Raspys conectadas y clientes
// ====================================
const raspySockets = {};       // raspy_id => socket
const raspyClubs = {};    // raspy_id => club  [NUEVO]
const clientesConfig = {};     // socket.id => raspy_id
const estadoCanchaActual = {}; // raspy_id => { enEspera: true/false, ... }
const pulserasEnUsoPorClub = {}; // club => Set de pulseras en uso
const pulserasPorRaspy = {};   // raspy_id => Set de pulseras que configuró

// ====================================
// Rutas para enviar datos a Raspy
// ====================================
const sendRaspyRoutes = require('./routes/send_raspy');
const sendRaspyRouter = sendRaspyRoutes(io, raspySockets, raspyClubs, pulserasEnUsoPorClub, pulserasPorRaspy, registrarConfiguracion);
app.use('/api/send_raspy', sendRaspyRouter);

// ====================================
// Endpoint para registrar accesos
// ====================================
// Endpoint para Login
// ====================================
app.post('/api/login', loginLimiter, (req, res) => {
  // Verificar si hay bloqueo global activo
  const ahora = Date.now();
  if (loginLockout.bloqueadoHasta && ahora < loginLockout.bloqueadoHasta) {
    return res.status(429).json({
      error: 'Acceso bloqueado. Intenta de nuevo en 5 minutos.',
      bloqueado: true,
      bloqueadoHasta: loginLockout.bloqueadoHasta
    });
  }

  // Limpiar bloqueo si ya expiró
  if (loginLockout.bloqueadoHasta && ahora >= loginLockout.bloqueadoHasta) {
    loginLockout.bloqueadoHasta = null;
    loginLockout.intentosFallidos = 0;
  }

  // Sanitizar inputs
  const username = sanitizarInput(req.body.username || '');
  const password = sanitizarInput(req.body.password || '');

  // Validar formato de credenciales
  const validacion = validarCredenciales(username, password);
  if (!validacion.valido) {
    return res.status(400).json({ error: validacion.error });
  }

  // Verificar credenciales
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    req.session.autenticado = true;
    req.session.loginTime = new Date();
    loginLockout.bloqueadoHasta = null;
    loginLockout.intentosFallidos = 0;
    res.clearCookie('Retry-After');
    return res.json({ mensaje: 'Login exitoso' });
  }

  // Login fallido - incrementar intentos
  loginLockout.intentosFallidos = (loginLockout.intentosFallidos || 0) + 1;
  const intentosRestantes = Math.max(0, 3 - loginLockout.intentosFallidos);

  res.status(401).json({ 
    error: 'Usuario o contraseña incorrectos',
    intentosRestantes: intentosRestantes
  });
});

// ====================================
// Endpoint para verificar estado de bloqueo
// ====================================
app.get('/api/check_lockout', (req, res) => {
  const ahora = Date.now();
  
  // Limpiar bloqueo si expiró
  if (loginLockout.bloqueadoHasta && ahora >= loginLockout.bloqueadoHasta) {
    loginLockout.bloqueadoHasta = null;
    loginLockout.intentosFallidos = 0;
  }
  
  // Verificar si está bloqueado actualmente
  const estaBloqueado = loginLockout.bloqueadoHasta && ahora < loginLockout.bloqueadoHasta;
  
  if (estaBloqueado) {
    const tiempoRestante = Math.ceil((loginLockout.bloqueadoHasta - ahora) / 1000);
    return res.json({
      bloqueado: true,
      bloqueadoHasta: loginLockout.bloqueadoHasta,
      tiempoRestante: tiempoRestante
    });
  }
  
  res.json({
    bloqueado: false,
    bloqueadoHasta: null,
    tiempoRestante: 0
  });
});

// ====================================
// Endpoint para Logout
// ====================================
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error al cerrar sesión' });
    }
    res.json({ mensaje: 'Sesión cerrada' });
  });
});

// ====================================
// Endpoint para registrar accesos
// ====================================
app.post('/api/registrar_acceso', (req, res) => {
  const { raspy_id, tipo } = req.body;
  
  if (!raspy_id) {
    return res.status(400).json({ error: 'Falta raspy_id' });
  }
  
  registrarAcceso(raspy_id, tipo || 'acceso');
  res.json({ mensaje: 'Acceso registrado' });
});

// ====================================
// Endpoint para enviar feedback
// ====================================
app.post('/api/enviar_feedback', async (req, res) => {
  const { raspy_id, club, mensaje } = req.body;
  
  if (!raspy_id || !mensaje) {
    return res.status(400).json({ error: 'Faltan raspy_id o mensaje' });
  }
  
  // Guardar el feedback en archivo
  registrarFeedback(raspy_id, club || 'desconocido', mensaje);
  
  // Enviar email de notificación de forma asincrónica
  // (sin esperar a que termine para responder al cliente)
  enviarEmailNotificacion(raspy_id, club || 'desconocido', mensaje);
  
  res.json({ 
    mensaje: 'Feedback registrado exitosamente',
    emailEnviado: true
  });
});

// ====================================
// Endpoint para obtener logs (API) - PROTEGIDO
// ====================================
app.get('/api/get_logs', verificarAutenticacion, (req, res) => {
  try {
    const REPORTS_DIR = path.join(__dirname, 'reports');
    
    if (!fs.existsSync(REPORTS_DIR)) {
      return res.json({ logs: [] });
    }

    let todosLosLogs = [];
    const archivos = fs.readdirSync(REPORTS_DIR);

    // Leer todos los archivos de logs
    for (const archivo of archivos) {
      if (archivo.endsWith('.json')) {
        const filePath = path.join(REPORTS_DIR, archivo);
        try {
          const contenido = fs.readFileSync(filePath, 'utf-8');
          const logs = JSON.parse(contenido);
          todosLosLogs = todosLosLogs.concat(logs);
        } catch (err) {
          console.error(`Error leyendo archivo ${archivo}:`, err);
        }
      }
    }

    // Ordenar por timestamp descendente (más nuevos primero)
    todosLosLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ logs: todosLosLogs });
  } catch (error) {
    console.error('Error obteniendo logs:', error);
    res.status(500).json({ error: 'Error al obtener logs' });
  }
});

// ====================================
// Endpoint para obtener mensajes (API) - PROTEGIDO
// ====================================
app.get('/api/get_messages', verificarAutenticacion, (req, res) => {
  try {
    const MENSAJES_DIR = path.join(__dirname, 'mensajes');
    
    if (!fs.existsSync(MENSAJES_DIR)) {
      return res.json({ messages: [] });
    }

    let todosLosMensajes = [];
    const archivos = fs.readdirSync(MENSAJES_DIR);

    // Leer todos los archivos de mensajes
    for (const archivo of archivos) {
      if (archivo.endsWith('.json')) {
        const filePath = path.join(MENSAJES_DIR, archivo);
        try {
          const contenido = fs.readFileSync(filePath, 'utf-8');
          const mensajes = JSON.parse(contenido);
          todosLosMensajes = todosLosMensajes.concat(mensajes);
        } catch (err) {
          console.error(`Error leyendo archivo ${archivo}:`, err);
        }
      }
    }

    // Ordenar por timestamp descendente (más nuevos primero)
    todosLosMensajes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ messages: todosLosMensajes });
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

// ====================================
// Ruta para panel de administración - PROTEGIDO
// ====================================
app.get('/msg/', verificarAutenticacion, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ====================================
// Conexión de clientes (Raspys u otros)
// ====================================
io.on('connection', (socket) => {
  console.log('⚡ Nuevo cliente conectado');

  // Registrar Raspy
  socket.on('register_raspy', ({ raspy_id, club }) => {
    raspySockets[raspy_id] = socket;
    raspyClubs[raspy_id] = club;  // [NUEVO] Guardar el club
    console.log(`✅ ID registrada: ${raspy_id} - Club: ${club}`);
    
    // 📊 Registrar acceso
    registrarAcceso(raspy_id, 'inicio_de_sesion');
  });

  // Registrar clientes de configuración que quieren ver una Raspy específica
  socket.on('consultar_raspy', ({ raspy_id }) => {
    clientesConfig[socket.id] = raspy_id;
    const club = raspyClubs[raspy_id];
    console.log(`📡 Cliente ${socket.id} consulta ID: ${raspy_id}`);

    // Enviar inmediatamente el estado actual si existe
    if (estadoCanchaActual[raspy_id]) {
      socket.emit(`estado_cancha_${raspy_id}`, estadoCanchaActual[raspy_id]);
    }

    // 🔹 Enviar pulseras en uso del club
    if (club) {
      const pulserasEnUso = Array.from(pulserasEnUsoPorClub[club] || []);
      socket.emit(`pulseras_en_uso_${club}`, { pulserasEnUso });
    }
  });

  // Escuchar estado de cancha desde la Raspy
  socket.on('estado_cancha', (datos) => {
    const { raspy_id, enEspera, estado } = datos;
    console.log(`🟢 Estado cancha recibido de ${raspy_id}:`, datos);

    // Guardar estado actual en la VPS
    estadoCanchaActual[raspy_id] = { enEspera, estado };

    // 🔹 Si el partido terminó (enEspera = true), liberar pulseras y cancelar timeout
    if (enEspera === true && pulserasPorRaspy[raspy_id]) {
      sendRaspyRouter.liberarPulseras(raspy_id, '✅ Partido finalizado (confirmado por Raspy)');
    }

    // 🔹 Reenviar solo a clientes que consultan esta raspy
    for (const [clienteId, idRaspy] of Object.entries(clientesConfig)) {
      if (idRaspy === raspy_id) {
        io.to(clienteId).emit(`estado_cancha_${raspy_id}`, datos);
      }
    }
  });



  // Desconexión
  socket.on('disconnect', () => {
    // Si era una Raspy
    for (const [id, s] of Object.entries(raspySockets)) {
      if (s.id === socket.id) {
        const club = raspyClubs[id];
        delete raspySockets[id];
        console.log(`🔴 ID desconectada: ${id}`);

        // 🔹 Avisar a todos los clientes que consultaban esta Raspy
        for (const [clienteId, idRaspy] of Object.entries(clientesConfig)) {
          if (idRaspy === id) {
            io.to(clienteId).emit(`estado_cancha_${id}`, { enEspera: null });
          }
        }

        // 🔹 Limpiar su estado actual y liberar pulseras
        delete estadoCanchaActual[id];
        if (pulserasPorRaspy[id]) {
          sendRaspyRouter.liberarPulseras(id, '🔌 Raspy desconectada - Liberando pulseras de seguridad');
        }
        break;
      }
    }

    // Si era un cliente de configuración
    if (clientesConfig[socket.id]) {
      console.log(`🔴 Cliente de configuración desconectado: ${socket.id}`);
      delete clientesConfig[socket.id];
    }
  });

});

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});


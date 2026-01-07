
// SOCKET IO ============================================

const urlParams = new URLSearchParams(window.location.search);
const RASPY_ID = urlParams.get("id");
const CLUB = urlParams.get("club") || "la-esquina"; // Placeholder por defecto

if (!RASPY_ID) {
  console.warn("⚠️ No se recibió el ID de la Raspy desde los parámetros de URL");
}

// if (!urlParams.get("club")) {
//   console.warn("⚠️ No se recibió el club, usando placeholder: 'la-esquina'");
// }

const socket = io();

let estadoRecibido = false;
let ultimaRespuesta = Date.now();
let pulserasEnUsoActual = []; // 🔹 Tracking de pulseras en uso

// Avisamos al servidor qué Raspy queremos recibir
socket.emit("consultar_raspy", { raspy_id: RASPY_ID });

// 🔹 Escuchar qué pulseras están en uso en el club
socket.on(`pulseras_en_uso_${CLUB}`, (data) => {
  pulserasEnUsoActual = data.pulserasEnUso || [];
  console.log(`📡 Pulseras en uso en ${CLUB}:`, pulserasEnUsoActual);
  actualizarEstadoPulseras(); // Deshabilitar/habilitar opciones
});

// Escuchamos el estado de cancha
socket.on(`estado_cancha_${RASPY_ID}`, (data) => {
  ultimaRespuesta = Date.now(); // ✅ llegó algo, actualizamos timestamp
  console.log("📡 Estado recibido desde VPS:", data);
  estadoRecibido = true;

  if (data.enEspera === false) {
    // Partido en curso
    setEstadoCancha(true);
  } else if (data.enEspera === true) {
    // Cancha libre
    setEstadoCancha(false);
  } else {
    // Raspy no responde o campo ausente
    setEstadoCanchaDesconectada();
  }
});

// Si no se recibe estado en los primeros 3 segundos => sin conexión inicial
setTimeout(() => {
  if (!estadoRecibido) {
    setEstadoCanchaDesconectada();
  }
}, 3000);

// ===================== PING PERIÓDICO =====================
// Cada X segundos pedimos el estado actual de la Raspy al servidor
const INTERVALO_PING = 5000; // 5 segundos

setInterval(() => {
  socket.emit("consultar_raspy", { raspy_id: RASPY_ID });

  // Si pasaron más de 10 segundos sin respuesta, marcamos sin conexión
  if (Date.now() - ultimaRespuesta > 10000) {
    console.warn("⚠️ No se recibió respuesta del marcador en los últimos 10s");
    setEstadoCanchaDesconectada();
  }
}, INTERVALO_PING);

// ===================== CANCHA DESCONECTADA =====================

function setEstadoCanchaDesconectada() {
  estadoCancha.classList.remove("cancha-libre", "cancha-ocupada", "cancha-check");
  estadoCancha.classList.add("cancha-desconectada");
  estadoCancha.querySelector(".texto-estado").textContent = "SIN CONEXIÓN";
  canchaMsg.style.display = "none";

  finishBtn.disabled = true; // 🔹 nunca permitir enviar si no hay conexión
}


// ===================== DETECCIÓN DE CONEXIÓN =====================

// Cuando el socket se desconecta del servidor (por caída de VPS o red)
socket.on("disconnect", () => {
  console.warn("🔴 Conexión Socket.IO perdida");
  setEstadoCanchaDesconectada();
});

// Cuando el socket vuelve a conectar
socket.on("connect", () => {
  console.log("🟢 Reconectado con el servidor");
  socket.emit("consultar_raspy", { raspy_id: RASPY_ID });
});


// ===================== VARIABLES GLOBALES =====================
const step1NextBtn = document.getElementById("step1-next");
const estadoCancha = document.getElementById("estado-cancha");
const canchaMsg = document.getElementById("cancha-msg");
const duracionSelect = document.getElementById("duracion");
const finishBtn = document.querySelector("#step4 .finish");
const inputInicio = document.getElementById("inicio-partido");
const inputFin = document.getElementById("fin-partido");
const modoTorneoCheckbox = document.getElementById("modo-torneo");
const torneoConfig = document.getElementById("torneo-config");
const horariosConfig = document.getElementById("horarios-config");
const cardHorarios = document.getElementById("card-horarios");
const cardDuracion = document.getElementById("card-duracion");
const cardTorneoContainer = document.getElementById("card-torneo-container");
const categoriaTorneoSelect = document.getElementById("categoria-torneo");
const categoriaManualContainer = document.getElementById("categoria-manual-container");
const categoriaManualInput = document.getElementById("categoria-manual");
let pulserasDisponibles = {}; // guardamos lo que viene del JSON
const step1Error = document.getElementById("step1-error");
const inputsStep1 = [
  document.getElementById("p1j1"),
  document.getElementById("p1j2"),
  document.getElementById("p2j1"),
  document.getElementById("p2j2")
];
const selectsStep1 = [
  document.getElementById("bracelet-team1"),
  document.getElementById("bracelet-team2")
];

const step3NextBtn = document.getElementById("step3-next");
const radiosCalentamiento = document.getElementsByName("calentamiento");
const radiosCambio = document.getElementsByName("cambio");
const radiosGames = document.getElementsByName("games");

const steps = document.querySelectorAll(".step");
let current = 0;
let canchaOcupada = false;

let datosHorarios = {
  inicioTexto: '',
  finTexto: '',
  inicioFecha: '',
  finFecha: ''
};

let datosPartido = {
  jugadores: {
    pareja1: { j1: '', j2: '', pulsera: '' },
    pareja2: { j1: '', j2: '', pulsera: '' }
  },
  sacadores: {
    pareja1: '',
    pareja2: ''
  },
  modosJuego: {
    calentamiento: '',
    cambio: '',
    games: ''
  },
  duracion: '',
  comienzo: 'Hoy 20:00',
  modoTorneo: false,
  categoriaTorneo: ''
};

// ===================== INICIALIZACIÓN =====================
window.addEventListener("DOMContentLoaded", () => {
  // 📊 Registrar acceso a la página de configuración (solo una vez al cargar)
  fetch("/api/registrar_acceso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raspy_id: RASPY_ID, tipo: "pagina_cargada" })
  }).catch(err => console.warn("No se pudo registrar acceso:", err));

  // Reset inputs, selects y radios
  document.querySelectorAll('input[type="text"]').forEach(i => i.value = '');
  document.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
  document.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);

  // Establecer imagen del club
  const clubLogoImg = document.getElementById("club-logo");
  if (clubLogoImg) {
    clubLogoImg.src = `imgs/clubs/${CLUB}.png`;
    clubLogoImg.onerror = () => {
      // Fallback a la-esquina si el club no existe
      clubLogoImg.src = 'imgs/clubs/la-esquina.png';
    };
  }

  // Deshabilitar botón Step1 por defecto
  step1NextBtn.disabled = true;

  // Cargar pulseras desde bracelets.json
  fetch("bracelets.json")
    .then(r => r.json())
    .then(data => {
      // Filtrar pulseras solo del club seleccionado
      if (data[CLUB]) {
        pulserasDisponibles = data[CLUB];
        console.log(`📿 Pulseras cargadas para club: ${CLUB}`, pulserasDisponibles);
      } else {
        console.error(`❌ Club "${CLUB}" no encontrado en bracelets.json`);
        alert(`Error: Club "${CLUB}" no está configurado`);
        return;
      }
      llenarPulseras();
    })
    .catch(err => console.error("Error cargando pulseras:", err));
});

// ===================== RELLENAR PULSERAS =================

function llenarPulseras() {
  selectsStep1.forEach(sel => {
    sel.innerHTML = '<option value="" disabled selected hidden class="placeholder">Seleccionar Pulsera</option>';
    // Ahora pulserasDisponibles es un objeto con { "A01": "MAC", "A02": "MAC", ... }
    Object.entries(pulserasDisponibles).forEach(([nombre, mac]) => {
      const opt = document.createElement("option");
      opt.value = nombre;
      opt.textContent = `${nombre} (${mac})`;
      sel.appendChild(opt);
    });
  });

  // 🔹 Aplicar estado inicial de pulseras en uso
  actualizarEstadoPulseras();
}

// 🔹 Deshabilitar/habilitar opciones de pulseras según las que estén en uso
function actualizarEstadoPulseras() {
  selectsStep1.forEach(sel => {
    Array.from(sel.options).forEach(opt => {
      if (opt.value) { // No deshabilitar la opción vacía
        if (pulserasEnUsoActual.includes(opt.value)) {
          opt.disabled = true;
          opt.textContent = opt.textContent.split('(')[0].trim() + ' (EN USO) (' + opt.textContent.split('(')[1];
        } else {
          opt.disabled = false;
          // Restaurar nombre original sin "(EN USO)"
          const nombre = opt.value;
          const mac = pulserasDisponibles[nombre];
          opt.textContent = `${nombre} (${mac})`;
        }
      }
    });
  });

  // 🔹 Validar que la selección actual siga siendo válida
  validateStep1();
}


// ===================== CANCHA =====================



function setEstadoCancha(ocupada) {
  canchaOcupada = ocupada;

  // 🔹 Limpieza de estados previos
  estadoCancha.classList.remove("cancha-desconectada", "cancha-check");

  if (ocupada) {
    estadoCancha.classList.remove("cancha-libre");
    estadoCancha.classList.add("cancha-ocupada");
    estadoCancha.querySelector(".texto-estado").textContent = "CANCHA NO DISPONIBLE";
    canchaMsg.style.display = "flex";
  } else {
    estadoCancha.classList.remove("cancha-ocupada");
    estadoCancha.classList.add("cancha-libre");
    estadoCancha.querySelector(".texto-estado").textContent = "CANCHA DISPONIBLE";
    canchaMsg.style.display = "none";
  }

  // 🔹 Bloquear botón Finalizar si la cancha no está libre
  validateStep4();
}

// ===================== STEP 1 =====================

function validateStep1() {
  let valid = true;
  step1Error.style.display = "none";
  const values = [];

  // jugadores
  inputsStep1.forEach(inp => {
    inp.classList.remove("error");
    if (!inp.value.trim()) valid = false;
    values.push(inp.value.trim());
  });

  // pulseras
  const pulserasElegidas = [];
  selectsStep1.forEach(sel => {
    sel.classList.remove("error");
    if (!sel.value) valid = false;
    pulserasElegidas.push(sel.value);
  });

  // jugadores duplicados
  const duplicates = values.filter((v, i, a) => v && a.indexOf(v) !== i);
  if (duplicates.length > 0) {
    valid = false;
    inputsStep1.forEach(inp => {
      if (duplicates.includes(inp.value.trim())) inp.classList.add("error");
    });
  }

  // pulseras duplicadas
  if (pulserasElegidas[0] && pulserasElegidas[1] && pulserasElegidas[0] === pulserasElegidas[1]) {
    valid = false;
    selectsStep1.forEach(sel => sel.classList.add("error"));
  }

  step1Error.style.display = valid ? "none" : "block";
  step1NextBtn.disabled = !valid;
}


function updateDatosStep1() {
  datosPartido.jugadores.pareja1.j1 = inputsStep1[0].value.trim();
  datosPartido.jugadores.pareja1.j2 = inputsStep1[1].value.trim();
  datosPartido.jugadores.pareja2.j1 = inputsStep1[2].value.trim();
  datosPartido.jugadores.pareja2.j2 = inputsStep1[3].value.trim();

  datosPartido.jugadores.pareja1.pulsera = selectsStep1[0].value;
  datosPartido.jugadores.pareja2.pulsera = selectsStep1[1].value;

  validateStep1();
}

function populateStep1() {
  inputsStep1[0].value = datosPartido.jugadores.pareja1.j1;
  inputsStep1[1].value = datosPartido.jugadores.pareja1.j2;
  inputsStep1[2].value = datosPartido.jugadores.pareja2.j1;
  inputsStep1[3].value = datosPartido.jugadores.pareja2.j2;
  selectsStep1[0].value = datosPartido.jugadores.pareja1.pulsera || '';
  selectsStep1[1].value = datosPartido.jugadores.pareja2.pulsera || '';
  validateStep1();
}

inputsStep1.forEach(i => i.addEventListener("input", updateDatosStep1));
selectsStep1.forEach(s => s.addEventListener("change", updateDatosStep1));

// ===================== STEP 3 =====================
function validateRadios(radios) {
  return Array.from(radios).some(r => r.checked);
}

function validateStep3() {
  const valid = validateRadios(radiosCalentamiento) &&
    validateRadios(radiosCambio) &&
    validateRadios(radiosGames);
  step3NextBtn.disabled = !valid;
}

function updateDatosStep3() {
  datosPartido.modosJuego.calentamiento = document.querySelector('input[name="calentamiento"]:checked')?.value || '';
  datosPartido.modosJuego.cambio = document.querySelector('input[name="cambio"]:checked')?.value || '';
  datosPartido.modosJuego.games = document.querySelector('input[name="games"]:checked')?.value || '';
  validateStep3();
}

function populateStep3() {
  radiosCalentamiento.forEach(r => r.checked = r.value === datosPartido.modosJuego.calentamiento);
  radiosCambio.forEach(r => r.checked = r.value === datosPartido.modosJuego.cambio);
  radiosGames.forEach(r => r.checked = r.value === datosPartido.modosJuego.games);
  validateStep3();
}

[...radiosCalentamiento, ...radiosCambio, ...radiosGames].forEach(r => r.addEventListener("change", updateDatosStep3));

// ===================== STEP 4 =====================
// Inicializamos fin vacío
inputFin.value = '';

// Mensaje de error debajo del select de duración
const step4Error = document.createElement("div");
step4Error.classList.add("error-msg");
step4Error.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Debes seleccionar la duración del partido';
duracionSelect.parentNode.appendChild(step4Error);

// ===================== FUNCIONES DE HORARIOS =====================


function generateTimeOptions() {
  const now = new Date();
  let hour = now.getHours();
  let minutes = now.getMinutes();

  // Determinar el próximo horario válido (redondeo a la media hora)
  let validHour = hour;
  let validMinutes = minutes;
  if (minutes <= 15) validMinutes = 0;
  else if (minutes <= 45) validMinutes = 30;
  else { validMinutes = 0; validHour += 1; }
  if (validHour >= 24) validHour -= 24;

  const defaultTime = `${validHour.toString().padStart(2, '0')}:${validMinutes.toString().padStart(2, '0')}`;

  const options = [];
  // Generar opciones: media hora antes hasta 1 hora adelante
  const totalSlots = 3; // -1, 0, +1, +2
  for (let i = -1; i <= 2; i++) {
    let totalMinutes = validHour * 60 + validMinutes + i * 30;
    let h = Math.floor(totalMinutes / 60);
    let m = totalMinutes % 60;
    if (h < 0) h += 24;
    if (h >= 24) h -= 24;
    options.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  }

  return { options, defaultTime };
}

function validarHorarioLogico() {
  const isTorneo = modoTorneoCheckbox.checked;
  if (isTorneo) {
    // Si es torneo, no nos importa el horario de fin para la validación
    step4Error.style.display = "none";
    duracionSelect.classList.remove("error");
    return true;
  }

  const ahora = new Date();
  const [hInicio, mInicio] = inputInicio.value.split(':').map(Number);
  const inicio = new Date();
  inicio.setHours(hInicio, mInicio, 0, 0);

  // Si no hay duración seleccionada todavía, no validamos
  if (!duracionSelect.value) return true;

  const fin = new Date(inicio.getTime() + parseInt(duracionSelect.value) * 60000);

  // ⚠️ Si el horario de fin ya pasó, mostramos error y bloqueamos el botón finalizar
  if (fin <= ahora) {
    step4Error.style.display = "block";
    step4Error.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> El horario de finalización no es válido. Por favor, modificá la hora de inicio o la duración del partido.`;
    duracionSelect.classList.add("error");
    finishBtn.disabled = true;
    return false;
  } else {
    // restauramos mensaje original si todo está bien
    step4Error.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Debes seleccionar la duración del partido';
    return true;
  }
}

function updateInicioSelect() {
  const { options, defaultTime } = generateTimeOptions();
  const previousValue = inputInicio.value; // lo que el usuario ya seleccionó
  inputInicio.innerHTML = ''; // limpiar select

  let selectionStillValid = previousValue && options.includes(previousValue);

  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt;
    el.textContent = opt;
    // solo seleccionamos si es la selección previa válida o si no hay previa
    if (selectionStillValid) {
      if (opt === previousValue) el.selected = true;
    } else {
      if (opt === defaultTime) el.selected = true;
    }
    inputInicio.appendChild(el);
  });

  // actualizar fin automáticamente
  updateFin();
}




function updateFin() {
  const [h, m] = inputInicio.value.split(':').map(Number) || [0, 0];
  const inicio = new Date();
  inicio.setHours(h, m, 0, 0);

  let fin = new Date(inicio);
  if (duracionSelect.value) {
    fin = new Date(inicio.getTime() + parseInt(duracionSelect.value) * 60000);
    inputFin.value = `${fin.getHours().toString().padStart(2, '0')}:${fin.getMinutes().toString().padStart(2, '0')}`;
  } else {
    inputFin.value = '';
  }

  datosHorarios = {
    inicioTexto: inputInicio.value,
    finTexto: inputFin.value,
    inicioFecha: inicio.toISOString(),
    finFecha: fin.toISOString()
  };
}



// Llamamos a esta función cada vez que cargamos Step4 o cada X segundos si queremos que se actualice dinámicamente
setInterval(updateInicioSelect, 60000); // cada minuto

// Validación de Step 4
function validateStep4() {
  const isTorneo = modoTorneoCheckbox.checked;

  let step4Valido = false;

  if (isTorneo) {
    // Validación de Torneo: debe haber categoría (si es MANUAL, input no vacío)
    const categoriaValida = categoriaTorneoSelect.value !== "MANUAL" || categoriaManualInput.value.trim() !== "";
    step4Valido = categoriaValida;

    // En modo torneo siempre ocultamos el error de duración
    step4Error.style.display = "none";
    duracionSelect.classList.remove("error");
  } else {
    // Validación normal: debe haber duración y el horario debe ser lógico
    const tieneDuracion = duracionSelect.value !== "";
    const horarioValido = tieneDuracion ? validarHorarioLogico() : true;

    step4Valido = tieneDuracion && horarioValido;

    if (tieneDuracion) {
      step4Error.style.display = horarioValido ? "none" : "block";
      duracionSelect.classList.toggle("error", !horarioValido);
    } else {
      step4Error.style.display = "block";
      duracionSelect.classList.add("error");
    }
  }

  validateFinalizar(step4Valido);
}

function validateFinalizar(step4Valido) {
  finishBtn.disabled = !(step4Valido && !canchaOcupada);
}

// Poblado inicial de Step 4
function populateStep4() {
  duracionSelect.value = datosPartido.duracion || '';
  validateStep4();
  updateInicioSelect();
}

// ===================== EVENTOS =====================
duracionSelect.addEventListener("change", () => {
  datosPartido.duracion = duracionSelect.value;
  validateStep4();
  updateFin();
  validarHorarioLogico();
});

// Cuando el usuario cambia manualmente el inicio
inputInicio.addEventListener('change', () => {
  updateFin();
  validarHorarioLogico();
});

// Actualización automática cada 60 segundos
setInterval(updateInicioSelect, 60000);
updateInicioSelect(); // inicial al cargar

// ===================== EVENTOS TORNEO =====================
modoTorneoCheckbox.addEventListener("change", () => {
  const isTorneo = modoTorneoCheckbox.checked;
  torneoConfig.style.display = isTorneo ? "block" : "none";

  // Efecto visual y deshabilitación en los contenedores
  if (isTorneo) {
    cardTorneoContainer.classList.add("active");
    cardHorarios.style.opacity = "0.4";
    cardHorarios.style.pointerEvents = "none";
    cardDuracion.style.opacity = "0.4";
    cardDuracion.style.pointerEvents = "none";

    duracionSelect.disabled = true;
    inputInicio.disabled = true;
  } else {
    cardTorneoContainer.classList.remove("active");
    cardHorarios.style.opacity = "1";
    cardHorarios.style.pointerEvents = "auto";
    cardDuracion.style.opacity = "1";
    cardDuracion.style.pointerEvents = "auto";

    duracionSelect.disabled = false;
    inputInicio.disabled = false;
  }

  validateStep4();
});

categoriaTorneoSelect.addEventListener("change", () => {
  categoriaManualContainer.style.display = categoriaTorneoSelect.value === "MANUAL" ? "block" : "none";
  validateStep4();
});

categoriaManualInput.addEventListener("input", () => {
  validateStep4();
});

// ===================== NAVEGACIÓN =====================
function showStep(index) {
  steps.forEach((s, i) => s.classList.toggle("active", i === index));
  current = index;
  if (index === 0) populateStep1();
  //  if(index===1) populateStep2(); //SI LA REACTIVAS FIJATE LOS INDICES
  if (index === 1) populateStep3();
  if (index === 2) populateStep4();
}

document.querySelectorAll(".next").forEach(btn => btn.addEventListener("click", () => { if (current < steps.length - 1) showStep(current + 1); }));
document.querySelectorAll(".prev").forEach(btn => btn.addEventListener("click", () => { if (current > 0) showStep(current - 1); }));

// ==================================================
// FINALIZAR Y ENVIAR AL SERVIDOR
// ==================================================

finishBtn.addEventListener("click", () => {

  updateFin();

  const isTorneo = modoTorneoCheckbox.checked;
  let categoriaFinal = "";
  if (isTorneo) {
    categoriaFinal = categoriaTorneoSelect.value === "MANUAL" ? categoriaManualInput.value.trim() : categoriaTorneoSelect.value;
  }

  const datosCompat = {
    jugadores: [
      datosPartido.jugadores.pareja1.j1,
      datosPartido.jugadores.pareja1.j2,
      datosPartido.jugadores.pareja2.j1,
      datosPartido.jugadores.pareja2.j2
    ],
    parejas: {
      pareja1: [
        datosPartido.jugadores.pareja1.j1,
        datosPartido.jugadores.pareja1.j2
      ],
      pareja2: [
        datosPartido.jugadores.pareja2.j1,
        datosPartido.jugadores.pareja2.j2
      ]
    },
    parejaSacadora: "pareja1",
    sacadores: ["", ""],
    tiempoCalentamiento: (() => {
      switch (datosPartido.modosJuego.calentamiento) {
        case "0": return "Sin calentamiento";
        case "5": return "5 minutos";
        case "10": return "10 minutos";
        default: return "";
      }
    })(),
    cambioDeLado: (() => {
      switch (datosPartido.modosJuego.cambio) {
        case "set": return "Al finalizar cada SET";
        case "tradicional": return "Tradicional (impares)";
        case "ninguno": return "Sin cambios";
        default: return "";
      }
    })(),
    tipoGames: (() => {
      switch (datosPartido.modosJuego.games) {
        case "punto-oro": return "Punto de oro";
        case "deuce": return "Deuce / Advantage";
        default: return "";
      }
    })(),
    modoTorneo: isTorneo,
    categoriaTorneo: categoriaFinal,
    ordenDeSaque: ["", "", "", ""],
    duracion: `${datosPartido.duracion} minutos`,
    comienzo: datosHorarios.inicioTexto,
    fin: datosHorarios.finTexto,
    inicioFecha: datosHorarios.inicioFecha,
    finFecha: datosHorarios.finFecha,
    pulseras: {
      pareja1: {
        nombre: datosPartido.jugadores.pareja1.pulsera,
        mac: pulserasDisponibles[datosPartido.jugadores.pareja1.pulsera] || ""
      },
      pareja2: {
        nombre: datosPartido.jugadores.pareja2.pulsera,
        mac: pulserasDisponibles[datosPartido.jugadores.pareja2.pulsera] || ""
      }
    },
    club: CLUB,
    mensaje: "actualizado_sin_cache_v2" // <- Mensaje de pruebas de caché 
  };


  console.log("🛠️ Partido configurado:", datosCompat);
  sendToServer(datosCompat);
});



// ==================================================
// ENVIAR DATOS AL SERVIDOR
// ==================================================

sendToServer = (datosPartido) => {
  // Enviar los datos al servidor para que los reenvíe a la Raspy
  fetch('/api/send_raspy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raspy_id: RASPY_ID, //ACÁ MANDAMOS A LA ID DE LA RASPY
      datos: datosPartido
    })
  })
    .then(response => response.json())
    .then(data => {
      console.log('Respuesta del servidor:', data);
      if (data.error) alert(data.error);
    })
    .catch(error => {
      console.error('Error enviando datos al servidor:', error);
      alert("No se pudo enviar la configuración. ¿El servidor está corriendo?");
    });
};

// ==================================================
// BOTÓN FLOTANTE DE FEEDBACK
// ==================================================

const feedbackBubble = document.getElementById('feedback-bubble');
const feedbackModal = document.getElementById('feedback-modal');
const feedbackText = document.getElementById('feedback-text');

const feedbackCancel = document.getElementById('feedback-cancel');
const feedbackSend = document.getElementById('feedback-send');

let feedbackAbiertoenSesion = false; // Rastrear si fue abierto en esta sesión

// Abrir modal
feedbackBubble.addEventListener('click', () => {
  feedbackModal.style.display = 'flex';
  feedbackText.focus();

  // Si es la primera vez que se abre, esconder el "!"
  if (!feedbackAbiertoenSesion) {
    feedbackBubble.classList.add('feedback-opened');
    feedbackAbiertoenSesion = true;
  }
});

// Cerrar modal
function cerrarFeedbackModal() {
  feedbackModal.style.display = 'none';
  feedbackText.value = '';
}


feedbackCancel.addEventListener('click', cerrarFeedbackModal);

// Cerrar al hacer click fuera del modal
feedbackModal.addEventListener('click', (e) => {
  if (e.target === feedbackModal) {
    cerrarFeedbackModal();
  }
});

// Enviar feedback
feedbackSend.addEventListener('click', () => {
  const mensaje = feedbackText.value.trim();

  if (!mensaje) {
    alert('Por favor escribe un mensaje antes de enviar');
    return;
  }

  feedbackSend.disabled = true;
  feedbackSend.textContent = 'Enviando...';

  fetch('/api/enviar_feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raspy_id: RASPY_ID,
      club: CLUB,
      mensaje: mensaje
    })
  })
    .then(response => response.json())
    .then(data => {
      console.log('✅ Feedback enviado:', data);
      alert('¡Gracias por el apoyo!');
      cerrarFeedbackModal();
      feedbackSend.disabled = false;
      feedbackSend.textContent = 'Enviar';
    })
    .catch(error => {
      console.error('Error enviando feedback:', error);
      alert('No se pudo enviar el feedback. Intenta de nuevo.');
      feedbackSend.disabled = false;
      feedbackSend.textContent = 'Enviar';
    });
});

// Permitir enviar con Ctrl+Enter o Cmd+Enter
feedbackText.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !feedbackSend.disabled) {
    feedbackSend.click();
  }
});


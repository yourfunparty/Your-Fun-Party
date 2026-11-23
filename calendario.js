/* =========================================================
   CALENDARIO DE DISPONIBILIDAD · Your Fun Party
   Lee los huecos ocupados del Google Calendar del parque
   (solo libre/ocupado: nunca se ven nombres ni detalles).
   ========================================================= */
const CAL_CONFIG = {
  // ID del calendario: Google Calendar > Configuración del calendario > "Integrar el calendario"
  calendarId: 'yourfunpartyleganes@gmail.com',
  // Clave de API de Google Cloud (restringida a yourfunparty.vercel.app)
  apiKey: 'AIzaSyApXoOwee-FfEvKt_z0mpUMv9uVs3ntMiA',
  // Número de WhatsApp (con prefijo 34, sin espacios)
  whatsapp: '34611120529',
  // Festivos de Leganés y de la Comunidad de Madrid (nacionales, autonómicos y locales).
  // Abrimos el festivo y también su víspera (se calcula sola), aunque caigan de lunes a jueves.
  // Fuente: BOE / BOCM. Añadir cada año los nuevos (los locales de Leganés se publican en diciembre).
  festivos: [
    // 2026
    '2026-01-01', '2026-01-06', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-02',
    '2026-08-14', '2026-08-15', '2026-10-09', '2026-10-12', '2026-11-02', '2026-12-07',
    '2026-12-08', '2026-12-25',
    // 2027 (Comunidad de Madrid; faltan los 2 festivos locales de Leganés, aún sin publicar)
    '2027-01-01', '2027-01-06', '2027-03-19', '2027-03-25', '2027-03-26', '2027-05-01',
    '2027-08-16', '2027-10-12', '2027-11-01', '2027-12-06', '2027-12-08', '2027-12-25',
    // 2028
    '2028-01-01',
  ],
  // Excepciones manuales (también se pueden hacer desde Google Calendar con un evento "ABIERTO" o "CERRADO")
  abiertosExtra: [],
  cerradosExtra: [],
  mesesAdelante: 12,
};

(function () {
  const TZ = 'Europe/Madrid';
  const root = document.getElementById('calendarBox');
  if (!root) return;

  const demo = /[?&]demo/.test(location.search);
  const configurado = !!(CAL_CONFIG.calendarId && CAL_CONFIG.apiKey);
  const cache = {};
  const fmtParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  const pad = (n) => String(n).padStart(2, '0');
  const key = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function madrid(date) {
    const p = {}; fmtParts.formatToParts(date).forEach((x) => (p[x.type] = x.value));
    return { y: +p.year, m: +p.month, d: +p.day, min: +p.hour * 60 + +p.minute };
  }
  const addDays = (y, m, d, n) => { const t = new Date(Date.UTC(y, m - 1, d + n)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
  const dow = (y, m, d) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lunes

  const hoy = madrid(new Date());
  const hoyKey = key(hoy.y, hoy.m, hoy.d);
  let vista = { y: hoy.y, m: hoy.m };
  let enfocarAviso = false;
  let seleccion = null; // fecha elegida en "¿Qué día quieres celebrarlo?"

  const FESTIVOS = new Set(CAL_CONFIG.festivos);
  let abiertosCal = {}, cerradosCal = {}; // vienen de Google Calendar (eventos "ABIERTO" / "CERRADO")
  // 'festivo' | 'vispera' | null
  function tipoEspecial(y, m, d) {
    if (FESTIVOS.has(key(y, m, d))) return 'festivo';
    if (FESTIVOS.has(key(...addDays(y, m, d, 1)))) return 'vispera';
    return null;
  }
  function abierto(y, m, d) {
    const k = key(y, m, d);
    if (cerradosCal[k] || CAL_CONFIG.cerradosExtra.includes(k)) return false;
    if (abiertosCal[k] || CAL_CONFIG.abiertosExtra.includes(k)) return true;
    return dow(y, m, d) >= 4 || !!tipoEspecial(y, m, d);
  }

  // Convierte intervalos ocupados en tramos por día (hora de Madrid)
  function porDia(busy) {
    const dias = {};
    busy.forEach(({ start, end }) => {
      const s = madrid(new Date(start)), e = madrid(new Date(end));
      let [y, m, d] = [s.y, s.m, s.d];
      for (let i = 0; i < 400; i++) {
        const k = key(y, m, d), last = y === e.y && m === e.m && d === e.d;
        const a = i === 0 ? s.min : 0, b = last ? e.min : 1440;
        if (b > a) (dias[k] = dias[k] || []).push([a, b]);
        if (last) break;
        [y, m, d] = addDays(y, m, d, 1);
      }
    });
    return dias;
  }

  const aReservados = (dias) => Object.fromEntries(Object.keys(dias).map((d) => [d, true]));

  function rango(y, m) {
    const first = [y, m, 1];
    const start = addDays(...first, -dow(...first));
    return { start, cells: 42 };
  }

  // Fuente principal: función privada de Vercel (/api/disponibilidad), que lee el calendario
  // completo y devuelve solo los días con algún evento. Se pide una vez.
  let privado;
  async function cargarPrivado() {
    if (privado !== undefined) return privado;
    try {
      const r = await fetch('/api/disponibilidad', { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      const mapa = (arr) => Object.fromEntries((arr || []).map((d) => [d, true]));
      privado = j && Array.isArray(j.reservados) ? mapa(j.reservados) : null;
      if (privado) { abiertosCal = mapa(j.abiertos); cerradosCal = mapa(j.cerrados); }
    } catch (e) { privado = null; }
    return privado;
  }

  async function cargar(y, m) {
    const k = `${y}-${m}`;
    if (cache[k]) return cache[k];
    if (!demo) { const p = await cargarPrivado(); if (p) return (cache[k] = p); }
    const { start } = rango(y, m);
    const end = addDays(...start, 42);
    if (demo) return (cache[k] = aReservados(porDia(demoBusy(start))));
    if (!configurado) return (cache[k] = null);
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy?key=' + encodeURIComponent(CAL_CONFIG.apiKey), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: `${key(...addDays(...start, -1))}T00:00:00Z`, timeMax: `${key(...addDays(...end, 1))}T00:00:00Z`, timeZone: TZ, items: [{ id: CAL_CONFIG.calendarId }] }),
    });
    const json = await res.json();
    const cal = json.calendars && json.calendars[CAL_CONFIG.calendarId];
    if (!res.ok || !cal || (cal.errors && cal.errors.length)) throw new Error(JSON.stringify(json.error || (cal && cal.errors) || json));
    return (cache[k] = aReservados(porDia(cal.busy || [])));
  }

  function waLink(y, m, d, tipo = 'libre') {
    const fecha = `${DIAS[dow(y, m, d)]} ${d} de ${MESES[m - 1]} de ${y}`;
    const txt = {
      libre: `Hola, he visto en la web que el ${fecha} está disponible y me gustaría reservarlo para una fiesta.`,
      cerrado: `Hola, me gustaría celebrar una fiesta el ${fecha}. ¿Abrís ese día?`,
      consultar: `Hola, me gustaría reservar la sala para una fiesta el ${fecha}.`,
    }[tipo];
    return `https://wa.me/${CAL_CONFIG.whatsapp}?text=${encodeURIComponent(txt)}`;
  }

  function celda(y, m, d, enMes, tramos, estadoGlobal) {
    const k = key(y, m, d);
    const pasado = k < hoyKey, esHoy = k === hoyKey;
    const num = `<span class="text-xs sm:text-sm font-bold ${esHoy ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white' : ''}">${d}</span>`;
    const base = 'relative min-h-[58px] sm:min-h-[92px] rounded-xl p-1 sm:p-2 flex flex-col gap-0.5 sm:gap-1 text-left' + (k === seleccion && enMes ? ' ring-[3px] ring-offset-2 ring-[#25D366] z-10' : '');
    if (!enMes) return `<div class="${base} opacity-30">${num}</div>`;
    if (pasado) return `<div class="${base} bg-surface-container-low text-outline opacity-60">${num}</div>`;
    if (!abierto(y, m, d)) return `<div class="${base} bg-surface-container-low text-outline">${num}<span class="text-[10px] sm:text-xs">Cerrado</span></div>`;

    if (estadoGlobal === 'cargando') return `<div class="${base} bg-surface-container-low text-outline animate-pulse">${num}<span class="text-[10px] sm:text-xs">···</span></div>`;
    if (estadoGlobal === 'sin-datos') {
      return `<button type="button" data-dia="${k}" aria-label="Seleccionar el ${d} de ${MESES[m - 1]}" class="${base} bg-surface-container-lowest border border-outline-variant text-primary hover:border-secondary transition-colors">${num}<span class="text-[10px] sm:text-xs text-on-surface-variant">Consultar</span></button>`;
    }
    if (tramos) {
      return `<div class="${base} bg-primary-container text-white" title="Reservado">${num}<span class="text-[10px] sm:text-xs font-semibold">Reservado</span></div>`;
    }
    const sel = k === seleccion;
    const esp = dow(y, m, d) < 4 ? tipoEspecial(y, m, d) : null;
    const etiqueta = esp ? `<span class="hidden sm:inline-block self-start rounded-full bg-white/70 text-secondary text-[10px] font-semibold px-1.5">${esp === 'festivo' ? 'Festivo' : 'Víspera'}</span>` : '';
    return `<button type="button" data-dia="${k}" aria-pressed="${sel}" aria-label="Seleccionar el ${d} de ${MESES[m - 1]}, libre" class="${base} ${sel ? 'bg-[#e8f8ee]' : 'bg-secondary-fixed hover:ring-2 hover:ring-secondary'} text-primary transition-shadow group">${num}<span class="text-[10px] sm:text-xs font-semibold">${sel ? 'Elegido' : 'Libre'}</span>${etiqueta}${sel ? '' : '<span class="hidden sm:block mt-auto text-[11px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity">Seleccionar</span>'}</button>`;
  }

  // ===== Escasez real, calculada con el calendario =====
  const diasMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  function resumenMes(y, m, datos) {
    const r = { abiertos: 0, libres: 0, sabados: 0, sabLibres: 0 };
    for (let d = 1; d <= diasMes(y, m); d++) {
      const k = key(y, m, d);
      if (k < hoyKey || !abierto(y, m, d)) continue;
      const libre = !(datos && datos[k]);
      r.abiertos++; if (libre) r.libres++;
      if (dow(y, m, d) === 5) { r.sabados++; if (libre) r.sabLibres++; }
    }
    return r;
  }
  // Devuelve { urgente, texto } o null. Solo es "urgente" cuando de verdad quedan pocos días.
  function escasez(y, m, datos) {
    const r = resumenMes(y, m, datos), mes = MESES[m - 1];
    if (!r.abiertos) return null;
    if (!r.libres) return { urgente: true, texto: `${mes[0].toUpperCase() + mes.slice(1)} está completo` };
    if (r.sabados && r.sabLibres <= 3 && r.sabLibres < r.sabados) {
      if (!r.sabLibres) return { urgente: true, texto: `Ya no quedan sábados libres en ${mes} · quedan ${pl(r.libres, 'día', 'días')}` };
      return { urgente: true, texto: `Solo ${r.sabLibres === 1 ? 'queda 1 sábado libre' : `quedan ${r.sabLibres} sábados libres`} en ${mes}` };
    }
    if (r.libres <= 6 && r.libres < r.abiertos) return { urgente: true, texto: `Solo ${r.libres === 1 ? 'queda 1 día libre' : `quedan ${r.libres} días libres`} en ${mes}` };
    return { urgente: false, texto: `En ${mes} quedan ${pl(r.libres, 'día libre', 'días libres')}, ${pl(r.sabLibres, 'sábado', 'sábados')}` };
  }

  // Aviso en la portada: mes actual (si le quedan días) o el siguiente. Solo si hay urgencia real.
  async function avisoPortada() {
    const el = document.getElementById('escasezHero');
    if (!el || (!configurado && !demo)) return;
    const meses = [[hoy.y, hoy.m]];
    const sig = new Date(Date.UTC(hoy.y, hoy.m, 1)); meses.push([sig.getUTCFullYear(), sig.getUTCMonth() + 1]);
    for (const [y, m] of meses) {
      let datos;
      try { datos = await cargar(y, m); } catch (e) { return; }
      if (!datos) return;
      const r = resumenMes(y, m, datos);
      if (r.abiertos < 7 || !r.libres) continue; // mes casi terminado o ya completo: miramos el siguiente
      const e = escasez(y, m, datos);
      if (e && e.urgente) {
        el.innerHTML = `<a href="#disponibilidad" class="inline-flex items-center gap-2 rounded-full bg-[#fff1e6] text-[#9a3412] border border-[#fed7aa] px-4 py-2 text-sm font-semibold hover:bg-[#ffe4cc] transition-colors"><span aria-hidden="true">🔥</span>${e.texto}<span class="font-bold">· Ver fechas →</span></a>`;
        el.classList.remove('hidden');
        return;
      }
    }
  }

  function lineaEscasez(datos, estado) {
    if (estado !== 'ok') return '';
    const e = escasez(vista.y, vista.m, datos);
    if (!e) return '';
    return e.urgente
      ? `<p class="flex items-center justify-center gap-2 rounded-xl bg-[#fff1e6] text-[#9a3412] px-3 py-2 text-sm font-semibold"><span aria-hidden="true">🔥</span>${e.texto}</p>`
      : `<p class="text-center text-sm text-on-surface-variant">${e.texto}</p>`;
  }

  function estadoDia(y, m, d, datos, estado) {
    const k = key(y, m, d);
    if (k < hoyKey) return 'pasado';
    if (!abierto(y, m, d)) return 'cerrado';
    if (estado === 'cargando') return 'cargando';
    if (estado === 'sin-datos') return 'sin-datos';
    return datos && datos[k] ? 'reservado' : 'libre';
  }

  function avisoSeleccion(datos, estado) {
    if (!seleccion) return '';
    const [y, m, d] = seleccion.split('-').map(Number);
    if (y !== vista.y || m !== vista.m) return '';
    const fecha = `${DIAS[dow(y, m, d)]} ${d} de ${MESES[m - 1]}`;
    const wa = (txt, tipo) => `<a href="${waLink(y, m, d, tipo)}" target="_blank" rel="noopener" class="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold text-sm px-4 py-2.5 rounded-full shadow-sm hover:scale-[1.02] transition-transform shrink-0">${txt}</a>`;
    const caja = (cls, icon, texto, extra = '') => `<div id="calAviso" class="scroll-mt-28 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl px-4 py-3 ${cls}"><p class="flex-1 text-sm sm:text-base"><span class="mr-1">${icon}</span>${texto}</p>${extra}</div>`;
    switch (estadoDia(y, m, d, datos, estado)) {
      case 'libre': return caja('bg-[#e8f8ee] text-[#14532d]', '✅', `<b>¡El ${fecha} está disponible!</b><br><span class="text-[13px] sm:text-sm">Las fechas vuelan: resérvala ahora antes de que otra familia se adelante.</span>`, wa('Reservar este día por WhatsApp', 'libre'));
      case 'reservado': return caja('bg-[#fdecec] text-[#7f1d1d]', '❌', `<b>El ${fecha} ya está reservado.</b> Elige otro día de los marcados en lila.`);
      case 'cerrado': return caja('bg-surface-container-low text-on-surface', '🔒', `<b>El ${fecha} estamos cerrados.</b> Abrimos viernes, sábados, domingos, festivos y vísperas. ¿Tienes alguna duda? Pregúntanos.`, wa('Preguntar por WhatsApp', 'cerrado'));
      case 'pasado': return caja('bg-surface-container-low text-on-surface', '📅', `<b>Esa fecha ya ha pasado.</b> Elige un día a partir de hoy.`);
      case 'sin-datos': return caja('bg-surface-container-low text-on-surface', 'ℹ️', `No podemos comprobar el ${fecha} en este momento. Pregúntanos y te lo decimos.`, wa('Preguntar por WhatsApp', 'consultar'));
      default: return caja('bg-surface-container-low text-on-surface-variant animate-pulse', '⏳', `Comprobando el ${fecha}…`);
    }
  }

  function pintar(datos, estado) {
    const { y, m } = vista;
    const { start } = rango(y, m);
    const limite = new Date(Date.UTC(hoy.y, hoy.m - 1 + CAL_CONFIG.mesesAdelante, 1));
    const puedeAtras = y > hoy.y || (y === hoy.y && m > hoy.m);
    const puedeAdelante = new Date(Date.UTC(y, m, 1)) < limite;
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const [cy, cm, cd] = addDays(...start, i);
      cells += celda(cy, cm, cd, cm === m, datos && datos[key(cy, cm, cd)], estado);
    }
    const aviso = estado === 'sin-datos'
      ? `<p class="text-xs sm:text-sm text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">No podemos mostrar la disponibilidad en este momento. Toca un día para preguntarnos.</p>` : '';
    const btn = (dir, on, label, icon) => `<button type="button" data-dir="${dir}" ${on ? '' : 'disabled'} aria-label="${label}" class="w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-secondary-fixed disabled:opacity-30 disabled:hover:bg-transparent transition-colors"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icon}"/></svg></button>`;
    root.className = 'w-full flex flex-col gap-3 scroll-mt-28';
    root.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1">${btn(-1, puedeAtras, 'Mes anterior', 'M15 6l-6 6 6 6')}${btn(1, puedeAdelante, 'Mes siguiente', 'M9 6l6 6-6 6')}</div>
        <h3 class="font-headline-sm text-headline-sm text-primary font-bold capitalize">${MESES[m - 1]} ${y}</h3>
        <button type="button" data-dir="0" class="text-xs sm:text-sm font-semibold text-secondary px-3 py-1.5 rounded-full hover:bg-secondary-fixed transition-colors">Hoy</button>
      </div>
      ${aviso}
      ${lineaEscasez(datos, estado)}
      ${avisoSeleccion(datos, estado)}
      <div class="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x, i) => `<span><span class="sm:hidden">${x}</span><span class="hidden sm:inline">${['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][i]}</span></span>`).join('')}
      </div>
      <div class="grid grid-cols-7 gap-1 sm:gap-1.5">${cells}</div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-on-surface-variant pt-1">
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-secondary-fixed ring-1 ring-secondary/40"></span>Libre · toca para elegirlo</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-primary-container"></span>Reservado</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-surface-container-low ring-1 ring-outline-variant"></span>Cerrado</span>
      </div>
      <p class="text-xs text-on-surface-variant">También abrimos los festivos de Leganés y de la Comunidad de Madrid y sus vísperas, aunque caigan entre semana.</p>`;
    root.querySelectorAll('button[data-dia]').forEach((b) => b.addEventListener('click', () => {
      seleccion = b.dataset.dia;
      enfocarAviso = true;
      mostrar();
    }));
    root.querySelectorAll('button[data-dir]').forEach((b) => b.addEventListener('click', () => {
      const dir = +b.dataset.dir;
      if (dir === 0) vista = { y: hoy.y, m: hoy.m };
      else { const t = new Date(Date.UTC(vista.y, vista.m - 1 + dir, 1)); vista = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }; }
      mostrar();
    }));
  }

  async function mostrar() {
    const { y, m } = vista;
    const k = `${y}-${m}`;
    if (!cache[k]) { pintar(null, 'cargando'); root.setAttribute('aria-busy', 'true'); }
    try {
      const datos = await cargar(y, m);
      if (vista.y !== y || vista.m !== m) return;
      pintar(datos, datos ? 'ok' : 'sin-datos');
      if (enfocarAviso) {
        enfocarAviso = false;
        const av = document.getElementById('calAviso');
        if (av) { const r = av.getBoundingClientRect(); if (r.top < 90 || r.bottom > innerHeight) av.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }
    } catch (e) {
      console.warn('[Calendario] No se pudo leer la disponibilidad:', e.message);
      if (vista.y === y && vista.m === m) pintar(null, 'sin-datos');
    }
    root.removeAttribute('aria-busy');
  }

  // Datos de ejemplo para previsualizar con ?demo en la URL
  function demoBusy(start) {
    const out = [];
    for (let i = 0; i < 42; i++) {
      const [y, m, d] = addDays(...start, i), w = dow(y, m, d), r = (d * 7 + m * 3) % 10;
      if (w < 4 || r > 5) continue;
      const k = key(y, m, d);
      if (r === 0) out.push({ start: `${k}T12:00:00+01:00`, end: `${k}T22:00:00+01:00` });
      else if (r === 1) out.push({ start: `${k}T11:00:00+01:00`, end: `${k}T14:00:00+01:00` });
      else out.push({ start: `${k}T17:00:00+01:00`, end: `${k}T22:00:00+01:00` });
    }
    return out;
  }

  window.yfpComprobarFecha = function (y, m, d) {
    seleccion = key(y, m, d);
    vista = { y, m };
    mostrar();
  };

  mostrar();
  avisoPortada();
})();

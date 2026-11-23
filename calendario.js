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
  // Días de lunes a jueves que SÍ abrimos (festivos y vísperas), formato 'AAAA-MM-DD'
  abiertosExtra: [],
  // Días de viernes a domingo que estamos cerrados (vacaciones, etc.)
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
  let seleccion = null; // fecha elegida en "¿Qué día quieres celebrarlo?"

  function abierto(y, m, d) {
    const k = key(y, m, d);
    if (CAL_CONFIG.cerradosExtra.includes(k)) return false;
    if (CAL_CONFIG.abiertosExtra.includes(k)) return true;
    return dow(y, m, d) >= 4;
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
      privado = j && Array.isArray(j.reservados) ? Object.fromEntries(j.reservados.map((d) => [d, true])) : null;
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

  function waLink(y, m, d) {
    const txt = `Hola, me gustaría reservar la sala el ${DIAS[dow(y, m, d)]} ${d} de ${MESES[m - 1]} de ${y}. ¿Está disponible?`;
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
      return `<a href="${waLink(y, m, d)}" target="_blank" rel="noopener" class="${base} bg-surface-container-lowest border border-outline-variant text-primary hover:border-secondary transition-colors">${num}<span class="text-[10px] sm:text-xs text-on-surface-variant">Consultar</span></a>`;
    }
    if (tramos) {
      return `<div class="${base} bg-primary-container text-white" title="Reservado">${num}<span class="text-[10px] sm:text-xs font-semibold">Reservado</span></div>`;
    }
    return `<a href="${waLink(y, m, d)}" target="_blank" rel="noopener" aria-label="Reservar el ${d} de ${MESES[m - 1]} por WhatsApp" class="${base} bg-secondary-fixed text-primary ring-0 hover:ring-2 hover:ring-secondary transition-shadow group">${num}<span class="text-[10px] sm:text-xs font-semibold">Libre</span><span class="hidden sm:block mt-auto text-[11px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity">Reservar →</span></a>`;
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
    const wa = (txt) => `<a href="${waLink(y, m, d)}" target="_blank" rel="noopener" class="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold text-sm px-4 py-2.5 rounded-full shadow-sm hover:scale-[1.02] transition-transform shrink-0">${txt}</a>`;
    const caja = (cls, icon, texto, extra = '') => `<div class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl px-4 py-3 ${cls}"><p class="flex-1 text-sm sm:text-base"><span class="mr-1">${icon}</span>${texto}</p>${extra}</div>`;
    switch (estadoDia(y, m, d, datos, estado)) {
      case 'libre': return caja('bg-[#e8f8ee] text-[#14532d]', '✅', `<b>¡El ${fecha} está libre!</b> Escríbenos para reservarlo.`, wa('Reservar este día por WhatsApp'));
      case 'reservado': return caja('bg-[#fdecec] text-[#7f1d1d]', '❌', `<b>El ${fecha} ya está reservado.</b> Elige otro día de los marcados en lila.`);
      case 'cerrado': return caja('bg-surface-container-low text-on-surface', '🔒', `<b>El ${fecha} estamos cerrados.</b> Abrimos viernes, sábados, domingos, vísperas y festivos. Si es festivo o víspera, pregúntanos.`, wa('Preguntar por WhatsApp'));
      case 'pasado': return caja('bg-surface-container-low text-on-surface', '📅', `<b>Esa fecha ya ha pasado.</b> Elige un día a partir de hoy.`);
      case 'sin-datos': return caja('bg-surface-container-low text-on-surface', 'ℹ️', `No podemos comprobar el ${fecha} en este momento. Pregúntanos y te lo decimos.`, wa('Preguntar por WhatsApp'));
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
      ? `<p class="text-xs sm:text-sm text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">No podemos mostrar la disponibilidad en este momento. Toca un día para preguntarnos por WhatsApp.</p>` : '';
    const btn = (dir, on, label, icon) => `<button type="button" data-dir="${dir}" ${on ? '' : 'disabled'} aria-label="${label}" class="w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-secondary-fixed disabled:opacity-30 disabled:hover:bg-transparent transition-colors"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icon}"/></svg></button>`;
    root.className = 'w-full flex flex-col gap-3 scroll-mt-28';
    root.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1">${btn(-1, puedeAtras, 'Mes anterior', 'M15 6l-6 6 6 6')}${btn(1, puedeAdelante, 'Mes siguiente', 'M9 6l6 6-6 6')}</div>
        <h3 class="font-headline-sm text-headline-sm text-primary font-bold capitalize">${MESES[m - 1]} ${y}</h3>
        <button type="button" data-dir="0" class="text-xs sm:text-sm font-semibold text-secondary px-3 py-1.5 rounded-full hover:bg-secondary-fixed transition-colors">Hoy</button>
      </div>
      ${aviso}
      ${avisoSeleccion(datos, estado)}
      <div class="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x, i) => `<span><span class="sm:hidden">${x}</span><span class="hidden sm:inline">${['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][i]}</span></span>`).join('')}
      </div>
      <div class="grid grid-cols-7 gap-1 sm:gap-1.5">${cells}</div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-on-surface-variant pt-1">
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-secondary-fixed ring-1 ring-secondary/40"></span>Libre · toca para reservar</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-primary-container"></span>Reservado</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-surface-container-low ring-1 ring-outline-variant"></span>Cerrado</span>
      </div>
      <p class="text-xs text-on-surface-variant">¿Festivo o víspera entre semana? Escríbenos y te decimos si está libre.</p>`;
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
})();

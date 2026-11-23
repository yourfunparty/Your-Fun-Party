// Función de Vercel: lee el calendario privado (dirección secreta iCal) y
// devuelve SOLO los días que tienen algún evento. Nunca envía nombres ni detalles.
// Configuración: variable de entorno CALENDAR_ICS_URL en Vercel.
const TZ = 'Europe/Madrid';

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const madridDate = (d) => fmt.format(d); // AAAA-MM-DD

function parseDate(line) {
  // line ejemplo: "DTSTART;VALUE=DATE:20261128" | "DTSTART;TZID=Europe/Madrid:20261128T170000" | "DTSTART:20261128T160000Z"
  const i = line.indexOf(':');
  const params = line.slice(0, i), v = line.slice(i + 1).trim();
  const ymd = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (/VALUE=DATE(?!-)/.test(params) || v.length === 8) return { date: ymd, allDay: true };
  if (v.endsWith('Z')) {
    const iso = `${ymd}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}Z`;
    return { date: madridDate(new Date(iso)), allDay: false, midnight: false };
  }
  // hora local (TZID) o flotante: el día es el de la fecha escrita
  return { date: ymd, allDay: false, midnight: v.slice(9, 15) === '000000' };
}

function addDay(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function diasOcupados(ics, desde, hasta) {
  const dias = new Set();
  let ev = null;
  for (const line of unfold(ics)) {
    if (line === 'BEGIN:VEVENT') ev = {};
    else if (line === 'END:VEVENT') {
      if (ev && ev.start && ev.status !== 'CANCELLED') {
        let fin = ev.end ? ev.end.date : ev.start.date;
        // DTEND de todo el día o a medianoche es exclusivo
        if (ev.end && (ev.end.allDay || ev.end.midnight) && fin > ev.start.date) fin = addDay(fin, -1);
        if (fin < ev.start.date) fin = ev.start.date;
        let d = ev.start.date;
        for (let i = 0; d <= fin && i < 60; i++, d = addDay(d, 1)) if (d >= desde && d <= hasta) dias.add(d);
      }
      ev = null;
    } else if (ev) {
      if (line.startsWith('DTSTART')) ev.start = parseDate(line);
      else if (line.startsWith('DTEND')) ev.end = parseDate(line);
      else if (line.startsWith('STATUS:')) ev.status = line.slice(7).trim();
    }
  }
  return [...dias].sort();
}

module.exports = async (req, res) => {
  const url = process.env.CALENDAR_ICS_URL;
  if (!url) return res.status(503).json({ error: 'no-configurado' });
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'yourfunparty-web' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ics = await r.text();
    const hoy = madridDate(new Date());
    const hasta = addDay(hoy, 400);
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ reservados: diasOcupados(ics, addDay(hoy, -45), hasta) });
  } catch (e) {
    return res.status(502).json({ error: 'calendario-no-disponible' });
  }
};
module.exports.diasOcupados = diasOcupados;

/* App del operario — funciona sin señal. Pantallas: registro del equipo → ¿quién eres? + PIN → checklists de hoy → tareas. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s), app = $('#app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { equipo: null, estado: null, local: { r: {}, rel: [], cerradas: {} }, usuario: null, vista: 'inicio', ejec: null, borr: {}, pend: 0, enLinea: navigator.onLine, aviso: '', deshacer: null };
  const TZ = () => (S.estado && S.estado.sede.zona_horaria) || 'America/Santiago';
  const hhmm = iso => iso ? Core.local(new Date(iso), TZ()).hhmm : '';
  const hoy = () => Core.local(new Date(), TZ()).fecha;
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random()).replace(/-/g, '').slice(0, 20);
  async function sha256(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  const guardarLocal = () => Local.set('local', S.local);

  /* ---------------- Datos: lo del servidor + lo respondido en este celular ---------------- */
  function ejecuciones() {
    const e = S.estado, out = (e.ejecuciones || []).slice(), ids = new Set(out.map(x => x.ejecucion_id)), f = hoy(), ahora = new Date();
    (e.plantillas || []).forEach(p => { // sin señal desde ayer: el celular arma las tareas de hoy con la misma lógica del servidor
      const id = Core.idEjecucion(f, p.plantilla_id);
      if (ids.has(id) || !Core.aplicaHoy(p, f)) return;
      const v = Core.ventana(p, f, TZ()); if (ahora >= v.limite) return;
      out.push({ ejecucion_id: id, plantilla_id: p.plantilla_id, plantilla: p.nombre, sede_id: p.sede_id, fecha: f, turno: p.turno, rol_id: p.rol_id, estado: 'ABIERTA', envio_programado: v.envio.toISOString(), hora_cierre: v.cierre.toISOString(), limite: v.limite.toISOString(), _local: true });
    });
    return out.sort((a, b) => a.envio_programado < b.envio_programado ? -1 : 1);
  }
  function instancias(ej) {
    const e = S.estado; let lista;
    if (ej._local) { const p = e.plantillas.find(x => x.plantilla_id === ej.plantilla_id); lista = Core.generarInstancias(p, e.tareas, e.secciones, ej.fecha, TZ(), e.umbrales, e.activos); }
    else lista = e.instancias.filter(i => i.ejecucion_id === ej.ejecucion_id).map(i => Object.assign({}, i));
    const ids = new Set(lista.map(i => i.instancia_id));
    S.local.rel.forEach(r => { if (r.ejecucion_id === ej.ejecucion_id && !ids.has(r.instancia_id)) lista.push(Object.assign({}, r)); });
    lista.forEach(i => {
      const l = S.local.r[i.instancia_id];
      if (l && !i.respuesta_id) { i.valor = l.valor; i.usuario = l.usuario; i.comentario = l.comentario; i.capturado_en = l.capturado_en; i._local = true; i.estado = l.no_aplica ? 'NO_APLICA' : Core.evaluarEstado(i, l.capturado_en).estado; }
      if (l && l.evidencias) i._fotos = l.evidencias;
    });
    return lista.sort((a, b) => a.orden - b.orden || (a.programada_para < b.programada_para ? -1 : 1));
  }
  const hecha = i => /^(HECHA|HECHA_ATRASO|NO_APLICA)$/.test(i.estado);
  const visibles = () => ejecuciones().filter(e => S.usuario.ve_toda_la_sede || !e.rol_id || e.rol_id === '*' || e.rol_id === S.usuario.rol_id);

  /* ---------------- Versión de la app ---------------- */
  // La app queda guardada en el celular para funcionar sin señal. Con señal, compara su versión con la publicada y con la
  // mínima que exige el servidor; si hay una más nueva se actualiza sola (lo pendiente de envío no se pierde).
  const VER = self.APP_VERSION || '0';
  const cmpVer = (a, b) => { const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number); for (let k = 0; k < 4; k++) { const d = (x[k] || 0) - (y[k] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
  const guardia = { get: () => { try { return JSON.parse(sessionStorage.getItem('act') || '{}'); } catch (e) { return {}; } }, set: v => { try { v ? sessionStorage.setItem('act', JSON.stringify(v)) : sessionStorage.removeItem('act'); } catch (e) { } } };
  async function versionPublicada() {
    try { const r = await fetch('version.js?nocache=' + Date.now(), { cache: 'no-store' }); return r.ok ? ((await r.text()).match(/APP_VERSION\s*=\s*'([\d.]+)'/) || [])[1] || '' : ''; } catch (e) { return ''; }
  }
  const obligatoria = () => !!(S.estado && S.estado.app_min && cmpVer(VER, S.estado.app_min) < 0);
  async function revisarVersion(manual) {
    if (!navigator.onLine) return false;
    const pub = await versionPublicada(), min = (S.estado && S.estado.app_min) || '';
    const meta = pub && cmpVer(VER, pub) < 0 ? pub : obligatoria() ? min : '';
    S.verNueva = meta; if (!meta) { guardia.set(null); return false; }
    if (S.ocupado || S.deshacer) return false; // en medio de una foto, un PDF o una respuesta: se reintenta en la próxima pasada
    if (!manual && !obligatoria() && S.usuario && S.vista === 'checklist') { barra(); return false; } // no se interrumpe a quien está respondiendo
    return actualizarApp(meta, manual);
  }
  async function actualizarApp(meta, manual) {
    const g = guardia.get(), n = g.v === meta && !manual ? g.n || 0 : 0;
    if (n >= 2) { S.sinBajar = meta; barra(); return false; } // ya se intentó: no se recarga en círculo
    guardia.set({ v: meta, n: n + 1 });
    S.ocupado = 'Actualizando la app…'; pintar();
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (reg) {
        const listo = new Promise(ok => { navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true }); setTimeout(ok, 20000); });
        await reg.update();
        if (reg.installing || reg.waiting) await listo;
      }
    } catch (e) { }
    location.reload(); return true;
  }

  /* ---------------- Sincronización ---------------- */
  async function refrescar() {
    if (!S.equipo || !navigator.onLine) return;
    try {
      const t0 = Date.now(), r = await apiPost({ action: 'estado', equipo: S.equipo.token, app: VER });
      if (!r.ok) { if (r.error === 'EQUIPO_NO_REGISTRADO') { S.aviso = 'Este equipo fue desactivado. Pide la clave de equipos para registrarlo de nuevo.'; await Local.del('equipo'); S.equipo = null; } return pintar(); }
      r._desfase = Math.round((Date.now() + (Date.now() - t0) / 2 - new Date(r.ahora).getTime()) / 60000); // reloj del celular vs servidor
      r._bajado = Date.now(); S.estado = r; await Local.set('estado', r); limpiarViejos(); if (!S.borrando) pintar(true);
      revisarVersion();
    } catch (e) { /* sin señal: se sigue con lo guardado */ }
  }
  async function enviar() {
    const r = await Cola.enviar(); S.pend = r.quedan == null ? S.pend : r.quedan; barra();
    if (r.enviados) refrescar();
    if (r.quedan && 'serviceWorker' in navigator) navigator.serviceWorker.ready.then(sw => sw.sync && sw.sync.register('cola')).catch(() => { });
  }
  function limpiarViejos() { // borra lo de días anteriores ya enviado
    const f = Core.sumarDias(hoy(), -1); let cambio = false;
    Object.keys(S.local.r).forEach(id => { if (id.slice(0, 10) < f && S.local.r[id].encolada) { delete S.local.r[id]; cambio = true; } });
    S.local.rel = S.local.rel.filter(r => r.fecha >= f);
    if (cambio) guardarLocal();
    Cola.todo().then(c => { if (c.length) return; Local.fotos().then(fs => fs.forEach(x => { if (x.fecha < f) Local.borrarFoto(x.id); })); });
  }

  /* ---------------- Responder ---------------- */
  const borr = i => S.borr[i.instancia_id] || (S.borr[i.instancia_id] = { fotos: [] });
  const pideComentario = (i, v, fuera) => (i.tipo_respuesta === 'BRM' && (v === 'R' || v === 'M')) || (i.tipo_respuesta === 'SI_NO' && v === 'NO') || fuera;
  async function responder(i, valor) {
    const b = borr(i); b.valor = valor; b.error = '';
    let fuera = false;
    if (i.tipo_respuesta === 'NUMERO') {
      const v = Core.validarValor(i, valor);
      if (!v.ok) { b.error = v.mensaje; return pintar(); }
      b.valor = String(v.numero); fuera = v.fuera_rango;
      if (fuera && !b.confirmado) { b.paso = 'confirmar'; b.mensaje = v.mensaje; return pintar(); }
    }
    if (i.tipo_respuesta === 'TEXTO' && !String(valor).trim()) { b.error = 'Escribe algo'; return pintar(); }
    if ((i.foto === 'OBLIGATORIA' || i.tipo_respuesta === 'FOTO') && !b.fotos.length) {
      const ok = await tomarFoto(i); if (!ok) { b.paso = ''; return pintar(); }
    }
    if (pideComentario(i, b.valor, fuera) && b.comentario === undefined) { b.paso = 'comentario'; return pintar(); }
    await guardar(i, { valor: i.tipo_respuesta === 'FOTO' ? 'FOTO' : b.valor, comentario: b.comentario || '', evidencias: b.fotos.slice(), fuera });
  }
  async function guardar(i, d) {
    const r = { respuesta_id: uid(), instancia_id: i.instancia_id, ejecucion_id: i.ejecucion_id, usuario_id: S.usuario.usuario_id, usuario: S.usuario.nombre, valor: d.valor || '', comentario: d.comentario || '',
      no_aplica: !!d.no_aplica, evidencias: d.evidencias || [], capturado_en: new Date().toISOString(), offline: !navigator.onLine, encolada: false };
    S.local.r[i.instancia_id] = r; delete S.borr[i.instancia_id];
    if (d.fuera && S.estado.t1) { const rel = Core.instanciaRelectura(i, r.capturado_en, S.estado.t1.relectura, S.estado.t1.escala); if (rel) { rel.fecha = i.fecha; S.local.rel.push(rel); } }
    await guardarLocal(); pintar();
    clearTimeout(S.deshacer && S.deshacer.t);
    if (S.deshacer) await encolar(S.deshacer.id);
    S.deshacer = { id: i.instancia_id, t: setTimeout(() => { const id = S.deshacer.id; S.deshacer = null; encolar(id).then(pintarAviso); }, 4000) };
    pintarAviso();
  }
  async function encolar(instId) {
    const r = S.local.r[instId]; if (!r || r.encolada) return;
    for (const ev of r.evidencias) await Cola.agregar({ tipo: 'archivo', evidencia_id: ev, cuerpo: { evidencia_id: ev, instancia_id: r.instancia_id, ejecucion_id: r.ejecucion_id, tipo: 'foto', fecha: instId.slice(0, 10), capturado_en: r.capturado_en } });
    await Cola.agregar({ tipo: 'respuesta', cuerpo: { respuesta_id: r.respuesta_id, instancia_id: r.instancia_id, usuario_id: r.usuario_id, valor: r.valor, comentario: r.comentario, no_aplica: r.no_aplica, evidencias: r.evidencias, capturado_en: r.capturado_en, offline: r.offline } });
    r.encolada = true; await guardarLocal(); S.pend = (await Cola.todo()).length; barra(); enviar();
  }
  async function deshacer() {
    if (!S.deshacer) return; clearTimeout(S.deshacer.t);
    const id = S.deshacer.id; S.deshacer = null;
    const m = /^(.*)~R(\d+)$/.exec(id), relId = (m ? m[1] : id) + '~R' + ((m ? Number(m[2]) : 0) + 1); // quita la relectura que había generado
    S.local.rel = S.local.rel.filter(x => x.instancia_id !== relId || S.local.r[relId]);
    delete S.local.r[id]; await guardarLocal(); pintar(); pintarAviso();
  }

  /* ---------------- Cámara en vivo con sello ---------------- */
  function sello(canvas, i) {
    const c = canvas.getContext('2d'), w = canvas.width, h = canvas.height, f = Math.max(14, Math.round(Math.max(w, h) / 46)), alto = Math.round(f * 4.9);
    c.fillStyle = 'rgba(0,0,0,.62)'; c.fillRect(0, h - alto, w, alto); c.fillStyle = '#fff'; c.textBaseline = 'top';
    const d = new Date(), fecha = d.toLocaleDateString('es-CL', { timeZone: TZ() }) + ' ' + d.toLocaleTimeString('es-CL', { timeZone: TZ() });
    c.font = 'bold ' + f + 'px sans-serif'; c.fillText(fecha + ' · ' + S.estado.sede.nombre, f * 0.6, h - alto + f * 0.4);
    c.font = f + 'px sans-serif'; c.fillText((S.usuario.nombre + ' · ' + i.texto).slice(0, 70), f * 0.6, h - alto + f * 1.8);
    c.fillText(S.estado.empresa + ' · Checklists de Operaciones', f * 0.6, h - alto + f * 3.2);
  }
  async function registrarFoto(canvas, i) {
    sello(canvas, i);
    const data = canvas.toDataURL('image/jpeg', 0.72).split(',')[1], id = 'ev' + uid();
    await Local.guardarFoto(id, { id, data, instancia_id: i.instancia_id, ejecucion_id: i.ejecucion_id, texto: i.texto, fecha: hoy() });
    borr(i).fotos.push(id); return true;
  }
  function tomarFoto(i) {
    return new Promise(async fin => {
      const ov = document.createElement('div'); ov.className = 'camara';
      ov.innerHTML = '<video autoplay playsinline muted></video><div class="cam-txt">' + esc(i.texto) + '</div><div class="cam-bot"><button class="cam-x">Cancelar</button><button class="cam-ok" aria-label="Tomar foto"></button><span></span></div>';
      let stream = null; const cerrar = ok => { if (stream) stream.getTracks().forEach(t => t.stop()); ov.remove(); fin(ok); };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch (e) { return fin(await fotoNativa(i)); } // sin cámara en vivo: cámara del sistema (solo fotos recién tomadas)
      document.body.appendChild(ov); const v = ov.querySelector('video'); v.srcObject = stream;
      ov.querySelector('.cam-x').onclick = () => cerrar(false);
      ov.querySelector('.cam-ok').onclick = async () => {
        if (!v.videoWidth) return;
        const esc2 = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * esc2); c.height = Math.round(v.videoHeight * esc2); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        await registrarFoto(c, i); cerrar(true);
      };
    });
  }
  function fotoNativa(i) {
    return new Promise(fin => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return fin(false);
        if (Date.now() - f.lastModified > 120000) { alert('Solo se aceptan fotos tomadas en este momento (no de la galería).'); return fin(false); }
        const img = new Image(); img.onload = async () => {
          const e2 = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * e2); c.height = Math.round(img.height * e2); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          fin(await registrarFoto(c, i));
        }; img.onerror = () => fin(false); img.src = URL.createObjectURL(f);
      };
      inp.oncancel = () => fin(false); inp.click();
    });
  }

  /* ---------------- Cierre y PDF ---------------- */
  async function generarPdf(ej, lista) {
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 12; let y = M;
    const r = Core.resumen(lista.filter(i => i.origen === 'PLAN')), ahora = new Date(), l = Core.local(ahora, TZ());
    const salto = alto => { if (y + alto > 285) { doc.addPage(); y = M; } };
    doc.setFillColor(11, 61, 92); doc.rect(0, 0, W, 26, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(ej.plantilla + ' · ' + S.estado.sede.nombre, M, 11); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(S.estado.empresa + ' · ' + ej.fecha.split('-').reverse().join('-') + ' · cerrado ' + l.hhmm + ' por ' + S.usuario.nombre, M, 19);
    y = 33; doc.setTextColor(20); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('Cumplimiento: ' + r.hechas + '/' + r.total + ' (' + r.pct_cumplimiento + '%)   A tiempo: ' + r.a_tiempo + '   Con atraso: ' + r.atrasadas + '   Pendientes: ' + r.pendientes + (r.pct_calidad !== '' ? '   En buen estado: ' + r.pct_calidad + '%' : ''), M, y);
    y += 7; let seccion = null;
    const nombreValor = i => !hecha(i) ? 'PENDIENTE' : i.estado === 'NO_APLICA' ? 'No aplica' : ({ B: 'Bueno', R: 'Regular', M: 'MALO', SI: 'Sí', NO: 'NO', FOTO: 'Foto' }[i.valor] || (i.valor + (i.tipo_respuesta === 'NUMERO' && i.unidad ? ' ' + i.unidad : '')));
    lista.forEach(i => {
      if (i.seccion !== seccion) { seccion = i.seccion; salto(12); doc.setFillColor(230, 238, 243); doc.rect(M, y - 4, W - 2 * M, 6.5, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(11, 61, 92); doc.text(String(seccion || 'Tareas'), M + 1.5, y + 0.5); y += 7; }
      const fuera = i.tipo_respuesta === 'NUMERO' && hecha(i) && i.valor !== '' && Core.validarValor(i, i.valor).fuera_rango, malo = fuera || /^(M|NO)$/.test(i.valor || '') || !hecha(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30);
      const t = doc.splitTextToSize((i.critica === 'SI' ? '(!) ' : '') + i.texto, 104), obs = i.comentario ? doc.splitTextToSize('Obs.: ' + i.comentario, 104) : [], alto = (t.length + obs.length) * 4 + 2;
      salto(alto); doc.text(t, M + 1.5, y);
      if (obs.length) { doc.setTextColor(110); doc.text(obs, M + 1.5, y + t.length * 4); }
      doc.setFont('helvetica', 'bold'); if (malo) doc.setTextColor(190, 30, 30); else doc.setTextColor(20, 120, 70);
      doc.text(doc.splitTextToSize(nombreValor(i) + (fuera ? ' (fuera de rango)' : ''), 34)[0], M + 110, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(90); doc.setFontSize(8);
      if (hecha(i)) doc.text(doc.splitTextToSize((i.usuario || '') + ' ' + hhmm(i.capturado_en) + (i.estado === 'HECHA_ATRASO' ? ' (atraso)' : ''), 42)[0], M + 146, y);
      y += alto; doc.setDrawColor(225); doc.line(M, y - 2.5, W - M, y - 2.5);
    });
    const fotos = []; for (const i of lista) for (const id of (i._fotos || [])) { const f = await Local.foto(id); if (f) fotos.push({ f, i }); }
    if (fotos.length) {
      doc.addPage(); y = M; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(11, 61, 92); doc.text('Fotos (' + fotos.length + ')', M, y + 2); y += 8;
      const an = 90, al = 100; let col = 0; // casilla de 90 x 100 mm: la foto se ajusta dentro sin deformarse (vertical u horizontal)
      for (const { f, i } of fotos) {
        if (col === 0) salto(al + 12);
        const x = M + col * (an + 6);
        try { const im = await achicar(f.data), k = Math.min(an / im.w, al / im.h), w = im.w * k, h = im.h * k; doc.addImage(im.url, 'JPEG', x + (an - w) / 2, y + (al - h) / 2, w, h, undefined, 'FAST'); } catch (e) { }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60); doc.text(doc.splitTextToSize(i.texto, an)[0], x, y + al + 4);
        col = 1 - col; if (col === 0) y += al + 10;
      }
    }
    const limpio = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
    return { nombre: ej.fecha + '_' + l.hhmm.replace(':', '') + '_' + limpio(S.estado.sede.nombre) + '_' + limpio(ej.plantilla), data: doc.output('datauristring').split(',')[1] };
  }
  function achicar(b64) { // las fotos van más livianas dentro del PDF
    return new Promise(ok => { const img = new Image(); img.onload = () => { const e = Math.min(1, 800 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * e; c.height = img.height * e; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); ok({ url: c.toDataURL('image/jpeg', 0.6), w: c.width, h: c.height }); }; img.src = 'data:image/jpeg;base64,' + b64; });
  }
  async function cerrar(ej) {
    S.ocupado = 'Armando el PDF…'; pintar();
    try {
      if (S.deshacer) { clearTimeout(S.deshacer.t); const id = S.deshacer.id; S.deshacer = null; await encolar(id); }
      const lista = instancias(ej), pdf = await generarPdf(ej, lista), ev = 'pdf' + uid();
      await Cola.agregar({ tipo: 'archivo', data: pdf.data, cuerpo: { evidencia_id: ev, ejecucion_id: ej.ejecucion_id, tipo: 'pdf', nombre: pdf.nombre, fecha: ej.fecha } });
      await Cola.agregar({ tipo: 'cerrar', cuerpo: { ejecucion_id: ej.ejecucion_id, usuario_id: S.usuario.usuario_id, cerrado_en: new Date().toISOString(), pdf_evidencia_id: ev } });
      S.local.cerradas[ej.ejecucion_id] = new Date().toISOString(); await guardarLocal();
      S.pend = (await Cola.todo()).length; S.vista = 'inicio'; S.aviso = navigator.onLine ? 'Checklist cerrado. El reporte va camino al grupo.' : 'Checklist cerrado. El reporte se enviará solo cuando vuelva la señal.';
      enviar();
    } catch (e) { S.aviso = 'No se pudo cerrar: ' + e.message; }
    S.ocupado = ''; pintar();
  }

  /* ---------------- Pantallas ---------------- */
  function barra() {
    const b = $('#barra'); if (!b) return;
    b.className = 'barra ' + (S.enLinea ? 'ok' : 'off');
    b.innerHTML = '<span class="punto"></span>' + (S.enLinea ? 'Con señal' : 'Sin señal') + (S.pend ? ' · <b>' + S.pend + ' pendiente' + (S.pend > 1 ? 's' : '') + ' de envío</b>' : ' · todo enviado') +
      (S.estado && Math.abs(S.estado._desfase || 0) > 5 ? ' · ⚠ hora del celular desfasada ' + Math.abs(S.estado._desfase) + ' min' : '') +
      (S.verNueva && !S.ocupado ? ' · <a data-a="actualizar-app">' + (S.sinBajar ? 'Versión nueva pendiente: reintentar' : 'Actualizar la app') + '</a>' : '');
  }
  function pintarAviso() {
    const d = $('#snack'); if (!d) return;
    d.innerHTML = S.deshacer ? '<span>Respuesta guardada</span><button data-a="deshacer">Deshacer</button>' : ''; d.hidden = !S.deshacer;
  }
  function pintar(suave) {
    if (suave && document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; // no interrumpir a quien escribe
    let h = '<div id="barra"></div>';
    if (S.aviso) { h += '<div class="aviso" data-a="cerrar-aviso">' + esc(S.aviso) + '</div>'; }
    if (S.ocupado) h += '<div class="centro"><div class="rueda"></div><p>' + esc(S.ocupado) + '</p></div>';
    else if (S.equipo && obligatoria() && S.enLinea) h += '<div class="tarjeta centro"><h1>Hay que actualizar la app</h1><p>Esta versión (' + esc(VER) + ') ya no se acepta. Lo que tengas pendiente de envío no se pierde.</p><button class="btn" data-a="actualizar-app">Actualizar ahora</button></div>';
    else if (!S.equipo) h += vRegistro();
    else if (!S.estado) h += '<div class="centro"><p>Conéctate a internet una vez para descargar los checklists.</p><button class="btn" data-a="recargar">Reintentar</button></div>';
    else if (!S.usuario) h += S.pinDe ? vPin() : vQuien();
    else if (S.vista === 'checklist' && S.ejec) h += vChecklist();
    else h += vInicio();
    app.innerHTML = h + '<div id="snack" class="snack" hidden></div>'; barra(); pintarAviso();
  }
  function vRegistro() {
    return '<div class="tarjeta centro"><img src="icons/icon-192.png" width="72" alt=""><h1>Registrar este equipo</h1><p>Se hace una sola vez. Pide la <b>clave de equipos</b> de tu sede al administrador.</p>' +
      '<input id="clave" class="campo" placeholder="Clave de equipos" autocapitalize="none" autocomplete="off"><input id="nomEq" class="campo" placeholder="Nombre de este celular (ej. Celular bodega)">' +
      '<button class="btn" data-a="registrar">Registrar</button></div>';
  }
  function vQuien() {
    return '<header class="top"><h1>' + esc(S.estado.sede.nombre) + '</h1><p>¿Quién eres?</p></header><div class="personas">' +
      S.estado.usuarios.map(u => '<button class="persona" data-a="quien" data-id="' + esc(u.usuario_id) + '"><b>' + esc(u.nombre) + '</b><small>' + esc(u.rol) + '</small></button>').join('') +
      (S.estado.usuarios.length ? '' : '<p class="centro">No hay personas con PIN en esta sede. Pídele al administrador que las cree en Configuración.</p>') + '</div>';
  }
  function vPin() {
    const u = S.pinDe, n = (S.pin || '').length;
    return '<header class="top"><h1>' + esc(u.nombre) + '</h1><p>Ingresa tu PIN</p></header><div class="pin"><div class="puntos">' + [0, 1, 2, 3].map(k => '<i class="' + (k < n ? 'on' : '') + '"></i>').join('') + '</div>' +
      (S.pinError ? '<p class="error">' + esc(S.pinError) + '</p>' : '') + '<div class="teclado">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', 'x'].map(k => '<button data-a="tecla" data-k="' + k + '">' + (k === 'x' ? 'Volver' : k) + '</button>').join('') + '</div></div>';
  }
  function vInicio() {
    const ahora = new Date().toISOString(), ej = visibles();
    let h = '<header class="top"><h1>' + esc(S.estado.sede.nombre) + '</h1><p>' + esc(S.usuario.nombre) + ' · <a data-a="salir">cambiar persona</a></p></header>';
    if (!ej.length) h += '<p class="centro">No hay checklists para ti hoy.</p>';
    ej.forEach(e => {
      const l = instancias(e).filter(i => i.origen === 'PLAN'), r = Core.resumen(l), cerrada = e.estado === 'CERRADA' || S.local.cerradas[e.ejecucion_id], futura = e.envio_programado > ahora;
      h += '<button class="tarjeta lista ' + (cerrada ? 'cerrada' : '') + '" data-a="abrir" data-id="' + esc(e.ejecucion_id) + '"><div class="fila"><b>' + esc(e.plantilla) + '</b><span class="chip ' + (cerrada ? 'gris' : futura ? 'azul' : 'verde') + '">' + (cerrada ? 'Cerrado' : futura ? 'Desde ' + hhmm(e.envio_programado) : 'Abierto') + '</span></div>' +
        '<div class="progreso"><i style="width:' + (r.total ? Math.round(100 * (r.hechas) / r.total) : 0) + '%"></i></div><small>' + r.hechas + ' de ' + r.total + ' tareas · cierra a las ' + hhmm(e.hora_cierre) + '</small></button>';
    });
    return h + '<p class="pie"><a data-a="recargar">Actualizar ahora</a><br><small>App ' + esc(VER) + ' · configuración ' + esc(S.estado.rev || '—') + (S.estado._bajado ? ' · al día a las ' + hhmm(new Date(S.estado._bajado).toISOString()) : '') + '</small></p>';
  }
  function vTarea(i, ahora) {
    const b = S.borr[i.instancia_id] || {}, ok = hecha(i), futura = !ok && i.disponible_desde > ahora, atras = !ok && i.vence_a < ahora;
    let h = '<div class="tarea ' + (ok ? 'ok' : atras ? 'atrasada' : '') + '" id="t-' + esc(i.instancia_id) + '"><p class="txt">' + (i.critica === 'SI' ? '<span class="crit">Crítica</span> ' : '') + esc(i.texto) + '</p>';
    if (ok) {
      const fuera = i.tipo_respuesta === 'NUMERO' && i.estado !== 'NO_APLICA' && Core.validarValor(i, i.valor).fuera_rango;
      const v = i.estado === 'NO_APLICA' ? 'No aplica' : ({ B: 'Bueno', R: 'Regular', M: 'Malo', SI: 'Sí', NO: 'No', FOTO: 'Foto tomada' }[i.valor] || esc(i.valor) + (i.tipo_respuesta === 'NUMERO' && i.unidad ? ' ' + esc(i.unidad) : ''));
      h += '<div class="hecha"><span class="valor v-' + esc(fuera ? 'M' : i.valor) + '">' + v + (fuera ? ' · fuera de rango' : '') + '</span><small>' + esc(i.usuario || '') + ' · ' + hhmm(i.capturado_en) + (i.estado === 'HECHA_ATRASO' ? ' · con atraso' : '') + (i._local ? ' · <b>por enviar</b>' : '') + '</small></div>' +
        (i.comentario ? '<small class="obs">💬 ' + esc(i.comentario) + '</small>' : '');
      return h + '</div>';
    }
    if (futura) return h + '<small class="meta">Disponible a las ' + hhmm(i.disponible_desde) + '</small></div>';
    h += '<small class="meta">' + (atras ? '⏰ Atrasada · vencía ' : 'Hasta las ') + hhmm(i.vence_a) + (Core.tieneRango(i) ? ' · rango ' + esc(Core.textoRango(i)) : '') + (i.foto === 'OBLIGATORIA' ? ' · 📷 con foto' : '') + '</small>';
    const id = esc(i.instancia_id);
    if (b.paso === 'confirmar') h += '<div class="alerta"><b>' + esc(b.mensaje) + '</b><p>¿El valor está bien escrito?</p><div class="botones"><button class="b-no" data-a="confirmar" data-id="' + id + '">Sí, es correcto</button><button class="b-sec" data-a="corregir" data-id="' + id + '">Corregir</button></div></div>';
    else if (b.paso === 'comentario') h += '<div class="alerta"><p>¿Qué pasó? (opcional)</p><textarea id="c-' + id + '" rows="2" placeholder="Escribe un comentario"></textarea><div class="botones"><button class="b-si" data-a="comentar" data-id="' + id + '">Guardar</button></div></div>';
    else if (b.paso === 'noaplica') h += '<div class="alerta"><p>¿Por qué no aplica?</p><textarea id="c-' + id + '" rows="2" placeholder="Motivo"></textarea><div class="botones"><button class="b-si" data-a="noaplica-ok" data-id="' + id + '">Guardar</button><button class="b-sec" data-a="corregir" data-id="' + id + '">Volver</button></div></div>';
    else {
      const B = (v, cl, t) => '<button class="' + cl + '" data-a="resp" data-id="' + id + '" data-v="' + v + '">' + t + '</button>';
      if (i.tipo_respuesta === 'SI_NO') h += '<div class="botones">' + B('SI', 'b-si', 'Sí') + B('NO', 'b-no', 'No') + '</div>';
      else if (i.tipo_respuesta === 'BRM') h += '<div class="botones">' + B('B', 'b-si', 'Bueno') + B('R', 'b-reg', 'Regular') + B('M', 'b-no', 'Malo') + '</div>';
      else if (i.tipo_respuesta === 'NUMERO') h += '<div class="numero"><button class="signo" data-a="signo" data-id="' + id + '">±</button><input id="n-' + id + '" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(b.valor || '') + '"><span>' + esc(i.unidad || '') + '</span><button class="b-si" data-a="num" data-id="' + id + '">' + (i.foto === 'OBLIGATORIA' ? '📷 Foto' : 'Guardar') + '</button></div>';
      else if (i.tipo_respuesta === 'TEXTO') h += '<div class="texto"><textarea id="x-' + id + '" rows="2" placeholder="Escribe aquí">' + esc(b.valor || '') + '</textarea><button class="b-si" data-a="txt" data-id="' + id + '">Guardar</button></div>';
      else h += '<div class="botones">' + B('FOTO', 'b-si', '📷 Tomar foto') + '</div>';
      if (b.error) h += '<p class="error">' + esc(b.error) + '</p>';
      h += '<div class="extra">' + (i.foto === 'OPCIONAL' ? '<a data-a="foto" data-id="' + id + '">📷 ' + ((b.fotos || []).length ? 'Foto lista ✓' : 'Agregar foto') + '</a>' : '<span></span>') + '<a data-a="noaplica" data-id="' + id + '">No aplica</a></div>';
    }
    return h + '</div>';
  }
  function vChecklist() {
    const ej = ejecuciones().find(e => e.ejecucion_id === S.ejec); if (!ej) { S.vista = 'inicio'; return vInicio(); }
    const lista = instancias(ej), plan = lista.filter(i => i.origen === 'PLAN'), r = Core.resumen(plan), ahora = new Date().toISOString(), cerrada = ej.estado === 'CERRADA' || S.local.cerradas[ej.ejecucion_id];
    let h = '<header class="top fijo"><a class="volver" data-a="volver">‹ Volver</a><h1>' + esc(ej.plantilla) + '</h1><div class="progreso"><i style="width:' + (r.total ? Math.round(100 * r.hechas / r.total) : 0) + '%"></i></div><p>' + r.hechas + ' de ' + r.total + ' · cierra a las ' + hhmm(ej.hora_cierre) + ' · ' + esc(S.usuario.nombre) + '</p></header>';
    let sec = null;
    lista.forEach(i => { if (i.seccion !== sec) { sec = i.seccion; h += '<h2 class="seccion">' + esc(sec || 'Tareas') + '</h2>'; } h += vTarea(i, ahora); });
    const pend = lista.filter(i => !hecha(i) && i.disponible_desde <= ahora).length;
    h += '<div class="cierre">' + (cerrada ? '<p>Este checklist ya fue cerrado' + (pend ? '. Aún puedes completar las ' + pend + ' tareas pendientes.' : '.') + '</p>' :
      (S.confirmaCierre ? '<p><b>' + (pend ? 'Quedan ' + pend + ' tareas sin responder.' : 'Todo respondido.') + '</b> Al cerrar se envía el reporte y el PDF al grupo.</p><button class="btn" data-a="cerrar-ok">Sí, cerrar y enviar reporte</button><button class="btn sec" data-a="cerrar-no">Seguir respondiendo</button>'
        : '<button class="btn" data-a="cerrar">Cerrar checklist</button>')) + '</div>';
    return h;
  }

  /* ---------------- Eventos ---------------- */
  const inst = id => { for (const e of ejecuciones()) { const i = instancias(e).find(x => x.instancia_id === id); if (i) return i; } };
  app.addEventListener('click', async ev => {
    const el = ev.target.closest('[data-a]'); if (!el) return;
    const a = el.dataset.a, id = el.dataset.id, i = id && /resp|num|txt|foto|noaplica|confirmar|corregir|comentar|signo/.test(a) ? inst(id) : null;
    if (a === 'cerrar-aviso') { S.aviso = ''; pintar(); }
    else if (a === 'registrar') {
      S.ocupado = 'Registrando…'; const clave = $('#clave').value, nombre = $('#nomEq').value; pintar();
      try { const r = await apiPost({ action: 'registrar', clave, nombre }); if (!r.ok) throw new Error(r.error); S.equipo = r; await Local.set('equipo', r); S.aviso = 'Equipo registrado en ' + r.sede; S.ocupado = 'Descargando checklists…'; pintar(); await refrescar(); }
      catch (e) { S.aviso = /fetch|RED/.test(e.message) ? 'Sin conexión. Necesitas señal para registrar el equipo.' : e.message; }
      S.ocupado = ''; pintar();
    }
    else if (a === 'recargar' || a === 'actualizar-app') {
      if (!navigator.onLine) { S.aviso = 'Sin señal. La app se actualiza sola cuando vuelva la conexión.'; return pintar(); }
      S.ocupado = 'Buscando cambios…'; pintar(); await refrescar(); enviar(); S.ocupado = '';
      if (!await revisarVersion(true)) { if (!S.aviso) S.aviso = S.verNueva ? 'La versión nueva todavía no se puede descargar. Reintenta en unos minutos.' : 'Estás al día: app ' + VER + ', configuración ' + ((S.estado || {}).rev || '—') + '.'; pintar(); }
    }
    else if (a === 'quien') { S.pinDe = S.estado.usuarios.find(u => u.usuario_id === id); S.pin = ''; S.pinError = ''; pintar(); }
    else if (a === 'tecla') {
      const k = el.dataset.k;
      if (k === 'x') { S.pinDe = null; return pintar(); }
      S.pin = k === '←' ? S.pin.slice(0, -1) : (S.pin + k).slice(0, 4); S.pinError = '';
      if (S.pin.length === 4) {
        if (await sha256(S.pinDe.pin_salt + ':' + S.pin) === S.pinDe.pin_hash) {
          S.usuario = S.pinDe; S.pinDe = null; S.aviso = ''; sessionStorage.setItem('u', JSON.stringify({ id: S.usuario.usuario_id, t: Date.now() }));
          const e = new URLSearchParams(location.search).get('e'); if (e && visibles().some(x => x.ejecucion_id === e)) { S.ejec = e; S.vista = 'checklist'; }
        } else { S.pinError = 'PIN incorrecto'; S.pin = ''; }
      }
      pintar();
    }
    else if (a === 'salir') { S.usuario = null; sessionStorage.removeItem('u'); S.vista = 'inicio'; pintar(); }
    else if (a === 'abrir') { S.ejec = id; S.vista = 'checklist'; S.confirmaCierre = false; pintar(); window.scrollTo(0, 0); }
    else if (a === 'volver') { S.vista = 'inicio'; pintar(); }
    else if (a === 'resp') responder(i, el.dataset.v);
    else if (a === 'signo') { const n = $('#n-' + CSS.escape(id)); n.value = n.value.startsWith('-') ? n.value.slice(1) : '-' + n.value; n.focus(); }
    else if (a === 'num') responder(i, $('#n-' + CSS.escape(id)).value);
    else if (a === 'txt') responder(i, $('#x-' + CSS.escape(id)).value);
    else if (a === 'confirmar') { const b = borr(i); b.confirmado = true; b.paso = ''; responder(i, b.valor); }
    else if (a === 'corregir') { delete S.borr[id]; pintar(); }
    else if (a === 'comentar') { const b = borr(i); b.comentario = $('#c-' + CSS.escape(id)).value.trim(); b.paso = ''; responder(i, b.valor); }
    else if (a === 'foto') { await tomarFoto(i); pintar(); }
    else if (a === 'noaplica') { borr(i).paso = 'noaplica'; pintar(); }
    else if (a === 'noaplica-ok') guardar(i, { no_aplica: true, comentario: $('#c-' + CSS.escape(id)).value.trim() });
    else if (a === 'deshacer') deshacer();
    else if (a === 'cerrar') { S.confirmaCierre = true; pintar(); window.scrollTo(0, document.body.scrollHeight); }
    else if (a === 'cerrar-no') { S.confirmaCierre = false; pintar(); }
    else if (a === 'cerrar-ok') { S.confirmaCierre = false; cerrar(ejecuciones().find(e => e.ejecucion_id === S.ejec)); }
  });
  app.addEventListener('input', ev => { // lo que se va escribiendo se conserva aunque la pantalla se redibuje
    const m = /^([nx])-(.+)$/.exec(ev.target.id || ''); if (m) (S.borr[m[2]] || (S.borr[m[2]] = { fotos: [] })).valor = ev.target.value;
  });
  window.addEventListener('online', () => { S.enLinea = true; barra(); enviar(); refrescar(); });
  window.addEventListener('offline', () => { S.enLinea = false; barra(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { enviar(); refrescar(); } });
  try { new BroadcastChannel('cola').onmessage = m => { S.pend = m.data.quedan; barra(); }; } catch (e) { }
  setInterval(() => { if (navigator.onLine) enviar(); }, 30000);
  setInterval(() => { refrescar(); }, 120000);
  setInterval(() => { if (S.usuario && !S.ocupado) pintar(true); if (S.verNueva && !S.sinBajar) revisarVersion(); }, 60000); // refresca horas y atrasos; aplica la versión nueva al salir del checklist

  /* ---------------- Inicio ---------------- */
  (async function iniciar() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    S.equipo = await Local.get('equipo') || null; S.estado = await Local.get('estado') || null; S.local = await Local.get('local') || S.local;
    S.pend = (await Cola.todo()).length;
    try { const u = JSON.parse(sessionStorage.getItem('u') || 'null'); if (u && S.estado && Date.now() - u.t < 12 * 3600000) S.usuario = S.estado.usuarios.find(x => x.usuario_id === u.id) || null; } catch (e) { }
    const enlace = new URLSearchParams(location.search).get('e'); // link del grupo de Telegram
    if (S.usuario && enlace && visibles().some(x => x.ejecucion_id === enlace)) { S.ejec = enlace; S.vista = 'checklist'; }
    for (const id of Object.keys(S.local.r)) if (!S.local.r[id].encolada) await encolar(id); // respuestas que quedaron sin encolar al cerrar la app
    if (S.equipo && S.estado && navigator.onLine) { // con señal, primero se bajan los cambios: no se trabaja con una configuración antigua
      S.ocupado = 'Buscando cambios…'; pintar(); await Promise.race([refrescar(), new Promise(ok => setTimeout(ok, 8000))]); S.ocupado = '';
      pintar(); revisarVersion();
    } else { pintar(); await refrescar(); }
    enviar();
    window.__app = { S, instancias, ejecuciones }; // para pruebas
  })();
})();

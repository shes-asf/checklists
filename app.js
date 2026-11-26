/* App del operario — funciona sin señal. Pantallas: registro del equipo → ¿quién eres? + PIN → checklists de hoy → tareas. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s), app = $('#app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { equipo: null, estado: null, local: { r: {}, rel: [], cerradas: {}, cerrando: {}, sucio: {} }, usuario: null, vista: 'inicio', ejec: null, borr: {}, pend: 0, enLinea: navigator.onLine, aviso: '', deshacer: null };
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
      out.push({ ejecucion_id: id, plantilla_id: p.plantilla_id, plantilla: p.nombre, sede_id: p.sede_id, fecha: f, turno: p.turno, rol_id: p.rol_id, estado: 'ABIERTA', envio_programado: v.envio.toISOString(), hora_cierre: v.cierre.toISOString(), limite: v.limite.toISOString(), plazo: v.plazo ? v.plazo.toISOString() : '', _local: true });
    });
    return out.sort((a, b) => a.envio_programado < b.envio_programado ? -1 : 1);
  }
  function instancias(ej) {
    const e = S.estado; let lista;
    if (ej._local) { const p = e.plantillas.find(x => x.plantilla_id === ej.plantilla_id); lista = Core.generarInstancias(p, e.tareas, e.secciones, ej.fecha, TZ(), e.activos); }
    else lista = e.instancias.filter(i => i.ejecucion_id === ej.ejecucion_id).map(i => Object.assign({}, i));
    const ids = new Set(lista.map(i => i.instancia_id));
    S.local.rel.forEach(r => { if (r.ejecucion_id === ej.ejecucion_id && !ids.has(r.instancia_id)) lista.push(Object.assign({}, r)); });
    lista.forEach(i => {
      const l = S.local.r[i.instancia_id]; if (!l) return;
      if (l.respuesta_id === i.respuesta_id) { i._mia = true; i._fotos = fotosDe(i, l); return; } // ya está en el servidor: se le pueden sumar fotos
      if (i.respuesta_id && l.reemplaza_a !== i.respuesta_id) return; // otra persona respondió o corrigió antes: vale lo del servidor
      i._previa = l.reemplaza_a ? { valor: i.valor, usuario: i.usuario, capturado_en: i.capturado_en } : null;
      i._incompleta = !Core.respuestaLista(i, l.evidencias.length, l.no_aplica).ok; // con foto obligatoria, sin foto sigue pendiente
      i.estado = l.no_aplica ? 'NO_APLICA' : i._incompleta ? 'PENDIENTE' : (l.reemplaza_a && /^HECHA/.test(i.estado) ? i.estado : Core.evaluarEstado(i, l.capturado_en).estado); // corregida: conserva a tiempo / con atraso
      i.valor = l.valor; i.usuario = l.usuario; i.usuario_id = l.usuario_id; i.comentario = l.comentario; i.capturado_en = l.capturado_en; i._local = true; i._fotos = l.evidencias.slice();
    });
    return lista.sort((a, b) => a.orden - b.orden || (a.programada_para < b.programada_para ? -1 : 1));
  }
  const fotosDe = (i, l) => { const ids = (i.fotos || []).map(f => f.id); (l.evidencias || []).forEach(x => { if (ids.indexOf(x) < 0) ids.push(x); }); return ids; };
  const hecha = i => /^(HECHA|HECHA_ATRASO|NO_APLICA)$/.test(i.estado);
  // Dentro del horario (hasta la hora de cierre + margen) se puede completar o corregir; después el checklist es definitivo.
  const editable = (ej, ahora) => ej.finalizada !== 'SI' && Core.enHorario(ej, ahora || new Date().toISOString());
  // Checklists con plazo fijo (inicio del turno + minutos): qué mostrarle a quien responde.
  function textoPlazo(e, plan, ahora) {
    if (!e.plazo) return 'cierra a las ' + hhmm(e.hora_cierre);
    if (Core.completa(plan)) return 'completo';
    const min = Math.ceil((new Date(e.plazo) - new Date(ahora)) / 60000);
    return min > 0 ? 'debe estar completo a las ' + hhmm(e.plazo) + (min <= 60 ? ' (quedan ' + min + ' min)' : '') : '<b class="vencido">plazo vencido a las ' + hhmm(e.plazo) + '</b>';
  }
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
    if (S.ocupado || S.envio || Object.keys(S.borr).some(k => S.borr[k].paso || S.borr[k].corrige)) return false; // en medio de una foto, un PDF o una respuesta: se reintenta en la próxima pasada
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
    const r = await Cola.enviar(); S.pend = r.quedan == null ? S.pend : r.quedan; await procesarEnvio(); barra();
    if (r.enviados) refrescar();
    if (r.quedan && 'serviceWorker' in navigator) navigator.serviceWorker.ready.then(sw => sw.sync && sw.sync.register('cola')).catch(() => { });
  }
  /** Después de cada envío: lo que el servidor rechazó se informa (y se deshace en el celular) y los cierres confirmados pasan a "enviado". */
  async function procesarEnvio() {
    const rech = (await Local.get('rechazos')) || [], msg = [];
    if (rech.length) {
      await Local.set('rechazos', []);
      rech.forEach(x => {
        if (x.tipo === 'respuesta') { const l = S.local.r[x.instancia_id]; if (l && l.respuesta_id === x.respuesta_id) delete S.local.r[x.instancia_id]; } // vuelve a verse lo que tiene el servidor
        else if (x.tipo === 'cerrar') delete S.local.cerrando[x.ejecucion_id];
        if (msg.indexOf(x.error) < 0) msg.push(x.error);
      });
      S.aviso = '⚠ ' + msg.join(' '); await guardarLocal();
    }
    const ok = (await Local.get('cierres')) || {}; let cambio = false;
    Object.keys(S.local.cerrando).forEach(id => {
      const c = ok[id]; if (!c || c.t < S.local.cerrando[id]) return;
      S.local.cerradas[id] = S.local.cerrando[id]; delete S.local.cerrando[id]; cambio = true;
      if (!rech.length) S.aviso = c.sin_cambios ? 'No había cambios que enviar: el informe anterior sigue vigente.' : c.v > 1 ? '✔ Checklist enviado. Va al grupo el informe actualizado (v' + c.v + ').' : '✔ Checklist enviado. El informe va camino al grupo.';
    });
    if (cambio) await guardarLocal();
    if ((cambio || rech.length) && !S.envio) pintar();
  }
  function limpiarViejos() {
    Object.keys(S.local.r).forEach(id => { // respuestas ya enviadas que el servidor no tomó (otra persona respondió o corrigió antes)
      const l = S.local.r[id], i = (S.estado.instancias || []).find(x => x.instancia_id === id);
      if (l.encolada && !S.pend && i && i.respuesta_id && i.respuesta_id !== l.respuesta_id && l.reemplaza_a !== i.respuesta_id) delete S.local.r[id];
    });
    ['cerradas', 'cerrando', 'sucio'].forEach(k => { const o = S.local[k] || (S.local[k] = {}), f0 = Core.sumarDias(hoy(), -1); Object.keys(o).forEach(id => { if (id.slice(0, 10) < f0) delete o[id]; }); }); // borra lo de días anteriores ya enviado
    const f = Core.sumarDias(hoy(), -1); let cambio = false;
    Object.keys(S.local.r).forEach(id => { if (id.slice(0, 10) < f && S.local.r[id].encolada) { delete S.local.r[id]; cambio = true; } });
    S.local.rel = S.local.rel.filter(r => r.fecha >= f);
    if (cambio) guardarLocal();
    Cola.todo().then(c => { if (c.length) return; Local.fotos().then(fs => fs.forEach(x => { if (x.fecha < f) Local.borrarFoto(x.id); })); });
  }

  /* ---------------- Responder ---------------- */
  // El orden lo define Core.pasoRespuesta (lo mismo que prueban las pruebas): 1) la respuesta, 2) confirmar si está fuera de rango,
  // 3) comentario. Con eso la respuesta queda GUARDADA en el celular; las fotos se toman después. No hay botón "Enviar" por tarea:
  // con señal todo sale solo en segundo plano y "Cerrar y enviar checklist" asegura que no quede nada sin subir.
  const borr = i => S.borr[i.instancia_id] || (S.borr[i.instancia_id] = { fotos: [] }); // fotos: [{ id, mini, t }]
  const ejDe = id => ejecuciones().find(e => e.ejecucion_id === id);
  const marcarCambio = ejId => { if (S.local.cerradas[ejId] || S.local.cerrando[ejId] || (ejDe(ejId) || {}).estado === 'CERRADA') S.local.sucio[ejId] = true; }; // vuelve a habilitar "Cerrar y enviar"
  async function responder(i, valor) {
    const b = borr(i); if (valor !== undefined) b.valor = valor; b.error = '';
    const p = Core.pasoRespuesta(i, { valor: b.valor, confirmado: b.confirmado, comentario: b.comentario });
    if (p.paso === 'error') { b.error = p.mensaje; return pintar(); }
    if (!b.respondido_en) b.respondido_en = new Date().toISOString();
    b.valor = p.valor;
    if (p.paso === 'confirmar') { b.paso = 'confirmar'; b.mensaje = p.mensaje; return pintar(); }
    if (p.paso === 'comentario' || (b.corrige && b.comentario === undefined)) { b.paso = 'comentario'; return pintar(); } // al corregir siempre se ofrece anotar el motivo
    await guardar(i, { valor: p.valor, comentario: b.comentario || '', fuera: p.fuera, capturado_en: b.respondido_en });
  }
  /** Guarda la respuesta en el celular. d.no_aplica para "No aplica". Si había un borrador de corrección, reemplaza a la respuesta vigente. */
  async function guardar(i, d) {
    const b = S.borr[i.instancia_id] || { fotos: [] }, fs = b.corrige ? b.fotos : [];
    const r = { respuesta_id: uid(), instancia_id: i.instancia_id, ejecucion_id: i.ejecucion_id, usuario_id: S.usuario.usuario_id, usuario: S.usuario.nombre, valor: d.valor || '', comentario: d.comentario || '',
      no_aplica: !!d.no_aplica, evidencias: fs.map(f => f.id), fotos_t: Object.fromEntries(fs.map(f => [f.id, f.t])), minis: Object.fromEntries(fs.filter(f => f.mini).map(f => [f.id, f.mini])),
      evEnc: fs.filter(f => f.previa).map(f => f.id), // las fotos anteriores que se conservan ya están en el servidor
      reemplaza_a: b.corrige || '', capturado_en: d.capturado_en || new Date().toISOString(), offline: !navigator.onLine, encolada: false };
    S.local.r[i.instancia_id] = r; delete S.borr[i.instancia_id]; marcarCambio(i.ejecucion_id);
    if (d.fuera && S.estado.t1) { const rel = Core.instanciaRelectura(i, r.capturado_en, S.estado.t1.relectura, S.estado.t1.escala); if (rel && !S.local.rel.some(x => x.instancia_id === rel.instancia_id)) { rel.fecha = i.fecha; S.local.rel.push(rel); } }
    await guardarLocal(); pintar(); tocar(i.instancia_id);
    if (!r.no_aplica && !r.evidencias.length && Core.fotoObligatoria(i)) await agregarFoto(i); // foto obligatoria: la cámara se abre sola
  }
  /** Una foto más para la tarea: al borrador de una corrección, o a la respuesta ya guardada (aunque ya se haya enviado). */
  async function agregarFoto(i) {
    const b = S.borr[i.instancia_id], max = Core.fotosMax(i);
    if (b && b.corrige) { if (b.fotos.length >= max) return; const f = await tomarFoto(i); if (f) b.fotos.push(f); return pintar(); }
    let r = S.local.r[i.instancia_id]; if (!r) return;
    if (fotosDe(i, r).length >= max) return;
    const f = await tomarFoto(i); if (!f) return pintar();
    r = S.local.r[i.instancia_id]; if (!r) return pintar();
    r.evidencias.push(f.id); (r.fotos_t || (r.fotos_t = {}))[f.id] = f.t; (r.minis || (r.minis = {}))[f.id] = f.mini; marcarCambio(i.ejecucion_id);
    await guardarLocal(); pintar(); tocar(i.instancia_id);
  }
  async function quitarFoto(i, id) {
    const b = S.borr[i.instancia_id];
    if (b && b.corrige) { const f = b.fotos.find(x => x.id === id); b.fotos = b.fotos.filter(x => x.id !== id); if (f && !f.previa) await Local.borrarFoto(id); return pintar(); } // la anterior no se borra del registro: deja de ser vigente
    const r = S.local.r[i.instancia_id]; if (!r || (r.evEnc || []).indexOf(id) >= 0) return; // ya salió del celular: se quita corrigiendo
    r.evidencias = r.evidencias.filter(x => x !== id); delete (r.minis || {})[id]; await Local.borrarFoto(id); await guardarLocal(); pintar(); tocar(i.instancia_id);
  }
  async function descartar(i) { const b = S.borr[i.instancia_id]; if (b) for (const f of (b.fotos || [])) if (!f.previa) await Local.borrarFoto(f.id); delete S.borr[i.instancia_id]; pintar(); }
  /** "cambiar": la respuesta todavía no sale del celular, se puede rehacer sin dejar rastro. */
  async function cambiar(i) {
    const id = i.instancia_id, r = S.local.r[id]; if (!r || r.encolada) return;
    for (const f of r.evidencias) if ((r.evEnc || []).indexOf(f) < 0) await Local.borrarFoto(f);
    const m = /^(.*)~R(\d+)$/.exec(id), relId = (m ? m[1] : id) + '~R' + ((m ? Number(m[2]) : 0) + 1); // quita la relectura que había generado
    S.local.rel = S.local.rel.filter(x => x.instancia_id !== relId || S.local.r[relId]);
    delete S.local.r[id]; await guardarLocal(); pintar();
  }
  /** "Corregir" una respuesta que ya está en el servidor: se abre un borrador que muestra la anterior; al guardar la reemplaza (queda en el historial). */
  function corregir(i) {
    const l = S.local.r[i.instancia_id] || {};
    S.borr[i.instancia_id] = { corrige: i.respuesta_id, previa: { valor: i.valor, estado: i.estado, usuario: i.usuario, capturado_en: i.capturado_en, comentario: i.comentario },
      fotos: (i.fotos || []).map(f => ({ id: f.id, t: f.t, mini: (l.minis || {})[f.id] || '', previa: true })), valor: /NUMERO|TEXTO/.test(i.tipo_respuesta) ? i.valor : undefined };
    pintar();
  }

  /* ---------------- Envío en segundo plano ---------------- */
  // Una respuesta sale del celular cuando el operario pasa a otra tarea o deja de tocarla por 60 segundos (así una alerta crítica
  // llega con sus fotos), y siempre al tocar "Cerrar y enviar". Con foto obligatoria no sale mientras le falte la foto.
  function tocar(id) { S.activa = id; S.activaT = Date.now(); clearTimeout(S.tSync); S.tSync = setTimeout(() => sincronizar(), 60000); sincronizar(id); }
  let serie = Promise.resolve(); // de a una: dos pasadas a la vez encolarían dos veces lo mismo
  const enSerie = fn => (serie = serie.then(fn, fn));
  const sincronizar = excepto => enSerie(async () => { for (const id of Object.keys(S.local.r)) if (id !== excepto) await encolarUna(id); });
  const encolar = id => enSerie(() => encolarUna(id));
  async function encolarUna(instId) {
    const r = S.local.r[instId]; if (!r) return;
    if (!r.evEnc) r.evEnc = r.encolada ? r.evidencias.slice() : []; // registros de versiones anteriores de la app
    const i = (S.estado.instancias || []).find(x => x.instancia_id === instId) || S.local.rel.find(x => x.instancia_id === instId) || instLocal(instId);
    if (i && !Core.respuestaLista(i, r.evidencias.length, r.no_aplica).ok) return;
    let algo = false;
    for (const ev of r.evidencias) if (r.evEnc.indexOf(ev) < 0) { // cada foto con su propia hora; lleva el id de su respuesta (sirve para las que se agregan después)
      await Cola.agregar({ tipo: 'archivo', evidencia_id: ev, cuerpo: { evidencia_id: ev, instancia_id: r.instancia_id, ejecucion_id: r.ejecucion_id, respuesta_id: r.respuesta_id, tipo: 'foto', fecha: instId.slice(0, 10), capturado_en: (r.fotos_t || {})[ev] || r.capturado_en } });
      r.evEnc.push(ev); algo = true;
    }
    if (!r.encolada) {
      await Cola.agregar({ tipo: 'respuesta', cuerpo: { respuesta_id: r.respuesta_id, instancia_id: r.instancia_id, usuario_id: r.usuario_id, valor: r.valor, comentario: r.comentario, no_aplica: r.no_aplica, evidencias: r.evidencias.slice(), capturado_en: r.capturado_en, offline: r.offline, reemplaza_a: r.reemplaza_a || undefined } });
      r.encolada = true; algo = true;
    }
    if (!algo) return;
    await guardarLocal(); S.pend = (await Cola.todo()).length; if (!S.envio) { pintar(true); enviar(); } else barra();
  }
  function instLocal(id) { for (const e of ejecuciones()) if (e._local) { const i = instancias(e).find(x => x.instancia_id === id); if (i) return i; } return null; }

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
    const data = canvas.toDataURL('image/jpeg', 0.72).split(',')[1], id = 'ev' + uid(), t = new Date().toISOString();
    const k = Math.min(1, 160 / Math.max(canvas.width, canvas.height)), m = document.createElement('canvas'); // miniatura para revisar antes de enviar
    m.width = Math.max(1, Math.round(canvas.width * k)); m.height = Math.max(1, Math.round(canvas.height * k)); m.getContext('2d').drawImage(canvas, 0, 0, m.width, m.height);
    await Local.guardarFoto(id, { id, data, instancia_id: i.instancia_id, ejecucion_id: i.ejecucion_id, texto: i.texto, fecha: hoy(), capturado_en: t });
    return { id, mini: m.toDataURL('image/jpeg', 0.6), t };
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
        cerrar(await registrarFoto(c, i));
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

  /* ---------------- Cerrar y enviar ---------------- */
  // Un solo toque: sube las fotos pendientes, después las respuestas y al final el cierre. El checklist no cuenta como enviado
  // hasta que el servidor lo confirma; si se corta la señal queda "pendiente de envío" y se reintenta solo. El PDF lo arma el servidor.
  async function cerrar(ej) {
    S.confirmaCierre = false; const id = ej.ejecucion_id;
    try {
      for (const k of Object.keys(S.local.r)) if (S.local.r[k].ejecucion_id === id) await encolar(k);
      const t = new Date().toISOString();
      for (const x of await Cola.todo()) if (x.tipo === 'cerrar' && x.cuerpo.ejecucion_id === id) await Cola.borrar(x.id); // un solo cierre en cola, siempre al final
      await Cola.agregar({ tipo: 'cerrar', cuerpo: { ejecucion_id: id, usuario_id: S.usuario.usuario_id, cerrado_en: t } });
      S.local.cerrando[id] = t; delete S.local.sucio[id]; await guardarLocal();
      const cola = await Cola.todo(), nf = cola.filter(x => x.tipo === 'archivo').length;
      S.pend = cola.length; S.envio = { id, fotos: nf, quedan: nf, nombre: ej.plantilla }; pintar();
      if (navigator.onLine) await enviar();
    } catch (e) { S.aviso = 'No se pudo cerrar: ' + e.message; }
    S.envio = null; S.vista = 'inicio';
    if (S.local.cerrando[id]) S.aviso = (navigator.onLine ? 'No se pudo terminar el envío' : 'Sin señal') + ': "' + ej.plantilla + '" quedó pendiente de envío. Se enviará solo apenas haya conexión; no hace falta volver a tocar nada.';
    pintar();
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
    d.innerHTML = ''; d.hidden = true;
  }
  function pintar(suave) {
    if (suave && document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; // no interrumpir a quien escribe
    let h = '<div id="barra"></div>';
    if (S.aviso) { h += '<div class="aviso" data-a="cerrar-aviso">' + esc(S.aviso) + '</div>'; }
    if (S.envio) { // avance del envío único
      const e = S.envio, n = e.fotos - Math.min(e.fotos, e.quedan);
      h += '<div class="tarjeta centro envio"><div class="rueda"></div><h1>Enviando checklist</h1><p><b>' + (e.fotos ? 'Enviando ' + Math.min(e.fotos, n + (e.quedan ? 1 : 0)) + ' de ' + e.fotos + (e.fotos === 1 ? ' foto' : ' fotos') + '…' : 'Enviando respuestas…') + '</b></p>' +
        '<div class="progreso"><i style="width:' + (e.fotos ? Math.round(100 * n / e.fotos) : 60) + '%"></i></div><p><small>' + esc(e.nombre) + ' · no cierres la app. Si se corta la señal, se termina de enviar solo.</small></p></div>';
    }
    else if (S.ocupado) h += '<div class="centro"><div class="rueda"></div><p>' + esc(S.ocupado) + '</p></div>';
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
      const l = instancias(e).filter(i => i.origen === 'PLAN'), r = Core.resumen(l), enviando = !!S.local.cerrando[e.ejecucion_id], cerrada = e.estado === 'CERRADA' || S.local.cerradas[e.ejecucion_id], futura = e.envio_programado > ahora, cambios = editable(e, ahora) && (S.local.sucio[e.ejecucion_id] || e.cambios_pendientes === 'SI');
      h += '<button class="tarjeta lista ' + (cerrada ? 'cerrada' : '') + '" data-a="abrir" data-id="' + esc(e.ejecucion_id) + '"><div class="fila"><b>' + esc(e.plantilla) + '</b><span class="chip ' + (enviando ? 'azul' : cerrada && !cambios ? 'gris' : futura ? 'azul' : 'verde') + '">' + (enviando ? 'Pendiente de envío' : cerrada && cambios ? 'Con cambios sin enviar' : cerrada ? 'Enviado' : futura ? 'Desde ' + hhmm(e.envio_programado) : 'Abierto') + '</span></div>' +
        '<div class="progreso"><i style="width:' + (r.total ? Math.round(100 * (r.hechas) / r.total) : 0) + '%"></i></div><small>' + r.hechas + ' de ' + r.total + ' tareas · ' + textoPlazo(e, l, ahora) + '</small></button>';
    });
    return h + '<p class="pie"><a data-a="recargar">Actualizar ahora</a><br><small>App ' + esc(VER) + ' · configuración ' + esc(S.estado.rev || '—') + (S.estado._bajado ? ' · al día a las ' + hhmm(new Date(S.estado._bajado).toISOString()) : '') + '</small><br><a href="portal.html">Inicio</a></p>';
  }
  const NOM = { B: 'Bueno', R: 'Regular', M: 'Malo', SI: 'Sí', NO: 'No', FOTO: 'Foto' };
  const nomValor = (i, v, na) => na ? 'No aplica' : (NOM[v] || esc(v) + (i.tipo_respuesta === 'NUMERO' && i.unidad ? ' ' + esc(i.unidad) : ''));
  function vEntrada(i, b, id) { // los botones o el campo para responder (también al corregir)
    const B = (v, cl, t) => '<button class="' + cl + '" data-a="resp" data-id="' + id + '" data-v="' + v + '">' + t + '</button>';
    if (i.tipo_respuesta === 'SI_NO') return '<div class="botones">' + B('SI', 'b-si', 'Sí') + B('NO', 'b-no', 'No') + '</div>';
    if (i.tipo_respuesta === 'BRM') return '<div class="botones">' + B('B', 'b-si', 'Bueno') + B('R', 'b-reg', 'Regular') + B('M', 'b-no', 'Malo') + '</div>';
    if (i.tipo_respuesta === 'NUMERO') return '<div class="numero"><button class="signo" data-a="signo" data-id="' + id + '">±</button><input id="n-' + id + '" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(b.valor || '') + '"><span>' + esc(i.unidad || '') + '</span><button class="b-si" data-a="num" data-id="' + id + '">Guardar</button></div>';
    if (i.tipo_respuesta === 'TEXTO') return '<div class="texto"><textarea id="x-' + id + '" rows="2" placeholder="Escribe aquí">' + esc(b.valor || '') + '</textarea><button class="b-si" data-a="txt" data-id="' + id + '">Guardar</button></div>';
    return '<div class="botones">' + B('FOTO', 'b-si', b.corrige ? 'Guardar corrección' : '📷 Tomar foto') + '</div>';
  }
  function vMinis(id, fs, quitable) { // fs: [{ id, mini, t, fija }]
    return fs.length ? '<div class="minis">' + fs.map((f, k) => '<span class="mini">' + (f.mini ? '<img src="' + f.mini + '" alt="Foto ' + (k + 1) + '">' : '<i class="sinmini">📷 ' + (k + 1) + '</i>') +
      (quitable && !f.fija ? '<button data-a="quitar-foto" data-id="' + id + '" data-f="' + esc(f.id) + '" aria-label="Borrar foto ' + (k + 1) + '">✕</button>' : '') + '<small>' + hhmm(f.t) + '</small></span>').join('') + '</div>' : '';
  }
  function vTarea(i, ahora, ej) {
    const b = S.borr[i.instancia_id] || {}, ok = hecha(i), puede = i.origen !== 'PLAN' || editable(ej, ahora), futura = !ok && i.disponible_desde > ahora, atras = !ok && i.vence_a < ahora, max = Core.fotosMax(i), oblig = Core.fotoObligatoria(i);
    const id = esc(i.instancia_id), l = S.local.r[i.instancia_id];
    let h = '<div class="tarea ' + (ok ? 'ok' : atras ? 'atrasada' : '') + '" id="t-' + id + '"><p class="txt">' + (i.critica === 'SI' ? '<span class="crit">Crítica</span> ' : '') + esc(i.texto) + '</p>';
    // 1) pasos intermedios de una respuesta (o de una corrección)
    if (b.paso === 'confirmar') return h + '<div class="alerta"><b>' + esc(b.mensaje) + '</b><p>¿El valor está bien escrito?</p><div class="botones"><button class="b-no" data-a="confirmar" data-id="' + id + '">Sí, es correcto</button><button class="b-sec" data-a="' + (b.corrige ? 'reintentar' : 'descartar') + '" data-id="' + id + '">Corregir</button></div></div></div>';
    if (b.paso === 'comentario') return h + '<div class="alerta"><p>' + (b.corrige ? '¿Por qué se corrige? (opcional)' : '¿Qué pasó? (opcional)') + '</p><textarea id="c-' + id + '" rows="2" placeholder="' + (b.corrige ? 'Motivo de la corrección' : 'Escribe un comentario') + '"></textarea><div class="botones"><button class="b-si" data-a="comentar" data-id="' + id + '">Guardar</button></div></div></div>';
    if (b.paso === 'noaplica') return h + '<div class="alerta"><p>¿Por qué no aplica?</p><textarea id="c-' + id + '" rows="2" placeholder="Motivo"></textarea><div class="botones"><button class="b-si" data-a="noaplica-ok" data-id="' + id + '">Guardar</button><button class="b-sec" data-a="descartar" data-id="' + id + '">Volver</button></div></div></div>';
    // 2) corrección en curso: se ve la respuesta anterior y quién y cuándo la dio
    if (b.corrige) {
      const p = b.previa, n = b.fotos.length;
      return h + '<div class="alerta corr"><p>✏️ <b>Corrigiendo.</b> Respuesta anterior: <b>' + nomValor(i, p.valor, p.estado === 'NO_APLICA') + '</b> · ' + esc(p.usuario || '') + ' · ' + hhmm(p.capturado_en) + (p.comentario ? '<br><small>💬 ' + esc(p.comentario) + '</small>' : '') + '</p>' +
        '<p>Elige la respuesta correcta:</p>' + vEntrada(i, b, id) + (b.error ? '<p class="error">' + esc(b.error) + '</p>' : '') +
        (max ? vMinis(id, b.fotos, true) + '<p class="cuenta">📷 <b>' + n + '/' + max + '</b> ' + (max === 1 ? 'foto' : 'fotos') + ' · quita con ✕ las que no correspondan' + '</p>' + (n < max ? '<div class="botones"><button class="b-sec" data-a="foto" data-id="' + id + '">📷 ' + (n ? 'Otra foto' : 'Tomar foto') + '</button></div>' : '') : '') +
        '<div class="extra"><a data-a="descartar" data-id="' + id + '">Cancelar corrección</a><a data-a="noaplica" data-id="' + id + '">No aplica</a></div></div></div>';
    }
    // 3) ya respondida (o respondida y esperando su foto obligatoria)
    if (ok || i._incompleta) {
      const fuera = i.tipo_respuesta === 'NUMERO' && i.estado !== 'NO_APLICA' && !i._incompleta && Core.validarValor(i, i.valor).fuera_rango, na = i.estado === 'NO_APLICA' || (l && i._local && l.no_aplica);
      const ids = i._fotos || (i.fotos || []).map(f => f.id), nf = ids.length || (i._mia || i._local ? 0 : Number(i.n_fotos) || 0);
      h += '<div class="hecha"><span class="valor v-' + esc(fuera ? 'M' : i.valor) + '">' + (i.valor === 'FOTO' ? 'Foto tomada' : nomValor(i, i.valor, na)) + (fuera ? ' · fuera de rango' : '') + '</span><small>' + esc(i.usuario || '') + ' · ' + hhmm(i.capturado_en) + (i.estado === 'HECHA_ATRASO' ? ' · con atraso' : '') + (nf ? ' · 📷 ' + nf : '') +
        (i._local && l && l.reemplaza_a ? ' · ✏️ corrección' : i.version > 1 ? ' · ✏️ corregida' : '') + (i._local ? ' · <b>por enviar</b>' : '') + '</small></div>' + (i.comentario ? '<small class="obs">💬 ' + esc(i.comentario) + '</small>' : '');
      if (i._incompleta) h += '<p class="error">📷 Falta la foto: sin ella esta tarea queda pendiente.</p>';
      const mia = l && (i._local || i._mia); // este celular tiene la respuesta: puede sumarle fotos
      if (mia && max && !na) {
        const tS = {}; (i.fotos || []).forEach(f => { tS[f.id] = f.t; });
        h += vMinis(id, ids.map(x => ({ id: x, mini: (l.minis || {})[x], t: (l.fotos_t || {})[x] || tS[x], fija: (l.evEnc || []).indexOf(x) >= 0 || !(l.fotos_t || {})[x] })), true);
        if (puede && ids.length < max) h += '<div class="botones"><button class="b-sec" data-a="foto" data-id="' + id + '">📷 ' + (ids.length ? 'Otra foto' : 'Tomar foto') + ' (' + ids.length + '/' + max + ')</button></div>';
      }
      const links = [];
      if (l && i._local && !l.encolada) links.push('<a data-a="cambiar" data-id="' + id + '">cambiar</a>');
      else if (!i._local && i.respuesta_id && i.origen === 'PLAN' && puede && Core.puedeCorregir(i.usuario_id, S.usuario)) links.push('<a data-a="corregir-resp" data-id="' + id + '">Corregir</a>');
      if (links.length) h += '<div class="extra"><span></span>' + links.join('') + '</div>';
      return h + '</div>';
    }
    if (futura) return h + '<small class="meta">Disponible a las ' + hhmm(i.disponible_desde) + '</small></div>';
    if (!puede) return h + '<small class="meta">Sin responder · el horario terminó a las ' + hhmm(ej.limite) + '</small></div>';
    h += '<small class="meta">' + (atras ? '⏰ Atrasada · vencía ' : 'Hasta las ') + hhmm(i.vence_a) + (Core.tieneRango(i) ? ' · rango ' + esc(Core.textoRango(i)) : '') + (max && i.tipo_respuesta !== 'FOTO' ? ' · 📷 ' + (oblig ? 'con foto' : 'foto opcional') + (max > 1 ? ' (hasta ' + max + ')' : '') : '') + '</small>';
    h += vEntrada(i, b, id);
    if (b.error) h += '<p class="error">' + esc(b.error) + '</p>';
    return h + '<div class="extra"><span></span><a data-a="noaplica" data-id="' + id + '">No aplica</a></div></div>'; // las fotos van después de la respuesta
  }
  function vChecklist() {
    const ej = ejecuciones().find(e => e.ejecucion_id === S.ejec); if (!ej) { S.vista = 'inicio'; return vInicio(); }
    const lista = instancias(ej), plan = lista.filter(i => i.origen === 'PLAN'), r = Core.resumen(plan), ahora = new Date().toISOString(), id = ej.ejecucion_id;
    const cerrada = ej.estado === 'CERRADA' || S.local.cerradas[id], enviando = !!S.local.cerrando[id], abierto = editable(ej, ahora);
    const cambios = !!S.local.sucio[id] || ej.cambios_pendientes === 'SI' || lista.some(i => i._local); // algo nuevo desde el último envío
    let h = '<header class="top fijo"><a class="volver" data-a="volver">‹ Volver</a><h1>' + esc(ej.plantilla) + '</h1><div class="progreso"><i style="width:' + (r.total ? Math.round(100 * r.hechas / r.total) : 0) + '%"></i></div><p>' + r.hechas + ' de ' + r.total + ' · ' + textoPlazo(ej, plan, ahora) + ' · ' + esc(S.usuario.nombre) + '</p></header>';
    let sec = null;
    lista.forEach(i => { if (i.seccion !== sec) { sec = i.seccion; h += '<h2 class="seccion">' + esc(sec || 'Tareas') + '</h2>'; } h += vTarea(i, ahora, ej); });
    const pend = plan.filter(i => !hecha(i) && i.disponible_desde <= ahora).length, sinFoto = plan.filter(i => i._incompleta).length;
    h += '<div class="cierre">';
    if (!abierto) h += '<p>' + (cerrada ? 'Este checklist ya es definitivo' : 'El horario de este checklist terminó') + ' (se podía completar o corregir hasta las ' + hhmm(ej.limite) + ').</p>';
    else if (enviando) h += '<p>⏳ <b>Pendiente de envío.</b> Se enviará solo apenas haya señal.</p><button class="btn sec" data-a="reenviar">Reintentar ahora</button>';
    else if (cerrada && !cambios) h += '<p>✔ <b>Checklist enviado.</b> Hasta las ' + hhmm(ej.limite) + ' puedes completar tareas pendientes o corregir respuestas; después vuelve a tocar "Cerrar y enviar".</p>';
    else if (S.confirmaCierre) h += '<p><b>' + (pend ? 'Quedan ' + pend + ' tareas sin responder' + (sinFoto ? ' (' + sinFoto + ' solo necesita' + (sinFoto > 1 ? 'n' : '') + ' su foto)' : '') + '.' : 'Todo respondido.') + '</b> ' + (cerrada ? 'Se enviará un informe actualizado con los cambios.' : 'Se envían las fotos y respuestas pendientes y el informe va al grupo.') + (pend ? ' Hasta las ' + hhmm(ej.limite) + ' podrás completarlas y volver a enviar.' : '') + '</p>' +
      '<button class="btn" data-a="cerrar-ok">Sí, cerrar y enviar</button><button class="btn sec" data-a="cerrar-no">Seguir respondiendo</button>';
    else h += (cerrada ? '<p>Hay cambios sin enviar desde el último informe.</p>' : '') + '<button class="btn" data-a="cerrar">Cerrar y enviar checklist</button>';
    return h + '</div>';
  }

  /* ---------------- Eventos ---------------- */
  const inst = id => { for (const e of ejecuciones()) { const i = instancias(e).find(x => x.instancia_id === id); if (i) return i; } };
  app.addEventListener('click', async ev => {
    const el = ev.target.closest('[data-a]'); if (!el) return;
    const a = el.dataset.a, id = el.dataset.id, i = id && /resp|num|txt|foto|noaplica|confirmar|corregir|comentar|signo|descartar|reintentar|cambiar/.test(a) ? inst(id) : null;
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
    else if (a === 'descartar') descartar(i);
    else if (a === 'reintentar') { const b = borr(i); b.paso = ''; b.confirmado = false; pintar(); } // corrigiendo: vuelve a elegir el valor
    else if (a === 'cambiar') cambiar(i);
    else if (a === 'corregir-resp') corregir(i);
    else if (a === 'comentar') { const b = borr(i); b.comentario = $('#c-' + CSS.escape(id)).value.trim(); b.paso = ''; responder(i, b.valor); }
    else if (a === 'foto') agregarFoto(i);
    else if (a === 'quitar-foto') quitarFoto(i, el.dataset.f);
    else if (a === 'noaplica') { borr(i).paso = 'noaplica'; pintar(); }
    else if (a === 'noaplica-ok') guardar(i, { no_aplica: true, comentario: $('#c-' + CSS.escape(id)).value.trim() });
    else if (a === 'reenviar') { if (!navigator.onLine) { S.aviso = 'Sin señal. Se enviará solo cuando vuelva la conexión.'; return pintar(); } S.ocupado = 'Enviando…'; pintar(); await enviar(); S.ocupado = ''; pintar(); }
    else if (a === 'cerrar') { S.confirmaCierre = true; pintar(); window.scrollTo(0, document.body.scrollHeight); }
    else if (a === 'cerrar-no') { S.confirmaCierre = false; pintar(); }
    else if (a === 'cerrar-ok') { S.confirmaCierre = false; cerrar(ejecuciones().find(e => e.ejecucion_id === S.ejec)); }
  });
  app.addEventListener('input', ev => { // lo que se va escribiendo se conserva aunque la pantalla se redibuje
    const m = /^([nx])-(.+)$/.exec(ev.target.id || ''); if (m) (S.borr[m[2]] || (S.borr[m[2]] = { fotos: [] })).valor = ev.target.value;
  });
  window.addEventListener('online', () => { S.enLinea = true; barra(); sincronizar().then(enviar); refrescar(); });
  window.addEventListener('offline', () => { S.enLinea = false; barra(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) sincronizar(); else { enviar(); refrescar(); } }); // al salir de la app, lo respondido sale de inmediato
  try {
    new BroadcastChannel('cola').onmessage = m => {
      S.pend = m.data.quedan; barra();
      if (S.envio && m.data.fotos != null) { S.envio.quedan = m.data.fotos; pintar(); } // avance del envío único
      else if (!m.data.progreso && !S.envio) procesarEnvio(); // lo envió el celular en segundo plano
    };
  } catch (e) { }
  setInterval(() => { if (Date.now() - (S.activaT || 0) >= 60000 && !S.envio) sincronizar().then(() => { if (navigator.onLine) enviar(); }); else if (navigator.onLine) enviar(); }, 30000); // red de seguridad: nada respondido queda sin salir
  setInterval(() => { refrescar(); }, 120000);
  setInterval(() => { if (S.usuario && !S.ocupado) pintar(true); if (S.verNueva && !S.sinBajar) revisarVersion(); }, 60000); // refresca horas y atrasos; aplica la versión nueva al salir del checklist

  /* ---------------- Inicio ---------------- */
  (async function iniciar() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    S.equipo = await Local.get('equipo') || null; S.estado = await Local.get('estado') || null; S.local = Object.assign({ r: {}, rel: [], cerradas: {}, cerrando: {}, sucio: {} }, await Local.get('local') || {});
    S.pend = (await Cola.todo()).length;
    try { const u = JSON.parse(sessionStorage.getItem('u') || 'null'); if (u && S.estado && Date.now() - u.t < 12 * 3600000) S.usuario = S.estado.usuarios.find(x => x.usuario_id === u.id) || null; } catch (e) { }
    const enlace = new URLSearchParams(location.search).get('e'); // link del grupo de Telegram
    if (S.usuario && enlace && visibles().some(x => x.ejecucion_id === enlace)) { S.ejec = enlace; S.vista = 'checklist'; }
    if (S.estado) { await sincronizar(); await procesarEnvio(); } // lo que quedó respondido al cerrar la app sale ahora
    if (S.equipo && S.estado && navigator.onLine) { // con señal, primero se bajan los cambios: no se trabaja con una configuración antigua
      S.ocupado = 'Buscando cambios…'; pintar(); await Promise.race([refrescar(), new Promise(ok => setTimeout(ok, 8000))]); S.ocupado = '';
      pintar(); revisarVersion();
    } else { pintar(); await refrescar(); }
    enviar();
    window.__app = { S, instancias, ejecuciones, sincronizar }; // para pruebas
  })();
})();

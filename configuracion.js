/* Panel de configuración sin código: sedes, personas y roles, cámaras y umbrales, checklists y tareas, reglas, Telegram, equipos. */
(function () {
  const { api, esc } = Panel, main = document.querySelector('main');
  const C = { t: null, sec: 'sedes', pl: '', sucio: false, msg: null, tg: {}, tipos: {} };
  const nuevoId = p => p + Date.now().toString(36).slice(-4).toUpperCase() + Math.floor(Math.random() * 36).toString(36).toUpperCase();
  const SINO = [['SI', 'Sí'], ['NO', 'No']];
  const ops = (lista, id, nombre, vacio) => (vacio ? [['', vacio]] : []).concat(lista.map(x => [String(x[id]), x[nombre]]));
  const sedesOp = todas => (todas ? [['*', 'Todas las sedes']] : []).concat(ops(C.t.Sedes, 'sede_id', 'nombre'));

  /* ---------- columnas de cada grilla ---------- */
  const usSede = (u, crear) => { let x = C.t.UsuarioSede.find(r => r.usuario_id === u.usuario_id); if (!x && crear) { x = { usuario_id: u.usuario_id, sede_id: '', rol_id: 'OPERARIO' }; C.t.UsuarioSede.push(x); } return x || {}; };
  const umbral = (a, crear) => { let x = C.t.Umbrales.find(r => r.activo_id === a.activo_id && !r.tarea_id); if (!x && crear) { x = { umbral_id: 'UM-' + a.activo_id, activo_id: a.activo_id, tarea_id: '', minimo: '', maximo: '', unidad: '°C', severidad: 'ALTA' }; C.t.Umbrales.push(x); } return x || {}; };
  const seccionDe = t => (C.t.Secciones.find(s => s.seccion_id === t.seccion_id) || {}).nombre || '';
  const ponerSeccion = (t, nombre) => {
    nombre = String(nombre).trim() || 'General';
    let s = C.t.Secciones.find(x => x.plantilla_id === t.plantilla_id && x.nombre.toLowerCase() === nombre.toLowerCase());
    if (!s) { s = { seccion_id: nuevoId('SEC'), plantilla_id: t.plantilla_id, nombre, orden: 99 }; C.t.Secciones.push(s); }
    t.seccion_id = s.seccion_id;
  };
  const COLS = {
    sedes: [{ k: 'nombre', t: 'Nombre', cls: 'ancho' }, { k: 'tipo', t: 'Tipo', op: [['bodega', 'Bodega'], ['local', 'Local'], ['faena', 'Faena']] }, { k: 'centro_costo', t: 'Centro de costo' },
      { k: 'telegram_chat_id', t: 'ID grupo de Telegram' }, { k: 'telegram_chat_escalamiento', t: 'ID chat de escalamiento' }, { k: 'clave_equipos', t: 'Clave de equipos' }, { k: 'activa', t: 'Activa', op: SINO }],
    personas: [{ k: 'nombre', t: 'Nombre', cls: 'ancho' }, { t: 'Sede', op: () => sedesOp(true), get: u => usSede(u).sede_id || '', set: (u, v) => usSede(u, true).sede_id = v },
      { t: 'Rol', op: () => ops(C.t.Roles, 'rol_id', 'nombre'), get: u => usSede(u).rol_id || '', set: (u, v) => usSede(u, true).rol_id = v },
      { k: 'pin_nuevo', t: 'PIN nuevo (4 dígitos)', cls: 'corto', ph: u => u.tiene_pin === 'SI' ? '••••' : 'sin PIN' }, { k: 'email', t: 'Email (solo para el panel)' }, { k: 'telegram_user_id', t: 'ID de Telegram (opcional)' }, { k: 'activo', t: 'Activo', op: SINO }],
    camaras: [{ k: 'nombre', t: 'Nombre', cls: 'ancho' }, { k: 'sede_id', t: 'Sede', op: () => sedesOp() }, { k: 'tipo', t: 'Tipo', op: [['camara_refrigerada', 'Cámara refrigerada'], ['camara_congelado', 'Cámara de congelado'], ['equipo_frio', 'Equipo de frío'], ['otro', 'Otro']] },
      { t: 'Mínimo', cls: 'corto', get: a => umbral(a).minimo ?? '', set: (a, v) => umbral(a, true).minimo = v }, { t: 'Máximo', cls: 'corto', get: a => umbral(a).maximo ?? '', set: (a, v) => umbral(a, true).maximo = v },
      { t: 'Unidad', cls: 'corto', get: a => umbral(a).unidad ?? '°C', set: (a, v) => umbral(a, true).unidad = v }, { k: 'activo', t: 'Activa', op: SINO }],
    tareas: [{ t: 'Sección', get: seccionDe, set: ponerSeccion, lista: 'secciones', cls: 'medio' }, { k: 'texto', t: 'Tarea', cls: 'ancho' },
      { k: 'tipo_respuesta', t: 'Respuesta', op: [['SI_NO', 'Sí / No'], ['BRM', 'Bueno / Regular / Malo'], ['NUMERO', 'Número'], ['TEXTO', 'Texto'], ['FOTO', 'Solo foto']] }, { k: 'unidad', t: 'Unidad', cls: 'corto' },
      { k: 'foto', t: 'Foto', op: [['NO', 'No'], ['OPCIONAL', 'Opcional'], ['OBLIGATORIA', 'Obligatoria']] }, { k: 'critica', t: 'Crítica', op: SINO }, { k: 'critico_estados', t: 'Alerta si queda en', op: [['', '(según tipo)'], ['M', 'Malo'], ['R,M', 'Regular o Malo'], ['NO', 'No']] },
      { k: 'frecuencia', t: 'Frecuencia', op: [['DIARIA', 'Diaria'], ['CADA_N_HORAS', 'Cada N horas'], ['SEMANAL', 'Semanal'], ['MENSUAL', 'Mensual']] }, { k: 'hora_objetivo', t: 'Hora objetivo', tipo: 'time' }, { k: 'tolerancia_min', t: 'Tolerancia (min)', cls: 'corto' },
      { k: 'cada_n_horas', t: 'Cada N h', cls: 'corto' }, { k: 'ventana_inicio', t: 'Desde', tipo: 'time' }, { k: 'ventana_fin', t: 'Hasta', tipo: 'time' }, { k: 'dias_semana', t: 'Días (LMXJVSD)', cls: 'corto' }, { k: 'dia_mes', t: 'Día del mes', cls: 'corto' },
      { k: 'activo_id', t: 'Cámara / equipo', op: t => ops(C.t.Activos.filter(a => a.sede_id === (plantilla() || {}).sede_id), 'activo_id', 'nombre', '—') }, { k: 'activa', t: 'Activa', op: SINO }],
    reglas: [{ k: 'tipo', t: 'Regla', ro: true }, { t: 'Qué hace', ro: true, get: r => (C.tipos[r.tipo] || [r.descripcion])[0] }, { k: 'activa', t: 'Activa', op: SINO }, { k: 'sede_id', t: 'Aplica a', op: () => sedesOp(true) },
      { k: 'parametro', t: 'Parámetro 1', cls: 'corto', nota: r => (C.tipos[r.tipo] || [])[1] }, { k: 'parametro2', t: 'Parámetro 2', cls: 'corto', nota: r => (C.tipos[r.tipo] || [])[2] }],
    parametros: [{ k: 'clave', t: 'Parámetro', ro: true }, { k: 'valor', t: 'Valor', cls: 'ancho' }, { k: 'descripcion', t: 'Para qué sirve', ro: true }],
    equipos: [{ k: 'nombre', t: 'Equipo', ro: true }, { t: 'Sede', ro: true, get: d => (C.t.Sedes.find(s => s.sede_id === d.sede_id) || {}).nombre || d.sede_id }, { t: 'Registrado', ro: true, get: d => String(d.registrado_en).slice(0, 10) }, { k: 'activo', t: 'Autorizado', op: SINO }],
  };
  const FILAS = { sedes: () => C.t.Sedes, personas: () => C.t.Usuarios, camaras: () => C.t.Activos, tareas: () => C.t.Tareas.filter(t => t.plantilla_id === C.pl), reglas: () => C.t.Reglas, parametros: () => C.t.Parametros, equipos: () => C.t.Dispositivos };
  const plantilla = () => C.t.Plantillas.find(p => p.plantilla_id === C.pl);

  function grilla(g, opc) {
    const cols = COLS[g], filas = FILAS[g](); opc = opc || {};
    return '<table class="ed"><thead><tr>' + (opc.mover ? '<th></th>' : '') + cols.map(c => '<th>' + c.t + '</th>').join('') + (opc.borrar ? '<th></th>' : '') + '</tr></thead><tbody>' + filas.map((f, i) => '<tr>' +
      (opc.mover ? '<td style="white-space:nowrap"><button class="mini sec" data-mv="-1" data-g="' + g + '" data-i="' + i + '" title="Subir">▲</button> <button class="mini sec" data-mv="1" data-g="' + g + '" data-i="' + i + '" title="Bajar">▼</button></td>' : '') +
      cols.map((c, k) => {
        const v = c.get ? c.get(f) : (f[c.k] == null ? '' : f[c.k]), d = ' data-g="' + g + '" data-i="' + i + '" data-c="' + k + '"';
        if (c.ro) return '<td>' + esc(v) + '</td>';
        if (c.op) { const o = typeof c.op === 'function' ? c.op(f) : c.op; return '<td><select' + d + '>' + (o.some(x => x[0] === String(v)) ? '' : '<option value="' + esc(v) + '">' + esc(v || '—') + '</option>') + o.map(x => '<option value="' + esc(x[0]) + '"' + (x[0] === String(v) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') + '</select></td>'; }
        return '<td><input' + d + ' type="' + (c.tipo || 'text') + '" class="' + (c.cls || '') + '" value="' + esc(v) + '"' + (c.ph ? ' placeholder="' + esc(c.ph(f)) + '"' : '') + (c.lista ? ' list="' + c.lista + '"' : '') + '>' + (c.nota && c.nota(f) ? '<div class="ayuda" style="margin:2px 0 0">' + esc(c.nota(f)) + '</div>' : '') + '</td>';
      }).join('') + (opc.borrar ? '<td><button class="mini rojo" data-del="' + g + '" data-i="' + i + '" title="Eliminar">✕</button></td>' : '') + '</tr>').join('') + '</tbody></table>' +
      (opc.agregar ? '<p><button class="sec" data-add="' + g + '">+ ' + opc.agregar + '</button></p>' : '');
  }

  const SECCIONES = [['sedes', 'Sedes'], ['personas', 'Personas y roles'], ['camaras', 'Cámaras y umbrales'], ['checklists', 'Checklists y tareas'], ['reglas', 'Reglas y alertas'], ['telegram', 'Telegram'], ['equipos', 'Equipos'], ['parametros', 'Parámetros']];
  function pintar() {
    let h = '<div class="tabs">' + SECCIONES.map(s => '<button data-sec="' + s[0] + '" class="' + (C.sec === s[0] ? 'on' : '') + '">' + s[1] + '</button>').join('') + '</div>';
    if (C.msg) h += '<div class="aviso ' + C.msg[0] + '">' + esc(C.msg[1]) + '</div>';
    h += '<div class="caja">';
    if (C.sec === 'sedes') h += '<p class="ayuda">Cada sede tiene su grupo de Telegram, su centro de costo y su <b>clave de equipos</b> (la que se escribe una sola vez en cada celular). Para agregar una sede: créala aquí, agrega sus personas y cámaras, y en “Checklists y tareas” duplica una plantilla hacia la sede nueva.</p>' + grilla('sedes', { agregar: 'Agregar sede', borrar: true });
    if (C.sec === 'personas') h += '<p class="ayuda">En el celular cada persona entra con su nombre y su PIN. El email solo se necesita para quienes entran al dashboard o a esta configuración (jefes, operaciones, administradores). El PIN no se muestra: escribe uno nuevo para cambiarlo.</p>' + grilla('personas', { agregar: 'Agregar persona', borrar: true });
    if (C.sec === 'camaras') h += '<p class="ayuda">Rango aceptado de cada cámara o equipo. Una lectura fuera de este rango dispara la regla T1. Ej.: refrigerado 0 a 4 °C; congelado −25 a −18 °C.</p>' + grilla('camaras', { agregar: 'Agregar cámara o equipo', borrar: true });
    if (C.sec === 'checklists') h += vChecklists();
    if (C.sec === 'reglas') h += '<p class="ayuda">Activa o desactiva cada regla y ajusta sus parámetros. Las tareas no críticas nunca generan alertas propias: solo aparecen en el reporte de cierre.</p>' + grilla('reglas', { borrar: true }) +
      '<p><select id="tipoRegla">' + Object.keys(C.tipos).map(t => '<option>' + t + '</option>').join('') + '</select> <button class="sec" data-add="reglas">+ Agregar regla para una sede específica</button></p>';
    if (C.sec === 'telegram') h += vTelegram();
    if (C.sec === 'equipos') h += '<p class="ayuda">Celulares registrados con la clave de equipos. Si un celular se pierde, márcalo como no autorizado.</p>' + grilla('equipos');
    if (C.sec === 'parametros') h += grilla('parametros');
    h += '</div>';
    if (C.sec !== 'telegram') h += '<div class="fijo-abajo"><button id="guardar"' + (C.sucio ? '' : ' disabled') + '>Guardar cambios</button><span class="ayuda">' + (C.sucio ? 'Hay cambios sin guardar.' : 'Sin cambios pendientes.') + ' Los celulares toman los cambios la próxima vez que tengan señal.</span></div>';
    main.innerHTML = h;
  }
  function vChecklists() {
    if (!C.pl || !plantilla()) C.pl = (C.t.Plantillas[0] || {}).plantilla_id || '';
    const p = plantilla(), nomSede = id => (C.t.Sedes.find(s => s.sede_id === id) || {}).nombre || id;
    let h = '<div class="filtros"><select id="selPl">' + C.t.Plantillas.map(x => '<option value="' + esc(x.plantilla_id) + '"' + (x.plantilla_id === C.pl ? ' selected' : '') + '>' + esc(nomSede(x.sede_id) + ' · ' + x.nombre + ' (' + x.turno + ')') + '</option>').join('') + '</select>' +
      '<button class="sec" id="nuevaPl">+ Nuevo checklist</button>' + (p ? '<select id="sedeDup">' + sedesOp().map(o => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('') + '</select><button class="sec" id="dupPl">Duplicar hacia esa sede</button><button class="rojo" id="delPl">Eliminar checklist</button>' : '') + '</div>';
    if (!p) return h + '<p class="ayuda">Aún no hay checklists.</p>';
    const campo = (k, t, tipo, o) => '<label>' + t + (o ? '<select data-pl="' + k + '">' + o.map(x => '<option value="' + esc(x[0]) + '"' + (x[0] === String(p[k]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') + '</select>' : '<input data-pl="' + k + '" type="' + (tipo || 'text') + '" value="' + esc(p[k]) + '">') + '</label>';
    h += '<div class="form">' + campo('nombre', 'Nombre') + campo('sede_id', 'Sede', '', sedesOp()) + campo('turno', 'Turno', '', [['AM', 'AM'], ['PM', 'PM'], ['NOCHE', 'Noche']]) + campo('rol_id', 'Quién lo responde', '', ops(C.t.Roles, 'rol_id', 'nombre', 'Cualquiera de la sede')) +
      campo('hora_envio', 'Hora en que se envía el link', 'time') + campo('hora_cierre', 'Hora de cierre', 'time') + campo('tolerancia_cierre_min', 'Margen después del cierre (min)') + campo('dias', 'Días (LMXJVSD)') + campo('activa', 'Activo', '', SINO) + '</div>' +
      '<p class="ayuda">Versión ' + esc(p.version || 1) + ' · ' + FILAS.tareas().length + ' tareas. Al guardar un cambio sube la versión; lo ya respondido no se altera. <b>Hora objetivo</b> vacía = la tarea vence al cierre del checklist. <b>Cada N horas</b>: indica N y el rango Desde–Hasta. <b>Semanal</b>: días (ej. L o LXV). <b>Mensual</b>: día del mes.</p>' +
      '<datalist id="secciones">' + C.t.Secciones.filter(s => s.plantilla_id === C.pl).map(s => '<option value="' + esc(s.nombre) + '">').join('') + '</datalist>' + grilla('tareas', { agregar: 'Agregar tarea', borrar: true, mover: true });
    return h;
  }
  function vTelegram() {
    return '<h2 style="margin-top:0">1. Bot</h2><p class="ayuda">En Telegram abre <b>@BotFather</b>, envía <code>/newbot</code>, ponle nombre y copia el token que entrega. Pégalo aquí: se guarda en el servidor y no se vuelve a mostrar.</p>' +
      '<p>Estado: ' + (C.tg.token ? '<span class="chip c-ok">Token guardado' + (C.tg.bot ? ' · ' + esc(C.tg.bot) : '') + '</span>' : '<span class="chip c-mal">Falta el token</span>') + '</p>' +
      '<div class="filtros"><input id="token" placeholder="123456789:AA..." style="min-width:340px" autocomplete="off"><button id="guardarToken">Guardar token</button></div>' +
      '<h2>2. Botones de las alertas</h2><p class="ayuda">Activa la conexión para que funcionen “Me hago cargo”, “Ya resuelto” y “Escalar”, y el comando <code>/id</code>.</p><div class="filtros"><button id="webhook">Activar botones</button><button class="sec" id="tgInfo">Ver estado</button></div>' +
      '<h2>3. Grupos</h2><p class="ayuda">Crea un grupo por sede, agrega el bot y escribe <code>/id</code> en el grupo: el bot responde con el ID (un número negativo). Cópialo en <b>Sedes → ID grupo de Telegram</b>. Para avisos privados (regla C2), cada jefe le escribe <code>/id</code> al bot en privado y su número va en <b>Personas → ID de Telegram</b>.</p>' +
      '<div class="filtros"><button class="sec" id="tgProbar">Enviar mensaje de prueba a los grupos</button></div><div id="tgRes"></div>';
  }

  /* ---------- guardar ---------- */
  function normalizar() { // orden de tareas y secciones según cómo quedaron en pantalla
    C.t.Plantillas.forEach(p => {
      const ts = C.t.Tareas.filter(t => t.plantilla_id === p.plantilla_id), usadas = [];
      ts.forEach((t, i) => { t.orden = i + 1; if (!t.seccion_id) ponerSeccion(t, 'General'); if (usadas.indexOf(t.seccion_id) < 0) usadas.push(t.seccion_id); });
      C.t.Secciones = C.t.Secciones.filter(s => s.plantilla_id !== p.plantilla_id || usadas.indexOf(s.seccion_id) >= 0);
      C.t.Secciones.forEach(s => { if (s.plantilla_id === p.plantilla_id) s.orden = usadas.indexOf(s.seccion_id) + 1; });
    });
    const ids = new Set(C.t.Plantillas.map(p => p.plantilla_id));
    C.t.Tareas = C.t.Tareas.filter(t => ids.has(t.plantilla_id) && String(t.texto).trim()); C.t.Secciones = C.t.Secciones.filter(s => ids.has(s.plantilla_id));
    const us = new Set(C.t.Usuarios.map(u => u.usuario_id)); C.t.UsuarioSede = C.t.UsuarioSede.filter(x => us.has(x.usuario_id) && x.sede_id);
    const ac = new Set(C.t.Activos.map(a => a.activo_id)); C.t.Umbrales = C.t.Umbrales.filter(u => u.tarea_id || ac.has(u.activo_id));
  }
  function validar() {
    const claves = C.t.Sedes.map(s => String(s.clave_equipos).trim().toLowerCase()).filter(x => x);
    if (new Set(claves).size !== claves.length) return 'Dos sedes tienen la misma clave de equipos.';
    if (C.t.Sedes.some(s => !String(s.nombre).trim())) return 'Hay una sede sin nombre.';
    const malPin = C.t.Usuarios.find(u => u.pin_nuevo && !/^\d{4}$/.test(u.pin_nuevo)); if (malPin) return 'El PIN de ' + malPin.nombre + ' debe tener exactamente 4 dígitos.';
    const sinSede = C.t.Usuarios.find(u => !usSede(u).sede_id); if (sinSede) return 'Falta la sede de ' + (sinSede.nombre || 'una persona') + '.';
    const malaHora = C.t.Plantillas.find(p => !Core.normHora(p.hora_envio) || !Core.normHora(p.hora_cierre)); if (malaHora) return 'El checklist "' + malaHora.nombre + '" necesita hora de envío y de cierre.';
    return '';
  }
  async function guardar() {
    normalizar(); const err = validar(); if (err) { C.msg = ['mal', err]; return pintar(); }
    const b = document.querySelector('#guardar'); b.disabled = true; b.textContent = 'Guardando…';
    const t = {}; ['Sedes', 'Usuarios', 'UsuarioSede', 'Activos', 'Umbrales', 'Plantillas', 'Secciones', 'Tareas', 'Reglas', 'Parametros', 'Dispositivos'].forEach(n => t[n] = C.t[n]);
    try { const r = await api({ action: 'admin_guardar', tablas: t }); if (!r.ok) throw new Error(r.error); recibir(r); C.msg = ['ok', 'Cambios guardados.']; }
    catch (e) { C.msg = ['mal', 'No se guardó: ' + e.message]; }
    pintar();
  }
  function recibir(r) { C.t = r.tablas; C.tipos = r.tipos_regla; C.tg = Object.assign(C.tg, r.telegram); C.sucio = false; }

  /* ---------- eventos ---------- */
  const NUEVO = {
    sedes: () => ({ sede_id: nuevoId('S'), nombre: '', tipo: 'local', centro_costo: '', telegram_chat_id: '', telegram_chat_escalamiento: '', zona_horaria: 'America/Santiago', clave_equipos: 'sede-' + Math.random().toString(36).slice(2, 8), activa: 'SI' }),
    personas: () => ({ usuario_id: nuevoId('U'), nombre: '', email: '', telefono: '', telegram_user_id: '', pin_nuevo: '', activo: 'SI', tiene_pin: 'NO' }),
    camaras: () => ({ activo_id: nuevoId('ACT'), sede_id: (C.t.Sedes[0] || {}).sede_id || '', nombre: '', tipo: 'camara_refrigerada', codigo_qr: '', activo: 'SI' }),
    tareas: () => { const ult = FILAS.tareas().slice(-1)[0] || {}; return { tarea_id: nuevoId('T'), plantilla_id: C.pl, seccion_id: ult.seccion_id || '', orden: 999, texto: '', tipo_respuesta: 'SI_NO', unidad: '', foto: 'NO', critica: 'NO', critico_estados: '', frecuencia: 'DIARIA', cada_n_horas: '', ventana_inicio: '', ventana_fin: '', dias_semana: '', dia_mes: '', hora_objetivo: '', tolerancia_min: 15, activo_id: '', activa: 'SI' }; },
    reglas: () => ({ regla_id: nuevoId('R'), tipo: document.querySelector('#tipoRegla').value, sede_id: (C.t.Sedes[0] || {}).sede_id || '*', parametro: '', parametro2: '', activa: 'SI', descripcion: '' }),
  };
  const TABLA = { sedes: 'Sedes', personas: 'Usuarios', camaras: 'Activos', tareas: 'Tareas', reglas: 'Reglas' };
  main.addEventListener('change', e => {
    const d = e.target.dataset;
    if (d.g) { const c = COLS[d.g][d.c], f = FILAS[d.g]()[d.i]; c.set ? c.set(f, e.target.value) : f[c.k] = e.target.value; C.sucio = true; C.msg = null; if (c.op || c.lista) pintar(); else { const b = document.querySelector('#guardar'); if (b) b.disabled = false; } }
    else if (d.pl) { plantilla()[d.pl] = e.target.value; C.sucio = true; pintar(); }
    else if (e.target.id === 'selPl') { C.pl = e.target.value; pintar(); }
  });
  main.addEventListener('click', async e => {
    const t = e.target, d = t.dataset;
    if (d.sec) { C.sec = d.sec; C.msg = null; return pintar(); }
    if (d.add) { C.t[TABLA[d.add]].push(NUEVO[d.add]()); C.sucio = true; return pintar(); }
    if (d.del) {
      const f = FILAS[d.del]()[d.i]; if (!confirm('¿Eliminar "' + (f.nombre || f.texto || f.tipo) + '"? Se aplica al guardar.')) return;
      const arr = C.t[TABLA[d.del]]; arr.splice(arr.indexOf(f), 1); C.sucio = true; return pintar();
    }
    if (d.mv) { const fs = FILAS[d.g](), a = fs[d.i], b = fs[Number(d.i) + Number(d.mv)]; if (!b) return; const T = C.t.Tareas, ia = T.indexOf(a), ib = T.indexOf(b); T[ia] = b; T[ib] = a; C.sucio = true; return pintar(); }
    if (t.id === 'guardar') return guardar();
    if (t.id === 'nuevaPl') { const p = { plantilla_id: nuevoId('P'), nombre: 'Nuevo checklist', sede_id: (C.t.Sedes[0] || {}).sede_id || '', turno: 'AM', rol_id: '', version: 1, dias: 'LMXJVS', hora_envio: '08:00', hora_cierre: '10:00', tolerancia_cierre_min: 15, activa: 'SI' }; C.t.Plantillas.push(p); C.pl = p.plantilla_id; C.sucio = true; return pintar(); }
    if (t.id === 'dupPl') {
      const p = plantilla(), sede = document.querySelector('#sedeDup').value, np = Object.assign({}, p, { plantilla_id: nuevoId('P'), sede_id: sede, version: 1, nombre: p.nombre + (sede === p.sede_id ? ' (copia)' : '') }), mapa = {};
      C.t.Secciones.filter(s => s.plantilla_id === p.plantilla_id).forEach(s => { mapa[s.seccion_id] = nuevoId('SEC'); C.t.Secciones.push(Object.assign({}, s, { seccion_id: mapa[s.seccion_id], plantilla_id: np.plantilla_id })); });
      C.t.Tareas.filter(x => x.plantilla_id === p.plantilla_id).forEach(x => C.t.Tareas.push(Object.assign({}, x, { tarea_id: nuevoId('T'), plantilla_id: np.plantilla_id, seccion_id: mapa[x.seccion_id] || '', activo_id: sede === p.sede_id ? x.activo_id : '' })));
      C.t.Plantillas.push(np); C.pl = np.plantilla_id; C.sucio = true; C.msg = ['ok', 'Checklist duplicado' + (sede === p.sede_id ? '' : '. Revisa la columna “Cámara / equipo” de las tareas de temperatura: hay que elegir las cámaras de la sede nueva') + '. Falta guardar.']; return pintar();
    }
    if (t.id === 'delPl') { const p = plantilla(); if (!confirm('¿Eliminar el checklist "' + p.nombre + '" y sus tareas? El histórico ya respondido se conserva.')) return; C.t.Plantillas.splice(C.t.Plantillas.indexOf(p), 1); C.pl = ''; C.sucio = true; return pintar(); }
    const res = (html) => { const x = document.querySelector('#tgRes'); if (x) x.innerHTML = html; };
    if (t.id === 'guardarToken') { const r = await api({ action: 'admin_secreto', clave: 'TELEGRAM_TOKEN', valor: document.querySelector('#token').value }); if (r.ok) { C.tg.token = true; C.tg.bot = r.bot; C.msg = ['ok', 'Token guardado. Bot: ' + r.bot]; } else C.msg = ['mal', r.error]; return pintar(); }
    if (t.id === 'webhook') { const r = await api({ action: 'admin_telegram', op: 'webhook', api_url: self.APP_CONFIG.API_URL }); C.msg = r.ok ? ['ok', 'Botones activados.'] : ['mal', 'No se pudo activar: ' + r.error]; return pintar(); }
    if (t.id === 'tgInfo') { const r = await api({ action: 'admin_telegram', op: 'info' }); return res('<div class="aviso ' + (r.ok && r.info.url && !r.info.last_error_message ? 'ok' : '') + '">' + (r.ok ? 'Bot ' + esc(r.bot) + ' · conexión ' + (r.info.url ? 'activa' : 'NO activada') + ' · mensajes en espera: ' + (r.info.pending_update_count || 0) + (r.info.last_error_message ? ' · último error: ' + esc(r.info.last_error_message) + '. Si el error se repite, cambia el parámetro TELEGRAM_MODO a POLLING.' : '') : esc(r.error)) + '</div>'); }
    if (t.id === 'tgProbar') { const r = await api({ action: 'admin_telegram', op: 'probar' }); return res('<div class="aviso">' + (r.resultados || []).map(x => esc(x.sede) + ': <b>' + esc(x.resultado === 'ENVIADA' ? 'enviado ✓' : x.resultado === 'SIN_CHAT' ? 'falta el ID del grupo' : x.resultado) + '</b>').join('<br>') + '</div>'); }
  });
  window.addEventListener('beforeunload', e => { if (C.sucio) { e.preventDefault(); e.returnValue = ''; } });
  document.querySelector('#salir').onclick = e => { e.preventDefault(); Panel.salir(); };
  Panel.iniciar('Configuración de checklists', async () => {
    main.innerHTML = '<p class="ayuda">Cargando…</p>';
    const r = await api({ action: 'admin_get' });
    if (!r.ok) { main.innerHTML = '<div class="aviso mal">' + esc(r.error) + '</div><p><a href="dashboard.html">Ir al dashboard</a></p>'; return; }
    recibir(r); pintar();
  });
})();

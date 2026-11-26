/* Panel de configuración sin código: sedes, personas y roles, cámaras y equipos (con su rango), checklists y tareas, reglas, Telegram, equipos. */
(function () {
  const { api, esc } = Panel, main = document.querySelector('main');
  main.classList.add('cfg');
  const C = { t: null, sec: 'sedes', pl: '', sucio: false, msg: null, tg: {}, tipos: {}, edit: '', aviso: null };
  const mem = { get: (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  // Columnas visibles de la tabla de tareas, por bloque (se recuerda en este navegador). El panel "Editar" siempre muestra todo.
  const BLOQUES = [['tarea', 'Sección y tipo'], ['alerta', 'Evidencia y alerta'], ['cuando', 'Cuándo'], ['estado', 'Estado']];
  C.ver = Object.assign({ tarea: true, alerta: true, cuando: true, estado: true }, mem.get('cfg_columnas', {})); C.plegado = !!mem.get('cfg_plegado', false);
  const nuevoId = p => p + Date.now().toString(36).slice(-4).toUpperCase() + Math.floor(Math.random() * 36).toString(36).toUpperCase();
  const SINO = [['SI', 'Sí'], ['NO', 'No']];
  const ops = (lista, id, nombre, vacio) => (vacio ? [['', vacio]] : []).concat(lista.map(x => [String(x[id]), x[nombre]]));
  const sedesOp = todas => (todas ? [['*', 'Todas las sedes']] : []).concat(ops(C.t.Sedes, 'sede_id', 'nombre'));

  /* ---------- columnas de cada grilla ---------- */
  const usSede = (u, crear) => { let x = C.t.UsuarioSede.find(r => r.usuario_id === u.usuario_id); if (!x && crear) { x = { usuario_id: u.usuario_id, sede_id: '', rol_id: 'OPERARIO' }; C.t.UsuarioSede.push(x); } return x || {}; };
  const seccionDe = t => (C.t.Secciones.find(s => s.seccion_id === t.seccion_id) || {}).nombre || '';
  const ponerSeccion = (t, nombre) => {
    nombre = String(nombre).trim() || 'General';
    let s = C.t.Secciones.find(x => x.plantilla_id === t.plantilla_id && x.nombre.toLowerCase() === nombre.toLowerCase());
    if (!s) { s = { seccion_id: nuevoId('SEC'), plantilla_id: t.plantilla_id, nombre, orden: 99 }; C.t.Secciones.push(s); }
    t.seccion_id = s.seccion_id;
  };
  const esNum = t => t.tipo_respuesta === 'NUMERO', lleno = v => String(v == null ? '' : v).trim() !== '';
  const camDe = t => t.activo_id ? C.t.Activos.find(a => a.activo_id === t.activo_id) : null;
  const ALERTA_NUM = [['', 'Sin alerta'], ['TEMPERATURA', 'Fuera de rango de T°'], ['OTRA', 'Fuera de rango (otra medición)']];
  const ALERTA_SINO = [['', '(según tipo)'], ['NO', 'No'], ['SI', 'Sí (debe estar en No)']], ALERTA_BRM = [['', '(según tipo)'], ['M', 'Malo'], ['R,M', 'Regular o Malo']];
  /** Rango de una tarea Número: se ve y se edita en la misma tarea. Si queda igual al de su cámara, la tarea usa el de la cámara. */
  function rangoHtml(t, i) {
    if (!esNum(t)) return '<span class="nada">—</span>';
    const r = Core.rangoDe(t, camDe(t)), cam = camDe(t), camTiene = cam && (lleno(cam.minimo) || lleno(cam.maximo)), inp = (k, ph) => '<input class="corto" inputmode="decimal" data-r="' + k + '" data-i="' + i + '" value="' + esc(r[k]) + '" placeholder="' + ph + '" aria-label="' + (k === 'minimo' ? 'Mínimo' : 'Máximo') + '">';
    return '<div class="rango">' + inp('minimo', 'mín') + '<span>a</span>' + inp('maximo', 'máx') + '<span>' + esc(r.unidad) + '</span>' +
      (r.origen === 'CAMARA' ? '<span class="chip c-gris" title="Usa el rango de la cámara y sigue sus cambios. Si escribes otro valor, queda como rango propio de esta tarea.">Rango de la cámara</span>'
        : r.origen === 'TAREA' ? '<span class="chip c-med" title="Esta tarea tiene su propio rango; no cambia si se cambia el de la cámara.">Rango propio de esta tarea</span>' + (camTiene ? '<button class="mini sec" data-rcam="' + i + '" title="Volver al rango de la cámara: ' + esc(Core.textoRango({ minimo: cam.minimo, maximo: cam.maximo, unidad: cam.unidad })) + '">↺ usar el de la cámara</button>' : '')
          : '<span class="chip c-gris">Sin rango</span>') + '</div>';
  }
  const COLS = {
    sedes: [{ k: 'nombre', t: 'Nombre', cls: 'ancho' }, { k: 'tipo', t: 'Tipo', op: [['bodega', 'Bodega'], ['local', 'Local'], ['faena', 'Faena']] }, { k: 'centro_costo', t: 'Centro de costo' },
      { k: 'telegram_chat_id', t: 'ID grupo de Telegram' }, { k: 'telegram_chat_escalamiento', t: 'ID chat de escalamiento' }, { k: 'clave_equipos', t: 'Clave de equipos' },
      { k: 'emails_reporte', t: 'Correos del informe PDF', cls: 'ancho', ph: () => 'a@empresa.cl, b@empresa.cl' }, { k: 'emails_escalamiento', t: 'Correos de escalamiento', cls: 'ancho', ph: () => 'opcional' }, { k: 'activa', t: 'Activa', op: SINO }],
    personas: [{ k: 'nombre', t: 'Nombre', cls: 'ancho' }, { t: 'Sede', op: () => sedesOp(true), get: u => usSede(u).sede_id || '', set: (u, v) => usSede(u, true).sede_id = v },
      { t: 'Rol', op: () => ops(C.t.Roles, 'rol_id', 'nombre'), get: u => usSede(u).rol_id || '', set: (u, v) => usSede(u, true).rol_id = v },
      { k: 'pin_nuevo', t: 'PIN nuevo (4 dígitos)', cls: 'corto', ph: u => u.tiene_pin === 'SI' ? '••••' : 'sin PIN' }, { k: 'email', t: 'Email (solo para el panel)' }, { k: 'telegram_user_id', t: 'ID de Telegram (opcional)' }, { k: 'activo', t: 'Activo', op: SINO }],
    camaras: [{ k: 'nombre', t: 'Nombre', cls: 'ancho' }, { k: 'sede_id', t: 'Sede', op: () => sedesOp() }, { k: 'tipo', t: 'Tipo', op: [['camara_refrigerada', 'Cámara refrigerada'], ['camara_congelado', 'Cámara de congelado'], ['equipo_frio', 'Equipo de frío'], ['otro', 'Otro']] },
      { k: 'minimo', t: 'Mínimo', cls: 'corto' }, { k: 'maximo', t: 'Máximo', cls: 'corto' }, { k: 'unidad', t: 'Unidad', cls: 'corto', ph: () => '°C' },
      { t: 'Tareas que la miden', ro: true, get: a => { const ts = C.t.Tareas.filter(t => t.activo_id === a.activo_id), pr = ts.filter(t => Core.rangoDe(t, a).origen === 'TAREA').length; return ts.length ? ts.length + (pr ? ' (' + pr + ' con rango propio)' : '') : '—'; } }, { k: 'activo', t: 'Activa', op: SINO }],
    tareas: [{ k: 'texto', t: 'Tarea', area: true, b: 'fija' }, { t: 'Sección', get: seccionDe, set: ponerSeccion, lista: 'secciones', cls: 'medio', b: 'tarea' },
      { k: 'tipo_respuesta', t: 'Respuesta', b: 'tarea', op: [['SI_NO', 'Sí / No'], ['BRM', 'Bueno / Regular / Malo'], ['NUMERO', 'Número'], ['TEXTO', 'Texto'], ['FOTO', 'Solo foto']] },
      { k: 'unidad', t: 'Unidad', cls: 'corto', b: 'tarea', off: t => !esNum(t), ph: t => Core.rangoDe(t, camDe(t)).unidad || '' },
      { k: 'foto', t: 'Foto', b: 'alerta', op: [['NO', 'No'], ['OPCIONAL', 'Opcional'], ['OBLIGATORIA', 'Obligatoria']] }, { k: 'fotos_max', t: 'Fotos máx.', cls: 'corto', ph: () => '1', b: 'alerta', off: t => t.foto === 'NO' && t.tipo_respuesta !== 'FOTO' },
      { k: 'critica', t: 'Crítica', op: SINO, b: 'alerta' },
      // Un solo campo "Alerta si queda en": en tareas Número enciende la alerta por rango (alerta_rango); en B/R/M y Sí/No, el estado que alerta (critico_estados).
      { t: 'Alerta si queda en', b: 'alerta', get: t => esNum(t) ? (t.alerta_rango || '') : (t.critico_estados || ''), set: (t, v) => { if (esNum(t)) t.alerta_rango = v; else t.critico_estados = v; },
        op: t => esNum(t) ? ALERTA_NUM : t.tipo_respuesta === 'SI_NO' ? ALERTA_SINO : t.tipo_respuesta === 'BRM' ? ALERTA_BRM : [['', '—']], aviso: t => Core.validarRango(t, camDe(t)).join('; ') },
      { k: 'activo_id', t: 'Cámara / equipo', b: 'alerta', op: t => ops(C.t.Activos.filter(a => a.sede_id === (plantilla() || {}).sede_id), 'activo_id', 'nombre', '—'),
        set: (t, v) => { t.activo_id = v; const a = camDe(t); if (a && (lleno(a.minimo) || lleno(a.maximo))) { t.minimo = ''; t.maximo = ''; } } }, // al elegir la cámara se toma su rango
      { t: 'Rango aceptado', b: 'alerta', html: rangoHtml },
      { k: 'frecuencia', t: 'Frecuencia', b: 'cuando', op: [['DIARIA', 'Diaria'], ['CADA_N_HORAS', 'Cada N horas'], ['SEMANAL', 'Semanal'], ['MENSUAL', 'Mensual']] },
      { k: 'cada_n_horas', t: 'Cada N h', cls: 'corto', b: 'cuando', off: t => t.frecuencia !== 'CADA_N_HORAS' }, { k: 'ventana_inicio', t: 'Desde', tipo: 'time', b: 'cuando', off: t => t.frecuencia !== 'CADA_N_HORAS' }, { k: 'ventana_fin', t: 'Hasta', tipo: 'time', b: 'cuando', off: t => t.frecuencia !== 'CADA_N_HORAS' },
      { k: 'dias_semana', t: 'Días (LMXJVSD)', cls: 'corto', b: 'cuando', off: t => t.frecuencia !== 'SEMANAL' }, { k: 'dia_mes', t: 'Día del mes', cls: 'corto', b: 'cuando', off: t => t.frecuencia !== 'MENSUAL' },
      { k: 'hora_objetivo', t: 'Hora objetivo', tipo: 'time', b: 'cuando', off: t => t.frecuencia === 'CADA_N_HORAS' }, { k: 'tolerancia_min', t: 'Tolerancia (min)', cls: 'corto', b: 'cuando' },
      { k: 'activa', t: 'Activa', op: SINO, b: 'estado' }],
    reglas: [{ k: 'tipo', t: 'Regla', ro: true }, { t: 'Qué hace', ro: true, get: r => (C.tipos[r.tipo] || [r.descripcion])[0] }, { k: 'activa', t: 'Activa', op: SINO }, { k: 'sede_id', t: 'Aplica a', op: () => sedesOp(true) },
      { k: 'parametro', t: 'Parámetro 1', cls: 'corto', nota: r => (C.tipos[r.tipo] || [])[1] }, { k: 'parametro2', t: 'Parámetro 2', cls: 'corto', nota: r => (C.tipos[r.tipo] || [])[2] },
      { k: 'canal', t: 'Canal', op: r => /^(C3|ENVIAR_PDF)$/.test(r.tipo) ? [['', 'Telegram']] : [['', 'Telegram'], ['CORREO', 'Correo'], ['AMBOS', 'Telegram y correo']] },
      { k: 'destinatarios', t: 'Destinatarios (correos)', cls: 'ancho', ph: r => /^(C3|ENVIAR_PDF)$/.test(r.tipo) ? 'el informe por correo va en Sedes' : 'vacío = los correos de la sede' }],
    parametros: [{ k: 'clave', t: 'Parámetro', ro: true }, { k: 'valor', t: 'Valor', cls: 'ancho' }, { k: 'descripcion', t: 'Para qué sirve', ro: true }],
    equipos: [{ k: 'nombre', t: 'Equipo', ro: true }, { t: 'Sede', ro: true, get: d => (C.t.Sedes.find(s => s.sede_id === d.sede_id) || {}).nombre || d.sede_id }, { t: 'Registrado', ro: true, get: d => String(d.registrado_en).slice(0, 10) },
      { t: 'Versión app', ro: true, get: d => d.app_version ? d.app_version + (C.app_min && Panel.cmpVer(d.app_version, C.app_min) < 0 ? ' ⚠ atrasada' : '') : 'anterior a 1.1' }, { t: 'Configuración', ro: true, get: d => !d.visto_en ? 'sin dato' : String(d.config_rev) === String(C.rev) ? 'al día' : '⚠ atrasada' },
      { t: 'Última conexión', ro: true, get: d => d.visto_en ? new Date(d.visto_en).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—' }, { k: 'activo', t: 'Autorizado', op: SINO }],
  };
  const FILAS = { sedes: () => C.t.Sedes, personas: () => C.t.Usuarios, camaras: () => C.t.Activos, tareas: () => C.t.Tareas.filter(t => t.plantilla_id === C.pl), reglas: () => C.t.Reglas, parametros: () => C.t.Parametros, equipos: () => C.t.Dispositivos };
  const plantilla = () => C.t.Plantillas.find(p => p.plantilla_id === C.pl);

  const avisoHtml = txt => txt ? '<div class="aviso-celda">⚠ ' + esc(txt) + '</div>' : '';
  /** Contenido de una celda (sin el <td>): sirve igual para la tabla y para el panel "Editar". */
  function control(g, c, k, f, i) {
    const v = c.get ? c.get(f) : (f[c.k] == null ? '' : f[c.k]), d = ' data-g="' + g + '" data-i="' + i + '" data-c="' + k + '"', extra = (c.nota && c.nota(f) ? '<div class="ayuda" style="margin:2px 0 0">' + esc(c.nota(f)) + '</div>' : '') + (c.aviso ? '<div class="aviso-slot" data-av="' + i + '">' + avisoHtml(c.aviso(f)) + '</div>' : '');
    if (c.html) return c.html(f, i);
    if (c.off && c.off(f)) return '<span class="nada">—</span>';
    if (c.ro) return esc(v);
    if (c.op) { const o = typeof c.op === 'function' ? c.op(f) : c.op; return '<select' + d + ' aria-label="' + esc(c.t) + '">' + (o.some(x => x[0] === String(v)) ? '' : '<option value="' + esc(v) + '">' + esc(v || '—') + '</option>') + o.map(x => '<option value="' + esc(x[0]) + '"' + (x[0] === String(v) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') + '</select>' + extra; }
    if (c.area) return '<textarea' + d + ' rows="2" aria-label="' + esc(c.t) + '">' + esc(v) + '</textarea>' + extra;
    return '<input' + d + ' type="' + (c.tipo || 'text') + '" class="' + (c.cls || '') + '" value="' + esc(v) + '"' + (c.ph ? ' placeholder="' + esc(c.ph(f)) + '"' : '') + (c.lista ? ' list="' + c.lista + '"' : '') + ' aria-label="' + esc(c.t) + '">' + extra;
  }
  /**
   * Tabla editable. Los encabezados quedan fijos al bajar y la primera columna (en tareas: orden + texto) queda fija al desplazarse de lado.
   * opc: { agregar, borrar, mover (tareas: orden, subir/bajar y Editar en la columna fija) }.
   */
  function grilla(g, opc) {
    opc = opc || {}; const filas = FILAS[g](), todas = COLS[g].map((c, k) => ({ c, k })), cols = todas.filter(x => !x.c.b || x.c.b === 'fija' || C.ver[x.c.b]);
    const cl = (x, n) => n === 0 ? (opc.mover ? ' class="f1"' : ' class="f0"') : '';
    let cab = '';
    if (opc.mover) { // fila superior con el nombre de cada bloque de columnas
      const nom = { tarea: 'Tarea · sección y tipo', alerta: 'Evidencia y alerta', cuando: 'Cuándo', estado: 'Estado' }, gr = [];
      cols.slice(1).forEach(x => { const u = gr[gr.length - 1]; if (u && u.b === x.c.b) u.n++; else gr.push({ b: x.c.b, n: 1 }); });
      if (opc.borrar && gr.length) gr[gr.length - 1].n++; else if (opc.borrar) gr.push({ b: 'estado', n: 1 });
      cab = '<tr class="grupos"><th class="f0" colspan="2">Tarea</th>' + gr.map(x => '<th colspan="' + x.n + '" class="g-' + x.b + '"><span class="gt">' + nom[x.b] + '</span></th>').join('') + '</tr>';
    }
    return '<div class="tabla-marco"><div class="tabla-wrap" data-tabla="' + g + '"><table class="ed' + (opc.mover ? ' con-orden' : '') + '"><thead>' + cab + '<tr class="cols">' + (opc.mover ? '<th class="f0">Orden</th>' : '') + cols.map((x, n) => '<th' + cl(x, n) + '>' + x.c.t + '</th>').join('') + (opc.borrar ? '<th></th>' : '') + '</tr></thead><tbody>' + filas.map((f, i) => '<tr' + (opc.mover && C.edit === f.tarea_id ? ' class="editando"' : '') + '>' +
      (opc.mover ? '<td class="f0"><div class="orden"><b>' + (i + 1) + '</b><button class="mini sec" data-mv="-1" data-g="' + g + '" data-i="' + i + '" title="Subir">▲</button><button class="mini sec" data-mv="1" data-g="' + g + '" data-i="' + i + '" title="Bajar">▼</button><button class="mini" data-edit="' + i + '" title="Editar todos los campos de esta tarea">Editar</button></div></td>' : '') +
      cols.map((x, n) => '<td' + cl(x, n) + '>' + control(g, x.c, x.k, f, i) + '</td>').join('') + (opc.borrar ? '<td><button class="mini rojo" data-del="' + g + '" data-i="' + i + '" title="Eliminar">✕</button></td>' : '') + '</tr>').join('') + '</tbody></table></div></div>' +
      (opc.agregar && !opc.mover ? '<p><button class="sec" data-add="' + g + '">+ ' + opc.agregar + '</button></p>' : '');
  }
  /** Panel lateral "Editar": todos los campos de una tarea en formulario vertical, por bloques. Lo que se cambia aquí queda en la tabla y se guarda con el mismo botón. */
  function panelTarea() {
    const filas = FILAS.tareas(), i = filas.findIndex(t => t.tarea_id === C.edit), t = filas[i]; if (!t) { C.edit = ''; return ''; }
    const de = b => COLS.tareas.map((c, k) => ({ c, k })).filter(x => x.c.b === b && !(x.c.off && x.c.off(t))).map(x => '<label class="' + (x.c.html || x.c.area ? 'todo' : '') + '"><span>' + x.c.t + '</span>' + control('tareas', x.c, x.k, t, i) + '</label>').join('');
    return '<aside class="panel-ed" role="dialog" aria-label="Editar tarea"><div class="panel-cab"><b>Tarea ' + (i + 1) + ' de ' + filas.length + '</b><span><button class="mini sec" data-edit="' + (i - 1) + '"' + (i ? '' : ' disabled') + ' title="Tarea anterior">◀</button> <button class="mini sec" data-edit="' + (i + 1) + '"' + (i < filas.length - 1 ? '' : ' disabled') + ' title="Tarea siguiente">▶</button> <button class="mini" data-cerrar="1">Listo</button></span></div>' +
      '<h3>Tarea</h3><div class="pf">' + de('fija') + de('tarea') + '</div><h3>Evidencia y alerta</h3><div class="pf">' + de('alerta') + '</div><h3>Cuándo</h3><div class="pf">' + de('cuando') + '</div><h3>Estado</h3><div class="pf">' + de('estado') + '</div>' +
      '<p class="ayuda">Los cambios quedan en la tabla. Para aplicarlos, usa <b>Guardar cambios</b>.</p></aside>';
  }

  const SECCIONES = [['sedes', 'Sedes'], ['personas', 'Personas y roles'], ['camaras', 'Cámaras y equipos'], ['checklists', 'Checklists y tareas'], ['reglas', 'Reglas y alertas'], ['telegram', 'Telegram'], ['equipos', 'Equipos'], ['parametros', 'Parámetros']];
  /** Lo que hay que conservar al repintar: desplazamiento de la tabla y del panel, y el campo que tiene el foco. */
  function selDe(a) {
    if (!a || !main.contains(a)) return ''; const d = a.dataset, q = a.closest('.panel-ed') ? '.panel-ed ' : a.closest('.tabla-wrap') ? '.tabla-wrap ' : '';
    return d.g ? q + '[data-g="' + d.g + '"][data-i="' + d.i + '"][data-c="' + d.c + '"]' : d.r ? q + '[data-r="' + d.r + '"][data-i="' + d.i + '"]' : d.pl ? '[data-pl="' + d.pl + '"]' : a.id ? '#' + a.id : '';
  }
  function vista() { const w = main.querySelector('.tabla-wrap'), p = main.querySelector('.panel-ed'); return { tabla: w ? w.dataset.tabla + '|' + C.pl : '', wl: w ? w.scrollLeft : 0, wt: w ? w.scrollTop : 0, pt: p ? p.scrollTop : 0, foco: selDe(document.activeElement) }; }
  function restaurar(v) {
    const w = main.querySelector('.tabla-wrap'), p = main.querySelector('.panel-ed');
    if (w && v.tabla === w.dataset.tabla + '|' + C.pl) { w.scrollLeft = v.wl; w.scrollTop = v.wt; } if (p) p.scrollTop = v.pt;
    const f = v.foco && main.querySelector(v.foco); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { } }
  }
  /** Altura de la barra fija (para que la tabla ocupe el resto de la pantalla) y sombras que avisan que hay más columnas a los lados. */
  function ajustar() {
    const b = main.querySelector('.barra-fija'), hb = b ? b.offsetHeight : 0;
    main.querySelectorAll('.tabla-wrap').forEach(w => {
      // Alto de la tabla: lo que queda entre la barra fija y el final de la página, para que al bajar del todo sus encabezados queden justo bajo la barra.
      const bajo = Math.max(0, document.documentElement.scrollHeight - (w.getBoundingClientRect().bottom + window.scrollY));
      w.style.maxHeight = Math.max(260, window.innerHeight - hb - bajo - 4) + 'px';
      const m = w.parentNode, ver = () => { m.classList.toggle('mas-izq', w.scrollLeft > 2); m.classList.toggle('mas-der', w.scrollLeft + w.clientWidth < w.scrollWidth - 2); m.classList.toggle('mas-arr', w.scrollTop > 2); };
      w.onscroll = ver; ver();
      const f0 = w.querySelector('tr.cols th.f0'), g = w.querySelector('tr.grupos'); // anchos reales: la 2.ª columna fija parte donde termina la 1.ª, y la 2.ª fila de encabezados bajo la 1.ª
      const f1 = w.querySelector('tr.cols th.f1'); if (f0 && f1) { w.style.setProperty('--w0', f0.offsetWidth + 'px'); w.style.setProperty('--wf', (f0.offsetWidth + f1.offsetWidth) + 'px'); } if (g) w.style.setProperty('--h0', g.offsetHeight + 'px');
    });
  }
  window.addEventListener('resize', () => { if (C.t) ajustar(); });
  function pintar() {
    const v = vista(), pls = C.t.Plantillas, nomSede = id => (C.t.Sedes.find(s => s.sede_id === id) || {}).nombre || id;
    if (C.sec === 'checklists' && (!C.pl || !plantilla())) C.pl = (pls[0] || {}).plantilla_id || '';
    let h = '<div class="barra-fija"><div class="tabs">' + SECCIONES.map(s => '<button data-sec="' + s[0] + '" class="' + (C.sec === s[0] ? 'on' : '') + '">' + s[1] + '</button>').join('') + '</div>' +
      (C.sec === 'telegram' ? '' : '<div class="barra-acc">' + (C.sec === 'checklists' && pls.length ? '<label class="sel-pl">Checklist <select id="selPl">' + pls.map(x => '<option value="' + esc(x.plantilla_id) + '"' + (x.plantilla_id === C.pl ? ' selected' : '') + '>' + esc(nomSede(x.sede_id) + ' · ' + x.nombre + ' (' + x.turno + ')') + '</option>').join('') + '</select></label>' : '') +
        '<span class="estado-g' + (C.sucio ? ' pend' : '') + '" title="Los celulares toman los cambios la próxima vez que tengan señal.">' + (C.sucio ? 'Hay cambios sin guardar.' : 'Sin cambios pendientes.') + '</span><button id="guardar"' + (C.sucio ? '' : ' disabled') + '>Guardar cambios</button></div>') + '</div>';
    if (C.aviso) h += avisoMigracion();
    if (C.msg) h += '<div class="aviso ' + C.msg[0] + '">' + esc(C.msg[1]) + '</div>';
    h += '<div class="caja cfg">';
    if (C.sec === 'sedes') h += '<p class="ayuda">Cada sede tiene su grupo de Telegram, su centro de costo y su <b>clave de equipos</b> (la que se escribe una sola vez en cada celular). En <b>Correos del informe PDF</b> escribe, separados por coma, quiénes reciben el informe de cada checklist al cerrarse (también cuando nadie lo cierra); vacío = no se envía correo. Para agregar una sede: créala aquí, agrega sus personas y cámaras, y en “Checklists y tareas” duplica una plantilla hacia la sede nueva.</p>' + grilla('sedes', { agregar: 'Agregar sede', borrar: true });
    if (C.sec === 'personas') h += '<p class="ayuda">En el celular cada persona entra con su nombre y su PIN. El email solo se necesita para quienes entran al dashboard o a esta configuración (jefes, operaciones, administradores). El PIN no se muestra: escribe uno nuevo para cambiarlo.</p>' + grilla('personas', { agregar: 'Agregar persona', borrar: true });
    if (C.sec === 'camaras') h += '<p class="ayuda"><b>Rango por defecto</b> de cada cámara o equipo. Lo usan todas las tareas que miden esa cámara, en cualquier checklist, salvo las que tengan un rango propio: cambiarlo aquí lo cambia en todas. Ej.: refrigerado 0 a 4 °C; congelado −25 a −18 °C. Para que una lectura fuera de rango <b>alerte</b>, la tarea debe tener “Alerta si queda en: Fuera de rango” (en Checklists y tareas).</p>' + grilla('camaras', { agregar: 'Agregar cámara o equipo', borrar: true });
    if (C.sec === 'checklists') h += vChecklists();
    if (C.sec === 'reglas') h += '<p class="ayuda">Activa o desactiva cada regla y ajusta sus parámetros. Las tareas no críticas nunca generan alertas propias: solo aparecen en el informe de cierre.</p>' +
      '<p class="ayuda"><b>Canal:</b> cada alerta puede ir por Telegram, por correo o por ambos. Por Telegram llega al grupo de la sede (lo escalado, a su chat de escalamiento). Por correo llega a los destinatarios de la regla; si los dejas vacíos, a los correos de la sede. Los botones <i>Me hago cargo / Ya resuelto / Escalar</i> solo existen en Telegram. El <b>informe PDF por correo</b> no se configura aquí: sale en cada cierre a los "Correos del informe PDF" de la sede.</p>' + grilla('reglas', { borrar: true }) +
      '<p><select id="tipoRegla">' + Object.keys(C.tipos).map(t => '<option>' + t + '</option>').join('') + '</select> <button class="sec" data-add="reglas">+ Agregar regla para una sede específica</button></p>';
    if (C.sec === 'telegram') h += vTelegram();
    if (C.sec === 'equipos') h += '<p class="ayuda">Celulares registrados con la clave de equipos. Si un celular se pierde, márcalo como no autorizado.</p>' +
      '<p class="ayuda">Cada celular baja los cambios de configuración y la versión nueva de la app cuando se abre con señal (y cada 2 minutos mientras está abierto). Aquí se ve qué tiene cada uno. <b>La actualización es automática</b>: cuando se publica una versión nueva de la app, el sistema la detecta en su siguiente ciclo (5 minutos) y la exige a todos los celulares, sin que nadie tenga que hacer nada. Se apaga con el parámetro AUTO_ACTUALIZAR = NO. El botón sirve para exigirla en el momento.</p>' +
      '<p><button class="sec" id="forzar">Forzar actualización en los equipos</button> <button class="sec" id="verEquipos">Volver a consultar</button> <span class="ayuda">Versión mínima exigida: <b>' + esc(C.app_min || 'ninguna') + '</b> · configuración actual: <b>' + esc(C.rev || '—') + '</b></span></p>' + grilla('equipos') +
      '<h3>Autoprueba del sistema</h3><p class="ayuda">Prueba el sistema real de punta a punta, sin celulares: álbum de fotos por Telegram, correo con varios adjuntos, PDF con varias fotos, corrección de respuestas con informe actualizado, plazo incumplido y checklist no iniciado. Los mensajes llegan al grupo de Telegram de la primera sede, marcados como <b>PRUEBA</b>; los correos, solo a ti. Tarda cerca de 2 minutos y al terminar borra lo que creó.</p><p><button class="sec" id="autoprueba">Ejecutar autoprueba</button></p><div id="apRes"></div>';
    if (C.sec === 'parametros') h += grilla('parametros');
    h += '</div>' + (C.sec === 'checklists' ? panelTarea() : '');
    main.innerHTML = h; main.classList.toggle('con-panel', !!main.querySelector('.panel-ed')); ajustar(); restaurar(v);
  }
  function avisoMigracion() {
    const a = C.aviso, n = (x, uno, varios) => x + ' ' + (x === 1 ? uno : varios);
    return '<div class="aviso ok"><b>El rango ahora se configura en la misma tarea.</b> La pestaña Umbrales dejó de usarse (quedó en la hoja como respaldo). Se pasaron ' + n(a.camaras, 'rango a su cámara', 'rangos a sus cámaras') + ' y ' + n(a.tareas_rango, 'rango propio a su tarea', 'rangos propios a sus tareas') +
      '. Quedaron con la alerta encendida, igual que antes: ' + n(a.temperatura, 'tarea', 'tareas') + ' como “Fuera de rango de T°” y ' + a.otra + ' como “otra medición”.' +
      (a.sin_camara && a.sin_camara.length ? '<br>Quedaron como “otra medición” por no tener cámara: ' + a.sin_camara.map(esc).join('; ') + '.' : '') +
      (a.sin_rango && a.sin_rango.length ? '<br><b>Ojo:</b> estas tareas tienen cámara pero no rango, así que ya no avisan “lectura faltante”: ' + a.sin_rango.map(esc).join('; ') + '. Si deben avisar, dale rango a su cámara y elige la alerta en la tarea.' : '') +
      ' <button class="mini sec" id="avisoVisto">Entendido</button></div>';
  }
  // Plazo fijo: a la hora "inicio del turno + minutos" el checklist debe estar completo; si no, sale el aviso de incumplimiento.
  const aMin = h => { const m = /^(\d{1,2}):(\d\d)$/.exec(String(h || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const aHora = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((m % 1440) + 1440) % 1440 % 60).padStart(2, '0');
  function plazoDe(p) {
    const n = Number(String(p.plazo_min || '').replace(',', '.')); if (!n || n <= 0) return null;
    const env = aMin(p.hora_envio), ini = aMin(p.hora_inicio_turno) ?? env; let cie = aMin(p.hora_cierre); if (env == null || cie == null || ini == null) return null;
    if (cie <= env) cie += 1440; const lim = cie + (Number(p.tolerancia_cierre_min === '' || p.tolerancia_cierre_min == null ? 15 : p.tolerancia_cierre_min) || 0);
    return { plazo: ini + n, envio: env, limite: lim };
  }
  function textoPlazo(p) {
    const x = plazoDe(p);
    if (!x) return '<b>Plazo fijo</b> (opcional): si indicas los minutos, el checklist debe estar <b>completo</b> a esa hora contada desde el inicio del turno (vacío = la hora de envío). Al completarse se cierra solo y sale el informe; si a esa hora falta algo, sale el aviso de incumplimiento. Sin minutos, el checklist funciona como siempre.';
    if (x.plazo <= x.envio) return '<span style="color:#c0392b"><b>Plazo fijo mal definido:</b> vence a las ' + aHora(x.plazo) + ', antes de que el checklist quede disponible.</span>';
    if (x.plazo > x.limite) return '<span style="color:#c0392b"><b>Plazo fijo mal definido:</b> vence a las ' + aHora(x.plazo) + ', después del cierre del checklist (' + aHora(x.limite) + ').</span>';
    return '<b>Plazo fijo:</b> debe estar completo a las <b>' + aHora(x.plazo) + '</b>. Si falta algo a esa hora sale el aviso de incumplimiento' + (x.limite > x.plazo ? '; se puede completar fuera de plazo hasta las ' + aHora(x.limite) + '.' : ' y el checklist se cierra.') + ' El recordatorio de "no iniciado" solo sale si cae al menos 10 minutos antes.';
  }
  function vChecklists() {
    const p = plantilla();
    let h = '<div class="filtros"><button class="sec" id="nuevaPl">+ Nuevo checklist</button>' + (p ? '<select id="sedeDup" aria-label="Sede de destino">' + sedesOp().map(o => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('') + '</select><button class="sec" id="dupPl">Duplicar hacia esa sede</button><button class="rojo" id="delPl">Eliminar checklist</button>' : '') + '</div>';
    if (!p) return h + '<p class="ayuda">Aún no hay checklists.</p>';
    const campo = (k, t, tipo, o) => '<label>' + t + (o ? '<select data-pl="' + k + '">' + o.map(x => '<option value="' + esc(x[0]) + '"' + (x[0] === String(p[k]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') + '</select>' : '<input data-pl="' + k + '" type="' + (tipo || 'text') + '" value="' + esc(p[k]) + '">') + '</label>';
    h += '<details class="datos-pl"' + (C.plegado ? '' : ' open') + '><summary>Datos del checklist · versión ' + esc(p.version || 1) + ' · ' + FILAS.tareas().length + ' tareas</summary><div class="form">' + campo('nombre', 'Nombre') + campo('sede_id', 'Sede', '', sedesOp()) + campo('turno', 'Turno', '', [['AM', 'AM'], ['PM', 'PM'], ['NOCHE', 'Noche']]) + campo('rol_id', 'Quién lo responde', '', ops(C.t.Roles, 'rol_id', 'nombre', 'Cualquiera de la sede')) +
      campo('hora_envio', 'Hora en que se envía el link', 'time') + campo('hora_cierre', 'Hora de cierre', 'time') + campo('tolerancia_cierre_min', 'Margen después del cierre (min)') + campo('dias', 'Días (LMXJVSD)') + campo('activa', 'Activo', '', SINO) +
      campo('hora_inicio_turno', 'Plazo fijo: inicio del turno', 'time') + campo('plazo_min', 'Plazo fijo: minutos para completarlo') + '</div>' +
      '<p class="ayuda">' + textoPlazo(p) + '</p>' +
      '<p class="ayuda">Al guardar un cambio sube la versión; lo ya respondido no se altera. <b>Fotos máx.</b>: cuántas fotos admite la tarea (1 a 10; vacío = 1). <b>Hora objetivo</b> vacía = la tarea vence al cierre del checklist. <b>Cada N horas</b>: indica N y el rango Desde–Hasta. <b>Semanal</b>: días (ej. L o LXV). <b>Mensual</b>: día del mes.</p>' +
      '<p class="ayuda"><b>Alerta si queda en</b>: en tareas <b>Número</b> elige “Fuera de rango de T°” (temperatura de una cámara) o “Fuera de rango (otra medición)”; con eso la tarea alerta al salir de rango, pide relectura, escala y avisa si falta la lectura. El rango viene de la cámara y se puede cambiar solo para esa tarea. “Sin alerta” = el número se registra y se marca en rojo si está fuera de rango, pero no avisa.</p></details>' +
      '<div class="ver-cols"><button class="sec" data-add="tareas">+ Agregar tarea</button><span>Columnas visibles:</span>' + BLOQUES.map(b => '<label><input type="checkbox" data-ver="' + b[0] + '"' + (C.ver[b[0]] ? ' checked' : '') + '> ' + b[1] + '</label>').join('') + '<span class="ayuda" style="margin:0">El botón <b>Editar</b> de cada fila abre todos sus campos.</span></div>' +
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
    const ac = new Set(C.t.Activos.map(a => a.activo_id)); C.t.Tareas.forEach(t => { if (t.activo_id && !ac.has(t.activo_id)) t.activo_id = ''; if (!esNum(t)) { t.alerta_rango = ''; t.minimo = ''; t.maximo = ''; } });
  }
  function validar() {
    const claves = C.t.Sedes.map(s => String(s.clave_equipos).trim().toLowerCase()).filter(x => x);
    if (new Set(claves).size !== claves.length) return 'Dos sedes tienen la misma clave de equipos.';
    if (C.t.Sedes.some(s => !String(s.nombre).trim())) return 'Hay una sede sin nombre.';
    const malos = t => String(t || '').split(/[\s,;]+/).filter(x => x && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    for (const s of C.t.Sedes) { const m = malos(s.emails_reporte).concat(malos(s.emails_escalamiento)); if (m.length) return 'Correo mal escrito en la sede ' + s.nombre + ': ' + m[0]; }
    for (const r of C.t.Reglas) { const m = malos(r.destinatarios); if (m.length) return 'Correo mal escrito en la regla ' + r.tipo + ': ' + m[0]; }
    for (const r of C.t.Reglas) if (/CORREO|AMBOS/.test(r.canal || '') && !String(r.destinatarios || '').trim() && !C.t.Sedes.some(s => String(s.emails_reporte || '').trim())) return 'La regla ' + r.tipo + ' va por correo, pero no tiene destinatarios ni hay correos en ninguna sede.';
    for (const t of C.t.Tareas) { const v = String(t.fotos_max == null ? '' : t.fotos_max).trim(); if (v !== '' && !/^([1-9]|10)$/.test(v)) return 'En "' + t.texto + '", Fotos máx. debe ser un número de 1 a 10 (o vacío).'; }
    for (const a of C.t.Activos) { const mi = Core.num(a.minimo, null), ma = Core.num(a.maximo, null); if (mi !== null && ma !== null && mi >= ma) return 'En la cámara "' + a.nombre + '", el mínimo debe ser menor que el máximo.'; }
    for (const t of C.t.Tareas) { const e = Core.validarRango(t, camDe(t)); if (e.length) return 'Tarea "' + t.texto + '" (' + ((C.t.Plantillas.find(p => p.plantilla_id === t.plantilla_id) || {}).nombre || '') + '): ' + e.join('; ') + '.'; }
    for (const p of C.t.Plantillas) { const x = plazoDe(p); if (x && (x.plazo <= x.envio || x.plazo > x.limite)) return 'El plazo fijo de "' + p.nombre + '" queda fuera del horario del checklist (vence a las ' + aHora(x.plazo) + ').'; }
    const malPin = C.t.Usuarios.find(u => u.pin_nuevo && !/^\d{4}$/.test(u.pin_nuevo)); if (malPin) return 'El PIN de ' + malPin.nombre + ' debe tener exactamente 4 dígitos.';
    const sinSede = C.t.Usuarios.find(u => !usSede(u).sede_id); if (sinSede) return 'Falta la sede de ' + (sinSede.nombre || 'una persona') + '.';
    const malaHora = C.t.Plantillas.find(p => !Core.normHora(p.hora_envio) || !Core.normHora(p.hora_cierre)); if (malaHora) return 'El checklist "' + malaHora.nombre + '" necesita hora de envío y de cierre.';
    return '';
  }
  async function guardar() {
    normalizar(); const err = validar(); if (err) { C.msg = ['mal', err]; return pintar(); }
    const b = document.querySelector('#guardar'); b.disabled = true; b.textContent = 'Guardando…';
    const t = {}; ['Sedes', 'Usuarios', 'UsuarioSede', 'Activos', 'Plantillas', 'Secciones', 'Tareas', 'Reglas', 'Parametros', 'Dispositivos'].forEach(n => t[n] = C.t[n]);
    try { const r = await api({ action: 'admin_guardar', tablas: t }); if (!r.ok) throw new Error(r.error); recibir(r); C.msg = ['ok', 'Cambios guardados.']; }
    catch (e) { C.msg = ['mal', 'No se guardó: ' + e.message]; }
    pintar();
  }
  function recibir(r) { C.rev = r.rev; C.app_min = r.app_min; C.t = r.tablas; C.tipos = r.tipos_regla; C.tg = Object.assign(C.tg, r.telegram); C.sucio = false; C.aviso = r.aviso_migracion || null; }

  /* ---------- eventos ---------- */
  const NUEVO = {
    sedes: () => ({ sede_id: nuevoId('S'), nombre: '', tipo: 'local', centro_costo: '', telegram_chat_id: '', telegram_chat_escalamiento: '', zona_horaria: 'America/Santiago', clave_equipos: 'sede-' + Math.random().toString(36).slice(2, 8), activa: 'SI', emails_reporte: '', emails_escalamiento: '' }),
    personas: () => ({ usuario_id: nuevoId('U'), nombre: '', email: '', telefono: '', telegram_user_id: '', pin_nuevo: '', activo: 'SI', tiene_pin: 'NO' }),
    camaras: () => ({ activo_id: nuevoId('ACT'), sede_id: (C.t.Sedes[0] || {}).sede_id || '', nombre: '', tipo: 'camara_refrigerada', codigo_qr: '', activo: 'SI', minimo: '', maximo: '', unidad: '°C' }),
    tareas: () => { const ult = FILAS.tareas().slice(-1)[0] || {}; return { tarea_id: nuevoId('T'), plantilla_id: C.pl, seccion_id: ult.seccion_id || '', orden: 999, texto: '', tipo_respuesta: 'SI_NO', unidad: '', foto: 'NO', critica: 'NO', critico_estados: '', frecuencia: 'DIARIA', cada_n_horas: '', ventana_inicio: '', ventana_fin: '', dias_semana: '', dia_mes: '', hora_objetivo: '', tolerancia_min: 15, activo_id: '', activa: 'SI', fotos_max: '', alerta_rango: '', minimo: '', maximo: '' }; },
    reglas: () => ({ regla_id: nuevoId('R'), tipo: document.querySelector('#tipoRegla').value, sede_id: (C.t.Sedes[0] || {}).sede_id || '*', parametro: '', parametro2: '', activa: 'SI', descripcion: '', canal: '', destinatarios: '' }),
  };
  const TABLA = { sedes: 'Sedes', personas: 'Usuarios', camaras: 'Activos', tareas: 'Tareas', reglas: 'Reglas' };
  const marcar = () => { C.sucio = true; C.msg = null; const b = main.querySelector('#guardar'), s = main.querySelector('.estado-g'); if (b) b.disabled = false; if (s) { s.textContent = 'Hay cambios sin guardar.'; s.classList.add('pend'); } };
  /** Rango y aviso de una tarea, en la tabla y en el panel, sin repintar lo demás (así no se pierde un clic en Guardar ni el foco al pasar de mínimo a máximo). */
  function refrescarTarea(i) {
    const t = FILAS.tareas()[i], foco = selDe(document.activeElement); if (!t) return;
    main.querySelectorAll('[data-r="minimo"][data-i="' + i + '"]').forEach(x => { x.closest('.rango').outerHTML = rangoHtml(t, i); });
    main.querySelectorAll('.aviso-slot[data-av="' + i + '"]').forEach(x => { x.innerHTML = avisoHtml(Core.validarRango(t, camDe(t)).join('; ')); });
    const f = foco && main.querySelector(foco); if (f && f !== document.activeElement) { try { f.focus({ preventScroll: true }); if (f.select) f.select(); } catch (e) { } }
  }
  main.addEventListener('change', e => {
    const d = e.target.dataset;
    if (d.g) {
      const c = COLS[d.g][d.c], f = FILAS[d.g]()[d.i]; c.set ? c.set(f, e.target.value) : f[c.k] = e.target.value; marcar();
      if (c.op || c.lista) pintar();
      else main.querySelectorAll('[data-g="' + d.g + '"][data-i="' + d.i + '"][data-c="' + d.c + '"]').forEach(x => { if (x !== e.target) x.value = e.target.value; }); // tabla y panel muestran lo mismo
    }
    else if (d.r) { // rango de la tarea: si queda igual al de su cámara, se usa el de la cámara
      const t = FILAS.tareas()[d.i], cam = camDe(t), r = Core.rangoDe(t, cam), nv = { minimo: r.minimo, maximo: r.maximo }, n = x => Core.num(x, null);
      nv[d.r] = e.target.value.trim().replace(',', '.');
      if (cam && n(nv.minimo) === n(cam.minimo) && n(nv.maximo) === n(cam.maximo)) { t.minimo = ''; t.maximo = ''; } else { t.minimo = nv.minimo; t.maximo = nv.maximo; }
      marcar(); const i = d.i; setTimeout(() => refrescarTarea(i), 0);
    }
    else if (d.ver) { C.ver[d.ver] = e.target.checked; mem.set('cfg_columnas', C.ver); pintar(); }
    else if (d.pl) { plantilla()[d.pl] = e.target.value; C.sucio = true; pintar(); }
    else if (e.target.id === 'selPl') { C.pl = e.target.value; C.edit = ''; pintar(); }
  });
  main.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('datos-pl')) { C.plegado = !e.target.open; mem.set('cfg_plegado', C.plegado); ajustar(); } }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && C.edit) { C.edit = ''; pintar(); } });
  main.addEventListener('click', async e => {
    const t = e.target, d = t.dataset;
    if (d.sec) { C.sec = d.sec; C.msg = null; C.edit = ''; return pintar(); }
    if (d.edit !== undefined) { const f = FILAS.tareas()[d.edit]; if (f) { C.edit = f.tarea_id; pintar(); const p = main.querySelector('.panel-ed'), w = main.querySelector('.tabla-wrap'), tr = main.querySelector('tr.editando'), th = main.querySelector('.tabla-wrap thead'); if (p) p.scrollTop = 0;
      if (w && tr && th) { const r = tr.getBoundingClientRect(), rw = w.getBoundingClientRect(), arriba = Math.max(rw.top, 0) + th.offsetHeight, abajo = Math.min(rw.bottom, window.innerHeight); if (r.top < arriba || r.bottom > abajo) tr.scrollIntoView({ block: 'center' }); } } return; } // la fila que se edita queda a la vista
    if (d.cerrar) { C.edit = ''; return pintar(); }
    if (d.rcam !== undefined) { const f = FILAS.tareas()[d.rcam]; f.minimo = ''; f.maximo = ''; marcar(); return pintar(); }
    if (t.id === 'avisoVisto') { C.aviso = null; pintar(); try { await api({ action: 'admin_aviso_visto' }); } catch (e) { } return; }
    if (d.add) { const nf = NUEVO[d.add](); C.t[TABLA[d.add]].push(nf); C.sucio = true; if (d.add === 'tareas') C.edit = nf.tarea_id; return pintar(); }
    if (d.del) {
      const f = FILAS[d.del]()[d.i]; if (!confirm('¿Eliminar "' + (f.nombre || f.texto || f.tipo) + '"? Se aplica al guardar.')) return;
      const arr = C.t[TABLA[d.del]]; arr.splice(arr.indexOf(f), 1); C.sucio = true; return pintar();
    }
    if (d.mv) { const fs = FILAS[d.g](), a = fs[d.i], b = fs[Number(d.i) + Number(d.mv)]; if (!b) return; const T = C.t.Tareas, ia = T.indexOf(a), ib = T.indexOf(b); T[ia] = b; T[ib] = a; C.sucio = true; return pintar(); }
    if (t.id === 'guardar') return guardar();
    if (t.id === 'forzar' || t.id === 'verEquipos') {
      if (C.sucio) { C.msg = ['mal', 'Primero guarda los cambios pendientes.']; return pintar(); }
      try {
        let r;
        if (t.id === 'forzar') {
          const v = ((await (await fetch('version.js?nocache=' + Date.now(), { cache: 'no-store' })).text()).match(/APP_VERSION\s*=\s*'([\d.]+)'/) || [])[1];
          if (!v) throw new Error('no se pudo leer la versión publicada');
          if (!confirm('Los celulares con una versión de la app anterior a la ' + v + ' tendrán que actualizarse antes de seguir. ¿Continuar?')) return;
          r = await api({ action: 'admin_forzar', app: v }); if (!r.ok) throw new Error(r.error);
          C.msg = ['ok', 'Listo. Versión mínima exigida: ' + v + '. Cada celular se actualiza al abrirse con señal, o en un par de minutos si ya está abierto.'];
        } else { r = await api({ action: 'admin_get' }); if (!r.ok) throw new Error(r.error); C.msg = null; }
        recibir(r);
      } catch (e) { C.msg = ['mal', 'No se pudo: ' + e.message]; }
      return pintar();
    }
    if (t.id === 'autoprueba') {
      if (C.sucio) { C.msg = ['mal', 'Primero guarda los cambios pendientes.']; return pintar(); }
      if (!confirm('Se enviarán mensajes de PRUEBA al grupo de Telegram y correos a tu dirección. ¿Continuar?')) return;
      const caja = document.querySelector('#apRes'), lin = []; t.disabled = true;
      const ver = (cls, txt) => { lin.push('<div class="aviso ' + cls + '">' + txt + '</div>'); caja.innerHTML = lin.join(''); };
      const envios = r => (r.envios || []).map(x => esc(x.canal) + ' · ' + esc(x.que) + ' · ' + esc(x.adjunto) + ' → <b>' + esc(x.resultado) + '</b>').join('<br>');
      const estado = r => ((r.estado || {}).checklists || []).map(x => esc(x.checklist) + ': ' + esc(x.estado) + (x.plazo ? ' · ' + esc(x.plazo) : '') + ' · informe ' + esc(x.informe || '') + ' · PDF ' + esc(x.pdf || 'NO') + ' · ' + esc(x.correo || 'sin correo')).join('<br>');
      let mal = false;
      try {
        for (const paso of ['preparar', 'respuestas', 'correccion', 'reloj']) {
          ver('', 'Paso: ' + paso + '…'); const r = await api({ action: 'admin_autoprueba', paso }); lin.pop();
          if (!r.ok) throw new Error(paso + ': ' + r.error);
          const err = /ERROR|SIN_/.test(JSON.stringify([r.envios, r.estado])); mal = mal || err;
          ver(err ? 'mal' : 'ok', '<b>' + paso + '</b>' + (paso === 'preparar' ? ' · grupo de ' + esc(r.sede) + ' · correo ' + esc(r.correo) : '<br>' + envios(r) + '<br>' + estado(r)));
        }
      } catch (e) { mal = true; ver('mal', 'Falló: ' + esc(e.message)); }
      try { await api({ action: 'admin_autoprueba', paso: 'limpiar' }); ver(mal ? 'mal' : 'ok', mal ? 'Terminó con errores. Lo creado por la prueba se borró.' : 'Autoprueba correcta. Lo creado por la prueba se borró.'); } catch (e) { ver('mal', 'No se pudo limpiar: ' + esc(e.message)); }
      t.disabled = false; return;
    }
    if (t.id === 'nuevaPl') { C.edit = ''; const p = { plantilla_id: nuevoId('P'), nombre: 'Nuevo checklist', sede_id: (C.t.Sedes[0] || {}).sede_id || '', turno: 'AM', rol_id: '', version: 1, dias: 'LMXJVS', hora_envio: '08:00', hora_cierre: '10:00', tolerancia_cierre_min: 15, activa: 'SI', hora_inicio_turno: '', plazo_min: '' }; C.t.Plantillas.push(p); C.pl = p.plantilla_id; C.sucio = true; return pintar(); }
    if (t.id === 'dupPl') { C.edit = '';
      const p = plantilla(), sede = document.querySelector('#sedeDup').value, np = Object.assign({}, p, { plantilla_id: nuevoId('P'), sede_id: sede, version: 1, nombre: p.nombre + (sede === p.sede_id ? ' (copia)' : '') }), mapa = {};
      C.t.Secciones.filter(s => s.plantilla_id === p.plantilla_id).forEach(s => { mapa[s.seccion_id] = nuevoId('SEC'); C.t.Secciones.push(Object.assign({}, s, { seccion_id: mapa[s.seccion_id], plantilla_id: np.plantilla_id })); });
      C.t.Tareas.filter(x => x.plantilla_id === p.plantilla_id).forEach(x => C.t.Tareas.push(Object.assign({}, x, { tarea_id: nuevoId('T'), plantilla_id: np.plantilla_id, seccion_id: mapa[x.seccion_id] || '', activo_id: sede === p.sede_id ? x.activo_id : '' })));
      C.t.Plantillas.push(np); C.pl = np.plantilla_id; C.sucio = true; C.msg = ['ok', 'Checklist duplicado' + (sede === p.sede_id ? '' : '. Las tareas de temperatura quedaron marcadas con ⚠: hay que elegirles la cámara de la sede nueva (o dejarlas “Sin alerta”) antes de guardar') + '. Falta guardar.']; return pintar();
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

/* Dashboard de cumplimiento: por sede, checklist, tarea, persona y turno; quién respondió; histórico; lecturas por cámara; estado de alertas. */
(function () {
  const { api, esc } = Panel, main = document.querySelector('main');
  const D = { datos: null, sede: '', tab: 'sede', desde: '', hasta: '' };
  const pct = v => v === '' || v == null ? '—' : String(v).replace('.', ',') + '%';
  const hora = (iso, conFecha) => { if (!iso) return ''; const l = Core.local(new Date(iso), 'America/Santiago'); return (conFecha ? l.fecha.slice(8) + '-' + l.fecha.slice(5, 7) + ' ' : '') + l.hhmm; };
  const fechaCorta = f => f.slice(8) + '-' + f.slice(5, 7);
  const barra = v => v === '' ? '' : '<span class="barra-pct"><i style="width:' + Math.min(100, v) + '%"></i></span>';
  // Resultado del plazo fijo (inicio del turno + minutos): cumplido, fuera de plazo o incumplido.
  const chipPlazo = e => !e.plazo ? '' : ({ CUMPLIDO: '<span class="chip c-ok">Cumplido ' + hora(e.completada_en) + '</span>', FUERA_DE_PLAZO: '<span class="chip c-med">Fuera de plazo ' + hora(e.completada_en) + '</span>',
    INCUMPLIDO: '<span class="chip c-mal">Incumplido</span>' }[e.resultado_plazo] || '<span class="chip c-gris">Límite ' + hora(e.plazo) + '</span>');
  const chipEstado = e => '<span class="chip ' + ({ HECHA: 'c-ok', HECHA_ATRASO: 'c-med', NO_HECHA: 'c-mal', PENDIENTE: 'c-gris', NO_APLICA: 'c-gris', ABIERTA: 'c-mal', RECONOCIDA: 'c-med', RESUELTA: 'c-ok', CERRADA: 'c-ok', EN_CURSO: 'c-med' }[e] || 'c-gris') + '">' +
    ({ HECHA: 'A tiempo', HECHA_ATRASO: 'Con atraso', NO_HECHA: 'No hecha', PENDIENTE: 'Pendiente', NO_APLICA: 'No aplica', ABIERTA: 'Abierta', RECONOCIDA: 'Reconocida', RESUELTA: 'Resuelta', CERRADA: 'Cerrado', EN_CURSO: 'En curso' }[e] || esc(e)) + '</span>';
  const valor = i => i.estado === 'NO_APLICA' ? 'No aplica' : ({ B: 'Bueno', R: 'Regular', M: 'Malo', SI: 'Sí', NO: 'No', FOTO: 'Foto' }[i.valor] || (i.valor === '' ? '' : esc(i.valor) + (i.tipo_respuesta === 'NUMERO' && i.unidad ? ' ' + esc(i.unidad) : '')));

  const NOM_ALERTA = { T1: 'Fuera de rango', T3: 'Lectura faltante', C1: 'Crítica vencida', C2: 'No iniciado', C4: 'Cumplimiento bajo', PLAZO: 'Plazo', ITEM_CRITICO_ESTADO: 'Tarea crítica', NO_REALIZADO: 'No realizado', SYNC_TARDIO: 'Envío tardío' };
  async function cargar() {
    main.innerHTML = '<p class="ayuda">Cargando…</p>';
    const r = await api({ action: 'dashboard', desde: D.desde, hasta: D.hasta });
    if (!r.ok) { main.innerHTML = '<div class="aviso mal">' + esc(r.error) + '</div>'; return; }
    D.datos = r; D.desde = r.desde; D.hasta = r.hasta; pintar();
  }
  function rango(dias) { const hoy = Core.local(new Date(), 'America/Santiago').fecha; D.hasta = hoy; D.desde = Core.sumarDias(hoy, -(dias - 1)); cargar(); }

  function tabla(titulos, filas, clases) {
    return '<table><thead><tr>' + titulos.map((t, k) => '<th class="' + ((clases || [])[k] || '') + '">' + t + '</th>').join('') + '</tr></thead><tbody>' +
      (filas.length ? filas.join('') : '<tr><td colspan="' + titulos.length + '" class="ayuda">Sin datos en el período</td></tr>') + '</tbody></table>';
  }
  function tablaGrupo(nombre, grupos) {
    grupos.sort((a, b) => (a.pct_cumplimiento === '' ? 999 : a.pct_cumplimiento) - (b.pct_cumplimiento === '' ? 999 : b.pct_cumplimiento));
    return tabla([nombre, 'Programadas', 'Hechas', 'Cumplimiento', 'A tiempo', 'Con atraso', 'No hechas', 'En buen estado'], grupos.map(g =>
      '<tr><td>' + esc(g.clave) + '</td><td class="n">' + g.total + '</td><td class="n">' + g.hechas + '</td><td class="n">' + barra(g.pct_cumplimiento) + '<b>' + pct(g.pct_cumplimiento) + '</b></td><td class="n">' + pct(g.pct_a_tiempo) +
      '</td><td class="n">' + g.atrasadas + '</td><td class="n">' + (g.no_hechas + g.pendientes) + '</td><td class="n">' + pct(g.pct_calidad) + '</td></tr>'), ['', 'n', 'n', 'n', 'n', 'n', 'n', 'n']);
  }
  function grafico(inst) { // cumplimiento por día (barras)
    const dias = Core.agrupar(inst, i => i.fecha).sort((a, b) => a.clave < b.clave ? -1 : 1); if (dias.length < 2) return '';
    const W = 900, H = 170, m = { l: 34, b: 22, t: 8 }, an = (W - m.l) / dias.length, alto = H - m.b - m.t;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cumplimiento por día" style="width:100%;height:auto">';
    [0, 50, 100].forEach(v => { const y = m.t + alto * (1 - v / 100); s += '<line x1="' + m.l + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#e3e9ed"/><text x="' + (m.l - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + v + '%</text>'; });
    dias.forEach((d, k) => {
      const v = d.pct_cumplimiento === '' ? 0 : d.pct_cumplimiento, h = alto * v / 100, x = m.l + k * an + an * 0.15;
      s += '<rect x="' + x + '" y="' + (m.t + alto - h) + '" width="' + an * 0.7 + '" height="' + h + '" rx="3" fill="#12805c"><title>' + fechaCorta(d.clave) + ': ' + pct(d.pct_cumplimiento) + ' (' + d.hechas + ' de ' + d.total + ')</title></rect>';
      if (dias.length <= 16 || k % Math.ceil(dias.length / 16) === 0) s += '<text x="' + (x + an * 0.35) + '" y="' + (H - 6) + '" text-anchor="middle">' + fechaCorta(d.clave) + '</text>';
    });
    return '<h2>Cumplimiento por día</h2><div class="caja">' + s + '</svg></div>';
  }

  /* ---------- Lecturas por cámara o equipo: todas las del período, vengan del checklist que vengan ---------- */
  const numero = v => Core.num(v, null), rangoTxt = x => Core.textoRango({ minimo: x.minimo, maximo: x.maximo, unidad: x.unidad });
  function lecturas() {
    const g = {};
    D.datos.instancias.forEach(i => {
      if (i.tipo_respuesta !== 'NUMERO' || i.valor === '' || numero(i.valor) === null || !(i.activo_id || i.alerta_rango) || (D.sede && String(i.sede_id) !== D.sede)) return;
      const k = i.activo_id || 'T:' + i.tarea_id; (g[k] || (g[k] = [])).push(i);
    });
    Object.keys(g).forEach(k => g[k].sort((a, b) => a.capturado_en < b.capturado_en ? -1 : 1));
    return g;
  }
  /** Gráfico de lecturas en el tiempo: franja = rango aceptado; puntos rojos = fuera de rango. `chico` = miniatura para la tabla. */
  function curva(l, chico) {
    const W = chico ? 150 : 900, H = chico ? 30 : 230, m = chico ? { l: 2, r: 2, t: 3, b: 3 } : { l: 46, r: 12, t: 10, b: 24 }, ult = l[l.length - 1], mi = numero(ult.minimo), ma = numero(ult.maximo);
    const vs = l.map(i => numero(i.valor)), ts = l.map(i => new Date(i.capturado_en).getTime()); let lo = Math.min.apply(null, vs.concat(mi === null ? [] : [mi])), hi = Math.max.apply(null, vs.concat(ma === null ? [] : [ma]));
    const pad = (hi - lo || 1) * 0.12; lo -= pad; hi += pad; const t0 = ts[0], t1 = ts[ts.length - 1] === t0 ? t0 + 1 : ts[ts.length - 1];
    const x = t => m.l + (W - m.l - m.r) * (l.length === 1 ? 0.5 : (t - t0) / (t1 - t0)), y = v => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Lecturas en el tiempo" style="width:' + (chico ? W + 'px' : '100%') + ';height:auto;display:block">';
    const ya = y(ma === null ? hi : ma), yb = y(mi === null ? lo : mi); if (mi !== null || ma !== null) s += '<rect x="' + m.l + '" y="' + ya + '" width="' + (W - m.l - m.r) + '" height="' + Math.max(0, yb - ya) + '" fill="#e2f4ec"/>';
    if (!chico) {
      [mi, ma].forEach(v => { if (v !== null) s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#12805c" stroke-dasharray="4 3"/><text x="' + (m.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>'; });
      const dias = {}; l.forEach((i, k) => { const f = Core.local(new Date(i.capturado_en), 'America/Santiago'); if (!dias[f.fecha]) { dias[f.fecha] = 1; s += '<text x="' + x(ts[k]) + '" y="' + (H - 6) + '" text-anchor="middle">' + fechaCorta(f.fecha) + ' ' + f.hhmm + '</text>'; } });
    }
    s += '<polyline fill="none" stroke="#8a97a0" stroke-width="' + (chico ? 1.2 : 1.6) + '" points="' + l.map((i, k) => x(ts[k]).toFixed(1) + ',' + y(vs[k]).toFixed(1)).join(' ') + '"/>';
    l.forEach((i, k) => { const mal = i.fuera_rango === 'SI'; s += '<circle cx="' + x(ts[k]).toFixed(1) + '" cy="' + y(vs[k]).toFixed(1) + '" r="' + (chico ? (mal ? 2.6 : 1.6) : (mal ? 5 : 3.5)) + '" fill="' + (mal ? '#c0392b' : '#0b3d5c') + '"' + (mal && !chico ? ' stroke="#fff" stroke-width="1.5"' : '') + '><title>' + hora(i.capturado_en, true) + ' · ' + esc(i.valor) + ' ' + esc(i.unidad || '') + (mal ? ' · FUERA DE RANGO' : '') + ' · ' + esc(i.plantilla) + '</title></circle>'; });
    return s + '</svg>';
  }
  function vCamaras(nomSede) {
    const d = D.datos, g = lecturas(), acts = {}; (d.activos || []).forEach(a => { acts[a.activo_id] = a; });
    const claves = Object.keys(g).concat((d.activos || []).filter(a => !g[a.activo_id] && a.activo !== 'NO' && (!D.sede || String(a.sede_id) === D.sede)).map(a => a.activo_id));
    if (!claves.length) return '';
    const filas = claves.map(k => {
      const l = g[k] || [], a = acts[k], u = l[l.length - 1], fuera = l.filter(i => i.fuera_rango === 'SI').length, nombre = a ? a.nombre : u ? (u.activo || u.texto.replace(/^RELECTURA · /, '').replace(/ · \d\d:\d\d$/, '') + ' (sin cámara)') : k;
      return { fuera, n: l.length, nombre, h: '<tr class="clic" data-cam="' + esc(k) + '"><td><b>' + esc(nombre) + '</b></td><td>' + esc(nomSede[a ? a.sede_id : u.sede_id] || '') + '</td><td>' + esc(a ? rangoTxt(a) : rangoTxt(u)) + '</td><td class="n">' + l.length + '</td><td class="n">' + (fuera ? '<span class="chip c-mal">' + fuera + ' fuera de rango</span>' : l.length ? '<span class="chip c-ok">todas en rango</span>' : '') +
        '</td><td>' + (u ? '<b style="color:' + (u.fuera_rango === 'SI' ? 'var(--rojo)' : 'inherit') + '">' + esc(u.valor) + ' ' + esc(u.unidad || '') + '</b> <span class="ayuda">' + hora(u.capturado_en, true) + ' · ' + esc(u.plantilla) + '</span>' : '<span class="ayuda">Sin lecturas en el período</span>') + '</td><td>' + (l.length > 1 ? curva(l, true) : '') + '</td></tr>' };
    }).sort((a, b) => b.fuera - a.fuera || b.n - a.n || a.nombre.localeCompare(b.nombre));
    return '<h2>Lecturas por cámara o equipo (toca una para ver todas sus lecturas)</h2><div class="caja" id="camaras">' + tabla(['Cámara o equipo', 'Sede', 'Rango de la cámara', 'Lecturas', 'Resultado', 'Última lectura', 'Período'], filas.map(f => f.h), ['', '', '', 'n', 'n', '', '']) +
      '<p class="ayuda" style="margin:8px 0 0">Reúne las lecturas de todos los checklists que miden la misma cámara (apertura, control cada 2 horas, cierre, guardia). La franja verde del gráfico es el rango aceptado; en rojo, las lecturas fuera de rango.</p></div>';
  }
  function verCamara(k) {
    const d = D.datos, l = lecturas()[k] || [], a = (d.activos || []).find(x => x.activo_id === k), u = l[l.length - 1] || {}, nombre = a ? a.nombre : (u.activo || String(u.texto || k).replace(/ · \d\d:\d\d$/, ''));
    document.querySelector('#modal').innerHTML = '<div class="modal" data-cerrar="1"><div style="width:960px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h2 style="margin:0">' + esc(nombre) + ' · ' + l.length + ' lecturas' + (a && rangoTxt(a) ? ' · rango ' + esc(rangoTxt(a)) : '') + '</h2><button class="sec" data-cerrar="1">Cerrar</button></div>' +
      (l.length ? curva(l, false) : '<p class="ayuda">Sin lecturas en el período.</p>') + tabla(['Fecha y hora', 'Lectura', 'Rango aplicado', 'Checklist', 'Tarea', 'Quién'], l.slice().reverse().map(i => '<tr><td>' + hora(i.capturado_en, true) + '</td><td><b style="color:' + (i.fuera_rango === 'SI' ? 'var(--rojo)' : 'inherit') + '">' + esc(i.valor) + ' ' + esc(i.unidad || '') + '</b>' + (i.fuera_rango === 'SI' ? ' <span class="chip c-mal">fuera de rango</span>' : '') +
        '</td><td>' + esc(rangoTxt(i)) + '</td><td>' + esc(i.plantilla) + '</td><td>' + esc(i.texto) + (i.comentario ? '<br><span class="ayuda">💬 ' + esc(i.comentario) + '</span>' : '') + '</td><td>' + esc(i.usuario) + '</td></tr>')) + '</div></div>';
  }

  function pintar() {
    const d = D.datos, enSede = x => !D.sede || String(x.sede_id) === D.sede, nomSede = {}; d.sedes.forEach(s => nomSede[s.sede_id] = s.nombre);
    // Para el % se cuentan las tareas ya respondidas o ya vencidas (las que aún están en plazo no bajan el cumplimiento).
    const inst = d.instancias.filter(i => enSede(i) && i.origen === 'PLAN' && !(i.estado === 'PENDIENTE' && i.vence_a > d.ahora)), ejec = d.ejecuciones.filter(enSede), alertas = d.alertas.filter(enSede).sort((a, b) => a.creada_en < b.creada_en ? 1 : -1);
    const r = Core.resumen(inst), abiertas = alertas.filter(a => a.estado !== 'RESUELTA').length;
    let h = '<div class="filtros"><select id="sede"><option value="">Todas las sedes</option>' + d.sedes.map(s => '<option value="' + esc(s.sede_id) + '"' + (D.sede === String(s.sede_id) ? ' selected' : '') + '>' + esc(s.nombre) + '</option>').join('') + '</select>' +
      '<input type="date" id="desde" value="' + d.desde + '"> a <input type="date" id="hasta" value="' + d.hasta + '"><button id="ver">Ver</button><button class="sec" data-r="1">Hoy</button><button class="sec" data-r="7">7 días</button><button class="sec" data-r="30">30 días</button>' +
      '<span class="ayuda">Actualizado ' + hora(d.ahora) + ' · ' + esc(d.usuario) + '</span></div>';
    h += '<div class="kpis"><div class="kpi"><b>' + pct(r.pct_cumplimiento) + '</b><span>Cumplimiento · ' + r.hechas + ' de ' + r.total + ' tareas hechas o ya vencidas</span></div><div class="kpi"><b>' + pct(r.pct_a_tiempo) + '</b><span>Hechas a tiempo</span></div>' +
      '<div class="kpi"><b>' + pct(r.pct_calidad) + '</b><span>En buen estado (B, Sí o en rango)</span></div><div class="kpi"><b>' + ejec.filter(e => e.estado === 'CERRADA' && e.cerrada_por !== 'Sistema').length + ' / ' + ejec.length + '</b><span>Checklists cerrados por el equipo</span></div>' +
      '<div class="kpi"><b style="color:' + (abiertas ? 'var(--rojo)' : 'inherit') + '">' + abiertas + '</b><span>Alertas abiertas</span></div></div>';
    h += grafico(inst);
    const tabs = [['sede', 'Por sede'], ['checklist', 'Por checklist'], ['tarea', 'Por tarea'], ['persona', 'Por persona'], ['turno', 'Por turno']];
    h += '<div class="tabs">' + tabs.map(t => '<button data-tab="' + t[0] + '" class="' + (D.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div><div class="caja">';
    if (D.tab === 'sede') h += tablaGrupo('Sede', Core.agrupar(inst, i => nomSede[i.sede_id] || i.sede_id));
    if (D.tab === 'checklist') h += tablaGrupo('Checklist', Core.agrupar(inst, i => i.plantilla + ' · ' + (nomSede[i.sede_id] || i.sede_id)));
    if (D.tab === 'turno') h += tablaGrupo('Turno', Core.agrupar(inst, i => 'Turno ' + (i.turno || '—') + ' · ' + (nomSede[i.sede_id] || i.sede_id)));
    if (D.tab === 'tarea') h += tablaGrupo('Tarea (de menor a mayor cumplimiento)', Core.agrupar(inst, i => i.texto.replace(/ · \d\d:\d\d$/, '') + ' — ' + i.plantilla + ', ' + (nomSede[i.sede_id] || i.sede_id)));
    if (D.tab === 'persona') {
      const g = Core.agrupar(d.instancias.filter(i => enSede(i) && i.usuario), i => i.usuario).sort((a, b) => b.hechas - a.hechas);
      const tarde = {}; d.instancias.forEach(i => { if (i.usuario && Number(i.retraso_sync_min) > 30) tarde[i.usuario] = (tarde[i.usuario] || 0) + 1; });
      h += tabla(['Persona', 'Tareas respondidas', 'A tiempo', 'Con atraso', '% a tiempo', 'En buen estado', 'Enviadas tarde (sin señal)'], g.map(x => '<tr><td>' + esc(x.clave) + '</td><td class="n">' + x.hechas + '</td><td class="n">' + x.a_tiempo + '</td><td class="n">' + x.atrasadas +
        '</td><td class="n">' + pct(x.hechas ? Math.round(1000 * x.a_tiempo / x.hechas) / 10 : '') + '</td><td class="n">' + pct(x.pct_calidad) + '</td><td class="n">' + (tarde[x.clave] || 0) + '</td></tr>'), ['', 'n', 'n', 'n', 'n', 'n', 'n']);
    }
    h += '</div>';
    h += '<h2>Checklists del período (toca uno para ver quién respondió cada tarea)</h2><div class="caja">' + tabla(['Fecha', 'Sede', 'Checklist', 'Turno', 'Estado', 'Plazo', 'Cumplimiento', 'A tiempo', 'Inicio', 'Cierre', 'Cerrado por', 'PDF', 'Correo'],
      ejec.slice().sort((a, b) => (b.fecha + b.envio_programado).localeCompare(a.fecha + a.envio_programado)).map(e => '<tr class="clic" data-ejec="' + esc(e.ejecucion_id) + '"><td>' + fechaCorta(e.fecha) + '</td><td>' + esc(nomSede[e.sede_id]) + '</td><td><b>' + esc(e.plantilla) + '</b></td><td>' + esc(e.turno) +
        '</td><td>' + chipEstado(e.estado === 'ABIERTA' ? 'PENDIENTE' : e.estado) + '</td><td>' + chipPlazo(e) + '</td><td class="n">' + barra(e.pct_cumplimiento === '' ? '' : Number(e.pct_cumplimiento)) + '<b>' + pct(e.pct_cumplimiento) + '</b> (' + (e.hechas || 0) + '/' + e.total + ')</td><td class="n">' + pct(e.pct_a_tiempo) +
        '</td><td>' + hora(e.inicio) + '</td><td>' + hora(e.cierre) + '</td><td>' + esc(e.cerrada_por || '') + '</td><td>' + (e.pdf_evidencia_id ? '<button class="mini sec" data-pdf="' + esc(e.pdf_evidencia_id) + '">PDF' + (Number(e.informe_version) > 1 ? ' v' + esc(e.informe_version) : '') + '</button>' : '') + '</td><td title="' + esc(e.correo_resultado || '') + '">' + (e.correo_enviado_en ? 'Enviado ' + hora(e.correo_enviado_en) : /^ERROR/.test(e.correo_resultado || '') ? '<span class="chip c-mal">Error</span>' : '') + '</td></tr>'), ['', '', '', '', '', '', 'n', 'n']) + '</div>';
    h += vCamaras(nomSede);
    h += '<h2>Alertas</h2><div class="caja">' + tabla(['Creada', 'Sede', 'Tipo', 'Detalle', 'Estado', 'Nivel', 'Se hizo cargo', 'Resuelta por', 'Min. hasta resolver'], alertas.map(a => {
      const min = a.resuelta_en ? Math.round((new Date(a.resuelta_en) - new Date(a.creada_en)) / 60000) : '';
      return '<tr><td>' + hora(a.creada_en, true) + '</td><td>' + esc(nomSede[a.sede_id]) + '</td><td>' + esc(NOM_ALERTA[a.tipo] || a.tipo) + '</td><td style="max-width:420px">' + esc(a.mensaje).slice(0, 260) + '</td><td>' + (a.resuelta_via === 'INFORMATIVA' ? '<span class="chip c-gris">Aviso</span>' : chipEstado(a.estado)) + '</td><td>' + (String(a.nivel) === '2' ? '<span class="chip c-mal">Escalada</span>' : 'Grupo') +
        '</td><td>' + esc(a.reconocida_por || '') + '</td><td>' + esc(a.resuelta_por || '') + (a.resuelta_via && a.resuelta_via !== 'INFORMATIVA' ? ' <span class="ayuda">(' + ({ BOTON: 'botón', LECTURA: 'nueva lectura', AUTOMATICA: 'automática', CORRECCION: 'corrección', COMPLETADO: 'se completó' }[a.resuelta_via] || '') + ')</span>' : '') + '</td><td class="n">' + min + '</td></tr>';
    })) + '</div><div id="modal"></div>';
    main.innerHTML = h;
  }
  function detalle(id) {
    const d = D.datos, e = d.ejecuciones.find(x => x.ejecucion_id === id), l = d.instancias.filter(i => i.ejecucion_id === id);
    let sec = null, filas = [];
    l.forEach(i => {
      if (i.seccion !== sec) { sec = i.seccion; filas.push('<tr><th colspan="7">' + esc(sec || 'Tareas') + '</th></tr>'); }
      filas.push('<tr><td>' + (i.critica === 'SI' ? '<span class="chip c-mal">Crítica</span> ' : '') + esc(i.texto) + (i.comentario ? '<br><span class="ayuda">💬 ' + esc(i.comentario) + '</span>' : '') + '</td><td>' + chipEstado(i.estado) + '</td><td><b style="color:' + (i.fuera_rango === 'SI' || /^(M|NO)$/.test(i.valor) ? 'var(--rojo)' : 'inherit') + '">' + valor(i) + '</b>' + (i.fuera_rango === 'SI' ? ' <span class="chip c-mal">fuera de rango</span>' : '') +
        ((i.historial || []).length > 1 ? ' <button class="mini sec" data-hist="' + esc(i.instancia_id) + '" title="Ver las respuestas anteriores">✏️ corregida (v' + i.version + ')</button>' : '') +
        '</td><td>' + esc(i.usuario) + '</td><td>' + hora(i.capturado_en) + (i.minutos_atraso > 0 ? ' <span class="ayuda">(+' + i.minutos_atraso + ' min)</span>' : '') + '</td><td>' + (Number(i.retraso_sync_min) > 5 ? '<span class="chip c-med" title="Hora en que llegó al servidor">llegó ' + hora(i.recibido_en) + '</span>' : '') + '</td><td>' + ((i.fotos || []).length > 1 ? '<button class="mini sec" data-fotos="' + esc(i.instancia_id) + '">Ver ' + i.fotos.length + ' fotos</button>' : i.foto ? '<button class="mini sec" data-foto="' + esc(i.foto) + '">Ver foto</button><br><span class="ayuda">' + hora(((i.fotos || [])[0] || {}).t, true) + '</span>' : '') + '</td></tr>');
    });
    document.querySelector('#modal').innerHTML = '<div class="modal" data-cerrar="1"><div><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h2 style="margin:0">' + esc(e.plantilla) + ' · ' + fechaCorta(e.fecha) + ' · ' + pct(e.pct_cumplimiento) + '</h2><button class="sec" data-cerrar="1">Cerrar</button></div>' +
      tabla(['Tarea', 'Estado', 'Respuesta', 'Quién respondió', 'Hora (celular)', 'Sincronización', 'Foto'], filas) + '</div></div>';
  }
  async function verArchivo(id, esPdf) {
    const m = document.querySelector('#modal'), previo = m.innerHTML;
    const r = await api({ action: 'foto', evidencia_id: id });
    if (!r.ok) return alert(r.error);
    const url = 'data:' + r.mime + ';base64,' + r.data;
    if (esPdf) { const a = document.createElement('a'); a.href = url; a.download = r.nombre; a.click(); return; }
    const div = document.createElement('div'); div.className = 'modal'; div.dataset.foto = '1'; div.innerHTML = '<div><img src="' + url + '" alt="Foto de evidencia"><p class="ayuda">' + esc(r.nombre) + ' · toca fuera para cerrar</p></div>';
    div.onclick = () => div.remove(); document.body.appendChild(div);
  }
  // Todas las fotos de una tarea, una debajo de otra, cada una con su fecha y hora de captura (se piden al backend de a una).
  async function verFotos(instId) {
    const i = D.datos.instancias.find(x => x.instancia_id === instId), fs = (i && i.fotos) || [];
    const div = document.createElement('div'); div.className = 'modal'; div.dataset.foto = '1';
    div.innerHTML = '<div style="max-height:92vh;overflow:auto"><h2 style="margin:0 0 8px">' + esc(i.texto) + ' · ' + fs.length + ' fotos</h2><div id="galeria">' + fs.map((f, k) => '<figure style="margin:0 0 14px"><div class="ayuda" data-k="' + k + '">Cargando foto ' + (k + 1) + '…</div><figcaption class="ayuda">Foto ' + (k + 1) + ' de ' + fs.length + ' · tomada el ' + hora(f.t, true) + '</figcaption></figure>').join('') + '</div><p class="ayuda">Toca fuera para cerrar</p></div>';
    div.onclick = ev => { if (ev.target === div) div.remove(); }; document.body.appendChild(div);
    for (let k = 0; k < fs.length; k++) {
      if (!div.isConnected) return;
      const r = await api({ action: 'foto', evidencia_id: fs[k].id }), c = div.querySelector('[data-k="' + k + '"]'); if (!c) return;
      c.outerHTML = r.ok ? '<img src="data:' + r.mime + ';base64,' + r.data + '" alt="Foto ' + (k + 1) + '" style="max-width:100%;border-radius:8px">' : '<div class="aviso mal">No se pudo cargar: ' + esc(r.error) + '</div>';
    }
  }
  // Historial de una tarea corregida: todas sus respuestas, de la primera a la vigente (nada se sobrescribe).
  function verHistorial(instId) {
    const i = D.datos.instancias.find(x => x.instancia_id === instId), hs = (i && i.historial) || [];
    const div = document.createElement('div'); div.className = 'modal'; div.dataset.foto = '1';
    div.innerHTML = '<div><h2 style="margin:0 0 8px">' + esc(i.texto) + ' · historial de respuestas</h2>' + tabla(['Versión', 'Respuesta', 'Quién', 'Hora (celular)', 'Comentario'],
      hs.map((h, k) => '<tr><td>v' + h.version + (k === hs.length - 1 ? ' <span class="chip c-ok">vigente</span>' : '') + '</td><td><b>' + valor(Object.assign({}, i, { valor: h.valor, estado: h.no_aplica === 'SI' ? 'NO_APLICA' : 'HECHA' })) + '</b>' + (h.fuera_rango === 'SI' ? ' <span class="chip c-mal">fuera de rango</span>' : '') + '</td><td>' + esc(h.usuario) + '</td><td>' + hora(h.capturado_en) + '</td><td>' + esc(h.comentario || '') + '</td></tr>')) +
      '<p class="ayuda">Toca fuera para cerrar</p></div>';
    div.onclick = ev => { if (ev.target === div) div.remove(); }; document.body.appendChild(div);
  }
  main.addEventListener('click', e => {
    const t = e.target, q = s => t.closest(s);
    if (t.dataset.hist) return verHistorial(t.dataset.hist);
    if (t.dataset.fotos) return verFotos(t.dataset.fotos);
    if (t.id === 'ver') { D.desde = document.querySelector('#desde').value; D.hasta = document.querySelector('#hasta').value; return cargar(); }
    if (t.dataset.r) return rango(Number(t.dataset.r));
    if (t.dataset.tab) { D.tab = t.dataset.tab; return pintar(); }
    if (t.dataset.pdf) { e.stopPropagation(); return verArchivo(t.dataset.pdf, true); }
    if (t.dataset.foto) return verArchivo(t.dataset.foto, false);
    if (t.dataset.cerrar) { if (t === e.target && (t.tagName === 'BUTTON' || t.classList.contains('modal'))) document.querySelector('#modal').innerHTML = ''; return; }
    if (q('tr[data-cam]')) return verCamara(q('tr[data-cam]').dataset.cam);
    if (q('tr[data-ejec]')) return detalle(q('tr[data-ejec]').dataset.ejec);
  });
  main.addEventListener('change', e => { if (e.target.id === 'sede') { D.sede = e.target.value; pintar(); } });
  document.querySelector('#salir').onclick = e => { e.preventDefault(); Panel.salir(); };
  Panel.iniciar('Dashboard de checklists', cargar);
})();

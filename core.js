/**
 * GAG Chile — Checklists de Operaciones (MVP)
 * NÚCLEO: lógica pura (sin Google ni navegador). Este mismo archivo corre en
 * Apps Script (servidor), en la PWA (celular, sin señal) y en las pruebas (Node).
 * Aquí viven frecuencias, tolerancias, validación de rangos y cálculo de cumplimiento.
 */
var Core = (function () {
  var TZ_DEF = 'America/Santiago';
  var LETRAS = 'DLMXJVS'; // getUTCDay(): 0 = domingo

  // ---- Zona horaria -------------------------------------------------------
  // Minutos que hay que SUMAR a UTC para obtener la hora local (Chile: -180 o -240).
  var offsetFn = function (date, tz) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: tz || TZ_DEF, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    var p = {}; f.formatToParts(date).forEach(function (x) { p[x.type] = Number(x.value); });
    var comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((comoUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  };
  function setOffsetFn(fn) { offsetFn = fn; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }

  /** Fecha y hora local de un instante: { fecha:'2026-11-10', hhmm:'08:30', dia:10 } */
  function local(date, tz) {
    var d = new Date(new Date(date).getTime() + offsetFn(new Date(date), tz) * 60000);
    return {
      fecha: d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()),
      hhmm: p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()), dia: d.getUTCDate(),
    };
  }
  /** Instante (Date) de una fecha y hora local de la sede. */
  function aInstante(fecha, hhmm, tz) {
    var a = fecha.split('-').map(Number), h = String(hhmm).split(':').map(Number);
    var base = Date.UTC(a[0], a[1] - 1, a[2], h[0], h[1] || 0);
    var d = new Date(base - offsetFn(new Date(base), tz) * 60000);
    return new Date(base - offsetFn(d, tz) * 60000); // 2.ª pasada: cambios de hora
  }
  function sumarDias(fecha, n) {
    var a = fecha.split('-').map(Number), d = new Date(Date.UTC(a[0], a[1] - 1, a[2] + n));
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  }
  function letraDia(fecha) { var a = fecha.split('-').map(Number); return LETRAS.charAt(new Date(Date.UTC(a[0], a[1] - 1, a[2])).getUTCDay()); }
  function diasDelMes(fecha) { var a = fecha.split('-').map(Number); return new Date(Date.UTC(a[0], a[1], 0)).getUTCDate(); }
  function hhmmOk(s) { return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(s || '').trim()); }
  function normHora(s) { s = String(s || '').trim(); if (!hhmmOk(s)) return ''; var x = s.split(':'); return p2(Number(x[0])) + ':' + x[1]; }
  function minDe(hhmm) { var x = hhmm.split(':').map(Number); return x[0] * 60 + x[1]; }
  function hhmmDe(min) { min = ((min % 1440) + 1440) % 1440; return p2(Math.floor(min / 60)) + ':' + p2(min % 60); }
  function mas(date, min) { return new Date(new Date(date).getTime() + min * 60000); }
  function iso(d) { return d ? new Date(d).toISOString() : ''; }
  function si(v) { return v === true || /^(s|1|true|x)/i.test(String(v == null ? '' : v).trim()); }
  function num(v, def) { if (v === '' || v == null) return def; var n = Number(String(v).replace(',', '.')); return isNaN(n) ? def : n; }

  // ---- Plantillas y ventanas ---------------------------------------------
  function aplicaHoy(plantilla, fecha) {
    if (!si(plantilla.activa)) return false;
    var dias = String(plantilla.dias || 'LMXJVSD').toUpperCase();
    return dias.indexOf(letraDia(fecha)) >= 0;
  }
  /** Ventana del turno: envío del link, cierre y límite (cierre + tolerancia). Soporta turnos que cruzan medianoche. */
  function ventana(plantilla, fecha, tz) {
    var he = normHora(plantilla.hora_envio) || '08:00', hc = normHora(plantilla.hora_cierre) || '23:59';
    var envio = aInstante(fecha, he, tz);
    var cruza = hc <= he;
    var cierre = aInstante(cruza ? sumarDias(fecha, 1) : fecha, hc, tz);
    var limite = mas(cierre, num(plantilla.tolerancia_cierre_min, 15));
    // Plazo fijo (opcional): inicio del turno + N minutos. A esa hora el checklist debe estar completo; solo depende del reloj.
    var pm = num(plantilla.plazo_min, 0), plazo = null;
    if (pm > 0) {
      var hi = normHora(plantilla.hora_inicio_turno) || he;
      plazo = mas(aInstante(fecha, hi, tz), pm);
      if (plazo > limite) plazo = limite;
      if (plazo <= envio) plazo = null; // configuración inválida: se ignora
    }
    return { envio: envio, cierre: cierre, limite: limite, plazo: plazo, cruza: cruza, hora_envio: he, hora_cierre: hc };
  }
  function instanteEnTurno(hhmm, v, fecha, tz) { // una hora "suelta" dentro del turno
    return aInstante(v.cruza && hhmm < v.hora_envio ? sumarDias(fecha, 1) : fecha, hhmm, tz);
  }
  function idEjecucion(fecha, plantillaId) { return fecha + '~' + plantillaId; }
  function idInstancia(fecha, plantillaId, tareaId, hhmm) { return fecha + '~' + plantillaId + '~' + tareaId + '~' + String(hhmm).replace(':', ''); }

  /** Horas (HH:mm) en que toca una tarea dentro de la ejecución de `fecha`. [] = hoy no toca. */
  function horasDeTarea(tarea, plantilla, fecha, tz) {
    var v = ventana(plantilla, fecha, tz), f = String(tarea.frecuencia || 'DIARIA').toUpperCase();
    var objetivo = normHora(tarea.hora_objetivo);
    if (f === 'SEMANAL') {
      var ds = String(tarea.dias_semana || '').toUpperCase().replace(/[^LMXJVSD]/g, '');
      return ds.indexOf(letraDia(fecha)) >= 0 ? [objetivo || v.hora_cierre] : [];
    }
    if (f === 'MENSUAL') {
      var n = Math.min(num(tarea.dia_mes, 1), diasDelMes(fecha));
      return Number(fecha.split('-')[2]) === n ? [objetivo || v.hora_cierre] : [];
    }
    if (f === 'CADA_N_HORAS') {
      var paso = Math.max(15, Math.round(num(tarea.cada_n_horas, 2) * 60));
      var ini = minDe(normHora(tarea.ventana_inicio) || v.hora_envio), fin = minDe(normHora(tarea.ventana_fin) || v.hora_cierre);
      if (fin < ini) fin += 1440;
      var out = [];
      for (var m = ini; m <= fin; m += paso) {
        var h = hhmmDe(m), t = instanteEnTurno(h, v, fecha, tz);
        if (t >= v.envio && t < v.cierre && out.indexOf(h) < 0) out.push(h);
      }
      return out;
    }
    return [objetivo || v.hora_cierre]; // DIARIA
  }

  /**
   * Genera las instancias del día para una plantilla. Cada instancia guarda una COPIA de la tarea
   * (texto, tipo, rango): así un cambio posterior de la plantilla no altera el histórico.
   */
  function generarInstancias(plantilla, tareas, secciones, fecha, tz, activos) {
    var v = ventana(plantilla, fecha, tz), secs = {}, acts = {}, out = [];
    (secciones || []).forEach(function (s) { secs[s.seccion_id] = s; });
    (activos || []).forEach(function (a) { acts[a.activo_id] = a; });
    (tareas || []).filter(function (t) { return String(t.plantilla_id) === String(plantilla.plantilla_id) && (t.activa === '' || t.activa == null || si(t.activa)); })
      .forEach(function (t) {
        var tol = num(t.tolerancia_min, 15), sec = secs[t.seccion_id] || {}, u = rangoDe(t, acts[t.activo_id]), esNum = String(t.tipo_respuesta || '').toUpperCase() === 'NUMERO';
        var cada = String(t.frecuencia || '').toUpperCase() === 'CADA_N_HORAS', sinHora = !cada && !normHora(t.hora_objetivo);
        horasDeTarea(t, plantilla, fecha, tz).forEach(function (h) {
          var prog = instanteEnTurno(h, v, fecha, tz), vence = mas(prog, tol);
          if (v.plazo && sinHora && vence > v.plazo) vence = v.plazo; // con plazo fijo, las tareas sin hora propia vencen al plazo
          out.push({
            instancia_id: idInstancia(fecha, plantilla.plantilla_id, t.tarea_id, h),
            ejecucion_id: idEjecucion(fecha, plantilla.plantilla_id), tarea_id: String(t.tarea_id),
            sede_id: String(plantilla.sede_id), fecha: fecha,
            seccion: sec.nombre || '', orden: num(sec.orden, 0) * 1000 + num(t.orden, 0),
            texto: t.texto + (cada ? ' · ' + h : ''), tipo_respuesta: String(t.tipo_respuesta || 'SI_NO').toUpperCase(),
            unidad: (esNum ? u.unidad : t.unidad) || '', foto: String(t.foto || 'NO').toUpperCase(),
            critica: si(t.critica) ? 'SI' : 'NO', critico_estados: String(t.critico_estados || ''),
            activo_id: String(t.activo_id || ''), activo: (acts[t.activo_id] || {}).nombre || '', fotos_max: fotosMax(t) > 1 ? String(fotosMax(t)) : '',
            minimo: esNum ? u.minimo : '', maximo: esNum ? u.maximo : '', alerta_rango: esNum && u.origen ? alertaDe(t) : '',
            disponible_desde: iso(cada ? mas(prog, -Math.max(tol, 15)) : v.envio),
            programada_para: iso(prog), vence_a: iso(vence),
            estado: 'PENDIENTE', minutos_atraso: '', origen: 'PLAN', respuesta_id: '',
          });
        });
      });
    out.sort(function (a, b) { return a.orden - b.orden || (a.programada_para < b.programada_para ? -1 : 1); });
    return out;
  }
  function vacio(v) { return v === '' || v == null || String(v).trim() === ''; }
  function alertaDe(t) { var a = String((t && t.alerta_rango) || '').toUpperCase().trim(); return a === 'TEMPERATURA' || a === 'OTRA' ? a : ''; }
  /**
   * RANGO DE UNA TAREA: el propio de la tarea (minimo/maximo escritos en ella) manda; si no tiene, el de su cámara; si no, ninguno.
   * Devuelve { minimo, maximo, unidad, origen: 'TAREA' | 'CAMARA' | '' }. Es la única regla, igual en el celular, el servidor y las pruebas.
   */
  function rangoDe(tarea, activo) {
    var a = activo || {}, al = alertaDe(tarea), un = function (x) { return x || (al === 'TEMPERATURA' ? '°C' : ''); };
    if (!vacio(tarea.minimo) || !vacio(tarea.maximo)) return { minimo: vacio(tarea.minimo) ? '' : tarea.minimo, maximo: vacio(tarea.maximo) ? '' : tarea.maximo, unidad: un(tarea.unidad || a.unidad), origen: 'TAREA' };
    if (tarea.activo_id && (!vacio(a.minimo) || !vacio(a.maximo))) return { minimo: vacio(a.minimo) ? '' : a.minimo, maximo: vacio(a.maximo) ? '' : a.maximo, unidad: un(tarea.unidad || a.unidad), origen: 'CAMARA' };
    return { minimo: '', maximo: '', unidad: tarea.unidad || '', origen: '' };
  }
  /** ¿Esta tarea alerta por rango? 'TEMPERATURA', 'OTRA' o '' (un número con rango pero sin esta opción solo se marca en rojo, no alerta). */
  function alertaRango(inst) { return tieneRango(inst) ? alertaDe(inst) : ''; }
  /** Errores de configuración de una tarea con alerta de rango ([] = está bien). `activo` es su cámara, si tiene. */
  function validarRango(tarea, activo) {
    var al = alertaDe(tarea), err = [];
    if (!al) return err;
    if (String(tarea.tipo_respuesta || '').toUpperCase() !== 'NUMERO') return ['la alerta por rango solo sirve en tareas de tipo Número'];
    if (al === 'TEMPERATURA' && !tarea.activo_id) err.push('falta elegir la cámara (obligatoria en "Fuera de rango de T°")');
    var r = rangoDe(tarea, activo), mi = num(r.minimo, null), ma = num(r.maximo, null);
    if (!r.origen || (mi === null && ma === null)) err.push('falta el rango: escribe mínimo o máximo, o elige una cámara que lo tenga');
    else if (mi !== null && ma !== null && mi >= ma) err.push('el mínimo (' + mi + ') debe ser menor que el máximo (' + ma + ')');
    return err;
  }
  /** Relectura que pide la regla T1 (id determinista: celular y servidor crean la misma). */
  function instanciaRelectura(inst, capturadoISO, minRelectura, minEscala) {
    var m = /^(.*)~R(\d+)$/.exec(inst.instancia_id), baseId = m ? m[1] : inst.instancia_id, k = m ? Number(m[2]) : 0;
    if (k >= 4) return null; // máximo 4 relecturas seguidas; después manda la alerta escalada
    var base = new Date(capturadoISO), r = {};
    Object.keys(inst).forEach(function (c) { r[c] = inst[c]; });
    r.instancia_id = baseId + '~R' + (k + 1);
    r.texto = 'RELECTURA · ' + String(inst.texto).replace(/^RELECTURA · /, ''); r.origen = 'RELECTURA'; r.critica = 'SI'; r.orden = Number(inst.orden) + 0.1;
    r.disponible_desde = iso(base); r.programada_para = iso(mas(base, minRelectura)); r.vence_a = iso(mas(base, minEscala));
    r.estado = 'PENDIENTE'; r.minutos_atraso = ''; r.respuesta_id = '';
    delete r.valor; delete r.usuario; delete r.comentario; delete r.capturado_en; delete r._fila;
    return r;
  }

  // ---- Respuestas ---------------------------------------------------------
  /** A tiempo o con atraso, según la hora en que se CAPTURÓ (no la de llegada al servidor). */
  function evaluarEstado(inst, capturadoISO) {
    var atraso = Math.ceil((new Date(capturadoISO) - new Date(inst.vence_a)) / 60000);
    return atraso > 0 ? { estado: 'HECHA_ATRASO', minutos_atraso: atraso } : { estado: 'HECHA', minutos_atraso: 0 };
  }
  function tieneRango(inst) { return inst.tipo_respuesta === 'NUMERO' && (inst.minimo !== '' || inst.maximo !== '') && (inst.minimo != null || inst.maximo != null); }
  /** Valida un valor contra el rango. Se usa igual en el celular (sin señal) y en el servidor. */
  function validarValor(inst, valor) {
    if (inst.tipo_respuesta !== 'NUMERO') return { ok: true, fuera_rango: false };
    var n = num(valor, null);
    if (n === null) return { ok: false, fuera_rango: false, mensaje: 'Escribe un número' };
    if (!tieneRango(inst)) return { ok: true, fuera_rango: false, numero: n };
    var mi = num(inst.minimo, null), ma = num(inst.maximo, null);
    var fuera = (mi !== null && n < mi) || (ma !== null && n > ma);
    return {
      ok: true, numero: n, fuera_rango: fuera,
      mensaje: fuera ? n + ' ' + (inst.unidad || '') + ': fuera de rango (' + textoRango(inst) + ')' : '',
    };
  }
  function textoRango(inst) {
    var mi = num(inst.minimo, null), ma = num(inst.maximo, null), u = inst.unidad ? ' ' + inst.unidad : '';
    if (mi !== null && ma !== null) return mi + ' a ' + ma + u;
    if (ma !== null) return 'máximo ' + ma + u;
    if (mi !== null) return 'mínimo ' + mi + u;
    return '';
  }
  function estadosCriticos(inst) {
    var e = String(inst.critico_estados || '').toUpperCase().split(/[,; ]+/).filter(function (x) { return x; });
    if (!e.length && inst.critica === 'SI') e = inst.tipo_respuesta === 'BRM' ? ['M'] : inst.tipo_respuesta === 'SI_NO' ? ['NO'] : [];
    return e;
  }
  /** ¿La respuesta gatilla la regla ITEM_CRITICO_ESTADO? (ítem crítico en uno de sus estados críticos) */
  function esRespuestaCritica(inst, valor) {
    if (inst.critica !== 'SI' && !String(inst.critico_estados || '').trim()) return false;
    return estadosCriticos(inst).indexOf(String(valor).toUpperCase()) >= 0;
  }
  function esBuena(inst, valor) { // null = no evaluable
    var v = String(valor).toUpperCase();
    if (inst.tipo_respuesta === 'BRM') return v === 'B';
    if (inst.tipo_respuesta === 'SI_NO') return v !== malSiNo(inst);
    if (tieneRango(inst)) return !validarValor(inst, valor).fuera_rango;
    return null;
  }

  // ---- Fotos y orden de la respuesta --------------------------------------
  /** Cuántas fotos admite una tarea: 0 si no lleva foto; si lleva, de 1 a 10 (fotos_max vacío = 1, como siempre). */
  function fotosMax(inst) {
    var conFoto = inst.tipo_respuesta === 'FOTO' || /^(OPCIONAL|OBLIGATORIA)$/.test(String(inst.foto || '').toUpperCase());
    if (!conFoto) return 0;
    var n = Math.floor(num(inst.fotos_max, 1));
    return Math.max(1, Math.min(10, n));
  }
  function fotoObligatoria(inst) { return inst.tipo_respuesta === 'FOTO' || String(inst.foto || '').toUpperCase() === 'OBLIGATORIA'; }
  /** Valor "malo" de una tarea Sí/No: normalmente NO. Si su alerta se configuró para SI (algo que debe estar apagado), el malo es SI. */
  function malSiNo(inst) { return String(inst.critico_estados || '').toUpperCase().replace(/\s/g, '') === 'SI' ? 'SI' : 'NO'; }
  /**
   * ORDEN DE UNA RESPUESTA: primero el valor; después la confirmación (número fuera de rango) y el comentario. Con eso la respuesta
   * queda GUARDADA en el celular; las fotos se toman después y no hay un botón de envío por tarea (todo sale en segundo plano y al
   * tocar "Cerrar y enviar checklist").
   * b = borrador { valor, confirmado, comentario (undefined = aún no se pidió) }.
   * Devuelve { paso: 'error' | 'confirmar' | 'comentario' | 'guardar', mensaje, valor, fuera }.
   */
  function pasoRespuesta(inst, b) {
    var tipo = inst.tipo_respuesta, valor = b.valor, fuera = false;
    if (tipo === 'NUMERO') {
      var v = validarValor(inst, valor);
      if (!v.ok) return { paso: 'error', mensaje: v.mensaje };
      valor = String(v.numero); fuera = v.fuera_rango;
      if (fuera && !b.confirmado) return { paso: 'confirmar', mensaje: v.mensaje, valor: valor, fuera: true };
    }
    if (tipo === 'TEXTO' && !String(valor == null ? '' : valor).trim()) return { paso: 'error', mensaje: 'Escribe algo' };
    if (tipo === 'FOTO') valor = 'FOTO';
    var u = String(valor).toUpperCase();
    var pide = (tipo === 'BRM' && (u === 'R' || u === 'M')) || (tipo === 'SI_NO' && u === malSiNo(inst)) || fuera;
    if (pide && b.comentario === undefined) return { paso: 'comentario', valor: valor, fuera: fuera };
    return { paso: 'guardar', valor: valor, fuera: fuera };
  }
  /**
   * ¿La respuesta se puede ENVIAR? Con foto obligatoria necesita al menos una; nunca más fotos que el máximo de la tarea.
   * Mientras no esté lista, la tarea sigue contando como pendiente (se avisa al cerrar).
   */
  function respuestaLista(inst, nFotos, noAplica) {
    var n = num(nFotos, 0), max = fotosMax(inst);
    if (noAplica) return { ok: true };
    if (n > max) return { ok: false, mensaje: max ? 'Esta tarea admite ' + max + (max === 1 ? ' foto' : ' fotos') + ' como máximo' : 'Esta tarea no lleva foto' };
    if (fotoObligatoria(inst) && n < 1) return { ok: false, falta: true, mensaje: 'Esta tarea necesita al menos una foto' };
    return { ok: true };
  }

  // ---- Completar o corregir un checklist ya enviado -----------------------
  /** Un checklist admite respuestas y correcciones hasta su límite (hora de cierre + margen), según la hora de CAPTURA. */
  function enHorario(ejec, capturadoISO) { return !!ejec && !!ejec.limite && iso(capturadoISO) <= ejec.limite; }
  /** Puede corregir una respuesta quien la dio o un jefe (rol que ve toda la sede). */
  function puedeCorregir(usuarioIdRespuesta, usuario) {
    if (!usuario) return false;
    return String(usuario.usuario_id) === String(usuarioIdRespuesta) || si(usuario.ve_toda_la_sede);
  }
  function nombreValor(inst, r) {
    if (!r) return 'Sin responder';
    if (si(r.no_aplica)) return 'No aplica';
    var v = String(r.valor == null ? '' : r.valor);
    return ({ B: 'Bueno', R: 'Regular', M: 'Malo', SI: 'Sí', NO: 'No', FOTO: 'Foto' })[v.toUpperCase()] || (v + (inst.tipo_respuesta === 'NUMERO' && inst.unidad ? ' ' + inst.unidad : ''));
  }
  /** Foto del estado de un checklist al enviar un informe: sirve para decir, en el siguiente, qué cambió. */
  function fotoInforme(instancias, nFotos) {
    var plan = (instancias || []).filter(function (i) { return i.origen === 'PLAN' || !i.origen; }), r = resumen(plan), ids = {};
    (instancias || []).forEach(function (i) { if (i.respuesta_id) ids[i.instancia_id] = i.respuesta_id; });
    return { h: r.hechas, n: r.total, p: r.pct_cumplimiento, nf: num(nFotos, 0), i: ids, f: faltas(instancias).map(function (x) { return [x.instancia_id + '|' + x.tipo, x.detalle + ' — ' + x.texto]; }) };
  }
  /**
   * QUÉ CAMBIÓ desde el informe anterior. previo = fotoInforme del informe anterior; instancias con su respuesta vigente (.valor, .usuario...);
   * respuestas = todas las del checklist (también las reemplazadas). Devuelve las tareas completadas después, las correcciones
   * (valor anterior -> nuevo, quién y cuándo; `mejora` si pasó de mal estado a bueno), el cumplimiento antes y ahora, y las faltas resueltas o nuevas.
   */
  function cambios(previo, instancias, respuestas, nFotos) {
    previo = previo || { i: {}, f: [] };
    var porId = {}, out = { completadas: [], correcciones: [], resueltas: [], nuevas: [], fotos: Math.max(0, num(nFotos, 0) - num(previo.nf, 0)) };
    (respuestas || []).forEach(function (r) { porId[r.respuesta_id] = r; });
    (instancias || []).forEach(function (i) {
      var antes = (previo.i || {})[i.instancia_id], ahora = i.respuesta_id;
      if (!ahora || antes === ahora) return;
      var ra = porId[antes], rn = porId[ahora] || {};
      if (!antes) { out.completadas.push({ instancia_id: i.instancia_id, texto: i.texto, valor: nombreValor(i, rn), usuario: rn.usuario || '', capturado_en: rn.capturado_en || '', critica: i.critica === 'SI' }); return; }
      var ba = ra && !si(ra.no_aplica) ? esBuena(i, ra.valor) : null, bn = !si(rn.no_aplica) ? esBuena(i, rn.valor) : null;
      out.correcciones.push({ instancia_id: i.instancia_id, texto: i.texto, antes: nombreValor(i, ra), despues: nombreValor(i, rn), usuario: rn.usuario || '', capturado_en: rn.capturado_en || '',
        usuario_antes: ra ? ra.usuario : '', comentario: rn.comentario || '', mejora: ba === false && bn === true, empeora: ba !== false && bn === false, critica: i.critica === 'SI' });
    });
    var fa = {}, fn = {}; (previo.f || []).forEach(function (x) { fa[x[0]] = x[1]; });
    faltas(instancias).forEach(function (x) { var k = x.instancia_id + '|' + x.tipo; fn[k] = 1; if (!fa[k]) out.nuevas.push(x.detalle + ' — ' + x.texto); });
    Object.keys(fa).forEach(function (k) { if (!fn[k]) out.resueltas.push(fa[k]); });
    var r = resumen((instancias || []).filter(function (i) { return i.origen === 'PLAN' || !i.origen; }));
    out.antes = { hechas: num(previo.h, 0), total: num(previo.n, 0), pct: previo.p === undefined ? '' : previo.p }; out.ahora = { hechas: r.hechas, total: r.total, pct: r.pct_cumplimiento };
    out.hay = !!(out.completadas.length || out.correcciones.length || out.fotos);
    return out;
  }

  // ---- Cumplimiento -------------------------------------------------------
  /** Resumen de un conjunto de instancias (cada una puede traer .valor de su respuesta). */
  function resumen(instancias) {
    var r = { total: 0, hechas: 0, a_tiempo: 0, atrasadas: 0, no_hechas: 0, no_aplica: 0, pendientes: 0, evaluadas: 0, buenas: 0 };
    (instancias || []).forEach(function (i) {
      if (i.estado === 'NO_APLICA') { r.no_aplica++; return; }
      r.total++;
      if (i.estado === 'HECHA') { r.hechas++; r.a_tiempo++; }
      else if (i.estado === 'HECHA_ATRASO') { r.hechas++; r.atrasadas++; }
      else if (i.estado === 'NO_HECHA') r.no_hechas++;
      else r.pendientes++;
      if ((i.estado === 'HECHA' || i.estado === 'HECHA_ATRASO') && i.valor !== undefined && i.valor !== '') {
        var b = esBuena(i, i.valor);
        if (b !== null) { r.evaluadas++; if (b) r.buenas++; }
      }
    });
    r.pct_cumplimiento = r.total ? Math.round(1000 * r.hechas / r.total) / 10 : '';
    r.pct_a_tiempo = r.total ? Math.round(1000 * r.a_tiempo / r.total) / 10 : '';
    r.pct_calidad = r.evaluadas ? Math.round(1000 * r.buenas / r.evaluadas) / 10 : '';
    return r;
  }
  /** ¿Están todas las tareas planificadas respondidas (o marcadas No aplica)? Las relecturas no cuentan. */
  function completa(instancias) {
    var plan = (instancias || []).filter(function (i) { return i.origen === 'PLAN' || !i.origen; });
    return plan.length > 0 && plan.every(function (i) { return /^(HECHA|HECHA_ATRASO|NO_APLICA)$/.test(i.estado); });
  }
  /**
   * FALTAS de un checklist: todo lo que no salió bien, para el informe. Cada instancia puede traer .valor de su respuesta.
   * tipos: NO_HECHA · ATRASO · FUERA_RANGO · ESTADO (Regular, Malo o No)
   */
  function faltas(instancias) {
    var out = [];
    (instancias || []).forEach(function (i) {
      if (i.estado === 'NO_APLICA') return;
      var crit = i.critica === 'SI', add = function (tipo, detalle) { out.push({ instancia_id: i.instancia_id, tipo: tipo, texto: i.texto, detalle: detalle, critica: crit, usuario: i.usuario || '' }); };
      if (i.estado === 'PENDIENTE' || i.estado === 'NO_HECHA') { if (i.origen !== 'RELECTURA' || i.estado === 'NO_HECHA') add('NO_HECHA', 'No realizada'); return; }
      if (i.estado === 'HECHA_ATRASO') add('ATRASO', 'Con atraso' + (i.minutos_atraso !== '' && i.minutos_atraso != null ? ' de ' + i.minutos_atraso + ' min' : ''));
      if (i.valor === undefined || i.valor === '') return;
      var v = String(i.valor).toUpperCase();
      if (tieneRango(i)) { if (validarValor(i, i.valor).fuera_rango) add('FUERA_RANGO', 'Fuera de rango: ' + i.valor + (i.unidad ? ' ' + i.unidad : '') + ' (rango ' + textoRango(i) + ')'); }
      else if (i.tipo_respuesta === 'BRM' && (v === 'R' || v === 'M')) add('ESTADO', v === 'M' ? 'Malo' : 'Regular');
      else if (i.tipo_respuesta === 'SI_NO' && v === malSiNo(i)) add('ESTADO', v === 'NO' ? 'No' : 'Sí (debía ser No)');
    });
    return out;
  }
  /** Agrupa instancias por una clave y resume cada grupo (dashboard: por sede, tarea, persona, turno...). */
  function agrupar(instancias, claveFn) {
    var g = {}, orden = [];
    (instancias || []).forEach(function (i) {
      var k = claveFn(i); if (k == null || k === '') return;
      if (!g[k]) { g[k] = []; orden.push(k); } g[k].push(i);
    });
    return orden.map(function (k) { var r = resumen(g[k]); r.clave = k; return r; });
  }
  /** Tareas vencidas (pasó vence_a y siguen pendientes) a una hora dada. */
  function vencidas(instancias, ahora) {
    var t = new Date(ahora).toISOString();
    return (instancias || []).filter(function (i) { return i.estado === 'PENDIENTE' && i.vence_a < t; });
  }

  return {
    setOffsetFn: setOffsetFn, local: local, aInstante: aInstante, sumarDias: sumarDias, letraDia: letraDia,
    normHora: normHora, mas: mas, iso: iso, si: si, num: num, aplicaHoy: aplicaHoy, ventana: ventana,
    idEjecucion: idEjecucion, idInstancia: idInstancia, horasDeTarea: horasDeTarea, generarInstancias: generarInstancias,
    instanciaRelectura: instanciaRelectura, evaluarEstado: evaluarEstado, tieneRango: tieneRango, validarValor: validarValor,
    textoRango: textoRango, esRespuestaCritica: esRespuestaCritica, esBuena: esBuena, resumen: resumen, agrupar: agrupar, vencidas: vencidas, completa: completa, faltas: faltas,
    rangoDe: rangoDe, alertaRango: alertaRango, validarRango: validarRango,
    fotosMax: fotosMax, fotoObligatoria: fotoObligatoria, malSiNo: malSiNo, pasoRespuesta: pasoRespuesta, respuestaLista: respuestaLista,
    enHorario: enHorario, puedeCorregir: puedeCorregir, nombreValor: nombreValor, fotoInforme: fotoInforme, cambios: cambios,
  };
})();
if (typeof module !== 'undefined') module.exports = Core;

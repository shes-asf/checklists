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
    return { envio: envio, cierre: cierre, limite: mas(cierre, num(plantilla.tolerancia_cierre_min, 15)), cruza: cruza, hora_envio: he, hora_cierre: hc };
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
   * (texto, tipo, umbrales): así un cambio posterior de la plantilla no altera el histórico.
   */
  function generarInstancias(plantilla, tareas, secciones, fecha, tz, umbrales, activos) {
    var v = ventana(plantilla, fecha, tz), secs = {}, acts = {}, out = [];
    (secciones || []).forEach(function (s) { secs[s.seccion_id] = s; });
    (activos || []).forEach(function (a) { acts[a.activo_id] = a; });
    (tareas || []).filter(function (t) { return String(t.plantilla_id) === String(plantilla.plantilla_id) && (t.activa === '' || t.activa == null || si(t.activa)); })
      .forEach(function (t) {
        var tol = num(t.tolerancia_min, 15), sec = secs[t.seccion_id] || {}, u = umbralDe(t, umbrales);
        var cada = String(t.frecuencia || '').toUpperCase() === 'CADA_N_HORAS';
        horasDeTarea(t, plantilla, fecha, tz).forEach(function (h) {
          var prog = instanteEnTurno(h, v, fecha, tz);
          out.push({
            instancia_id: idInstancia(fecha, plantilla.plantilla_id, t.tarea_id, h),
            ejecucion_id: idEjecucion(fecha, plantilla.plantilla_id), tarea_id: String(t.tarea_id),
            sede_id: String(plantilla.sede_id), fecha: fecha,
            seccion: sec.nombre || '', orden: num(sec.orden, 0) * 1000 + num(t.orden, 0),
            texto: t.texto + (cada ? ' · ' + h : ''), tipo_respuesta: String(t.tipo_respuesta || 'SI_NO').toUpperCase(),
            unidad: t.unidad || (u ? u.unidad : '') || '', foto: String(t.foto || 'NO').toUpperCase(),
            critica: si(t.critica) ? 'SI' : 'NO', critico_estados: String(t.critico_estados || ''),
            activo_id: String(t.activo_id || ''), activo: (acts[t.activo_id] || {}).nombre || '',
            minimo: u ? u.minimo : '', maximo: u ? u.maximo : '',
            disponible_desde: iso(cada ? mas(prog, -Math.max(tol, 15)) : v.envio),
            programada_para: iso(prog), vence_a: iso(mas(prog, tol)),
            estado: 'PENDIENTE', minutos_atraso: '', origen: 'PLAN', respuesta_id: '',
          });
        });
      });
    out.sort(function (a, b) { return a.orden - b.orden || (a.programada_para < b.programada_para ? -1 : 1); });
    return out;
  }
  function umbralDe(tarea, umbrales) {
    var porTarea = null, porActivo = null;
    (umbrales || []).forEach(function (u) {
      if (u.tarea_id && String(u.tarea_id) === String(tarea.tarea_id)) porTarea = u;
      else if (u.activo_id && tarea.activo_id && String(u.activo_id) === String(tarea.activo_id)) porActivo = u;
    });
    return porTarea || porActivo;
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
    if (inst.tipo_respuesta === 'SI_NO') return v === 'SI';
    if (tieneRango(inst)) return !validarValor(inst, valor).fuera_rango;
    return null;
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
    textoRango: textoRango, esRespuestaCritica: esRespuestaCritica, esBuena: esBuena, resumen: resumen, agrupar: agrupar, vencidas: vencidas,
  };
})();
if (typeof module !== 'undefined') module.exports = Core;

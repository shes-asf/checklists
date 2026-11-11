// Almacenamiento local (IndexedDB) y cola de envío. Lo usan la app y el service worker.
// Todo lo que se responde sin señal queda aquí y se envía solo, en orden, cuando vuelve la conexión.
(function (g) {
  let dbp = null;
  function db() {
    return dbp || (dbp = new Promise((ok, err) => {
      const r = indexedDB.open('checklists', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('cola', { keyPath: 'id', autoIncrement: true }); d.createObjectStore('fotos'); };
      r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error);
    }));
  }
  function tx(almacen, modo, fn) {
    return db().then(d => new Promise((ok, err) => {
      const t = d.transaction(almacen, modo), s = t.objectStore(almacen), r = fn(s);
      t.oncomplete = () => ok(r && r.result !== undefined ? r.result : undefined); t.onerror = () => err(t.error);
    }));
  }
  const Local = {
    get: k => tx('kv', 'readonly', s => s.get(k)),
    set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
    del: k => tx('kv', 'readwrite', s => s.delete(k)),
    foto: id => tx('fotos', 'readonly', s => s.get(id)),
    guardarFoto: (id, v) => tx('fotos', 'readwrite', s => s.put(v, id)),
    fotos: () => tx('fotos', 'readonly', s => s.getAll()),
    borrarFoto: id => tx('fotos', 'readwrite', s => s.delete(id)),
  };

  async function api(body) {
    const url = (g.APP_CONFIG || {}).API_URL;
    if (!url || !/^https?:\/\//.test(url)) throw new Error('Falta configurar la dirección del backend (config.js)');
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('RED');
    return r.json();
  }

  let enCurso = null;
  const Cola = {
    agregar: item => tx('cola', 'readwrite', s => s.add(item)),
    todo: () => tx('cola', 'readonly', s => s.getAll()),
    borrar: id => tx('cola', 'readwrite', s => s.delete(id)),
    async pendientes() { return (await Cola.todo()).filter(i => i.tipo !== 'archivo' || true).length; },
    /** Envía la cola en orden (fotos antes que su respuesta). Se detiene al primer error de red y reintenta después. */
    enviar() {
      if (enCurso) return enCurso;
      enCurso = (async () => {
        const eq = await Local.get('equipo'); let enviados = 0, error = '';
        if (!eq) return { enviados, error: 'sin equipo' };
        try {
          for (;;) {
            const cola = await Cola.todo(); if (!cola.length) break;
            const it = cola[0];
            if (it.tipo === 'archivo') {
              const f = it.evidencia_id && !it.data ? await Local.foto(it.evidencia_id) : null;
              const r = await api(Object.assign({ action: 'archivo', equipo: eq.token }, it.cuerpo, { data: it.data || (f && f.data) }));
              if (!r.ok && !/incompleto/.test(r.error || '')) throw new Error(r.error || 'RED');
              await Cola.borrar(it.id); enviados++;
            } else if (it.tipo === 'respuesta') {
              const lote = []; for (const x of cola) { if (x.tipo !== 'respuesta' || lote.length >= 25) break; lote.push(x); }
              const r = await api({ action: 'respuestas', equipo: eq.token, items: lote.map(x => x.cuerpo) });
              if (!r.ok) throw new Error(r.error || 'RED');
              const res = {}; (r.resultados || []).forEach(x => res[x.respuesta_id] = x);
              for (const x of lote) { const y = res[x.cuerpo.respuesta_id]; if (y && (y.ok || y.descartar)) { await Cola.borrar(x.id); enviados++; } else throw new Error((y && y.error) || 'RED'); }
            } else if (it.tipo === 'cerrar') {
              const r = await api(Object.assign({ action: 'cerrar', equipo: eq.token }, it.cuerpo));
              if (!r.ok && !r.descartar) throw new Error(r.error || 'RED');
              await Cola.borrar(it.id); enviados++;
            } else await Cola.borrar(it.id);
          }
        } catch (e) { error = String(e.message || e); }
        const quedan = (await Cola.todo()).length;
        try { new BroadcastChannel('cola').postMessage({ enviados, quedan, error }); } catch (e) { }
        return { enviados, quedan, error };
      })().finally(() => { enCurso = null; });
      return enCurso;
    },
  };
  g.Local = Local; g.Cola = Cola; g.apiPost = api;
})(self);

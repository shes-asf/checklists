// Común al dashboard y a la configuración: llamadas al backend y acceso con email + código de 6 dígitos.
const Panel = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const guardado = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } } };
  let sesion = guardado.get('sesion');
  async function api(body) {
    const url = (self.APP_CONFIG || {}).API_URL;
    if (!/^https?:\/\//.test(url || '')) throw new Error('Falta configurar la dirección del backend en config.js');
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ sesion }, body)) });
    const j = await r.json();
    if (!j.ok && j.error === 'SESION_VENCIDA') { sesion = null; guardado.set('sesion', null); location.reload(); }
    return j;
  }
  /** Muestra el login si hace falta y luego llama a `entrar()`. */
  function iniciar(titulo, entrar) {
    const main = document.querySelector('main');
    if (sesion) return entrar();
    let email = '';
    const pintar = (paso, msg) => {
      main.innerHTML = '<div class="login"><h2 style="margin-top:0">' + esc(titulo) + '</h2>' + (msg ? '<div class="aviso mal">' + esc(msg) + '</div>' : '') +
        (paso === 1 ? '<p>Ingresa con tu correo. Te enviaremos un código de 6 dígitos.</p><input id="em" type="email" placeholder="tu@correo.cl" value="' + esc(email) + '"><button id="ok">Enviar código</button>'
          : '<p>Escribe el código que llegó a <b>' + esc(email) + '</b> (dura 10 minutos).</p><input id="cod" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code"><button id="ok">Entrar</button><p><a href="#" id="otro">Usar otro correo</a></p>') + '</div>';
      const b = main.querySelector('#ok'), inp = main.querySelector('input'); inp.focus();
      inp.onkeydown = e => { if (e.key === 'Enter') b.click(); };
      if (paso === 2) main.querySelector('#otro').onclick = e => { e.preventDefault(); pintar(1); };
      b.onclick = async () => {
        b.disabled = true;
        try {
          if (paso === 1) { email = inp.value.trim().toLowerCase(); const r = await api({ action: 'login_inicio', email }); r.ok ? pintar(2) : pintar(1, r.error); }
          else { const r = await api({ action: 'login_verificar', email, codigo: inp.value.trim() }); if (!r.ok) return pintar(2, r.error); sesion = r.sesion; guardado.set('sesion', sesion); entrar(); }
        } catch (e) { pintar(paso, 'No se pudo conectar: ' + e.message); }
      };
    };
    pintar(1);
  }
  function salir() { sesion = null; guardado.set('sesion', null); location.reload(); }
  return { api, iniciar, salir, esc };
})();

import type { PageLocale } from './cloud-protection.js';
import { escapeHtml } from './cloud-protection-page.js';

/**
 * The preview comments page (architecture 4.13 "Preview comments", decision 111): Codeqlick's own
 * page on a deployment's address, with the preview in a same-origin frame and the overlay script
 * on top. Nothing of the user's site is changed.
 */

export const COMMENTS_PAGE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

export const OVERLAY_HEADERS = {
  'Content-Type': 'application/javascript; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'cross-origin',
} as const;

const COPY: Record<PageLocale, Record<string, string>> = {
  en: {
    title: 'Comments',
    comment: 'Comment',
    cancel: 'Cancel',
    send: 'Send',
    reply: 'Reply',
    resolve: 'Resolve',
    reopen: 'Reopen',
    delete: 'Delete',
    close: 'Close',
    showResolved: 'Show resolved',
    open: 'open',
    inbox: 'Inbox',
    mention: 'Mention…',
    placeholder: 'Write a comment',
    hint: 'Click anywhere on the page to leave a comment.',
    noToken: 'Open the comments from the Codeqlick Cloud console.',
    expired: 'This comments session has expired. Open it again from the console.',
    framed:
      "This site can't be shown in a frame. Allow SAMEORIGIN (X-Frame-Options) or 'self' (frame-ancestors) in codeqlick.json to comment on it.",
    failed: "That didn't work. Try again.",
    resolved: 'Resolved',
  },
  es: {
    title: 'Comentarios',
    comment: 'Comentar',
    cancel: 'Cancelar',
    send: 'Enviar',
    reply: 'Responder',
    resolve: 'Resolver',
    reopen: 'Reabrir',
    delete: 'Borrar',
    close: 'Cerrar',
    showResolved: 'Mostrar resueltos',
    open: 'abiertos',
    inbox: 'Bandeja',
    mention: 'Mencionar…',
    placeholder: 'Escribe un comentario',
    hint: 'Haz clic en cualquier punto de la página para comentar.',
    noToken: 'Abre los comentarios desde la consola de Codeqlick Cloud.',
    expired: 'Esta sesión de comentarios ha caducado. Vuelve a abrirla desde la consola.',
    framed:
      "Este sitio no se puede mostrar en un marco. Permite SAMEORIGIN (X-Frame-Options) o 'self' (frame-ancestors) en codeqlick.json para comentarlo.",
    failed: 'No ha funcionado. Vuelve a probar.',
    resolved: 'Resuelto',
  },
};

/** JSON that is safe inside a `<script type="application/json">`. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function renderCommentsPage(input: { locale: PageLocale; path: string }): string {
  const copy = COPY[input.locale];
  return `<!doctype html>
<html lang="${input.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(copy.title!)} · Codeqlick</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;font:14px/1.4 system-ui,sans-serif;color:#14101f}
#cq-frame{position:fixed;inset:44px 0 0 0;width:100%;height:calc(100% - 44px);border:0;background:#fff}
#cq-bar{position:fixed;top:0;left:0;right:0;height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;background:#14101f;color:#fff;z-index:3;box-sizing:border-box}
#cq-bar b{font-weight:600;margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cq-bar button,#cq-bar a{font:inherit;color:#fff;background:transparent;border:1px solid #5c5768;border-radius:6px;padding:4px 10px;cursor:pointer;text-decoration:none}
#cq-bar button[aria-pressed=true]{background:#d9177e;border-color:#d9177e}
#cq-bar label{display:flex;gap:4px;align-items:center;white-space:nowrap}
#cq-layer{position:fixed;inset:44px 0 0 0;z-index:1;pointer-events:none}
#cq-layer.on{pointer-events:auto;cursor:crosshair;background:rgba(217,23,126,.04)}
.cq-pin{position:absolute;width:26px;height:26px;margin:-26px 0 0 0;border-radius:13px 13px 13px 0;background:#d9177e;color:#fff;border:2px solid #fff;font:600 12px system-ui;cursor:pointer;pointer-events:auto;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.cq-pin.done{background:#5c5768}
#cq-panel{position:fixed;z-index:4;width:300px;max-height:60vh;overflow:auto;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.2);padding:10px}
#cq-panel[hidden],#cq-note[hidden]{display:none}
#cq-panel p{margin:0 0 8px;white-space:pre-wrap;overflow-wrap:anywhere}
#cq-panel small{color:#5c5768;display:block}
#cq-panel textarea{width:100%;box-sizing:border-box;min-height:64px;font:inherit;border:1px solid #ccc;border-radius:6px;padding:6px}
#cq-panel select,#cq-panel button{font:inherit;margin:6px 6px 0 0}
#cq-panel button{border:1px solid #ccc;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer}
#cq-panel button.primary{background:#d9177e;border-color:#d9177e;color:#fff}
#cq-note{position:fixed;z-index:5;left:50%;top:56px;transform:translateX(-50%);max-width:520px;background:#fcEAF3;color:#14101f;border:1px solid #d9177e;border-radius:8px;padding:8px 12px}
</style>
</head>
<body>
<script type="application/json" id="cq-config">${scriptJson({ copy, path: input.path })}</script>
<div id="cq-bar">
<b>${escapeHtml(copy.title!)}</b>
<span id="cq-count"></span>
<label><input type="checkbox" id="cq-resolved"> ${escapeHtml(copy.showResolved!)}</label>
<button type="button" id="cq-mode" aria-pressed="false">${escapeHtml(copy.comment!)}</button>
<a id="cq-inbox" href="#" target="_blank" rel="noopener noreferrer" hidden>${escapeHtml(copy.inbox!)}</a>
</div>
<iframe id="cq-frame" title="Preview"></iframe>
<div id="cq-layer"></div>
<div id="cq-panel" hidden></div>
<div id="cq-note" role="status" hidden></div>
<script src="/__codeqlick/comments/overlay.js"></script>
</body>
</html>
`;
}

/**
 * The overlay: reads the token from the fragment, draws the pins of the frame's current page and
 * talks to `/__codeqlick/comments/api/` with the token in a header. Comment text is only ever
 * set as `textContent`.
 */
export const OVERLAY_SCRIPT = String.raw`(function () {
  'use strict';
  var config = JSON.parse(document.getElementById('cq-config').textContent);
  var copy = config.copy;
  var KEY = 'cq-comments-token';
  var token = null;
  var hash = location.hash.match(/[#&]token=([^&]+)/);
  try {
    if (hash) sessionStorage.setItem(KEY, decodeURIComponent(hash[1]));
    token = sessionStorage.getItem(KEY);
  } catch (e) {
    token = hash ? decodeURIComponent(hash[1]) : null;
  }
  if (hash) history.replaceState(null, '', location.pathname + location.search);

  var frame = document.getElementById('cq-frame');
  var layer = document.getElementById('cq-layer');
  var panel = document.getElementById('cq-panel');
  var note = document.getElementById('cq-note');
  var mode = document.getElementById('cq-mode');
  var showResolved = document.getElementById('cq-resolved');
  var count = document.getElementById('cq-count');
  var inbox = document.getElementById('cq-inbox');
  var me = null;
  var threads = [];
  var currentPath = config.path;

  function el(tag, text, cls) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function say(text) {
    note.textContent = text;
    note.hidden = !text;
  }
  function api(method, path, body) {
    var init = {
      method: method,
      credentials: 'omit',
      headers: { 'X-Codeqlick-Comments': token || '' },
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch('/__codeqlick/comments/api' + path, init).then(function (res) {
      if (res.status === 401) {
        say(copy.expired);
        throw new Error('expired');
      }
      if (!res.ok) {
        say(copy.failed);
        throw new Error(String(res.status));
      }
      return res.status === 204 ? null : res.json();
    });
  }

  function frameDoc() {
    try {
      return frame.contentDocument;
    } catch (e) {
      return null;
    }
  }
  function metrics() {
    var doc = frameDoc();
    if (!doc || !doc.documentElement) return null;
    var win = frame.contentWindow;
    return {
      doc: doc,
      sx: win.scrollX,
      sy: win.scrollY,
      w: Math.max(doc.documentElement.scrollWidth, 1),
      h: Math.max(doc.documentElement.scrollHeight, 1),
    };
  }
  function selectorOf(node) {
    var steps = [];
    while (node && node.nodeType === 1 && steps.length < 5) {
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
        steps.unshift('#' + node.id);
        break;
      }
      var tag = node.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body') break;
      var n = 1;
      var sib = node;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === node.tagName) n++;
      steps.unshift(tag + ':nth-of-type(' + n + ')');
      node = node.parentElement;
    }
    var out = steps.join(' > ');
    return out ? out.slice(0, 500) : null;
  }
  function mentionsIn(body, picked) {
    return picked
      .filter(function (m) {
        return body.indexOf('@' + m.name) !== -1;
      })
      .map(function (m) {
        return m.id;
      });
  }
  function composer(onSend, label) {
    var box = el('div');
    var text = el('textarea');
    text.placeholder = copy.placeholder;
    text.maxLength = 2000;
    var picked = [];
    var select = el('select');
    select.appendChild(el('option', copy.mention));
    (me ? me.members : []).forEach(function (m) {
      if (m.id === me.user.id) return;
      var opt = el('option', m.name);
      opt.value = m.id;
      select.appendChild(opt);
    });
    select.onchange = function () {
      var m = (me ? me.members : []).filter(function (x) {
        return x.id === select.value;
      })[0];
      if (m) {
        picked.push(m);
        text.value += (text.value && !/\s$/.test(text.value) ? ' ' : '') + '@' + m.name + ' ';
        text.focus();
      }
      select.selectedIndex = 0;
    };
    var send = el('button', label, 'primary');
    send.type = 'button';
    send.onclick = function () {
      var body = text.value.trim();
      if (!body) return;
      send.disabled = true;
      onSend(body, mentionsIn(body, picked)).then(
        function () {},
        function () {
          send.disabled = false;
        },
      );
    };
    box.appendChild(text);
    if (select.options.length > 1) box.appendChild(select);
    box.appendChild(send);
    return { box: box, text: text };
  }
  function place(x, y) {
    var left = Math.min(Math.max(8, x + 12), window.innerWidth - 316);
    var top = Math.min(Math.max(52, y), window.innerHeight - 200);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.hidden = false;
  }
  function closePanel() {
    panel.hidden = true;
    panel.textContent = '';
  }

  function render() {
    layer.querySelectorAll('.cq-pin').forEach(function (pin) {
      pin.remove();
    });
    var open = threads.filter(function (t) {
      return !t.resolvedAt;
    }).length;
    count.textContent = open + ' ' + copy.open;
    var m = metrics();
    if (!m) return;
    var n = 0;
    threads.forEach(function (t) {
      if (t.path !== currentPath) return;
      n++;
      if (t.resolvedAt && !showResolved.checked) return;
      var pin = el('button', String(n), 'cq-pin' + (t.resolvedAt ? ' done' : ''));
      pin.type = 'button';
      pin.style.left = (t.x / 100) * m.w - m.sx + 'px';
      pin.style.top = (t.y / 100) * m.h - m.sy + 'px';
      pin.onclick = function (event) {
        event.stopPropagation();
        openThread(t, event.clientX, event.clientY);
      };
      layer.appendChild(pin);
    });
  }
  function load() {
    return api('GET', '/threads').then(function (data) {
      threads = data.items;
      render();
    });
  }
  function openThread(t, x, y) {
    panel.textContent = '';
    if (t.selector) {
      var doc = frameDoc();
      try {
        var target = doc && doc.querySelector(t.selector);
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'nearest' });
      } catch (e) {}
    }
    t.comments.forEach(function (c) {
      panel.appendChild(el('small', c.author.name + ' · ' + new Date(c.createdAt).toLocaleString()));
      panel.appendChild(el('p', c.body));
      if (me && (c.author.id === me.user.id || me.admin)) {
        var del = el('button', copy.delete);
        del.type = 'button';
        del.onclick = function () {
          api('DELETE', '/threads/' + t.id + '/comments/' + c.id).then(function () {
            closePanel();
            return load();
          });
        };
        panel.appendChild(del);
      }
    });
    if (t.resolvedAt) panel.appendChild(el('small', copy.resolved));
    var reply = composer(function (body, mentions) {
      return api('POST', '/threads/' + t.id + '/comments', { body: body, mentions: mentions }).then(
        function () {
          closePanel();
          return load();
        },
      );
    }, copy.reply);
    panel.appendChild(reply.box);
    var toggle = el('button', t.resolvedAt ? copy.reopen : copy.resolve);
    toggle.type = 'button';
    toggle.onclick = function () {
      api('PATCH', '/threads/' + t.id, { resolved: !t.resolvedAt }).then(function () {
        closePanel();
        return load();
      });
    };
    panel.appendChild(toggle);
    var close = el('button', copy.close);
    close.type = 'button';
    close.onclick = closePanel;
    panel.appendChild(close);
    place(x, y);
  }

  layer.addEventListener('click', function (event) {
    if (!layer.classList.contains('on')) return;
    var m = metrics();
    if (!m) return;
    var rect = frame.getBoundingClientRect();
    var fx = event.clientX - rect.left;
    var fy = event.clientY - rect.top;
    var x = Math.min(100, Math.max(0, ((fx + m.sx) / m.w) * 100));
    var y = Math.min(100, Math.max(0, ((fy + m.sy) / m.h) * 100));
    var target = m.doc.elementFromPoint(fx, fy);
    var selector = target ? selectorOf(target) : null;
    panel.textContent = '';
    var box = composer(function (body, mentions) {
      return api('POST', '/threads', {
        path: currentPath,
        x: x,
        y: y,
        selector: selector,
        viewportWidth: Math.max(200, Math.min(10000, Math.round(rect.width))),
        body: body,
        mentions: mentions,
      }).then(function () {
        closePanel();
        setMode(false);
        return load();
      });
    }, copy.send);
    panel.appendChild(box.box);
    var cancel = el('button', copy.cancel);
    cancel.type = 'button';
    cancel.onclick = closePanel;
    panel.appendChild(cancel);
    place(event.clientX, event.clientY);
    box.text.focus();
  });

  function setMode(on) {
    mode.setAttribute('aria-pressed', on ? 'true' : 'false');
    layer.classList.toggle('on', on);
    if (on) say(copy.hint);
    else if (note.textContent === copy.hint) say('');
  }
  mode.onclick = function () {
    setMode(mode.getAttribute('aria-pressed') !== 'true');
  };
  showResolved.onchange = render;
  window.addEventListener('resize', render);

  frame.addEventListener('load', function () {
    var doc = frameDoc();
    if (!doc || !frame.contentWindow) {
      say(copy.framed);
      return;
    }
    var loc = frame.contentWindow.location;
    if (loc.href === 'about:blank') {
      say(copy.framed);
      return;
    }
    currentPath = loc.pathname + loc.search;
    history.replaceState(null, '', location.pathname + '?path=' + encodeURIComponent(currentPath));
    frame.contentWindow.addEventListener('scroll', render, { passive: true });
    frame.contentWindow.addEventListener('resize', render);
    closePanel();
    render();
  });
  frame.src = config.path;

  if (!token) {
    mode.disabled = true;
    say(copy.noToken);
    return;
  }
  api('GET', '/me')
    .then(function (data) {
      me = data;
      if (data.inboxUrl) {
        inbox.href = data.inboxUrl;
        inbox.hidden = false;
      }
      return load();
    })
    .catch(function () {
      mode.disabled = true;
    });
})();
`;

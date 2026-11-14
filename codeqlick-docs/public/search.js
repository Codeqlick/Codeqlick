// Search of the documentation: no dependencies, no requests until the box is used.
// The index (/search-<lang>.json) is [{ url, title, description, headings: [{ text, id }], text }].
(function () {
  var root = document.querySelector('[data-search]');
  if (!root) return;
  var input = root.querySelector('input');
  var list = root.querySelector('[role=listbox]');
  var status = root.querySelector('[data-status]');
  var index = null;
  var loading = null;
  var shown = [];
  var active = -1;

  // Lowercase and without accents, so "configuracion" finds "configuración".
  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function load() {
    if (!loading) {
      loading = fetch(root.dataset.index)
        .then(function (r) {
          return r.json();
        })
        .then(function (pages) {
          index = pages.map(function (p) {
            return {
              p: p,
              title: norm(p.title),
              desc: norm(p.description),
              heads: p.headings.map(function (h) {
                return norm(h.text);
              }),
              text: norm(p.text),
            };
          });
        })
        .catch(function () {
          index = [];
          loading = null; // try again next time
        });
    }
    return loading;
  }

  function search(query) {
    var terms = norm(query).split(/\s+/).filter(Boolean);
    if (!terms.length || !index) return [];
    var results = [];
    index.forEach(function (e) {
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i];
        var s = 0;
        if (e.title.indexOf(t) >= 0) s += e.title.indexOf(t) === 0 ? 14 : 10;
        if (
          e.heads.some(function (h) {
            return h.indexOf(t) >= 0;
          })
        )
          s += 4;
        if (e.desc.indexOf(t) >= 0) s += 3;
        if (e.text.indexOf(t) >= 0) s += 1;
        if (!s) return; // every term must match
        score += s;
      }
      // A heading with every term: link to it. Otherwise show where the first term is.
      var heading = null;
      e.heads.some(function (h, n) {
        if (
          terms.every(function (t) {
            return h.indexOf(t) >= 0;
          })
        ) {
          heading = e.p.headings[n];
          return true;
        }
      });
      results.push({ page: e.p, score: score, heading: heading, text: e.text, term: terms[0] });
    });
    results.sort(function (a, b) {
      return b.score - a.score;
    });
    return results.slice(0, 8);
  }

  function snippet(r) {
    if (r.heading) return r.heading.text;
    var plain = r.page.text;
    var at = r.text.indexOf(r.term); // same offsets as the original text in nearly every case
    if (at < 0) return r.page.description;
    var from = Math.max(0, at - 40);
    return (from ? '… ' : '') + plain.slice(from, from + 110).trim() + ' …';
  }

  function span(cls, text) {
    var el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    return el;
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function setActive(n) {
    var items = list.children;
    if (active >= 0 && items[active]) items[active].setAttribute('aria-selected', 'false');
    active = n;
    if (n >= 0 && items[n]) {
      items[n].setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', items[n].id);
      items[n].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function render() {
    var query = input.value.trim();
    list.textContent = '';
    active = -1;
    input.removeAttribute('aria-activedescendant');
    if (!query) {
      close();
      status.textContent = '';
      return;
    }
    shown = search(query);
    if (!shown.length) {
      var none = document.createElement('li');
      none.className = 'r-empty';
      none.textContent = root.dataset.empty;
      none.setAttribute('role', 'presentation');
      list.appendChild(none);
      status.textContent = root.dataset.empty;
    } else {
      shown.forEach(function (r, n) {
        var li = document.createElement('li');
        li.id = 'search-result-' + n;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        var a = document.createElement('a');
        a.href = r.page.url + (r.heading ? '#' + r.heading.id : '');
        a.tabIndex = -1;
        a.appendChild(span('r-title', r.page.title));
        a.appendChild(span('r-sub', snippet(r)));
        li.appendChild(a);
        list.appendChild(li);
      });
      status.textContent = root.dataset.count.replace('{n}', String(shown.length));
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  root.hidden = false;
  input.addEventListener('focus', function () {
    load().then(function () {
      if (input.value.trim()) render();
    });
  });
  input.addEventListener('input', function () {
    load().then(render);
  });
  input.addEventListener('keydown', function (e) {
    var open = !list.hidden && shown.length > 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open) return;
      e.preventDefault();
      var last = shown.length - 1;
      var step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(active < 0 ? (step > 0 ? 0 : last) : (active + step + shown.length) % shown.length);
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      var a = list.children[active < 0 ? 0 : active].querySelector('a');
      if (a) location.href = a.href;
    } else if (e.key === 'Escape') {
      if (!list.hidden) {
        e.preventDefault();
        close();
      } else if (input.value) {
        input.value = '';
      } else {
        input.blur();
      }
    }
  });
  // Keep focus in the box while clicking a result.
  list.addEventListener('mousedown', function (e) {
    e.preventDefault();
  });
  root.addEventListener('focusout', function (e) {
    if (!root.contains(e.relatedTarget)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    var tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) {
      return;
    }
    e.preventDefault();
    input.focus();
    input.select();
  });
})();

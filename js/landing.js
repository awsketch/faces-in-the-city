// landing.js — populates the list of sketches on the home page.

(async function () {
  const list = document.getElementById('sketch-list');

  try {
    const res = await fetch('sketches/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Could not load sketches index (${res.status})`);
    const data = await res.json();

    if (!data.sketches || data.sketches.length === 0) {
      list.innerHTML = '<li class="sketch-list__loading">No sketches yet.</li>';
      return;
    }

    list.innerHTML = '';
    for (const s of data.sketches) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `sketch.html?id=${encodeURIComponent(s.id)}`;
      a.innerHTML = `
        <span class="meta">
          <span class="title">${escapeHtml(s.title)}</span>
          ${s.location ? `<span class="location">${escapeHtml(s.location)}</span>` : ''}
        </span>
        <span class="arrow">›</span>
      `;
      li.appendChild(a);
      list.appendChild(li);
    }
  } catch (err) {
    console.error(err);
    list.innerHTML = `<li class="sketch-list__loading">Couldn't load sketches: ${escapeHtml(err.message)}</li>`;
  }
})();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

(() => {
  const lum = (rgb) => {
    const m = rgb.match(/\d+/g);
    if (!m) return null;
    const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const effBg = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)') return bg;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const bad = [];
  document.querySelectorAll('button, p, span, h1, h2, h3, li, div, td').forEach(el => {
    if (!el.textContent.trim() || el.children.length > 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 10) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.5) return;
    const l1 = lum(cs.color), l2 = lum(effBg(el));
    if (l1 === null || l2 === null) return;
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio < 2.8) bad.push(el.textContent.trim().slice(0, 30) + ' [' + Math.round(ratio * 10) / 10 + ':1]');
  });
  return bad.length ? JSON.stringify([...new Set(bad)].slice(0, 12)) : 'ALL PASS';
})()

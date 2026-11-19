// Sélecteur de filament commun (Relief SVG, Modèle 3D, CANVAS) :
// matière ou filament personnalisé + type (haute vitesse / standard / vitesse personnalisée),
// avec le débit calculé pour la vitesse choisie.
import {
  FAMILIES, SPEEDS, familyOf, speedOf, customSpeedOf, matIdOf, materialProfile, customFilaments, flowForSpeed, getCustomFilament,
} from './materials.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fr = (n) => String(n).replace('.', ',');

/**
 * Remplit `box` avec le sélecteur. opts : { value, printer, onChange(id), compact, exclude: ['tpu'] , canvas }
 * Renvoie { set(value) }.
 */
export function materialPicker(box, opts) {
  let value = opts.value || 'petg_hs';
  box.classList.add('matpick');
  box.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'matpick-row';
  const fam = document.createElement('select');
  fam.setAttribute('aria-label', 'Matière ou filament');
  const spd = document.createElement('select');
  spd.setAttribute('aria-label', 'Type de filament');
  const num = document.createElement('input');
  num.type = 'number'; num.min = '10'; num.max = '500'; num.step = '5';
  num.inputMode = 'numeric';
  num.setAttribute('aria-label', 'Vitesse en mm/s');
  num.className = 'matpick-speed';
  const unit = document.createElement('span');
  unit.className = 'matpick-unit';
  unit.textContent = 'mm/s';
  const info = document.createElement('small');
  info.className = 'matpick-info';
  row.append(fam, spd, num, unit);
  box.append(row, info);

  function options() {
    const groups = [];
    const base = Object.entries(FAMILIES)
      .filter(([k]) => !(opts.exclude || []).includes(k))
      .map(([k, f]) => `<option value="${k}">${esc(f.label)}${opts.canvas && k === 'tpu' ? ' — hors CANVAS' : ''}</option>`).join('');
    groups.push(`<optgroup label="Matières">${base}</optgroup>`);
    const mine = customFilaments().filter((c) => !(opts.exclude || []).includes(familyOf(c.base)));
    if (mine.length) groups.push(`<optgroup label="Mes filaments">${mine.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</optgroup>`);
    fam.innerHTML = groups.join('');
    spd.innerHTML = Object.entries(opts.compact ? { hs: 'HS rapide', std: 'Standard', custom: 'Perso…' } : SPEEDS)
      .map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  }

  function render() {
    // Filament personnalisé supprimé entre-temps : retour au PETG HS
    if (value.startsWith('cust:') && !getCustomFilament(value)) value = 'petg_hs';
    const isCustomFil = value.startsWith('cust:');
    fam.value = isCustomFil ? value : familyOf(value);
    if (!fam.value) fam.value = familyOf(value);
    const sp = isCustomFil ? 'hs' : speedOf(value);
    spd.value = sp;
    const F = FAMILIES[familyOf(value)];
    spd.hidden = isCustomFil;
    // TPU / nylon : pas de version HS, mais une vitesse personnalisée possible
    for (const o of spd.options) o.disabled = o.value === 'hs' && !F.hs;
    const showNum = !isCustomFil && sp === 'custom';
    num.hidden = unit.hidden = !showNum;
    if (showNum) num.value = String(customSpeedOf(value));
    const p = materialProfile(value, opts.printer());
    if (isCustomFil) {
      info.textContent = `${p.name} · buse ${p.nozzle} °C · plateau ${p.bed} °C · ${p.speeds ? 'réglages experts' : `${p.speedCap} mm/s`}`;
    } else if (sp === 'custom') {
      info.innerHTML = `Débit nécessaire <b>${fr(p.flowNeeded)} mm³/s</b> (max du filament ${fr(p.flowMax)}) · buse ${p.nozzle} °C`
        + (p.limited ? ` · <span class="warn">trop rapide : limité à ${p.speedMax} mm/s</span>` : '');
    } else {
      const v = p.speedCap || null;
      info.textContent = `${p.name} · buse ${p.nozzle} °C · plateau ${p.bed} °C · ${v ? `${v} mm/s max · ${fr(flowForSpeed(v))} mm³/s` : `jusqu'à ${fr(p.maxVolumetric)} mm³/s`}`;
    }
    box.classList.toggle('limited', !!p.limited);
  }

  const emit = (id) => { value = id; render(); opts.onChange && opts.onChange(id); };
  fam.addEventListener('change', () => {
    if (fam.value.startsWith('cust:')) return emit(fam.value);
    const sp = spd.value === 'custom' ? 'custom' : spd.value;
    const F = FAMILIES[fam.value];
    emit(matIdOf(fam.value, sp === 'hs' && !F.hs ? 'std' : sp, customSpeedOf(value) || 80));
  });
  spd.addEventListener('change', () => emit(matIdOf(familyOf(value), spd.value, customSpeedOf(value) || (spd.value === 'custom' ? 80 : 50))));
  num.addEventListener('change', () => {
    const v = Math.max(10, Math.min(500, Math.round(+num.value || 80)));
    emit(matIdOf(familyOf(value), 'custom', v));
  });

  options();
  render();
  return {
    set(v) { value = v || value; options(); render(); },
    refresh() { options(); render(); },
  };
}

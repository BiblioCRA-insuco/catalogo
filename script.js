/* ====================== CONFIGURACIÓN ====================== */
// Reemplaza estos valores por los de tu Google Sheet publicado.
// Sheet > Archivo > Compartir > Publicar en la web > selecciona cada
// hoja por separado y formato CSV. Copia la URL resultante aquí.

const SHEET_ID = "1HmH2iZ8zk01LCoIZaRiBoRmXlVgEWi5-pDBR3QQEqsM";
const GID_LIBROS = "0";       // gid de la pestaña "Libros"
const GID_RECURSOS = "2023874833"; // gid de la pestaña "Recursos"

const CSV_URL_LIBROS   = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID_LIBROS}`;
const CSV_URL_RECURSOS = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID_RECURSOS}`;

/* ====================== ESTADO ====================== */
let allItems = [];
let currentView = 'list';
let filters = { tipo:'', autor:'', apto:'', asignatura:'', tema:'', q:'' };

/* ====================== UTILIDADES ====================== */

// Parser CSV simple que respeta comillas y comas/saltos internos
function parseCSV(text){
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for(let i=0; i<text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += c; }
    } else {
      if(c === '"'){ inQuotes = true; }
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else if(c === '\r'){ /* skip */ }
      else { field += c; }
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows;
}

function csvToObjects(text){
  const rows = parseCSV(text).filter(r => r.some(c => c.trim() !== ''));
  if(rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = (r[i] ?? '').trim());
    return obj;
  });
}

// Convierte un link de Google Drive a un link de imagen directo
function driveImageUrl(link){
  if(!link) return '';
  const m = link.match(/\/d\/([a-zA-Z0-9_-]+)/) || link.match(/id=([a-zA-Z0-9_-]+)/);
  if(m){ return `https://lh3.googleusercontent.com/d/${m[1]}=w400`; }
  return link; // ya es una URL directa
}

function splitMulti(str){
  return (str || '').split(';').map(s => s.trim()).filter(Boolean);
}

function escapeHtml(str){
  return (str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ====================== CARGA DE DATOS ====================== */

async function loadSheet(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error('No se pudo cargar la hoja: ' + res.status);
  const text = await res.text();
  return csvToObjects(text);
}

async function init(){
  const status = document.getElementById('statusLine');
  try{
    const [libros, recursos] = await Promise.all([
      loadSheet(CSV_URL_LIBROS),
      loadSheet(CSV_URL_RECURSOS)
    ]);

    const librosNorm = libros.map(r => ({
      _tipo: 'libro',
      _id: r['Row ID'],
      titulo: r['Título'],
      subtitulo: r['Subtítulo'],
      autores: r['Autores'],
      apto: r['Apto para'],
      asignaturas: r['Asignaturas'],
      temas: r['Temas'],
      cantidad: r['Cantidad'],
      descripcion: r['Descripción'],
      imagen: '', // los libros no tienen imagen en esta hoja
      raw: r
    }));

    const recursosNorm = recursos.map(r => ({
      _tipo: 'recurso',
      _id: r['Row ID'],
      titulo: r['Recurso'],
      subtitulo: r['Categoría'],
      autores: '',
      apto: '',
      asignaturas: '',
      temas: r['Categoría'],
      cantidad: r['Cantidad total'],
      descripcion: r['Descripción'],
      imagen: driveImageUrl(r['Imagen']),
      raw: r
    }));

    allItems = [...librosNorm, ...recursosNorm];
    status.textContent = `${allItems.length} ítems cargados · actualizado al abrir la página`;

    populateFilters();
    render();
  } catch(err){
    console.error(err);
    status.textContent = 'No se pudo cargar el catálogo';
    document.getElementById('resultsContainer').innerHTML = `
      <div class="state-msg">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h3>No se pudo conectar con el catálogo</h3>
        <p>Verifica que el Google Sheet esté publicado en la web (Archivo → Compartir → Publicar en la web) y que el SHEET_ID y los gid de cada hoja sean correctos en el código.</p>
      </div>`;
  }
}

/* ====================== FILTROS ====================== */

function populateFilters(){
  const autores = new Set();
  const aptos = new Set();
  const asignaturas = new Set();
  const temas = new Set();

  allItems.forEach(item => {
    splitMulti(item.autores).forEach(a => autores.add(a));
    splitMulti(item.apto).forEach(a => aptos.add(a));
    splitMulti(item.asignaturas).forEach(a => asignaturas.add(a));
    splitMulti(item.temas).forEach(a => temas.add(a));
  });

  fillSelect('filterAutor', autores, 'Todos los autores');
  fillSelect('filterApto', aptos, 'Todos los cursos/niveles');
  fillSelect('filterAsignatura', asignaturas, 'Todas las asignaturas');
  fillSelect('filterTema', temas, 'Todos los temas');
}

function fillSelect(id, valuesSet, placeholder){
  const sel = document.getElementById(id);
  const values = [...valuesSet].sort((a,b) => a.localeCompare(b, 'es'));
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function applyFilters(){
  const q = filters.q.toLowerCase();
  return allItems.filter(item => {
    if(filters.tipo && item._tipo !== filters.tipo) return false;
    if(filters.autor && !splitMulti(item.autores).includes(filters.autor)) return false;
    if(filters.apto && !splitMulti(item.apto).includes(filters.apto)) return false;
    if(filters.asignatura && !splitMulti(item.asignaturas).includes(filters.asignatura)) return false;
    if(filters.tema && !splitMulti(item.temas).includes(filters.tema)) return false;
    if(q){
      const hay = `${item.titulo} ${item.subtitulo} ${item.autores} ${item.temas}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ====================== RENDER ====================== */

function render(){
  const filtered = applyFilters();
  updateCounts();
  updateActiveFilters();

  document.getElementById('resultCount').textContent = filtered.length;

  const container = document.getElementById('resultsContainer');

  if(filtered.length === 0){
    container.innerHTML = `
      <div class="state-msg">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
        <h3>Sin resultados</h3>
        <p>No hay ítems que coincidan con tu búsqueda o filtros. Intenta con otros términos o limpia los filtros.</p>
      </div>`;
    return;
  }

  if(currentView === 'grid'){
    container.innerHTML = `<div class="grid">${filtered.map(cardHtml).join('')}</div>`;
  } else {
    container.innerHTML = `<div class="list">
      <div class="list-row head">
        <div></div>
        <div>Título</div>
        <div>Autor / Categoría</div>
        <div>Detalles</div>
        <div style="text-align:right">Cant.</div>
      </div>
      ${filtered.map(listRowHtml).join('')}
    </div>`;
  }

  // bind click events
  container.querySelectorAll('[data-item-id]').forEach(el => {
    el.addEventListener('click', () => {
      const item = allItems.find(i => i._id === el.dataset.itemId);
      if(item) openModal(item);
    });
  });
}

function coverImg(item, sizeClass){
  if(item.imagen){
    return `<img src="${escapeHtml(item.imagen)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML=fallbackCover('${item._tipo}')">`;
  }
  return fallbackCover(item._tipo);
}

function fallbackCover(tipo){
  const icon = tipo === 'recurso'
    ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`
    : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
  return `<div class="cover-fallback">${icon}${tipo === 'recurso' ? 'Sin imagen' : 'Sin portada'}</div>`;
}

function cardHtml(item){
  const badge = item._tipo === 'recurso'
    ? `<span class="badge-type recurso">Recurso</span>`
    : `<span class="badge-type libro">Libro</span>`;
  const sub = item._tipo === 'recurso'
    ? item.subtitulo
    : (splitMulti(item.autores)[0] || '');

  return `
    <div class="card" data-item-id="${escapeHtml(item._id)}">
      <div class="card-cover">
        ${badge}
        ${coverImg(item)}
      </div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(item.titulo)}${item.subtitulo && item._tipo==='libro' ? ', ' + escapeHtml(item.subtitulo) : ''}</p>
        <p class="card-sub">${escapeHtml(sub)}</p>
        <div class="card-foot">
          <span>${escapeHtml(item._tipo === 'recurso' ? 'Recurso' : (splitMulti(item.apto)[0] || 'General'))}</span>
          <span class="qty-tag">×${escapeHtml(item.cantidad || '0')}</span>
        </div>
      </div>
    </div>`;
}

function listRowHtml(item){
  const autorOrCat = item._tipo === 'recurso' ? item.subtitulo : item.autores;
  const detalle = item._tipo === 'recurso' ? item.temas : (item.apto || item.temas);
  return `
    <div class="list-row" data-item-id="${escapeHtml(item._id)}">
      <div class="list-thumb">${coverImg(item)}</div>
      <div class="list-main">
        <p class="t">${escapeHtml(item.titulo)}${item.subtitulo && item._tipo==='libro' ? ', ' + escapeHtml(item.subtitulo) : ''}</p>
        <p class="s">${escapeHtml(item._tipo === 'recurso' ? 'Recurso' : 'Libro')}</p>
      </div>
      <div class="list-col">${escapeHtml(autorOrCat || '—')}</div>
      <div class="list-col muted">${escapeHtml(detalle || '—')}</div>
      <div class="list-qty">×${escapeHtml(item.cantidad || '0')}</div>
    </div>`;
}

function updateCounts(){
  document.getElementById('countAll').textContent = allItems.length;
  document.getElementById('countLibros').textContent = allItems.filter(i => i._tipo === 'libro').length;
  document.getElementById('countRecursos').textContent = allItems.filter(i => i._tipo === 'recurso').length;
}

function updateActiveFilters(){
  const map = [
    ['autor', filters.autor],
    ['apto', filters.apto],
    ['asignatura', filters.asignatura],
    ['tema', filters.tema],
  ];
  const container = document.getElementById('activeFilters');
  container.innerHTML = map
    .filter(([,v]) => v)
    .map(([key,v]) => `<span class="chip">${escapeHtml(v)}<button data-clear="${key}">×</button></span>`)
    .join('');

  container.querySelectorAll('[data-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.clear;
      filters[key] = '';
      document.getElementById('filter' + key.charAt(0).toUpperCase() + key.slice(1)).value = '';
      render();
    });
  });
}

/* ====================== MODAL ====================== */

function openModal(item){
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');

  const isLibro = item._tipo === 'libro';
  const r = item.raw;

  let fields = [];
  if(isLibro){
    fields = [
      ['Autores', r['Autores']],
      ['Editorial', r['Editorial']],
      ['Año edición', r['Año edición']],
      ['ISBN', r['ISBN']],
      ['Idioma', r['Idioma']],
      ['Ficción', r['Ficción']],
      ['Apto para', r['Apto para']],
      ['Asignaturas', r['Asignaturas']],
      ['Temas', r['Temas']],
      ['N° páginas', r['Número páginas']],
      ['Serie / volumen', [r['Serie o colección'], r['Volumen']].filter(Boolean).join(' — ')],
      ['Plan lector', r['Pertenece plan lector']],
    ];
  } else {
    fields = [
      ['Categoría', r['Categoría']],
      ['Cantidad total', r['Cantidad total']],
      ['Recomendaciones', r['Recomendaciones']],
    ];
  }
  fields = fields.filter(([,v]) => v && v.trim());

  content.innerHTML = `
    <button class="modal-close" id="modalCloseBtn" aria-label="Cerrar">×</button>
    <div class="modal-inner">
      <div class="modal-cover">${coverImg(item)}</div>
      <div>
        <div class="modal-type ${item._tipo}">${item._tipo === 'recurso' ? 'Recurso' : 'Libro'}</div>
        <h3 class="modal-title">${escapeHtml(item.titulo)}</h3>
        ${item.subtitulo && isLibro ? `<p class="modal-sub">${escapeHtml(item.subtitulo)}</p>` : ''}
        <div class="modal-fields">
          ${fields.map(([k,v]) => `<div class="field"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`).join('')}
          <div class="field full"><div class="k">Disponibles</div><div class="v">${escapeHtml(item.cantidad || '0')}</div></div>
        </div>
        ${item.descripcion ? `<div class="modal-desc"><h4>Descripción</h4><p>${escapeHtml(item.descripcion)}</p></div>` : ''}
        ${r['Notas'] ? `<div class="modal-notes">${escapeHtml(r['Notas'])}</div>` : ''}
      </div>
    </div>`;

  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  overlay.classList.add('open');
}

function closeModal(){
  document.getElementById('modalOverlay').classList.remove('open');
}

/* ====================== EVENTOS ====================== */

document.getElementById('searchInput').addEventListener('input', e => {
  filters.q = e.target.value;
  render();
});

document.querySelectorAll('#typePills button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#typePills button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filters.tipo = btn.dataset.type;
    render();
  });
});

['Autor','Apto','Asignatura','Tema'].forEach(name => {
  document.getElementById('filter' + name).addEventListener('change', e => {
    filters[name.toLowerCase()] = e.target.value;
    render();
  });
});

document.getElementById('clearFilters').addEventListener('click', () => {
  filters = { tipo:'', autor:'', apto:'', asignatura:'', tema:'', q:'' };
  document.querySelectorAll('select').forEach(s => s.value = '');
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('#typePills button').forEach(b => b.classList.remove('active'));
  document.querySelector('#typePills button[data-type=""]').classList.add('active');
  render();
});

document.getElementById('btnGrid').addEventListener('click', () => {
  currentView = 'grid';
  document.getElementById('btnGrid').classList.add('active');
  document.getElementById('btnList').classList.remove('active');
  render();
});
document.getElementById('btnList').addEventListener('click', () => {
  currentView = 'list';
  document.getElementById('btnList').classList.add('active');
  document.getElementById('btnGrid').classList.remove('active');
  render();
});

document.getElementById('modalOverlay').addEventListener('click', e => {
  if(e.target.id === 'modalOverlay') closeModal();
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') closeModal();
});

/* ====================== INICIO ====================== */
init();
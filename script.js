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
let allLibros = [];
let allRecursos = [];
let currentTab = 'libros'; // 'libros' | 'recursos'
let currentView = 'list';  // 'list' | 'grid'

let filters = {
  libros:   { autor:'', apto:'', asignatura:'', tema:'', q:'' },
  recursos: { categoria:'', q:'' }
};

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

    allLibros = libros.map(r => ({
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

    allRecursos = recursos.map(r => ({
      _tipo: 'recurso',
      _id: r['Row ID'],
      titulo: r['Recurso'],
      subtitulo: r['Categoría'],
      categoria: r['Categoría'],
      cantidad: r['Cantidad total'],
      descripcion: r['Descripción'],
      imagen: driveImageUrl(r['Imagen']),
      raw: r
    }));

    const total = allLibros.length + allRecursos.length;
    status.textContent = `${total} ítems cargados · actualizado al abrir la página`;

    document.getElementById('countLibros').textContent = allLibros.length;
    document.getElementById('countRecursos').textContent = allRecursos.length;

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
  // Libros
  const autores = new Set();
  const aptos = new Set();
  const asignaturas = new Set();
  const temas = new Set();

  allLibros.forEach(item => {
    splitMulti(item.autores).forEach(a => autores.add(a));
    splitMulti(item.apto).forEach(a => aptos.add(a));
    splitMulti(item.asignaturas).forEach(a => asignaturas.add(a));
    splitMulti(item.temas).forEach(a => temas.add(a));
  });

  fillSelect('filterAutor', autores, 'Todos los autores');
  fillSelect('filterApto', aptos, 'Todos los cursos/niveles');
  fillSelect('filterAsignatura', asignaturas, 'Todas las asignaturas');
  fillSelect('filterTema', temas, 'Todos los temas');

  // Recursos
  const categorias = new Set();
  allRecursos.forEach(item => {
    splitMulti(item.categoria).forEach(c => categorias.add(c));
  });
  fillSelect('filterCategoria', categorias, 'Todas las categorías');
}

function fillSelect(id, valuesSet, placeholder){
  const sel = document.getElementById(id);
  const values = [...valuesSet].sort((a,b) => a.localeCompare(b, 'es'));
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function applyFilters(){
  const f = filters[currentTab];
  const q = f.q.toLowerCase();

  if(currentTab === 'libros'){
    return allLibros.filter(item => {
      if(f.autor && !splitMulti(item.autores).includes(f.autor)) return false;
      if(f.apto && !splitMulti(item.apto).includes(f.apto)) return false;
      if(f.asignatura && !splitMulti(item.asignaturas).includes(f.asignatura)) return false;
      if(f.tema && !splitMulti(item.temas).includes(f.tema)) return false;
      if(q){
        const hay = `${item.titulo} ${item.subtitulo} ${item.autores} ${item.temas}`.toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  } else {
    return allRecursos.filter(item => {
      if(f.categoria && !splitMulti(item.categoria).includes(f.categoria)) return false;
      if(q){
        const hay = `${item.titulo} ${item.categoria} ${item.descripcion}`.toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  }
}

/* ====================== RENDER ====================== */

function render(){
  const filtered = applyFilters();
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
    container.innerHTML = currentTab === 'libros'
      ? tableHtmlLibros(filtered)
      : tableHtmlRecursos(filtered);
  }

  // bind click events
  container.querySelectorAll('[data-item-id]').forEach(el => {
    el.addEventListener('click', () => {
      const source = currentTab === 'libros' ? allLibros : allRecursos;
      const item = source.find(i => i._id === el.dataset.itemId);
      if(item) openModal(item);
    });
  });
}

function coverImg(item){
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

/* ---- Vista de tarjetas (grid) ---- */

function cardHtml(item){
  if(item._tipo === 'recurso'){
    return `
      <div class="card" data-item-id="${escapeHtml(item._id)}">
        <div class="card-cover">
          <span class="badge-type recurso">Recurso</span>
          ${coverImg(item)}
        </div>
        <div class="card-body">
          <p class="card-title">${escapeHtml(item.titulo)}</p>
          <p class="card-sub">${escapeHtml(item.categoria)}</p>
          <div class="card-foot">
            <span>Recurso</span>
            <span class="qty-tag">×${escapeHtml(item.cantidad || '0')}</span>
          </div>
        </div>
      </div>`;
  }

  const autorPrincipal = splitMulti(item.autores)[0] || '';
  return `
    <div class="card" data-item-id="${escapeHtml(item._id)}">
      <div class="card-cover">
        <span class="badge-type libro">Libro</span>
        ${coverImg(item)}
      </div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(item.titulo)}${item.subtitulo ? ', ' + escapeHtml(item.subtitulo) : ''}</p>
        <p class="card-sub">${escapeHtml(autorPrincipal)}</p>
        <div class="card-foot">
          <span>${escapeHtml(splitMulti(item.apto)[0] || 'General')}</span>
          <span class="qty-tag">×${escapeHtml(item.cantidad || '0')}</span>
        </div>
      </div>
    </div>`;
}

/* ---- Vista de tabla (lista) ---- */

function tableHtmlLibros(items){
  const rows = items.map(item => `
    <tr data-item-id="${escapeHtml(item._id)}">
      <td class="col-title">
        ${escapeHtml(item.titulo)}${item.subtitulo ? `<span class="sub">${escapeHtml(item.subtitulo)}</span>` : ''}
      </td>
      <td class="col-muted">${escapeHtml(item.autores || '—')}</td>
      <td class="col-tags">${escapeHtml(item.apto || '—')}</td>
      <td class="col-tags">${escapeHtml(item.asignaturas || '—')}</td>
      <td class="col-qty">×${escapeHtml(item.cantidad || '0')}</td>
    </tr>`).join('');

  return `
    <div class="table-wrap">
      <table class="catalog-table">
        <thead>
          <tr>
            <th>Título</th>
            <th>Autores</th>
            <th>Apto para</th>
            <th>Asignaturas</th>
            <th style="text-align:right">Cantidad</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function tableHtmlRecursos(items){
  const rows = items.map(item => `
    <tr data-item-id="${escapeHtml(item._id)}">
      <td class="col-thumb"><div class="table-thumb">${coverImg(item)}</div></td>
      <td class="col-title">${escapeHtml(item.titulo)}</td>
      <td class="col-muted">${escapeHtml(item.categoria || '—')}</td>
      <td class="col-qty">×${escapeHtml(item.cantidad || '0')}</td>
    </tr>`).join('');

  return `
    <div class="table-wrap">
      <table class="catalog-table">
        <thead>
          <tr>
            <th></th>
            <th>Recurso</th>
            <th>Categoría</th>
            <th style="text-align:right">Cantidad total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ====================== FILTROS ACTIVOS ====================== */

function updateActiveFilters(){
  const f = filters[currentTab];
  let map;
  if(currentTab === 'libros'){
    map = [
      ['autor', f.autor],
      ['apto', f.apto],
      ['asignatura', f.asignatura],
      ['tema', f.tema],
    ];
  } else {
    map = [
      ['categoria', f.categoria],
    ];
  }

  const container = document.getElementById('activeFilters');
  container.innerHTML = map
    .filter(([,v]) => v)
    .map(([key,v]) => `<span class="chip">${escapeHtml(v)}<button data-clear="${key}">×</button></span>`)
    .join('');

  container.querySelectorAll('[data-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.clear;
      filters[currentTab][key] = '';
      const selId = 'filter' + key.charAt(0).toUpperCase() + key.slice(1);
      const sel = document.getElementById(selId);
      if(sel) sel.value = '';
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

// Cambio de pestaña principal (Libros / Recursos)
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;

    // mostrar/ocultar bloques de filtros correspondientes
    document.getElementById('filtersLibros').style.display = currentTab === 'libros' ? '' : 'none';
    document.getElementById('filtersRecursos').style.display = currentTab === 'recursos' ? '' : 'none';

    // limpiar búsqueda al cambiar de pestaña
    document.getElementById('searchInput').value = '';

    render();
  });
});

document.getElementById('searchInput').addEventListener('input', e => {
  filters[currentTab].q = e.target.value;
  render();
});

['Autor','Apto','Asignatura','Tema'].forEach(name => {
  document.getElementById('filter' + name).addEventListener('change', e => {
    filters.libros[name.toLowerCase()] = e.target.value;
    render();
  });
});

document.getElementById('filterCategoria').addEventListener('change', e => {
  filters.recursos.categoria = e.target.value;
  render();
});

document.getElementById('clearFilters').addEventListener('click', () => {
  filters.libros = { autor:'', apto:'', asignatura:'', tema:'', q:'' };
  filters.recursos = { categoria:'', q:'' };
  document.querySelectorAll('select').forEach(s => s.value = '');
  document.getElementById('searchInput').value = '';
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

// ── TMDB CONFIG ──
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w185";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/w780";
const BOLLYWOOD_REGION = "IN";
const HINDI_LANG = "hi";
const ENGLISH_LANG = "en";
let currentLang = "hi";

// Genre map from TMDB genre IDs
const GENRE_MAP = {
  28:"Action", 12:"Adventure", 16:"Animation", 35:"Comedy", 80:"Crime",
  99:"Documentary", 18:"Drama", 10751:"Family", 14:"Fantasy", 36:"History",
  27:"Horror", 10402:"Music", 9648:"Mystery", 10749:"Romance",
  878:"Sci-Fi", 53:"Thriller", 10752:"War", 37:"Western"
};

const GENRES_FILTER = ["Action","Comedy","Crime","Drama","Family","History","Music","Romance","Thriller"];
const ERAS = [{l:"90s",min:1990,max:1999},{l:"2000s",min:2000,max:2009},{l:"2010s",min:2010,max:2019},{l:"2020s",min:2020,max:2030}];

// ── STATE ──
let apiKey = localStorage.getItem("tmdb_api_key") || "";
let movies = [];
let currentPage = 1;
let totalPages = 1;
let isFetching = false;
let searchTimeout = null;
let isSearchMode = false;
let searchQuery = "";

let userState = { watched:{}, favs:{}, notes:{}, ratings:{}, tab:"all", genreFilter:"", eraFilter:"", minRating:0 };
try { const s = localStorage.getItem("bw_tmdb_v1"); if(s) Object.assign(userState, JSON.parse(s)); } catch(e){}

let modalId = null;

function saveUserState() { try { localStorage.setItem("bw_tmdb_v1", JSON.stringify(userState)); } catch(e){} }

// ── INIT ──
if (apiKey) {
  showMainApp();
  fetchMovies(1, true);
} 

function submitApiKey() {
  const key = document.getElementById("api-key-input").value.trim();
  if (!key) return;
  document.getElementById("api-error").style.display = "none";
  // Test the key
  fetch(`${TMDB_BASE}/configuration?api_key=${key}`)
    .then(r => { if(!r.ok) throw new Error("bad key"); return r.json(); })
    .then(() => {
      apiKey = key;
      localStorage.setItem("tmdb_api_key", key);
      showMainApp();
      fetchMovies(1, true);
    })
    .catch(() => {
      document.getElementById("api-error").style.display = "block";
    });
}

function showMainApp() {
  document.getElementById("api-screen").style.display = "none";
  document.getElementById("main-app").style.display = "flex";
  buildGenrePills();
  buildEraPills();
}

function changeKey() {
  localStorage.removeItem("tmdb_api_key");
  apiKey = "";
  movies = [];
  document.getElementById("api-screen").style.display = "flex";
  document.getElementById("main-app").style.display = "none";
}

// ── FETCH BOLLYWOOD MOVIES ──
async function fetchMovies(page = 1, reset = false) {
  if (isFetching) return;
  isFetching = true;

  if (reset) {
    movies = [];
    currentPage = 1;
    document.getElementById("list-container").innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading films from TMDB…</p>
      </div>`;
    document.getElementById("load-more-wrap").style.display = "none";
  }

  try {
    // Fetch multiple pages in parallel for a richer initial load
    const pagesToFetch = reset ? [1, 2, 3] : [page];
    const results = await Promise.all(pagesToFetch.map(p =>
      fetch(`${TMDB_BASE}/discover/movie?api_key=${apiKey}&with_original_language=${currentLang}&region=${BOLLYWOOD_REGION}&primary_release_date.gte=1990-01-01&sort_by=vote_count.desc&vote_count.gte=100&page=${p}`)
        .then(r => r.json())
    ));

    results.forEach(data => {
      if (data.results) {
        totalPages = data.total_pages;
        data.results.forEach(m => {
          if (!movies.find(x => x.id === m.id)) movies.push(m);
        });
      }
    });

    currentPage = reset ? 3 : page;
    document.getElementById("hdr-total").textContent = movies.length + "+";
    document.getElementById("load-more-wrap").style.display = currentPage < totalPages ? "block" : "none";
    applyFilters();
  } catch(e) {
    document.getElementById("list-container").innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Couldn't load films. Check your API key or connection.</p>
        <button onclick="changeKey()">Change API Key</button>
      </div>`;
  }
  isFetching = false;
}

async function loadMoreMovies() {
  if (isSearchMode) {
    await searchTMDB(searchQuery, currentPage + 1);
  } else {
    await fetchMovies(currentPage + 1, false);
  }
}

// ── SEARCH ──
function handleSearch() {
  const q = document.getElementById("search").value.trim();
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (q.length > 1) {
      searchQuery = q;
      isSearchMode = true;
      searchTMDB(q, 1);
    } else {
      isSearchMode = false;
      searchQuery = "";
      applyFilters();
    }
  }, 400);
}

// ── LANGUAGE SWITCH (BOLLYWOOD / HOLLYWOOD) ──
function switchLang() {
  currentLang = currentLang === "hi" ? "en" : "hi";
  document.getElementById("lang-btn").textContent = currentLang === "hi" ? "🎬 Bollywood" : "🎬 Hollywood";
  movies = [];
  fetchMovies(1, true);
}

async function searchTMDB(query, page = 1) {
  if (page === 1) {
    document.getElementById("list-container").innerHTML = `
      <div class="loading-state"><div class="spinner"></div><p>Searching…</p></div>`;
  }
  try {
    const data = await fetch(`${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US&page=${page}&include_adult=false`)
      .then(r => r.json());
    
    const filtered = (data.results || []).filter(m => {
      const lang = m.original_language;
      const year = m.release_date ? parseInt(m.release_date.substr(0,4)) : 0;
      return lang === "hi" && year >= 1990;
    });

    if (page === 1) {
      movies = filtered;
    } else {
      filtered.forEach(m => { if (!movies.find(x => x.id === m.id)) movies.push(m); });
    }
    currentPage = page;
    totalPages = data.total_pages || 1;
    document.getElementById("load-more-wrap").style.display = currentPage < totalPages ? "block" : "none";
    renderList(movies);
  } catch(e) {
    renderList([]);
  }
}

// ── FILTERS & RENDER ──
function applyFilters() {
  if (isSearchMode) { renderList(movies); return; }
  const minR = parseFloat(document.getElementById("min-rating").value) || 0;
  const era = ERAS.find(e => e.l === userState.eraFilter);
  const sort = document.getElementById("sort-sel").value;

  let list = movies.filter(m => {
    const year = m.release_date ? parseInt(m.release_date.substr(0,4)) : 0;
    const genres = (m.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean);

    if (userState.tab === "watched" && !userState.watched[m.id]) return false;
    if (userState.tab === "favs" && !userState.favs[m.id]) return false;
    if (userState.tab === "todo" && userState.watched[m.id]) return false;
    if (userState.genreFilter && !genres.includes(userState.genreFilter)) return false;
    if (era && (year < era.min || year > era.max)) return false;
    if (m.vote_average < minR) return false;
    return true;
  });

  if (sort === "year_asc") list.sort((a,b) => (a.release_date||"").localeCompare(b.release_date||""));
  else if (sort === "year_desc") list.sort((a,b) => (b.release_date||"").localeCompare(a.release_date||""));
  else if (sort === "rating") list.sort((a,b) => b.vote_average - a.vote_average);
  else if (sort === "alpha") list.sort((a,b) => (a.title||"").localeCompare(b.title||""));
  else if (sort === "popularity") list.sort((a,b) => b.popularity - a.popularity);

  renderList(list);
}

function renderList(list) {
  const watched = Object.values(userState.watched).filter(Boolean).length;
  const total = movies.length;
  const pct = total ? Math.round(watched / total * 100) : 0;
  document.getElementById("hdr-watched").textContent = watched;
  document.getElementById("hdr-pct").textContent = pct;
  document.getElementById("prog-bar").style.width = pct + "%";
  document.getElementById("count-label").textContent = list.length + " film" + (list.length !== 1 ? "s" : "");

  const sort = document.getElementById("sort-sel").value;
  let html = "";
  let lastDecade = "";

  list.forEach(m => {
    const year = m.release_date ? m.release_date.substr(0,4) : "?";
    const decade = sort === "year_asc" || sort === "year_desc"
      ? (Math.floor(parseInt(year)/10)*10 + "s") : "";
    if (decade && decade !== lastDecade) {
      lastDecade = decade;
      html += `<div class="decade-bar">${decade}</div>`;
    }

    const genres = (m.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean).slice(0,2);
    const primaryGenre = genres[0] || "Drama";
    const genreClass = "tag-" + primaryGenre.toLowerCase().replace(/[^a-z]/g,"");
    const rating = m.vote_average ? m.vote_average.toFixed(1) : "—";
    const w = !!userState.watched[m.id];
    const f = !!userState.favs[m.id];
    const poster = m.poster_path 
      ? `<img src="${IMG_BASE}${m.poster_path}" alt="${m.title}" loading="lazy">`
      : `<span class="poster-fallback">${(m.title||"?").charAt(0)}</span>`;

    html += `
    <div class="movie-row${w ? " watched-row" : ""}" onclick="openModal(${m.id})">
      <div class="poster">${poster}</div>
      <div class="movie-body">
        <div class="movie-title-text">${m.title || m.original_title}</div>
        <div class="movie-meta-row">
          <span class="year-lbl">${year}</span>
          ${genres.map(g => `<span class="tag tag-${g.toLowerCase().replace(/[^a-z]/g,'')}">${g}</span>`).join("")}
          <span class="movie-rating">★ ${rating}</span>
        </div>
        <div class="movie-snippet">${m.overview || "No description available."}</div>
      </div>
      <div class="actions-col" onclick="event.stopPropagation()">
        <div class="cb${w ? " on" : ""}" onclick="toggleW(${m.id})">
          <svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="fav-btn${f ? " on" : ""}" onclick="toggleF(${m.id})">
          <svg viewBox="0 0 16 16"><path d="M8 13.7l-1.2-1.1C3.2 9.3 1 7.3 1 4.9 1 3 2.5 1.5 4.4 1.5c1 0 2 .5 2.6 1.3.6-.8 1.6-1.3 2.6-1.3C11.5 1.5 13 3 13 4.9c0 2.4-2.2 4.4-5.8 7.7L8 13.7z"/></svg>
        </div>
      </div>
    </div>`;
  });

  if (!html) html = `<div class="empty-state"><div class="empty-icon">🎬</div><p>No films match your current filters.</p></div>`;
  document.getElementById("list-container").innerHTML = html;
}

// ── USER ACTIONS ──
function toggleW(id) { userState.watched[id] = !userState.watched[id]; saveUserState(); applyFilters(); if(modalId===id) refreshModalButtons(id); }
function toggleF(id) { userState.favs[id] = !userState.favs[id]; saveUserState(); applyFilters(); if(modalId===id) refreshModalButtons(id); }

// ── MODAL ──
function openModal(id) {
  const m = movies.find(x => x.id === id);
  if (!m) return;
  modalId = id;

  const year = m.release_date ? m.release_date.substr(0,4) : "?";
  const rating = m.vote_average ? m.vote_average.toFixed(1) : "—";
  const votes = m.vote_count ? m.vote_count.toLocaleString() : "0";
  const genres = (m.genre_ids || []).map(gid => GENRE_MAP[gid]).filter(Boolean);

  // Poster
  const posterEl = document.getElementById("m-poster");
  const fallback = document.getElementById("m-poster-fallback");
  if (m.poster_path) {
    posterEl.innerHTML = `<img src="${IMG_BASE}${m.poster_path}" alt="${m.title}">`;
  } else {
    posterEl.innerHTML = `<span class="modal-poster-fallback">${(m.title||"?").charAt(0)}</span>`;
  }

  // Backdrop
  const backdropEl = document.getElementById("modal-backdrop");
  if (m.backdrop_path) {
    document.getElementById("m-backdrop").src = BACKDROP_BASE + m.backdrop_path;
    backdropEl.style.display = "block";
  } else {
    backdropEl.style.display = "none";
  }

  document.getElementById("m-title").textContent = m.title || m.original_title;
  document.getElementById("m-meta").innerHTML = `<b>${year}</b> · ★ ${rating} <span style="color:var(--text3)">(${votes} votes)</span>`;
  document.getElementById("m-genres").innerHTML = genres.map(g => `<span class="modal-genre-tag">${g}</span>`).join("");
  document.getElementById("m-review").textContent = m.overview || "No description available.";
  document.getElementById("m-note").value = userState.notes[id] || "";
  refreshModalButtons(id);
  renderStars(id);
  document.getElementById("modal-overlay").classList.add("open");
  document.getElementById("modal-sheet").scrollTop = 0;
}

function refreshModalButtons(id) {
  const wb = document.getElementById("m-watch-btn");
  const fb = document.getElementById("m-fav-btn");
  wb.textContent = userState.watched[id] ? "✓ Watched" : "Mark as watched";
  wb.className = "modal-action-btn" + (userState.watched[id] ? " green" : "");
  fb.textContent = userState.favs[id] ? "❤ Unfavourite" : "♡ Favourite";
  fb.className = "modal-action-btn" + (userState.favs[id] ? " pink" : "");
}

function renderStars(id) {
  const myR = userState.ratings[id] || 0;
  document.getElementById("m-stars").innerHTML = Array.from({length:5},(_,i) =>
    `<div class="star-btn${i<myR?" lit":""}" onclick="setRating(${id},${i+1})">${i<myR?"★":"☆"}</div>`
  ).join("");
}

function setRating(id, r) { userState.ratings[id] = userState.ratings[id]===r?0:r; saveUserState(); renderStars(id); }
function saveNote() { if(modalId) { userState.notes[modalId] = document.getElementById("m-note").value; saveUserState(); } }
function closeModal() { document.getElementById("modal-overlay").classList.remove("open"); }
function handleOverlayClick(e) { if(e.target===document.getElementById("modal-overlay")) closeModal(); }
function modalToggleWatch() { toggleW(modalId); }
function modalToggleFav() { toggleF(modalId); }

// ── FILTER UI ──
function toggleFilters() {
  const p = document.getElementById("filter-panel");
  const b = document.getElementById("filter-btn");
  b.classList.toggle("active", p.classList.toggle("open"));
}
function switchTab(tab) {
  userState.tab = tab;
  ["all","watched","favs","todo"].forEach(t => document.getElementById("tab-"+t).classList.toggle("active", t===tab));
  applyFilters();
}
function buildGenrePills() {
  document.getElementById("genre-pills").innerHTML = GENRES_FILTER.map(g =>
    `<div class="pill${userState.genreFilter===g?" active":""}" onclick="setGenre('${g}')">${g}</div>`
  ).join("");
}
function buildEraPills() {
  document.getElementById("era-pills").innerHTML = ERAS.map(e =>
    `<div class="pill${userState.eraFilter===e.l?" active":""}" onclick="setEra('${e.l}')">${e.l}</div>`
  ).join("");
}
function setGenre(g) { userState.genreFilter = userState.genreFilter===g?"":g; buildGenrePills(); applyFilters(); }
function setEra(e) { userState.eraFilter = userState.eraFilter===e?"":e; buildEraPills(); applyFilters(); }
function clearFilters() {
  userState.genreFilter = ""; userState.eraFilter = ""; userState.minRating = 0;
  document.getElementById("min-rating").value = 0;
  document.getElementById("rating-display").textContent = "0.0";
  buildGenrePills(); buildEraPills(); applyFilters();
}

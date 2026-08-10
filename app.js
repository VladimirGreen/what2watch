document.addEventListener('DOMContentLoaded', function() {

  // ========== МОК Telegram API ==========
  if (!window.Telegram) {
    window.Telegram = {
      WebApp: {
        ready: function() {},
        CloudStorage: {
          getItem: function(key, cb) { cb(null, localStorage.getItem('tg_' + key)); },
          setItem: function(key, value, cb) {
            localStorage.setItem('tg_' + key, value);
            if (cb) cb(null);
          }
        },
        onEvent: function() {},
        offEvent: function() {}
      }
    };
  }

  // ========== НАВИГАЦИЯ ==========
  var screens = {
    randomizer: document.getElementById('screen-randomizer'),
    search: document.getElementById('screen-search'),
    collections: document.getElementById('screen-collections'),
    settings: document.getElementById('screen-settings')
  };
  var navButtons = document.querySelectorAll('.nav-btn');

  function switchScreen(screenId) {
    for (var key in screens) {
      if (screens[key]) screens[key].classList.remove('active');
    }
    if (screens[screenId]) screens[screenId].classList.add('active');

    navButtons.forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.getAttribute('data-screen') === screenId) btn.classList.add('active');
    });

    if (screenId === 'collections') renderFolders();
    if (screenId === 'settings') {
      document.getElementById('setting-show-watched').checked = storageGet('showWatched', false);
    }
  }

  navButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      switchScreen(btn.getAttribute('data-screen'));
    });
  });
  switchScreen('randomizer');

  // ========== ТЕМЫ ==========
  var themeButtons = document.querySelectorAll('.theme-btn');
  themeButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var theme = btn.getAttribute('data-theme');
      document.body.className = 'theme-' + theme;
      localStorage.setItem('theme', theme);
    });
  });
  var savedTheme = localStorage.getItem('theme') || 'dark';
  document.body.className = 'theme-' + savedTheme;

  // ========== ХРАНИЛИЩЕ ==========
  var STORAGE_PREFIX = 'tg_';
  function storageGet(key, defaultValue) {
    var raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return defaultValue;
    try { return JSON.parse(raw); } catch (e) { return defaultValue; }
  }
  function storageSet(key, value) {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  }

  if (!localStorage.getItem(STORAGE_PREFIX + 'watchlist')) storageSet('watchlist', []);
  if (!localStorage.getItem(STORAGE_PREFIX + 'watched')) storageSet('watched', []);
  if (!localStorage.getItem(STORAGE_PREFIX + 'excluded')) storageSet('excluded', []);
  if (!localStorage.getItem(STORAGE_PREFIX + 'filters')) {
    storageSet('filters', { genres: [], yearFrom: 1900, yearTo: 2026, ratingMin: 0, showWatched: false });
  }
  if (!localStorage.getItem(STORAGE_PREFIX + 'showWatched')) storageSet('showWatched', false);

  // ========== TMDb API ==========
  var TMDB_API_KEY = 'ef7c2a92898037d91e4481fc43a1bf6a'; 
  var TMDB_BASE_URL = 'https://api.themoviedb.org/3';

  var allGenres = [];
  fetch(TMDB_BASE_URL + '/genre/movie/list?api_key=' + TMDB_API_KEY + '&language=ru')
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      allGenres = data.genres || [];
      populateGenreCheckboxes();
      updateFilterUI();
    });

  function populateGenreCheckboxes() {
    var container = document.getElementById('genre-checkboxes');
    if (!container || allGenres.length === 0) return;
    var filters = storageGet('filters', {});
    var selectedGenres = filters.genres || [];
    var html = '';
    allGenres.forEach(function(genre) {
      var checked = selectedGenres.indexOf(genre.id) !== -1 ? 'checked' : '';
      html += '<label><input type="checkbox" value="' + genre.id + '" ' + checked + '> ' + genre.name + '</label>';
    });
    container.innerHTML = html;
  }

  async function fetchRandomMovie(useFilters) {
    var excluded = storageGet('excluded', []);
    var watchedIds = storageGet('watched', []).map(function(m) { return m.id; });
    var filters = storageGet('filters', {});
    var showWatched = filters.showWatched || false;

    var params = 'api_key=' + TMDB_API_KEY + '&language=ru&sort_by=popularity.desc&include_adult=false&include_video=false&page=';
    if (useFilters !== false) {
      if (filters.genres && filters.genres.length > 0) params += '&with_genres=' + filters.genres.join(',');
      if (filters.yearFrom && filters.yearFrom > 1900) params += '&primary_release_date.gte=' + filters.yearFrom + '-01-01';
      if (filters.yearTo && filters.yearTo < 2026) params += '&primary_release_date.lte=' + filters.yearTo + '-12-31';
      if (filters.ratingMin && filters.ratingMin > 0) params += '&vote_average.gte=' + filters.ratingMin;
    }

    for (var attempt = 0; attempt < 8; attempt++) {
      var randomPage = Math.floor(Math.random() * 20) + 1;
      var url = TMDB_BASE_URL + '/discover/movie?' + params + '&page=' + randomPage;
      try {
        var resp = await fetch(url);
        var data = await resp.json();
        if (!data.results || data.results.length === 0) continue;
        var shuffled = data.results.sort(function() { return 0.5 - Math.random(); });
        for (var i = 0; i < shuffled.length; i++) {
          var movie = shuffled[i];
          if (excluded.indexOf(movie.id) !== -1) continue;
          if (!showWatched && watchedIds.indexOf(movie.id) !== -1) continue;
          var detailUrl = TMDB_BASE_URL + '/movie/' + movie.id + '?api_key=' + TMDB_API_KEY + '&language=ru';
          var detailResp = await fetch(detailUrl);
          return await detailResp.json();
        }
      } catch (err) { console.error(err); }
    }
    if (useFilters !== false) return await fetchRandomMovie(false);
    return null;
  }

  function updateMovieCard(movie) {
    if (!movie) { console.warn('Не удалось загрузить фильм'); return; }
    var posterUrl = movie.poster_path ? 'https://image.tmdb.org/t/p/w500' + movie.poster_path : '';
    var posterEl = document.querySelector('#screen-randomizer .poster-placeholder');
    if (posterEl) {
      posterEl.style.backgroundImage = posterUrl ? 'url(' + posterUrl + ')' : '';
      posterEl.style.backgroundSize = 'cover';
      posterEl.style.backgroundPosition = 'center';
    }
    document.querySelector('#screen-randomizer .card-info h2').textContent = movie.title || 'Без названия';
    document.querySelector('#screen-randomizer .year').textContent = (movie.release_date || '').substring(0, 4) || '----';
    document.querySelector('#screen-randomizer .rating').textContent = '★ ' + (movie.vote_average ? movie.vote_average.toFixed(1) : '--');
    var genresEl = document.querySelector('#screen-randomizer .genres');
    if (genresEl && movie.genres) {
      genresEl.textContent = movie.genres.map(function(g) { return g.name; }).join(', ');
    }
    document.querySelector('#screen-randomizer .description').textContent = movie.overview || 'Описание отсутствует.';
    document.querySelector('#screen-randomizer .description').classList.remove('expanded');
    var card = document.querySelector('#screen-randomizer .card');
    if (card) {
      card.dataset.movieId = movie.id;
      card.dataset.movieTitle = movie.title || '';
      card.dataset.movieYear = (movie.release_date || '').substring(0, 4);
      card.dataset.moviePoster = posterUrl;
    }
  }

  fetchRandomMovie().then(function(movie) { updateMovieCard(movie); });

  // Разворачивание описания
  document.querySelector('#screen-randomizer .description').addEventListener('click', function(e) {
    this.classList.toggle('expanded');
    e.stopPropagation();
  });

  // ========== КНОПКИ РАНДОМАЙЗЕРА ==========
  function handleButton(action) {
    var card = document.querySelector('#screen-randomizer .card');
    if (!card) return;
    var movieId = parseInt(card.dataset.movieId);
    if (!movieId) return;
    var movieData = {
      id: movieId,
      title: card.dataset.movieTitle,
      year: card.dataset.movieYear,
      poster: card.dataset.moviePoster
    };
    if (action === 'skip') {
      var excluded = storageGet('excluded', []);
      if (excluded.indexOf(movieId) === -1) { excluded.push(movieId); storageSet('excluded', excluded); }
    } else if (action === 'watched') {
      var watched = storageGet('watched', []);
      if (!watched.some(function(m) { return m.id === movieId; })) { watched.push(movieData); storageSet('watched', watched); }
    } else if (action === 'watchlist') {
      var watchlist = storageGet('watchlist', []);
      if (!watchlist.some(function(m) { return m.id === movieId; })) { watchlist.push(movieData); storageSet('watchlist', watchlist); }
    }
    fetchRandomMovie().then(updateMovieCard);
  }

  document.querySelector('.btn-skip').addEventListener('click', function() { handleButton('skip'); });
  document.querySelector('.btn-watched').addEventListener('click', function() { handleButton('watched'); });
  document.querySelector('.btn-watchlist').addEventListener('click', function() { handleButton('watchlist'); });

  // ========== ФИЛЬТРЫ ==========
  function updateFilterUI() {
    var filters = storageGet('filters', {});
    var activeCount = 0;
    if (filters.genres && filters.genres.length > 0) activeCount += filters.genres.length;
    if (filters.yearFrom && filters.yearFrom > 1900) activeCount++;
    if (filters.yearTo && filters.yearTo < 2026) activeCount++;
    if (filters.ratingMin && filters.ratingMin > 0) activeCount++;
    if (filters.showWatched) activeCount++;

    var countSpan = document.getElementById('filter-count');
    if (countSpan) countSpan.textContent = activeCount > 0 ? '(' + activeCount + ')' : '';
    var btn = document.getElementById('open-filter-btn');
    if (btn) {
      if (activeCount > 0) btn.classList.add('has-filters');
      else btn.classList.remove('has-filters');
    }

    var tagsContainer = document.getElementById('active-tags');
    if (tagsContainer) {
      var html = '';
      if (filters.genres && filters.genres.length > 0) {
        filters.genres.forEach(function(genreId) {
          var genre = allGenres.find(function(g) { return g.id === genreId; });
          if (genre) html += '<span class="tag" data-genre="' + genreId + '">' + genre.name + ' ✕</span>';
        });
      }
      if (filters.yearFrom > 1900) html += '<span class="tag" data-year-from>' + filters.yearFrom + ' от</span>';
      if (filters.yearTo < 2026) html += '<span class="tag" data-year-to>до ' + filters.yearTo + '</span>';
      if (filters.ratingMin > 0) html += '<span class="tag">≥ ' + filters.ratingMin + ' ★</span>';
      if (filters.showWatched) html += '<span class="tag">просмотренные</span>';
      if (html) html += '<span class="reset-btn" id="reset-tags">Сбросить всё</span>';
      tagsContainer.innerHTML = html;

      document.querySelectorAll('#active-tags .tag').forEach(function(tag) {
        tag.addEventListener('click', function() {
          var genreId = tag.getAttribute('data-genre');
          if (genreId) filters.genres = filters.genres.filter(function(id) { return id !== parseInt(genreId); });
          else if (tag.hasAttribute('data-year-from')) filters.yearFrom = 1900;
          else if (tag.hasAttribute('data-year-to')) filters.yearTo = 2026;
          else if (tag.textContent.includes('★')) filters.ratingMin = 0;
          else if (tag.textContent.includes('просмотренные')) filters.showWatched = false;
          storageSet('filters', filters);
          populateGenreCheckboxes();
          updateFilterForm();
          updateFilterUI();
        });
      });

      var resetBtn = document.getElementById('reset-tags');
      if (resetBtn) {
        resetBtn.addEventListener('click', function() {
          storageSet('filters', { genres: [], yearFrom: 1900, yearTo: 2026, ratingMin: 0, showWatched: false });
          populateGenreCheckboxes();
          updateFilterForm();
          updateFilterUI();
          fetchRandomMovie().then(updateMovieCard);
          document.getElementById('filter-sheet').style.display = 'none';
        });
      }
    }
  }

  function updateFilterForm() {
    var filters = storageGet('filters', {});
    document.getElementById('year-from').value = filters.yearFrom || 1900;
    document.getElementById('year-to').value = filters.yearTo || 2026;
    document.getElementById('rating-min').value = filters.ratingMin || 0;
    document.getElementById('rating-value').textContent = filters.ratingMin || 0;
    document.getElementById('filter-show-watched').checked = filters.showWatched || false;
  }

  document.getElementById('open-filter-btn').addEventListener('click', function() {
    updateFilterForm();
    populateGenreCheckboxes();
    updateFilterUI();
    document.getElementById('filter-sheet').style.display = 'flex';
  });
  document.getElementById('rating-min').addEventListener('input', function() {
    document.getElementById('rating-value').textContent = this.value;
  });
  document.getElementById('apply-filters').addEventListener('click', function() {
    var selectedGenres = [];
    var checkboxes = document.querySelectorAll('#genre-checkboxes input[type="checkbox"]:checked');
    checkboxes.forEach(function(cb) { selectedGenres.push(parseInt(cb.value)); });
    var filters = {
      genres: selectedGenres,
      yearFrom: parseInt(document.getElementById('year-from').value) || 1900,
      yearTo: parseInt(document.getElementById('year-to').value) || 2026,
      ratingMin: parseFloat(document.getElementById('rating-min').value) || 0,
      showWatched: document.getElementById('filter-show-watched').checked
    };
    storageSet('filters', filters);
    storageSet('showWatched', filters.showWatched);
    document.getElementById('filter-sheet').style.display = 'none';
    updateFilterUI();
    fetchRandomMovie().then(updateMovieCard);
  });
  document.getElementById('filter-close').addEventListener('click', function() {
    document.getElementById('filter-sheet').style.display = 'none';
  });
  document.getElementById('reset-filters').addEventListener('click', function() {
    storageSet('filters', { genres: [], yearFrom: 1900, yearTo: 2026, ratingMin: 0, showWatched: false });
    populateGenreCheckboxes();
    updateFilterForm();
    updateFilterUI();
    fetchRandomMovie().then(updateMovieCard);
    document.getElementById('filter-sheet').style.display = 'none';
  });

  // ========== ПАПКИ ПОДБОРОК ==========
  function renderFolders() {
    var foldersList = document.getElementById('folders-list');
    var folderContent = document.getElementById('folder-content');
    document.getElementById('folders-view').style.display = 'block';
    folderContent.style.display = 'none';
    var watchlist = storageGet('watchlist', []);
    var watched = storageGet('watched', []);
    foldersList.innerHTML = 
      '<div class="collection-item system" data-folder="watchlist">⏳ Буду смотреть (' + watchlist.length + ')</div>' +
      '<div class="collection-item system" data-folder="watched">✅ Просмотрено (' + watched.length + ')</div>';
    document.querySelectorAll('.collection-item').forEach(function(item) {
      item.addEventListener('click', function() {
        openFolder(item.getAttribute('data-folder'));
      });
    });
  }

  function openFolder(type) {
    var movies = type === 'watchlist' ? storageGet('watchlist', []) : storageGet('watched', []);
    var title = type === 'watchlist' ? 'Буду смотреть' : 'Просмотрено';
    document.getElementById('folders-view').style.display = 'none';
    var folderContent = document.getElementById('folder-content');
    folderContent.style.display = 'block';
    document.getElementById('folder-title').textContent = title;
    var cardsContainer = document.getElementById('folder-cards');
    if (movies.length === 0) {
      cardsContainer.innerHTML = '<p class="empty-msg">Пока пусто</p>';
    } else {
      var html = '';
      movies.forEach(function(movie) {
        html += createMiniCard(movie, type);
      });
      cardsContainer.innerHTML = html;
      document.querySelectorAll('#folder-cards .mini-card').forEach(function(card) {
        card.addEventListener('click', function(e) {
          if (e.target.closest('.btn-remove')) return;
          var movieId = parseInt(card.getAttribute('data-id'));
          if (movieId) openMovieSheet(movieId);
        });
      });
    }
    document.querySelector('#folder-content .back-btn').addEventListener('click', function() { renderFolders(); });
  }

  function createMiniCard(movie, listType) {
    var posterHtml = movie.poster
      ? '<div class="mini-poster" style="background-image: url(' + movie.poster + '); background-size: cover; background-position: center;"></div>'
      : '<div class="mini-poster"></div>';
    return '<div class="mini-card" data-id="' + movie.id + '" data-list="' + listType + '">' +
      posterHtml +
      '<div class="mini-info">' +
        '<p class="mini-title">' + (movie.title || 'Без названия') + '</p>' +
        '<p class="mini-desc">' + (movie.year || '') + '</p>' +
      '</div>' +
      '<button class="btn btn-remove">×</button>' +
    '</div>';
  }

  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('btn-remove')) {
      e.stopPropagation();
      var card = e.target.closest('.mini-card');
      if (!card) return;
      var id = parseInt(card.getAttribute('data-id'));
      var listType = card.getAttribute('data-list');
      removeMovieFromList(id, listType);
      card.remove();
    }
  });

  function removeMovieFromList(id, listType) {
    var key = listType === 'watchlist' ? 'watchlist' : 'watched';
    var list = storageGet(key, []);
    var updated = list.filter(function(m) { return m.id !== id; });
    storageSet(key, updated);
  }

  // ========== ШТОРКА ДЕТАЛЕЙ ==========
  async function openMovieSheet(movieId) {
    var url = TMDB_BASE_URL + '/movie/' + movieId + '?api_key=' + TMDB_API_KEY + '&language=ru';
    try {
      var resp = await fetch(url);
      var movie = await resp.json();
      if (!movie) return;
      document.getElementById('sheet-poster').style.backgroundImage = movie.poster_path
        ? 'url(https://image.tmdb.org/t/p/w500' + movie.poster_path + ')' : '';
      document.getElementById('sheet-title').textContent = movie.title || 'Без названия';
      document.getElementById('sheet-year').textContent = (movie.release_date || '').substring(0, 4);
      document.getElementById('sheet-rating').textContent = '★ ' + (movie.vote_average ? movie.vote_average.toFixed(1) : '--');
      document.getElementById('sheet-genres').textContent = movie.genres ? movie.genres.map(function(g) { return g.name; }).join(', ') : '';
      document.getElementById('sheet-description').textContent = movie.overview || 'Описание отсутствует.';
      document.getElementById('sheet-add-watchlist').dataset.movieId = movieId;
      document.getElementById('sheet-add-watchlist').dataset.movieTitle = movie.title || '';
      document.getElementById('sheet-add-watchlist').dataset.movieYear = (movie.release_date || '').substring(0, 4);
      document.getElementById('sheet-add-watchlist').dataset.moviePoster = movie.poster_path ? 'https://image.tmdb.org/t/p/w500' + movie.poster_path : '';
      document.getElementById('sheet-mark-watched').dataset.movieId = movieId;
      document.getElementById('sheet-mark-watched').dataset.movieTitle = movie.title || '';
      document.getElementById('sheet-mark-watched').dataset.movieYear = (movie.release_date || '').substring(0, 4);
      document.getElementById('sheet-mark-watched').dataset.moviePoster = movie.poster_path ? 'https://image.tmdb.org/t/p/w500' + movie.poster_path : '';
      document.getElementById('movie-sheet').style.display = 'flex';
    } catch (err) { console.error('Ошибка загрузки деталей:', err); }
  }

  document.querySelector('#movie-sheet .sheet-close').addEventListener('click', function() {
    document.getElementById('movie-sheet').style.display = 'none';
  });
  document.getElementById('movie-sheet').addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
  });

  function addMovieFromSheet(btn, listKey) {
    var movieId = parseInt(btn.dataset.movieId);
    if (!movieId) return;
    var movieData = {
      id: movieId,
      title: btn.dataset.movieTitle,
      year: btn.dataset.movieYear,
      poster: btn.dataset.moviePoster
    };
    var list = storageGet(listKey, []);
    if (!list.some(function(m) { return m.id === movieId; })) {
      list.push(movieData);
      storageSet(listKey, list);
    }
    document.getElementById('movie-sheet').style.display = 'none';
  }

  document.getElementById('sheet-add-watchlist').addEventListener('click', function() {
    addMovieFromSheet(this, 'watchlist');
  });
  document.getElementById('sheet-mark-watched').addEventListener('click', function() {
    addMovieFromSheet(this, 'watched');
  });

  // ========== НАСТРОЙКИ ==========
  document.getElementById('setting-show-watched').addEventListener('change', function() {
    storageSet('showWatched', this.checked);
    var filters = storageGet('filters', {});
    filters.showWatched = this.checked;
    storageSet('filters', filters);
    updateFilterUI();
  });

  document.getElementById('clear-cache-btn').addEventListener('click', function() {
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.startsWith(STORAGE_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach(function(key) { localStorage.removeItem(key); });
    window.location.reload();
  });

  updateFilterUI();
  console.log('What2Watch готов!');
});

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

  // Инициализация хранилища
  if (!localStorage.getItem(STORAGE_PREFIX + 'watchlist')) storageSet('watchlist', []);
  if (!localStorage.getItem(STORAGE_PREFIX + 'watched')) storageSet('watched', []);
  if (!localStorage.getItem(STORAGE_PREFIX + 'excluded')) storageSet('excluded', []);
  if (!localStorage.getItem(STORAGE_PREFIX + 'filters')) {
    storageSet('filters', { genres: [], yearFrom: 1900, yearTo: 2026, ratingMin: 0, showWatched: false, moodTags: [], anime: false });
  }
  if (!localStorage.getItem(STORAGE_PREFIX + 'showWatched')) storageSet('showWatched', false);
  if (!localStorage.getItem(STORAGE_PREFIX + 'userCollections')) storageSet('userCollections', {});
  if (!localStorage.getItem(STORAGE_PREFIX + 'checklists')) storageSet('checklists', {});

  // ========== АВТОРСКИЕ ТЕГИ ==========
  var authorTags = {
    'советское': [1,2,3], // замени на реальные ID
    'VHS': [4,5,6],
    'осенняя меланхолия': [7,8],
    'мне одиноко': [9],
    'тупые злодеи': [10]
  };

  // ========== TMDb API ==========
  var TMDB_API_KEY = 'ef7c2a92898037d91e4481fc43a1bf6a'; // 
  var TMDB_BASE_URL = 'https://api.themoviedb.org/3';

  var allGenres = [];
  fetch(TMDB_BASE_URL + '/genre/movie/list?api_key=' + TMDB_API_KEY + '&language=ru')
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      allGenres = data.genres || [];
      populateGenreCheckboxes();
      populateMoodTags();
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

  function populateMoodTags() {
    var container = document.getElementById('mood-tags');
    if (!container) return;
    var filters = storageGet('filters', {});
    var selectedMoods = filters.moodTags || [];
    var html = '';
    for (var tag in authorTags) {
      var checked = selectedMoods.indexOf(tag) !== -1 ? 'checked' : '';
      html += '<label><input type="checkbox" class="mood-checkbox" value="' + tag + '" ' + checked + '> ' + tag + '</label>';
    }
    container.innerHTML = html;
  }

  async function fetchRandomMovie(useFilters) {
    var excluded = storageGet('excluded', []);
    var watchedIds = storageGet('watched', []).map(function(m) { return m.id; });
    var filters = storageGet('filters', {});
    var showWatched = filters.showWatched || false;
    var animeOnly = filters.anime || false;
    var moodTags = filters.moodTags || [];

    // Если выбраны авторские теги, сразу строим список кандидатов
    var moodMovieIds = [];
    if (moodTags.length > 0) {
      moodTags.forEach(function(tag) {
        moodMovieIds = moodMovieIds.concat(authorTags[tag] || []);
      });
      moodMovieIds = [...new Set(moodMovieIds)]; // уникальные
    }

    var params = 'api_key=' + TMDB_API_KEY + '&language=ru&sort_by=popularity.desc&include_adult=false&include_video=false&page=';
    if (useFilters !== false) {
      if (filters.genres && filters.genres.length > 0) params += '&with_genres=' + filters.genres.join(',');
      if (animeOnly) params += '&with_genres=16&with_keywords=210024'; // аниме
      if (filters.yearFrom && filters.yearFrom > 1900) params += '&primary_release_date.gte=' + filters.yearFrom + '-01-01';
      if (filters.yearTo && filters.yearTo < 2026) params += '&primary_release_date.lte=' + filters.yearTo + '-12-31';
      if (filters.ratingMin && filters.ratingMin > 0) params += '&vote_average.gte=' + filters.ratingMin;
    }

    for (var attempt = 0; attempt < 10; attempt++) {
      var randomPage = Math.floor(Math.random() * 50) + 1;
      var url = TMDB_BASE_URL + '/discover/movie?' + params + '&page=' + randomPage;
      try {
        var resp = await fetch(url);
        var data = await resp.json();
        if (!data.results || data.results.length === 0) continue;
        var shuffled = data.results.sort(function() { return 0.5 - Math.random(); });
        for (var i = 0; i < shuffled.length; i++) {
          var movie = shuffled[i];
          // Проверка на исключённые и просмотренные
          if (excluded.indexOf(movie.id) !== -1) continue;
          if (!showWatched && watchedIds.indexOf(movie.id) !== -1) continue;
          // Если заданы теги, проверяем, есть ли фильм в moodMovieIds
          if (moodMovieIds.length > 0 && moodMovieIds.indexOf(movie.id) === -1) continue;
          var detailUrl = TMDB_BASE_URL + '/movie/' + movie.id + '?api_key=' + TMDB_API_KEY + '&language=ru';
          var detailResp = await fetch(detailUrl);
          return await detailResp.json();
        }
      } catch (err) { console.error(err); }
    }
    // Фолбэк без фильтров
    if (useFilters !== false) return await fetchRandomMovie(false);
    return null;
  }

  function updateMovieCard(movie) {
    if (!movie) {
      document.querySelector('h2').textContent = 'Не удалось загрузить фильм';
      return;
    }
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
    // Авторские теги для этого фильма
    var tagsContainer = document.querySelector('#screen-randomizer .tags');
    if (tagsContainer) {
      var tags = getAuthorTagsForMovie(movie.id);
      var tagHtml = tags.map(function(t) { return '<span class="tag">' + t + '</span>'; }).join('');
      tagsContainer.innerHTML = tagHtml;
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

  function getAuthorTagsForMovie(movieId) {
    var result = [];
    for (var tag in authorTags) {
      if (authorTags[tag].indexOf(movieId) !== -1) result.push(tag);
    }
    return result;
  }

  // Загрузка первого фильма
  function loadInitialMovie() {
    fetchRandomMovie().then(function(movie) {
      if (!movie) {
        // Экстренный фолбэк
        var fallbackUrl = TMDB_BASE_URL + '/movie/popular?api_key=' + TMDB_API_KEY + '&language=ru&page=' + (Math.floor(Math.random() * 30) + 1);
        fetch(fallbackUrl)
          .then(function(resp) { return resp.json(); })
          .then(function(data) {
            if (data.results && data.results.length > 0) {
              var randomIndex = Math.floor(Math.random() * data.results.length);
              updateMovieCard(data.results[randomIndex]);
            } else {
              document.querySelector('h2').textContent = 'Ошибка загрузки';
            }
          })
          .catch(function() {
            document.querySelector('h2').textContent = 'Ошибка сети';
          });
      } else {
        updateMovieCard(movie);
      }
    });
  }

  loadInitialMovie();

  // Разворачивание описания
  document.querySelector('#screen-randomizer .description').addEventListener('click', function(e) {
    this.classList.toggle('expanded');
    e.stopPropagation();
  });

  // Шеринг фильма
  document.getElementById('share-movie-btn').addEventListener('click', function() {
    var card = document.querySelector('#screen-randomizer .card');
    var title = card.dataset.movieTitle;
    var url = 'https://vladimirgreen.github.io/what2watch/?movie=' + card.dataset.movieId;
    shareContent(title, url);
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
    loadInitialMovie();
  }

  document.querySelector('.btn-skip').addEventListener('click', function() { handleButton('skip'); });
  document.querySelector('.btn-watched').addEventListener('click', function() { handleButton('watched'); });
  document.querySelector('.btn-watchlist').addEventListener('click', function() { handleButton('watchlist'); });

  // ========== ФИЛЬТРЫ ==========
  function updateFilterUI() {
    var filters = storageGet('filters', {});
    var activeCount = 0;
    if (filters.genres && filters.genres.length > 0) activeCount += filters.genres.length;
    if (filters.moodTags && filters.moodTags.length > 0) activeCount += filters.moodTags.length;
    if (filters.yearFrom && filters.yearFrom > 1900) activeCount++;
    if (filters.yearTo && filters.yearTo < 2026) activeCount++;
    if (filters.ratingMin && filters.ratingMin > 0) activeCount++;
    if (filters.showWatched) activeCount++;
    if (filters.anime) activeCount++;

    var countSpan = document.getElementById('filter-count');
    if (countSpan) countSpan.textContent = activeCount > 0 ? '(' + activeCount + ')' : '';
    var btn = document.getElementById('open-filter-btn');
    if (btn) {
      if (activeCount > 0) btn.style.color = 'var(--accent)';
      else btn.style.color = '#fff';
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
      if (filters.moodTags && filters.moodTags.length > 0) {
        filters.moodTags.forEach(function(tag) {
          html += '<span class="tag" data-mood="' + tag + '">' + tag + ' ✕</span>';
        });
      }
      if (filters.yearFrom > 1900) html += '<span class="tag" data-year-from>' + filters.yearFrom + ' от</span>';
      if (filters.yearTo < 2026) html += '<span class="tag" data-year-to>до ' + filters.yearTo + '</span>';
      if (filters.ratingMin > 0) html += '<span class="tag">≥ ' + filters.ratingMin + ' ★</span>';
      if (filters.showWatched) html += '<span class="tag">просмотренные</span>';
      if (filters.anime) html += '<span class="tag">аниме</span>';
      if (html) html += '<span class="reset-btn" id="reset-tags">Сбросить всё</span>';
      tagsContainer.innerHTML = html;

      document.querySelectorAll('#active-tags .tag').forEach(function(tag) {
        tag.addEventListener('click', function() {
          var genreId = tag.getAttribute('data-genre');
          var mood = tag.getAttribute('data-mood');
          if (genreId) filters.genres = filters.genres.filter(function(id) { return id !== parseInt(genreId); });
          else if (mood) filters.moodTags = filters.moodTags.filter(function(t) { return t !== mood; });
          else if (tag.hasAttribute('data-year-from')) filters.yearFrom = 1900;
          else if (tag.hasAttribute('data-year-to')) filters.yearTo = 2026;
          else if (tag.textContent.includes('★')) filters.ratingMin = 0;
          else if (tag.textContent.includes('просмотренные')) filters.showWatched = false;
          else if (tag.textContent.includes('аниме')) filters.anime = false;
          storageSet('filters', filters);
          populateGenreCheckboxes();
          populateMoodTags();
          updateFilterForm();
          updateFilterUI();
        });
      });

      var resetBtn = document.getElementById('reset-tags');
      if (resetBtn) {
        resetBtn.addEventListener('click', function() {
          storageSet('filters', { genres: [], yearFrom: 1900, yearTo: 2026, ratingMin: 0, showWatched: false, moodTags: [], anime: false });
          populateGenreCheckboxes();
          populateMoodTags();
          updateFilterForm();
          updateFilterUI();
          loadInitialMovie();
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
    document.getElementById('filter-anime').checked = filters.anime || false;
  }

  document.getElementById('open-filter-btn').addEventListener('click', function() {
    updateFilterForm();
    populateGenreCheckboxes();
    populateMoodTags();
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
    var selectedMoods = [];
    var moodBoxes = document.querySelectorAll('#mood-tags input[type="checkbox"]:checked');
    moodBoxes.forEach(function(cb) { selectedMoods.push(cb.value); });
    var filters = {
      genres: selectedGenres,
      moodTags: selectedMoods,
      yearFrom: parseInt(document.getElementById('year-from').value) || 1900,
      yearTo: parseInt(document.getElementById('year-to').value) || 2026,
      ratingMin: parseFloat(document.getElementById('rating-min').value) || 0,
      showWatched: document.getElementById('filter-show-watched').checked,
      anime: document.getElementById('filter-anime').checked
    };
    storageSet('filters', filters);
    storageSet('showWatched', filters.showWatched);
    document.getElementById('filter-sheet').style.display = 'none';
    updateFilterUI();
    loadInitialMovie();
  });
  document.getElementById('filter-close').addEventListener('click', function() {
    document.getElementById('filter-sheet').style.display = 'none';
  });
  document.getElementById('reset-filters').addEventListener('click', function() {
    storageSet('filters', { genres: [], yearFrom: 1900, yearTo: 2026, ratingMin: 0, showWatched: false, moodTags: [], anime: false });
    populateGenreCheckboxes();
    populateMoodTags();
    updateFilterForm();
    updateFilterUI();
    loadInitialMovie();
    document.getElementById('filter-sheet').style.display = 'none';
  });

  // ========== ПОИСК ==========
  var searchTimeout;
  document.getElementById('search-input').addEventListener('input', function() {
    var query = this.value.trim();
    if (query.length < 2) {
      document.getElementById('search-results').innerHTML = '';
      return;
    }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() {
      searchMovies(query);
    }, 500);
  });

  // Кнопка фильтра поиска
  document.getElementById('search-filter-btn').addEventListener('click', function() {
    // Используем ту же шторку фильтров, что и в рандомайзере
    updateFilterForm();
    populateGenreCheckboxes();
    populateMoodTags();
    updateFilterUI();
    document.getElementById('filter-sheet').style.display = 'flex';
    // При применении фильтров поиск будет обновлён вручную пользователем
  });

  // Кнопка поиска дорам (внешняя ссылка)
  // Добавим рядом с полем поиска кнопку "Дорамы"
  var doramaBtn = document.createElement('button');
  doramaBtn.textContent = '🇰🇷 Дорамы';
  doramaBtn.className = 'btn btn-secondary';
  doramaBtn.style.marginLeft = '8px';
  doramaBtn.addEventListener('click', function() {
    var query = document.getElementById('search-input').value.trim();
    if (!query) query = 'дорама';
    window.open('https://www.google.com/search?q=' + encodeURIComponent(query + ' дорама'), '_blank');
  });
  document.querySelector('.search-header').appendChild(doramaBtn);

  function searchMovies(query) {
    var filters = storageGet('filters', {});
    var params = 'api_key=' + TMDB_API_KEY + '&language=ru&query=' + encodeURIComponent(query) + '&page=1';
    if (filters.genres && filters.genres.length > 0) params += '&with_genres=' + filters.genres.join(',');
    if (filters.yearFrom && filters.yearFrom > 1900) params += '&primary_release_date.gte=' + filters.yearFrom + '-01-01';
    if (filters.yearTo && filters.yearTo < 2026) params += '&primary_release_date.lte=' + filters.yearTo + '-12-31';
    var url = TMDB_BASE_URL + '/search/movie?' + params;
    fetch(url)
      .then(function(resp) { return resp.json(); })
      .then(function(data) {
        displaySearchResults(data.results || []);
      })
      .catch(function(err) { console.error(err); });
  }

  function displaySearchResults(movies) {
    var container = document.getElementById('search-results');
    if (movies.length === 0) {
      container.innerHTML = '<p>Ничего не найдено</p>';
      return;
    }
    var html = '';
    movies.forEach(function(movie) {
      var poster = movie.poster_path ? 'https://image.tmdb.org/t/p/w92' + movie.poster_path : '';
      html += '<div class="mini-card" data-movie-id="' + movie.id + '" data-title="' + (movie.title || '') + '" data-year="' + (movie.release_date ? movie.release_date.substring(0,4) : '') + '" data-poster="' + poster + '">' +
        (poster ? '<div class="mini-poster" style="background-image:url(' + poster + ');background-size:cover;"></div>' : '<div class="mini-poster"></div>') +
        '<div class="mini-info"><p class="mini-title">' + movie.title + '</p><p class="mini-desc">' + (movie.release_date ? movie.release_date.substring(0,4) : '') + '</p></div>' +
        '<button class="btn-add">+</button>' +
      '</div>';
    });
    container.innerHTML = html;

    document.querySelectorAll('#search-results .btn-add').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var card = btn.closest('.mini-card');
        var movieId = parseInt(card.dataset.movieId);
        var title = card.dataset.title;
        var year = card.dataset.year;
        var poster = card.dataset.poster;
        showCollectionSelector(movieId, title, year, poster);
      });
    });

    document.querySelectorAll('#search-results .mini-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-add')) return;
        openMovieSheet(parseInt(card.dataset.movieId));
      });
    });
  }

  function showCollectionSelector(movieId, title, year, poster) {
    var select = document.getElementById('collection-select');
    var collections = storageGet('userCollections', {});
    var options = [{ name: 'Буду смотреть', id: 'watchlist' }];
    for (var id in collections) {
      options.push({ name: collections[id].name, id: id });
    }
    select.innerHTML = '';
    options.forEach(function(opt) {
      var option = document.createElement('option');
      option.value = opt.id;
      option.textContent = opt.name;
      select.appendChild(option);
    });
    document.getElementById('search-collection-select').classList.remove('hidden');
    document.getElementById('add-to-collection-btn').onclick = function() {
      var collectionId = select.value;
      var movieData = { id: movieId, title: title, year: year, poster: poster };
      if (collectionId === 'watchlist') {
        var list = storageGet('watchlist', []);
        if (!list.some(function(m) { return m.id === movieId; })) {
          list.push(movieData);
          storageSet('watchlist', list);
        }
      } else {
        addMovieToUserCollection(collectionId, movieData);
      }
      document.getElementById('search-collection-select').classList.add('hidden');
      alert('Добавлено!');
    };
  }

  // ========== ПОДБОРКИ ==========
  function renderFolders() {
    var foldersList = document.getElementById('folders-list');
    var watchlist = storageGet('watchlist', []);
    var watched = storageGet('watched', []);
    var userCollections = storageGet('userCollections', {});

    var html = '';
    html += '<div class="collection-item system" data-folder="watchlist">⏳ Буду смотреть (' + watchlist.length + ')</div>';
    html += '<div class="collection-item system" data-folder="watched">✅ Просмотрено (' + watched.length + ')</div>';

    for (var id in userCollections) {
      var col = userCollections[id];
      var count = col.movies ? col.movies.length : 0;
      html += '<div class="collection-item user" data-folder="' + id + '">📁 ' + col.name + ' (' + count + ') <button class="btn-remove delete-collection" data-id="' + id + '" style="font-size:1rem;">🗑</button></div>';
    }

    foldersList.innerHTML = html;
    document.getElementById('folders-view').style.display = 'block';
    document.getElementById('folder-content').style.display = 'none';

    document.querySelectorAll('.collection-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-collection')) return;
        var folderId = item.getAttribute('data-folder');
        openFolder(folderId);
      });
    });

    // Обработчики удаления пользовательских коллекций
    document.querySelectorAll('.delete-collection').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        if (confirm('Удалить подборку?')) {
          var collections = storageGet('userCollections', {});
          delete collections[id];
          storageSet('userCollections', collections);
          renderFolders();
        }
      });
    });
  }

  document.getElementById('create-collection-btn').addEventListener('click', function() {
    var name = prompt('Название подборки:');
    if (!name) return;
    var collections = storageGet('userCollections', {});
    var id = 'col_' + Date.now();
    collections[id] = { name: name, movies: [] };
    storageSet('userCollections', collections);
    renderFolders();
  });

  function openFolder(folderId) {
    var movies = [];
    var title = '';
    var isSystem = (folderId === 'watchlist' || folderId === 'watched');
    if (folderId === 'watchlist') {
      movies = storageGet('watchlist', []);
      title = 'Буду смотреть';
    } else if (folderId === 'watched') {
      movies = storageGet('watched', []);
      title = 'Просмотрено';
    } else {
      var collections = storageGet('userCollections', {});
      var col = collections[folderId];
      if (!col) return;
      title = col.name;
      movies = col.movies || [];
    }

    document.getElementById('folders-view').style.display = 'none';
    var folderContent = document.getElementById('folder-content');
    folderContent.style.display = 'block';
    document.getElementById('folder-title').textContent = title;

    var showChecked = document.getElementById('show-checked').checked;
    var checklists = storageGet('checklists', {});
    var folderChecklist = checklists[folderId] || [];

    var filteredMovies = showChecked ? movies : movies.filter(function(m) { return folderChecklist.indexOf(m.id) === -1; });

    var cardsContainer = document.getElementById('folder-cards');
    if (filteredMovies.length === 0) {
      cardsContainer.innerHTML = '<p class="empty-msg">Пока пусто</p>';
    } else {
      var html = '';
      filteredMovies.forEach(function(movie) {
        var checked = folderChecklist.indexOf(movie.id) !== -1 ? '✅ ' : '';
        html += '<div class="mini-card" data-id="' + movie.id + '" data-list="' + folderId + '">' +
          (movie.poster ? '<div class="mini-poster" style="background-image:url(' + movie.poster + ');background-size:cover;"></div>' : '<div class="mini-poster"></div>') +
          '<div class="mini-info">' +
            '<p class="mini-title">' + checked + (movie.title || 'Без названия') + '</p>' +
            '<p class="mini-desc">' + (movie.year || '') + '</p>' +
          '</div>' +
          '<button class="btn-remove">×</button>' +
        '</div>';
      });
      cardsContainer.innerHTML = html;

      document.querySelectorAll('#folder-cards .mini-card').forEach(function(card) {
        card.addEventListener('click', function(e) {
          if (e.target.classList.contains('btn-remove')) return;
          openMovieSheet(parseInt(card.getAttribute('data-id')));
        });
      });

      document.querySelectorAll('#folder-cards .btn-remove').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var card = btn.closest('.mini-card');
          var movieId = parseInt(card.getAttribute('data-id'));
          var listType = card.getAttribute('data-list');
          if (isSystem) {
            removeMovieFromSystemList(listType, movieId);
          } else {
            removeMovieFromUserCollection(listType, movieId);
          }
          card.remove();
        });
      });
    }

    document.querySelector('#folder-content .back-btn').onclick = function() {
      renderFolders();
    };

    document.getElementById('share-collection-btn').onclick = function() {
      var shareUrl = 'https://vladimirgreen.github.io/what2watch/?collection=' + folderId;
      shareContent(title, shareUrl);
    };

    // Чек-лист по двойному клику
    document.querySelectorAll('#folder-cards .mini-card').forEach(function(card) {
      card.addEventListener('dblclick', function() {
        var movieId = parseInt(card.getAttribute('data-id'));
        var checklists = storageGet('checklists', {});
        if (!checklists[folderId]) checklists[folderId] = [];
        var list = checklists[folderId];
        var index = list.indexOf(movieId);
        if (index === -1) {
          list.push(movieId);
        } else {
          list.splice(index, 1);
        }
        storageSet('checklists', checklists);
        openFolder(folderId);
      });
    });
  }

  function removeMovieFromSystemList(listType, movieId) {
    var key = listType === 'watchlist' ? 'watchlist' : 'watched';
    var list = storageGet(key, []);
    var updated = list.filter(function(m) { return m.id !== movieId; });
    storageSet(key, updated);
  }

  function removeMovieFromUserCollection(collectionId, movieId) {
    var collections = storageGet('userCollections', {});
    if (collections[collectionId]) {
      collections[collectionId].movies = collections[collectionId].movies.filter(function(m) { return m.id !== movieId; });
      storageSet('userCollections', collections);
    }
  }

  function addMovieToUserCollection(collectionId, movieData) {
    var collections = storageGet('userCollections', {});
    if (collections[collectionId]) {
      if (!collections[collectionId].movies.some(function(m) { return m.id === movieData.id; })) {
        collections[collectionId].movies.push(movieData);
        storageSet('userCollections', collections);
      }
    }
  }

  document.getElementById('show-checked').addEventListener('change', function() {
    var currentFolder = document.getElementById('folder-title').textContent;
    var folderId = '';
    if (currentFolder === 'Буду смотреть') folderId = 'watchlist';
    else if (currentFolder === 'Просмотрено') folderId = 'watched';
    else {
      var collections = storageGet('userCollections', {});
      for (var id in collections) {
        if (collections[id].name === currentFolder) {
          folderId = id;
          break;
        }
      }
    }
    if (folderId) openFolder(folderId);
  });

  // ========== ШТОРКА ДЕТАЛЕЙ ==========
  async function openMovieSheet(movieId) {
    var url = TMDB_BASE_URL + '/movie/' + movieId + '?api_key=' + TMDB_API_KEY + '&language=ru&append_to_response=videos';
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

      var trailerBtn = document.getElementById('sheet-trailer');
      trailerBtn.style.display = 'none';
      if (movie.videos && movie.videos.results) {
        var trailers = movie.videos.results.filter(function(v) { return v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'); });
        if (trailers.length > 0) {
          trailerBtn.style.display = 'inline-block';
          trailerBtn.onclick = function() {
            window.open('https://www.youtube.com/watch?v=' + trailers[0].key, '_blank');
          };
        }
      }

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
    // Очищаем только локальный кэш (localStorage), но не CloudStorage
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.startsWith(STORAGE_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach(function(key) { localStorage.removeItem(key); });
    // Перезагружаем страницу, чтобы сбросить всё состояние
    window.location.reload();
  });

  // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
  function shareContent(title, url) {
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function() {});
    } else {
      var textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('Ссылка скопирована: ' + url);
    }
  }

  // Обработка параметров URL (шеринг)
  var urlParams = new URLSearchParams(window.location.search);
  var sharedMovieId = urlParams.get('movie');
  var sharedCollectionId = urlParams.get('collection');
  if (sharedMovieId) {
    openMovieSheet(parseInt(sharedMovieId));
  }
  if (sharedCollectionId) {
    switchScreen('collections');
    setTimeout(function() { openFolder(sharedCollectionId); }, 500);
  }

  updateFilterUI();
  console.log('What2Watch v2.0 готов!');
});

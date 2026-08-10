document.addEventListener('DOMContentLoaded', function() {

  var TMDB_API_KEY = 'ТВОЙ_КЛЮЧ'; // ← замени на свой
  var TMDB_BASE_URL = 'https://api.themoviedb.org/3';

  // Простейший запрос: страница 1 популярных фильмов
  var testUrl = TMDB_BASE_URL + '/movie/popular?api_key=' + TMDB_API_KEY + '&language=ru&page=1';

  console.log('Пробую загрузить:', testUrl);

  fetch(testUrl)
    .then(function(response) {
      console.log('Статус ответа:', response.status);
      if (!response.ok) {
        throw new Error('HTTP ошибка ' + response.status);
      }
      return response.json();
    })
    .then(function(data) {
      console.log('Данные получены:', data);
      if (data.results && data.results.length > 0) {
        var movie = data.results[0]; // берём первый фильм
        updateCard(movie);
      } else {
        console.error('Пустой массив результатов');
        alert('API вернул пустой список. Проверь ключ.');
      }
    })
    .catch(function(error) {
      console.error('Ошибка запроса:', error);
      alert('Ошибка при запросе API. Смотри консоль.');
    });

  function updateCard(movie) {
    var posterUrl = movie.poster_path ? 'https://image.tmdb.org/t/p/w500' + movie.poster_path : '';
    var posterEl = document.querySelector('.poster-placeholder');
    if (posterEl) {
      posterEl.style.backgroundImage = posterUrl ? 'url(' + posterUrl + ')' : '';
      posterEl.style.backgroundSize = 'cover';
      posterEl.style.backgroundPosition = 'center';
    }
    document.querySelector('.card-info h2').textContent = movie.title || 'Без названия';
    document.querySelector('.year').textContent = (movie.release_date || '').substring(0, 4) || '----';
    document.querySelector('.rating').textContent = '★ ' + (movie.vote_average ? movie.vote_average.toFixed(1) : '--');
    document.querySelector('.genres').textContent = ''; // жанры не загружаем в тесте
    document.querySelector('.description').textContent = movie.overview || '';
  }
});
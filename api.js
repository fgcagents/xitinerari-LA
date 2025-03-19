const limit = 20;
let totalCount = 0;
let allResults = [];
const CACHE_DURATION = 60000; // 60 segons en milisegons
let apiAccessTime = null; // Variable global per guardar el moment d'accés

// Funció per formatar la data en "hh:mm"
function formatTime(date) {
  let hours = date.getHours();
  let minutes = date.getMinutes();
  return (hours < 10 ? "0" + hours : hours) + ":" + (minutes < 10 ? "0" + minutes : minutes);
}

// Funció per verificar si les dades en caché són vàlides
function isCacheValid() {
  const cachedTimestamp = localStorage.getItem('lastFetch');
  if (!cachedTimestamp) return false;
  
  const now = Date.now();
  return (now - parseInt(cachedTimestamp)) < CACHE_DURATION;
}

// Funció recursiva per obtenir les dades paginades
function fetchPage(offset) {
  // Primer comprovem si hi ha dades en caché vàlides
  if (offset === 0 && isCacheValid()) {
    const cachedData = JSON.parse(localStorage.getItem('trainData'));
    apiAccessTime = new Date(parseInt(localStorage.getItem('lastFetch')));
    
    allResults = cachedData.results;
    totalCount = cachedData.total_count;
    
    document.getElementById('timestamp').textContent = "Timestamp de acceso: " + apiAccessTime.toLocaleString();
    document.getElementById('trainCount').textContent = "Trens Circulant: " + totalCount;
    
    return Promise.resolve();
  }

  const apiUrl = `https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=${limit}&offset=${offset}`;
  return fetch(apiUrl)
    .then(response => response.json())
    .then(data => {
      if (offset === 0 && data.total_count) {
        totalCount = data.total_count;
        const now = new Date();
        apiAccessTime = now; // Assigna el moment d'accés
          
        // Guarda les dades a la caché
        localStorage.setItem('trainData', JSON.stringify({
          results: data.results,
          total_count: data.total_count
        }));
        localStorage.setItem('lastFetch', Date.now().toString());
        
        document.getElementById('timestamp').textContent = "Timestamp de acceso: " + now.toLocaleString();
        document.getElementById('trainCount').textContent = "Trens Circulant: " + totalCount;
      }
      
      if (data.results && Array.isArray(data.results)) {
        allResults = allResults.concat(data.results);
      }
      
      if (offset + limit < totalCount) {
        return fetchPage(offset + limit);
      }
    })
    .catch(error => console.error('Error al obtenir les dades:', error));
}

// Funció per refrescar la informació de la API cada 60 segons
function refreshData() {
  // Es reinicia la llista de resultats
  allResults = [];
  fetchPage(0);
}

// Inicia la càrrega de dades i programa el refresc cada 60 segons
document.addEventListener("DOMContentLoaded", function(){
  fetchPage(0).then(() => {
    // Ja s'ha actualitzat el timestamp i el compte de trens; 
    // no es renderitza cap taula, per tant s'ha eliminat la crida a renderTable.
    setInterval(refreshData, 60000);
  });
});

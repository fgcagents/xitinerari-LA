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

// Funció per transformar un element de l'API al format que tindria la taula
function transformItem(item, timestampStr) {
  const obj = {};
  ['id', 'lin', 'dir', 'origen', 'desti', 'tipus_unitat'].forEach(field => {
    obj[field] = item[field] || '';
  });
  let properaParada = '';
  if (item.properes_parades) {
    try {
      let parts = item.properes_parades.split(';');
      if (parts.length > 0) {
        let firstPart = parts[0].trim();
        let parsed = JSON.parse(firstPart);
        properaParada = parsed.parada || '';
      }
    } catch (error) {
      console.error("Error al processar properes_parades:", error);
    }
  }
  obj.propera_parada = properaParada;
  obj.timestamp = timestampStr;
  return obj;
}

// Funció recursiva per obtenir totes les pàgines i acumular els resultats
function fetchPage(offset) {
  // Si és la primera pàgina i la cache és vàlida, utilitza-la
  if (offset === 0 && isCacheValid()) {
    const cachedData = JSON.parse(localStorage.getItem('trainData'));
    apiAccessTime = new Date(parseInt(localStorage.getItem('lastFetch')));
    
    allResults = cachedData.results; // Ja estan transformats
    totalCount = cachedData.total_count;
    
    document.getElementById('timestamp').textContent = "Timestamp de acceso: " + apiAccessTime.toLocaleString();
    document.getElementById('trainCount').textContent = "Trens Circulant: " + totalCount;
    
    return Promise.resolve(allResults);
  }

  const apiUrl = `https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=${limit}&offset=${offset}`;
  return fetch(apiUrl)
    .then(response => response.json())
    .then(data => {
      if (offset === 0 && data.total_count) {
        totalCount = data.total_count;
        const now = new Date();
        apiAccessTime = now;
        const timestampStr = formatTime(now);
        
        // Transformem la primera pàgina de resultats
        allResults = data.results.map(item => transformItem(item, timestampStr));
        
        // Guarda la cache amb els resultats transformats
        localStorage.setItem('trainData', JSON.stringify({
          results: allResults,
          total_count: totalCount
        }));
        localStorage.setItem('lastFetch', Date.now().toString());
        
        document.getElementById('timestamp').textContent = "Timestamp de acceso: " + now.toLocaleString();
        document.getElementById('trainCount').textContent = "Trens Circulant: " + totalCount;
      } else {
        // Per les pàgines posteriors, s'utilitza el mateix timestamp
        const transformedResults = data.results.map(item => transformItem(item, formatTime(apiAccessTime)));
        allResults = allResults.concat(transformedResults);
      }
      
      // Si encara hi ha més registres, crida recursivament
      if (offset + limit < totalCount) {
        return fetchPage(offset + limit);
      } else {
        // Quan s'han carregat totes les pàgines, retorna l'array complet
        return allResults;
      }
    })
    .catch(error => {
      console.error('Error al obtenir les dades:', error);
      throw error;
    });
}

// Funció per refrescar la informació de la API cada 60 segons
function refreshData() {
  // Es reinicia l'array i es torna a buscar tot
  allResults = [];
  fetchPage(0);
}

// Inicia la càrrega de dades i programa el refresc cada 60 segons
document.addEventListener("DOMContentLoaded", function(){
  fetchPage(0).then((results) => {
    console.log("Tots els resultats han estat carregats:", results);
    // Aquí pots fer alguna acció amb tots els resultats si cal
    setInterval(refreshData, 60000);
  });
});

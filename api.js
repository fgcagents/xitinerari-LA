    const limit = 20;
    let totalCount = 0;
    let allResults = [];
    const CACHE_DURATION = 60000; // 60 segundos en milisegundos

    // Función para verificar si los datos en caché son válidos
    function isCacheValid() {
      const cachedTimestamp = localStorage.getItem('lastFetch');
      if (!cachedTimestamp) return false;
      
      const now = Date.now();
      return (now - parseInt(cachedTimestamp)) < CACHE_DURATION;
    }

    // Función para crear una fila de la tabla con los datos de un tren
    function createTableRow(item) {
      const tr = document.createElement('tr');
      
      // Extrae y muestra los campos
      ['id', 'lin', 'dir', 'origen', 'desti', 'tipus_unitat'].forEach(field => {
        const td = document.createElement('td');
        td.textContent = item[field] || '';
        tr.appendChild(td);
      });

      // Procesa el campo properes_parades: es una cadena con objetos JSON separados por ";"
      let properaParada = '';
      if (item.properes_parades) {
        try {
          // Se divide la cadena en partes usando ";" como separador
          let parts = item.properes_parades.split(';');
          if (parts.length > 0) {
            // Se toma la primera parte, se elimina espacios en blanco y se parsea como JSON
            let firstPart = parts[0].trim();
            let parsed = JSON.parse(firstPart);
            properaParada = parsed.parada || '';
          }
        } catch (error) {
          console.error("Error al procesar properes_parades:", error);
        }
      }
      const tdParada = document.createElement('td');
      tdParada.textContent = properaParada;
      tr.appendChild(tdParada);

      return tr;
    }

    // Función para renderizar la tabla con los resultados obtenidos
    function renderTable(results) {
      const tableBody = document.querySelector('#trainsTable tbody');
      results.forEach(item => {
        const row = createTableRow(item);
        tableBody.appendChild(row);
      });
    }

    // Función recursiva modificada para obtener los datos paginados
    function fetchPage(offset) {
      // Primero verificamos si hay datos en caché válidos
      if (offset === 0 && isCacheValid()) {
        const cachedData = JSON.parse(localStorage.getItem('trainData'));
        const cachedTimestamp = new Date(parseInt(localStorage.getItem('lastFetch')));
        
        allResults = cachedData.results;
        totalCount = cachedData.total_count;
        
        document.getElementById('timestamp').textContent = "Timestamp de acceso: " + cachedTimestamp.toLocaleString();
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
            
            // Guardamos los datos en caché
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
        .catch(error => console.error('Error al obtener los datos:', error));
    }

    // Inicia la obtención de datos cuando el DOM está cargado
    document.addEventListener("DOMContentLoaded", function(){
      fetchPage(0).then(() => {
        renderTable(allResults);
      });
    });

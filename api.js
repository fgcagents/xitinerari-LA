// Configuración de paginación y caché
const limit = 20;
let totalCount = 0;
let allResults = [];
let apiAccessTime = null;
let itinerarios = [];
let cachedData = null;
let lastCacheTime = null;
const toleranciaMs = 5 * 60 * 1000; // 5 minutos
const cacheDurationMs = 60 * 1000; // 1 minuto

// Función para formatear una fecha en "HH:MM"
function formatTime(date) {
  let hours = date.getHours();
  let minutes = date.getMinutes();
  return (hours < 10 ? "0" + hours : hours) + ":" + (minutes < 10 ? "0" + minutes : minutes);
}

// Función recursiva para obtener todos los registros de la API (paginación completa)
function fetchPage(offset) {
  const now = new Date().getTime();
  if (cachedData && lastCacheTime && (now - lastCacheTime < cacheDurationMs)) {
    allResults = cachedData;
    processMatching();
    return Promise.resolve();
  }
  const apiUrl = `https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=${limit}&offset=${offset}`;
  return fetch(apiUrl)
    .then(response => response.json())
    .then(data => {
      if (offset === 0 && data.total_count) {
        totalCount = data.total_count;
        apiAccessTime = new Date();
        /*document.getElementById('timestamp').textContent = "Timestamp de acceso: " + apiAccessTime.toLocaleString();*/
      }
      if (data.results && Array.isArray(data.results)) {
        allResults = allResults.concat(data.results);
      }
      if (offset + limit < totalCount) {
        return fetchPage(offset + limit);
      } else if (offset === 0) {
        // Guardar en caché solo cuando se completa la carga inicial
        cachedData = allResults;
        lastCacheTime = now;
        console.log("Datos guardados en caché:", cachedData);
      }
    })
    .catch(error => console.error('Error al obtener les dades:', error));
}

// Convierte un string "HH:MM" a un objeto Date con la fecha de hoy
function convertirHora(horaStr) {
  const [horas, minutos] = horaStr.split(':').map(Number);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), horas, minutos, 0, 0);
}

// Parsea el campo properes_parades (cadena con objetos JSON separados por ";")
function parsearParadas(paradasStr) {
  const paradas = [];
  if (!paradasStr) return paradas;
  const parts = paradasStr.split(';');
  parts.forEach(part => {
    try {
      const obj = JSON.parse(part.trim());
      if (obj.parada) {
        paradas.push(obj.parada);
      }
    } catch (error) {
      console.error("Error parseando properes_parades:", error);
    }
  });
  return paradas;
}

// Realiza el matching y guarda los resultados en localStorage
function processMatching() {
  const resultados = [];
  const ahora = new Date();
  const idsProcesados = new Set();
  
  if (itinerarios.length === 0) {
    console.warn("Carregar el fitxer JSON d'itineraris");
    return;
  }
  
  itinerarios.forEach(itin => {
    let matchEncontrado = false;
    const linItinShort = String(itin.Linia || "").trim().substring(0, 2).toUpperCase();
    const dirItin = String(itin["A/D"] || "").trim().toUpperCase();

    for (let i = 0; i < allResults.length && !matchEncontrado; i++) {
      const record = allResults[i];
      const linRecordShort = String(record.lin || "").trim().substring(0, 2).toUpperCase();
      const dirRecord = String(record.dir || "").trim().toUpperCase();
      
      if (linRecordShort === linItinShort && dirRecord === dirItin) {
        if (idsProcesados.has(record.id)) {
          continue;
        }
        if (record.estacionat_a && itin.hasOwnProperty(record.estacionat_a)) {
          const horaProgramadaStr = itin[record.estacionat_a];
          try {
            const horaProgramada = convertirHora(horaProgramadaStr);
            if (Math.abs(ahora - horaProgramada) <= toleranciaMs) {
              resultados.push({
                "ID Tren": `${record.id} (${itin.Tren})`, // Mantener para compatibilidad
                "API_ID": record.id,           // Nuevo campo
                "Tren_Numero": itin.Tren,      // Nuevo campo
                "Línea": record.lin,
                "Dirección": record.dir,
                "Estación": record.estacionat_a,
                "Hora Programada": horaProgramadaStr,
                "Estado": "Estacionat",
                itinerary: itin
              });
              idsProcesados.add(record.id);
              matchEncontrado = true;
              continue;
            }
          } catch (error) {
            console.error("Error al convertir la hora:", error);
          }
        }
        const paradasAPI = parsearParadas(record.properes_parades);
        for (let j = 0; j < paradasAPI.length && !matchEncontrado; j++) {
          const parada = paradasAPI[j];
          if (itin.hasOwnProperty(parada)) {
            const horaProgramadaStr = itin[parada];
            try {
              const horaProgramada = convertirHora(horaProgramadaStr);
              if (Math.abs(ahora - horaProgramada) <= toleranciaMs) {
                resultados.push({
                  "ID Tren": `${record.id} (${itin.Tren})`, // Mantener para compatibilidad
                  "API_ID": record.id,           // Nuevo campo
                  "Tren_Numero": itin.Tren,      // Nuevo campo
                  "Línea": record.lin,
                  "Dirección": record.dir,
                  "Estación": parada,
                  "Hora Programada": horaProgramadaStr,
                  "Estado": "Circulant",
                  itinerary: itin
                });
                idsProcesados.add(record.id);
                matchEncontrado = true;
                break;
              }
            } catch (error) {
              console.error("Error al convertir la hora:", error);
            }
          }
        }
      }
    }
  });
  
  if (resultados.length === 0) {
    console.warn("No se encontraron coincidencias");
  } else {
    console.log("Resultados de matching:", resultados);
  }
  
  // Modificar el guardado en localStorage para incluir ambos IDs
  const trenes = resultados.map(res => ({
    nombre: res.Tren_Numero,
    id: res.API_ID,
    id_completo: res["ID Tren"]  // Mantener el formato original también
  }));
  
  localStorage.setItem("trenes", JSON.stringify(trenes));
  console.log("Lista de trenes guardada en localStorage:", trenes);
}

// Función para refrescar los datos
function refreshData() {
  cachedData = null;
  lastCacheTime = null;
  allResults = [];
  if (GLOBAL_JSON_DATA) {
    itinerarios = GLOBAL_JSON_DATA;
    console.log('Itinerarios actualizados desde GLOBAL_JSON_DATA:', itinerarios);
  }
  fetchPage(0).then(() => {
    processMatching();
  });
}

// Observer para detectar cambios en GLOBAL_JSON_DATA
let lastJsonValue = null;
setInterval(() => {
    if (GLOBAL_JSON_DATA !== lastJsonValue) {
        lastJsonValue = GLOBAL_JSON_DATA;
        if (GLOBAL_JSON_DATA) {
            itinerarios = GLOBAL_JSON_DATA;
            console.log('Itinerarios actualizados por cambio en GLOBAL_JSON_DATA:', itinerarios);
            processMatching();
        }
    }
}, 1000);

// Manejar la carga del fichero de itinerarios
/*document.getElementById('itinerarioFile').addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      let data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) { data = [data]; }
      itinerarios = data;
      console.log('Itinerarios cargados:', itinerarios);
      processMatching();
    } catch (err) {
      console.error('Error al leer el fitxer JSON:', err);
    }
  };
  reader.readAsText(file);
});*/

// Función para mostrar los datos de la caché en la consola
function mostrarCache() {
  if (cachedData) {
    console.log("Datos en caché:", cachedData);
  } else {
    console.log("No hay datos en caché.");
  }
}

// Inicia la carga de datos al cargar la página y refresca cada 30 segundos
document.addEventListener("DOMContentLoaded", function(){
    if (GLOBAL_JSON_DATA) {
        itinerarios = GLOBAL_JSON_DATA;
        console.log('Itinerarios cargados desde GLOBAL_JSON_DATA:', itinerarios);
    } else {
        console.warn('GLOBAL_JSON_DATA no está disponible.');
    }
    allResults = [];
    fetchPage(0).then(() => {
        processMatching();
        setInterval(refreshData, 30000);
    });
});

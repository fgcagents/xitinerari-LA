// Configuración de paginación y caché
const limit = 20;
let totalCount = 0;
let allResults = [];
let apiAccessTime = null;
let itinerarios = [];
let cachedData = null;
let lastCacheTime = null;
const toleranciaMs = 10 * 60 * 1000; // 10 minutos
const cacheDurationMs = 30 * 1000; // 30 segons

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
    console.log("Usando datos en caché:", allResults);
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
        console.log(`Total de registros esperados: ${totalCount}`);
        console.log(`Número de páginas necesarias: ${Math.ceil(totalCount/limit)}`);
      }
      if (data.results && Array.isArray(data.results)) {
        allResults = allResults.concat(data.results);
      }
      
      // Verificar si necesitamos más páginas
      if (offset + limit < totalCount) {
        return fetchPage(offset + limit);
      } else {
        // Hemos terminado de obtener todas las páginas
        console.log("Recuperación completa:", {
          totalEsperado: totalCount,
          totalObtenido: allResults.length,
          páginas: Math.ceil(totalCount/limit)
        });
        
        // Asignamos en caché al finalizar todas las páginas
          cachedData = allResults;
          lastCacheTime = now;
          console.log("Datos guardados en caché:", cachedData);
        
      }
    })
    .catch(error => {
      console.error('Error al obtener les dades:', error);
      console.error('URL que falló:', apiUrl);
      console.error('Offset donde falló:', offset);
    });
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
  console.group('Process Matching');
  console.log('Iniciando matching con:', {
    'Total trenes API': allResults.length,
    'Total itinerarios': itinerarios.length
  });
  
  const resultados = [];
  const trenesSinItinerario = [];
  const ahora = new Date();
  const idsProcesados = new Set();
  const lineasForzadas = ["R5", "R6", "S3", "S4", "S8", "S9", "L8"];
  
  if (itinerarios.length === 0) {
    console.warn("Carregar el fitxer JSON d'itineraris");
    console.groupEnd();
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
        
        const paradasAPI = parsearParadas(record.properes_parades);
        for (let j = 0; j < paradasAPI.length && !matchEncontrado; j++) {
          const parada = paradasAPI[j];
          if (itin.hasOwnProperty(parada)) {
            const horaProgramadaStr = itin[parada];
            try {
              const horaProgramada = convertirHora(horaProgramadaStr);
              if (Math.abs(ahora - horaProgramada) <= toleranciaMs) {
                resultados.push({
                  "ID Tren": `${record.id} (${itin.Tren})`,
                  "API_ID": record.id,
                  "Tren_Numero": itin.Tren,
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
  
  // Identificar trenes sin itinerario asignado para las líneas forzadas
  allResults.forEach(record => {
    if (!idsProcesados.has(record.id) && record.lin) {
      const upperLin = record.lin.toUpperCase();
      if (lineasForzadas.some(code => upperLin.startsWith(code))) {
        // Extraer la próxima estación del campo properes_parades
        const paradasAPI = parsearParadas(record.properes_parades);
        const properaEstacio = paradasAPI.length > 0 ? paradasAPI[0] : null;
  
        // Determinar el estado del tren
        const estado = record.estacionat_a ? "Estacionat" : "Circulant";
  
        trenesSinItinerario.push({
          "ID Tren": record.id,
          "Línea": record.lin,
          "Dirección": record.dir,
          "Estado": "Sin asignar",
          "Propera Estació": properaEstacio,
          "Estado Tren": estado
        });
      }
    }
  });
  
  if (resultados.length === 0) {
    console.warn("No se encontraron coincidencias");
  } else {
    console.log("Resultados de matching:", resultados);
  }
  
  if (trenesSinItinerario.length > 0) {
    console.warn("Trenes sin itinerario asignado:", trenesSinItinerario);
  }
  
  console.groupEnd();
  
  // Guardar resultados en localStorage
  const trenes = resultados.map(res => ({
    nombre: res.Tren_Numero,
    id: res.API_ID,
    id_completo: res["ID Tren"]
  }));
  
  localStorage.setItem("trenes", JSON.stringify(trenes));
  console.log("Lista de trenes guardada en localStorage:", trenes);
}

// Función para refrescar los datos
function refreshData() {
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
/*let lastJsonValue = null;
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
*/
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

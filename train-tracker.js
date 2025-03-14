// Configuración para la API de trenes en circulación
const API_URL = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records';
const API_LIMIT = 20;
let circulating = []; // Array para almacenar los trenes en circulación
let lastApiUpdate = null; // Tiempo de la última actualización de la API

// Función para obtener todos los datos de la API paginada
async function fetchAllTrains() {
    let allTrains = [];
    let offset = 0;
    let hasMore = true;
    
    elements.loading.classList.add('visible');
    
    try {
        while (hasMore) {
            const url = `${API_URL}?limit=${API_LIMIT}&offset=${offset}`;
            const response = await fetchJSON(url);
            
            if (response.results && response.results.length > 0) {
                allTrains = [...allTrains, ...response.results];
                offset += API_LIMIT;
                
                // Si recibimos menos registros que el límite, hemos terminado
                if (response.results.length < API_LIMIT) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }
        
        // Procesar los datos obtenidos
        processCirculatingTrains(allTrains);
        lastApiUpdate = new Date();
        
        // Actualizar la tabla si hay datos filtrados
        if (filteredData.length > 0) {
            updateTable();
        }
        
        // Añadir log para depuración
        console.log(`Obtenidos ${allTrains.length} trenes en circulación`);
        
        return allTrains;
    } catch (error) {
        console.error('Error al obtener datos de trenes en circulación:', error);
        showError('Error al cargar los datos de trenes en circulación');
        return [];
    } finally {
        elements.loading.classList.remove('visible');
    }
}

// Función para parsear el campo 'properes_parades' de la API
function parseProperesParades(paradasStr) {
    if (!paradasStr) return [];
    
    const paradas = [];
    try {
        // Intentar parsear como JSON
        const obj = JSON.parse(paradasStr);
        if (obj && obj.parada) {
            paradas.push(obj.parada);
        }
    } catch (e) {
        // Si falla, intentar parsear como múltiples objetos JSON separados por ';'
        const parts = paradasStr.split(';');
        parts.forEach(part => {
            if (!part.trim()) return;
            
            try {
                const obj = JSON.parse(part);
                if (obj && obj.parada) {
                    paradas.push(obj.parada);
                }
            } catch (innerError) {
                // Ignorar errores de parseo individuales
                console.warn(`Error al parsear parada: ${part}`, innerError);
            }
        });
    }
    return paradas;
}

// Función para procesar los datos de la API y normalizar la información
function processCirculatingTrains(apiData) {
    circulating = apiData.map(train => {
        // Extraer las próximas paradas
        const paradas = parseProperesParades(train.properes_parades || '');
        
        return {
            id: train.id,
            lin: train.lin,           // Línea (S1, S2, etc.)
            dir: train.dir,           // Dirección (A: ascendente, D: descendente)
            origen: train.origen,     // Estación de origen
            desti: train.desti,       // Estación de destino
            paradas: paradas,         // Próximas paradas
            estacionat: train.estacionat_a, // Si está estacionado en alguna estación
            enHora: train.en_hora === "True", // Si va en hora
            unidad: train.ut,         // Identificador de la unidad
            geoPoint: train.geo_point_2d // Coordenadas geográficas
        };
    });
    
    // Añadir log para depuración
    console.log(`Procesados ${circulating.length} trenes en circulación`);
    console.log('Ejemplos de datos procesados:', circulating.slice(0, 2));
}

// Función para determinar si un tren está circulando según los datos de la API
function isTrainCirculating(entry) {
    // Añadir log para depuración
    console.log('Verificando si está circulando:', entry);
    
    // Si no hay datos de circulación, no podemos determinar si está circulando
    if (!circulating || !circulating.length) {
        console.log('No hay datos de circulación');
        return false;
    }
    
    // Obtener la hora actual
    const now = new Date();
    
    // Construir la fecha del tren usando la hora del registro
    const [hours, minutes] = entry.hora.split(':').map(Number);
    const trainTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    
    // Ventana de tiempo (en minutos) para considerar que un tren está circulando
    const TIME_WINDOW_MINUTES = 15; // Aumentado para dar más margen
    const timeWindow = TIME_WINDOW_MINUTES * 60 * 1000; // Convertir a milisegundos
    
    // Verificar si la hora del tren está dentro de la ventana de tiempo actual
    const timeDiff = Math.abs(now - trainTime);
    console.log(`Diferencia de tiempo: ${timeDiff} ms (máx permitido: ${timeWindow} ms)`);
    
    if (timeDiff > timeWindow) {
        console.log('Fuera de la ventana de tiempo');
        return false;
    }
    
    // Buscar en los trenes en circulación
    for (let train of circulating) {
        // Comprobar si coincide la línea y la dirección
        if (train.lin === entry.linia && train.dir === entry.ad) {
            console.log('Coincidencia en línea y dirección:', train.lin, train.dir);
            
            // Comprobar si la estación está en las próximas paradas
            if (train.paradas && train.paradas.includes(entry.estacio)) {
                console.log('Estación en próximas paradas');
                return true;
            }
            
            // Si el tren está estacionado en esta estación
            if (train.estacionat === entry.estacio) {
                console.log('Tren estacionado en esta estación');
                return true;
            }
        }
    }
    
    console.log('No coincide con ningún tren en circulación');
    return false;
}

// Función para actualizar la tabla con la información de trenes en circulación
function updateTableWithCirculationInfo() {
    // Obtener todas las filas de la tabla
    const rows = elements.resultats.querySelectorAll('tbody tr');
    
    // Añadir log para depuración
    console.log(`Actualizando información de circulación para ${rows.length} filas`);
    
    // Iterar sobre cada fila
    rows.forEach((row, index) => {
        // Obtener los datos de la fila
        // NOTA: Ajustar estos índices según la estructura real de la tabla
        try {
            const cells = row.querySelectorAll('td');
            
            // Verificar que hay suficientes celdas
            if (cells.length < 6) {
                console.warn(`Fila ${index} no tiene suficientes celdas: ${cells.length}`);
                return;
            }
            
            // Este índice puede variar según la estructura real de la tabla - añadir depuración
            console.log(`Contenido de celdas en fila ${index}:`, Array.from(cells).map(cell => cell.textContent.trim()));
            
            const tren = cells[2].textContent.trim();
            const estacio = cells[3].textContent.trim();
            const hora = cells[4].textContent.trim();
            const linia = cells[5].textContent.trim();
            const ad = cells[1].textContent.trim();
            
            // Crear un objeto con los datos para verificar si está circulando
            const entry = {
                tren: tren,
                estacio: estacio,
                hora: hora,
                linia: linia,
                ad: ad
            };
            
            // Verificar si el tren está circulando
            const isCirculating = isTrainCirculating(entry);
            
            // Aplicar la clase CSS correspondiente
            if (isCirculating) {
                row.classList.add('circulando');
                console.log(`Fila ${index} marcada como circulando`);
            } else {
                row.classList.remove('circulando');
            }
        } catch (error) {
            console.error(`Error al procesar fila ${index}:`, error);
        }
    });
}

// Modificar la función updateTable para incluir la información de circulación
let originalUpdateTable;
if (typeof updateTable !== 'undefined') {
    originalUpdateTable = updateTable;
    updateTable = function() {
        // Llamar a la función original
        originalUpdateTable();
        
        // Actualizar con la información de circulación
        updateTableWithCirculationInfo();
        
        // Mostrar la información de la última actualización de la API
        if (lastApiUpdate) {
            const apiUpdateInfo = document.getElementById('api-update-info');
            if (!apiUpdateInfo) {
                const infoDiv = document.createElement('div');
                infoDiv.id = 'api-update-info';
                infoDiv.className = 'api-update-info';
                elements.resultContainer.appendChild(infoDiv);
            }
            document.getElementById('api-update-info').textContent = `Última actualización: ${lastApiUpdate.toLocaleTimeString()}`;
        }
    };
} else {
    console.error('La función updateTable no está definida');
}
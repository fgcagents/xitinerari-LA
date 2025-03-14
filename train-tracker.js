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
    const paradas = [];
    try {
        // Intentar parsear como JSON
        const obj = JSON.parse(paradasStr);
        if (obj.parada) {
            paradas.push(obj.parada);
        }
    } catch (e) {
        // Si falla, intentar parsear como múltiples objetos JSON separados por ';'
        const parts = paradasStr.split(';');
        parts.forEach(part => {
            try {
                const obj = JSON.parse(part);
                if (obj.parada) {
                    paradas.push(obj.parada);
                }
            } catch (innerError) {
                // Ignorar errores de parseo individuales
            }
        });
    }
    return paradas;
}

// Función para procesar los datos de la API y normalizar la información
function processCirculatingTrains(apiData) {
    circulating = apiData.map(train => {
        // Extraer las próximas paradas
        const paradas = parseProperesParades(train.properes_parades);
        
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
    
    console.log(`Procesados ${circulating.length} trenes en circulación`);
}

// Función para determinar si un tren está circulando según los datos de la API
function isTrainCirculating(entry) {
    // Si no hay datos de circulación, no podemos determinar si está circulando
    if (!circulating.length) return false;
    
    // Obtener la hora actual
    const now = new Date();
    
    // Construir la fecha del tren usando la hora del registro
    const [hours, minutes] = entry.hora.split(':').map(Number);
    const trainTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    
    // Ventana de tiempo (en minutos) para considerar que un tren está circulando
    const TIME_WINDOW_MINUTES = 5;
    const timeWindow = TIME_WINDOW_MINUTES * 60 * 1000; // Convertir a milisegundos
    
    // Verificar si la hora del tren está dentro de la ventana de tiempo actual
    if (Math.abs(now - trainTime) > timeWindow) {
        return false;
    }
    
    // Buscar en los trenes en circulación
    for (let train of circulating) {
        // Comprobar si coincide la línea y la dirección
        if (train.lin === entry.linia && train.dir === entry.ad) {
            // Comprobar si la estación está en las próximas paradas
            if (train.paradas.includes(entry.estacio)) {
                return true;
            }
            
            // Si el tren está estacionado en esta estación
            if (train.estacionat === entry.estacio) {
                return true;
            }
        }
    }
    
    return false;
}

// Función para actualizar la tabla con la información de trenes en circulación
function updateTableWithCirculationInfo() {
    // Obtener todas las filas de la tabla
    const rows = elements.resultats.querySelectorAll('tbody tr');
    
    // Iterar sobre cada fila
    rows.forEach(row => {
        // Obtener los datos de la fila
        const tren = row.querySelector('td:nth-child(3)').textContent;
        const estacio = row.querySelector('td:nth-child(4)').textContent;
        const hora = row.querySelector('td:nth-child(5)').textContent;
        const linia = row.querySelector('td:nth-child(6)').textContent;
        const ad = row.querySelector('td:nth-child(2)').textContent;
        
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
        } else {
            row.classList.remove('circulando');
        }
    });
}

// Modificar la función updateTable para incluir la información de circulación
const originalUpdateTable = updateTable;
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

// Función para agregar un botón para actualizar los datos de la API
function addApiUpdateButton() {
    const container = document.querySelector('.filters-container');
    if (!container) return;
    
    // Crear el botón solo si no existe
    if (!document.getElementById('update-api-button')) {
        const button = document.createElement('button');
        button.id = 'update-api-button';
        button.textContent = 'Actualizar trenes en circulación';
        button.className = 'clear-filters';
        button.addEventListener('click', fetchAllTrains);
        
        container.appendChild(button);
    }
}

// Modificar la función init para incluir la carga de datos de la API
const originalInit = init;
init = async function() {
    // Llamar a la función original
    await originalInit();
    
    // Añadir estilos CSS para los trenes en circulación
    const style = document.createElement('style');
    style.textContent = `
        .circulando {
            background-color: #a8e6a1;
        }
        .api-update-info {
            font-size: 0.8em;
            color: #666;
            margin-top: 5px;
            text-align: right;
        }
    `;
    document.head.appendChild(style);
    
    // Añadir el botón para actualizar datos de la API
    addApiUpdateButton();
    
    // Cargar los datos de la API
    await fetchAllTrains();
    
    // Configurar actualización periódica (cada 5 minutos)
    setInterval(fetchAllTrains, 5 * 60 * 1000);
};

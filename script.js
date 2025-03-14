// Variables globals
let data = [];
let currentPage = 0;
const ITEMS_PER_PAGE = 33;
const DEBOUNCE_DELAY = 300;
let filterTimeout;
let filteredData = [];

// Elementos del DOM
const elements = {
    tren: document.getElementById('tren'),
    linia: document.getElementById('linia'),
    ad: document.getElementById('ad'),
    estacio: document.getElementById('estacio'),
    torn: document.getElementById('torn'), // Nuevo filtro para Torn
    horaInici: document.getElementById('horaInici'),
    horaFi: document.getElementById('horaFi'),
    resultContainer: document.getElementById('resultContainer'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('errorMessage'),
    clearFilters: document.getElementById('clearFilters'),
    resultats: document.getElementById('resultats'),
    currentYear: document.getElementById('current-year')
};

// Utilidad para mostrar errores
const showError = (message) => {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
    setTimeout(() => (elements.errorMessage.style.display = 'none'), 5000);
};

// Función genérica de fetch con manejo de error
async function fetchJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    return response.json();
}

// Función para cargar las estacions
async function cargarEstaciones() {
    try {
        const estacionesData = await fetchJSON('estacions.json');
        const datalist = document.getElementById('estacions');
        estacionesData.forEach(estacion => {
            const option = document.createElement('option');
            option.value = estacion.value;
            option.textContent = estacion.name;
            datalist.appendChild(option);
        });
    } catch (error) {
        console.error('Error cargando las estaciones:', error);
        showError('Error al cargar las estaciones');
    }
}

// Función para actualizar el título de la tabla
function updateTableTitle() {
    const select = elements.ad;
    const title = document.getElementById('table-title');
    const value = select.value;
    if (value === 'A') {
        title.textContent = 'Trens Ascendents';
    } else if (value === 'D') {
        title.textContent = 'Trens Descendents';
    } else {
        title.textContent = 'Ascendents/Descendents';
    }
}

// Funciones de conversión de tiempo
const timeToMinutes = timeStr => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// Función para cargar datos desde un archivo dado
async function loadData(filename = 'itinerari_LA51_2_0_1_asc_desc.json') {
    try {
        elements.loading.classList.add('visible');
        const jsonData = await fetchJSON(filename);
        data = jsonData;
        elements.resultContainer.style.display = 'none';
        filteredData = [];
        return data;
    } catch (error) {
        console.error('Error al cargar dades:', error);
        showError('Error al cargar les dades');
        throw error;
    } finally {
        elements.loading.classList.remove('visible');
    }
}

// Función para registrar los event listeners del menú
function initMenuListeners() {
    document.querySelectorAll('.menu a').forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const filename = e.target.dataset.file;
            try {
                await loadData(filename);
                const title = filename.includes('0_1') ? '000/100' : 
                              filename.includes('4_5') ? '400/500' : 
                              filename.includes('2_3') ? '200/300' : 
                              'feiners';
                document.querySelector('h1').textContent = `Servei ${title}`;
            } catch (error) {
                console.error('Error al canviar d\'itinerari:', error);
            }
        });
    });
}

// Función debounce para optimizar llamadas a filterData
function debounce(func, delay) {
    return function (...args) {
        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Función para limpiar filtros y actualizar la tabla
function clearFilters() {
    elements.tren.value = '';
    elements.linia.value = '';
    elements.ad.value = '';
    elements.estacio.value = '';
    elements.torn.value = ''; // Limpiar filtro Torn
    elements.horaInici.value = '';
    elements.horaFi.value = '';
    elements.resultContainer.style.display = 'none';
    filteredData = [];
    updateTable();
}

// Función para ordenar resultados basados en la hora
const sortResultsByTime = results => {
    return results.sort((a, b) => {
        const timeA = timeToMinutes(a.hora);
        const timeB = timeToMinutes(b.hora);
        if (timeA === null) return 1;
        if (timeB === null) return -1;
        const adjustedTimeA = timeA < 240 ? timeA + 1440 : timeA;
        const adjustedTimeB = timeB < 240 ? timeB + 1440 : timeB;
        return adjustedTimeA - adjustedTimeB;
    });
};

// Función para determinar si se debe resaltar la hora
function shouldHighlightTime(entry) {
    const estaciones = {
        R5: ["MV", "CL", "CG"],
        R6: ["MV", "CG"],
        R50: ["MG", "ML", "CG", "CL", "CR", "QC", "PL", "MV", "ME", "AE", "CB"],
        R60: ["MG", "ML", "CG", "CR", "QC", "PA", "PL", "MV", "ME", "BE", "CP"]
    };

    const specificTrains = ["N334", "P336", "P362", "N364", "P364", "N366", "P366"];
    const isLineaValid = Object.keys(estaciones).includes(entry.linia) && estaciones[entry.linia].includes(entry.estacio);
    const isSpecificTrain = specificTrains.includes(entry.tren);
    return isLineaValid && !(isSpecificTrain && entry.ad === "D");
}

// Función de filtrado principal
function filterData() {
    const filters = {
        tren: elements.tren.value.trim(),
        linia: elements.linia.value.trim(),
        ad: elements.ad.value.trim(),
        estacio: elements.estacio.value.trim(),
        torn: elements.torn.value.trim(), // Nuevo filtro
        horaInici: elements.horaInici.value.trim(),
        horaFi: elements.horaFi.value.trim()
    };

    const hasActiveFilters = Object.values(filters).some(value => value);
    if (!hasActiveFilters) {
        elements.resultContainer.style.display = 'none';
        filteredData = [];
        return;
    }

    currentPage = 0;
    const horaIniciMin = timeToMinutes(filters.horaInici);
    const horaFiMin = timeToMinutes(filters.horaFi);

    if (filters.torn) {
        // Si se filtra por Torn, se lista un SOLO registro por cada tren cuyo Torn coincida,
        // tomando la estación con el horario más bajo
        filteredData = data
            .filter(item => item.Torn && item.Torn.toLowerCase().includes(filters.torn.toLowerCase()))
            .map(item => {
                const stations = Object.keys(item)
                    .filter(key => !['Tren', 'Linia', 'A/D', 'Serveis', 'Torn', 'Tren_S'].includes(key) && item[key])
                    .sort((a, b) => {
                        const tA = timeToMinutes(item[a]);
                        const tB = timeToMinutes(item[b]);
                        return tA - tB;
                    });
                if (stations.length > 0) {
                    const selectedStation = stations[0];
                    return {
                        tren: item.Tren,
                        linia: item.Linia,
                        ad: item['A/D'],
                        torn: item.Torn,
                        tren_s: item.Tren_S,
                        estacio: selectedStation,
                        hora: item[selectedStation]
                    };
                }
            })
            .filter(entry => {
                if (!entry) return false;
                const entryTimeMin = timeToMinutes(entry.hora);
                let matchesTimeRange = true;
                if (horaIniciMin !== null) {
                    if (horaFiMin === null) {
                        if (entryTimeMin < horaIniciMin && entryTimeMin < 240) {
                            matchesTimeRange = true;
                        } else {
                            matchesTimeRange = entryTimeMin >= horaIniciMin;
                        }
                    } else {
                        if (horaIniciMin > horaFiMin) {
                            matchesTimeRange = entryTimeMin >= horaIniciMin || entryTimeMin <= horaFiMin;
                        } else {
                            matchesTimeRange = entryTimeMin >= horaIniciMin && entryTimeMin <= horaFiMin;
                        }
                    }
                }
                return (
                    (!filters.tren || entry.tren.toLowerCase().includes(filters.tren.toLowerCase())) &&
                    (!filters.linia || entry.linia.toLowerCase().includes(filters.linia.toLowerCase())) &&
                    (!filters.ad || entry.ad === filters.ad) &&
                    (!filters.estacio || entry.estacio.toLowerCase().includes(filters.estacio.toLowerCase())) &&
                    matchesTimeRange
                );
            });
    } else {
    // Sin filtro Torn, se listan todas las estaciones (itinerario completo)
    filteredData = data.flatMap(item =>
        Object.keys(item)
            .filter(key => !['Tren', 'Linia', 'A/D', 'Serveis', 'Torn', 'Tren_S'].includes(key) && item[key])
            .map(station => ({
                tren: item.Tren,
                linia: item.Linia,
                ad: item['A/D'],
                torn: item.Torn,
                tren_s: item.Tren_S,
                estacio: station,
                hora: item[station]
            }))
        .filter(entry => {
            const entryTimeMin = timeToMinutes(entry.hora);
            let matchesTimeRange = true;

            if (horaIniciMin !== null) {
                if (horaFiMin === null) {
                    // Si solo se proporciona hora de inicio
                    // Asumimos que horas menores a la hora de inicio son trenes de después de medianoche
                    if (entryTimeMin < horaIniciMin && entryTimeMin < 240) { // 240 minutos = 4:00 AM
                        // Probablemente es un tren de después de medianoche
                        matchesTimeRange = true;
                    } else {
// Tren normal después de la hora de inicio
                        matchesTimeRange = entryTimeMin >= horaIniciMin;
                    }
                } else {
                    // Si el rango pasa por medianoche (ej: 23:00 a 01:00)
                    if (horaIniciMin > horaFiMin) {
                        matchesTimeRange = entryTimeMin >= horaIniciMin || entryTimeMin <= horaFiMin;
                    } else {
                        matchesTimeRange = entryTimeMin >= horaIniciMin && entryTimeMin <= horaFiMin;
                    }
                }
            }
            
            return (
                (!filters.tren || entry.tren.toLowerCase().includes(filters.tren.toLowerCase())) &&
                (!filters.linia || entry.linia.toLowerCase().includes(filters.linia.toLowerCase())) &&
                (!filters.ad || entry.ad === filters.ad) &&
                (!filters.estacio || entry.estacio.toLowerCase().includes(filters.estacio.toLowerCase())) &&
                (!filters.torn || entry.torn.toLowerCase().includes(filters.torn.toLowerCase())) && // Filtro para Torn
                matchesTimeRange
            );
        })  
    );
    }
    filteredData = sortResultsByTime(filteredData);
    updateTable();
    
    // Si hay datos filtrados, se consulta la API para marcar los trenes circulantes
    if (filteredData.length) {
        updateCirculatingStatus();
    }
}

// Nueva constante para la URL de la API
const API_URL = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records';

// Función para obtener todos los datos de la API paginando (limite 20 por petición)
async function fetchAPITrains() {
    const rows = 20;
    let start = 0;
    let total = 0;
    let allTrains = [];
    do {
        const url = `${API_URL}?rows=${rows}&start=${start}`;
        const apiResponse = await fetchJSON(url);
        // La primera petición nos indica el total
        if (!total) {
            total = apiResponse.total_count;
        }
        allTrains = allTrains.concat(apiResponse.results);
        start += rows;
    } while (start < total);
    return allTrains;
}

// Función para extraer el nombre de la estación de un registro de la API
function getApiStation(record) {
    try {
        const parsed = JSON.parse(record.properes_parades);
        return parsed.parada ? parsed.parada.toLowerCase() : '';
    } catch (e) {
        return '';
    }
}

// Nueva función para parsear el campo 'properes_parades' de la API, 
// que puede contener uno o varios objetos JSON separados por ';'
function parseProperesParades(paradasStr) {
    const paradas = [];
    const parts = paradasStr.split(';');
    parts.forEach(part => {
        try {
            const obj = JSON.parse(part);
            if (obj.parada) {
                // Se normaliza la parada (en mayúsculas para facilitar la comparación)
                paradas.push(obj.parada.trim().toUpperCase());
            }
        } catch (e) {
            // Si falla el parse, se ignora esa parte
        }
    });
    return paradas;
}

// Función para determinar si un tren (del horario) está circulando.
// Se comprueba que la hora del tren (scheduleRecord.hora) esté en una 
// ventana de ±5 minutos respecto a la hora actual y se coteja línea, sentido y estación.
function isCirculating(scheduleRecord, apiRecords) {
    const now = new Date();
    // Construir la fecha del tren usando la fecha de hoy y la hora del registro
    const [hour, minute] = scheduleRecord.hora.split(':').map(Number);
    const scheduleTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  
    // Ventana de 5 minutos (en milisegundos)
    const timeWindow = 5 * 60 * 1000;
    if (Math.abs(now - scheduleTime) > timeWindow) {
        return false;
    }
  
    // Comparar con los registros de la API: cotejar linia, torn y que la estación esté entre las paradas
    for (let record of apiRecords) {
        if (
            scheduleRecord.linia.toLowerCase() === record.lin.toLowerCase() &&
            scheduleRecord.torn.toUpperCase() === record.dir.toUpperCase() &&
            record.paradas.includes(scheduleRecord.estacio.trim().toUpperCase())
        ) {
            return true;
        }
    }
    return false;
}

// Modificar updateCirculatingStatus() para usar la nueva aproximación
async function updateCirculatingStatus() {
    try {
        // Obtén todos los registros de la API (con paginación)
        const apiRecordsRaw = await fetchAPITrains();
        // Procesa los registros de la API para normalizarlos
        const apiRecords = apiRecordsRaw.map(record => {
            return {
                lin: record.lin,
                dir: record.dir,
                paradas: parseProperesParades(record.properes_parades)
            };
        });
      
        // Para cada registro filtrado del horario, se establece la propiedad 'circulating'
        filteredData.forEach(scheduleRecord => {
            scheduleRecord.circulating = isCirculating(scheduleRecord, apiRecords);
        });
      
        // Actualiza la tabla para reflejar los cambios (añadiendo la clase 'circulating')
        updateTable();
    } catch (error) {
        console.error("Error actualizando el estado de los trenes circulantes:", error);
    }
}
// Modificar updateTable() para marcar las filas cuyos trenes estén circulando
function updateTable() {
    const tbody = elements.resultats.querySelector('tbody');
    tbody.innerHTML = '';

    if (!filteredData.length) {
        elements.resultContainer.style.display = 'none';
        return;
    }

    const fragment = document.createDocumentFragment();
    const startIndex = currentPage * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const itemsToShow = filteredData.slice(startIndex, endIndex);

    itemsToShow.forEach((entry, index) => {
        const row = document.createElement('tr');
        // Si el tren está circulando, se añade la clase 'circulating'
        if (entry.circulating) {
            row.classList.add('circulating');
        }
        const rowNumber = startIndex + index + 1;
        const horaClass = shouldHighlightTime(entry) ? 'highlighted-time' : '';
        row.innerHTML = `
            <td class="row-number">${rowNumber}</td>
            <td>${entry.ad}</td>
            <td><a href="#" class="train-link" data-train="${entry.tren}">${entry.tren}</a></td>
            <td>${entry.estacio}</td>
            <td class="${horaClass}">${entry.hora}</td>
            <td>${entry.linia}</td>
            <td class="extra-col">${entry.torn}</td>
            <td class="extra-col"><a href="#" class="train-s-link" data-train="${entry.tren_s}">${entry.tren_s}</a></td>
        `;
        // Listener para el enlace del tren principal
        const trainLink = row.querySelector('.train-link');
        trainLink.addEventListener('click', (e) => {
            e.preventDefault();
            clearFilters();
            elements.tren.value = entry.tren;
            filterData();
        });
        // Listener para el enlace del tren secundario
        const trainSLink = row.querySelector('.train-s-link');
        trainSLink.addEventListener('click', (e) => {
            e.preventDefault();
            clearFilters();
            elements.tren.value = entry.tren_s;
            filterData();
        });
        fragment.appendChild(row);
    });

    tbody.appendChild(fragment);
    elements.resultContainer.style.display = 'block';

    const loadMoreButton = document.getElementById('loadMoreButton');
    if (filteredData.length > endIndex) {
        if (!loadMoreButton) {
            const button = document.createElement('button');
            button.id = 'loadMoreButton';
            button.textContent = '+ més';
            button.className = 'clear-filters';
            button.style.marginTop = '1rem';
            button.addEventListener('click', () => {
                currentPage++;
                updateTable();
            });
            elements.resultContainer.appendChild(button);
        }
    } else if (loadMoreButton) {
        loadMoreButton.remove();
    }
}

// Función para inicializar los listeners de inputs
function initInputListeners() {
    elements.tren.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.linia.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.ad.addEventListener('change', debounce(filterData, DEBOUNCE_DELAY));
    elements.estacio.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.torn.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY)); // Nuevo listener para Torn
    elements.horaInici.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.horaFi.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.clearFilters.addEventListener('click', clearFilters);
}

// Función de inicialización general
async function init() {
    try {
        elements.resultContainer.style.display = 'none';
        filteredData = [];
        await Promise.all([cargarEstaciones(), loadData()]);
        console.log('Inicialización completada - La tabla permanece oculta');
    } catch (error) {
        console.error('Error durante la inicialización:', error);
        showError('Error al inicializar la aplicación');
    }
    initMenuListeners();
    initInputListeners();
    if (elements.currentYear) {
        elements.currentYear.textContent = new Date().getFullYear();
    }
}

document.addEventListener('DOMContentLoaded', init);

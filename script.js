// ===================
// Script Unificado
// ===================

// Variables globales para itinerarios
let data = []; // Datos de itinerarios (JSON)
let currentPage = 0;
const ITEMS_PER_PAGE = 33;
const DEBOUNCE_DELAY = 300;
let filterTimeout;
let filteredData = [];

// Variables para datos de la API
const API_LIMIT = 20;
let totalCount = 0;
let allResults = []; // Datos de trenes en circulación desde la API
const CACHE_DURATION = 60000; // 60 segundos en milisegundos
let apiTimestamp = null; // Timestamp de la llamada a la API

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

// -------------------------------
// Funciones para los Itinerarios
// -------------------------------

// Carga de estaciones desde un fichero JSON
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

// Actualiza el título de la tabla según la dirección (A/D)
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

// Convierte una hora (formato "HH:MM") a minutos
const timeToMinutes = timeStr => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// Carga los datos de itinerarios desde un archivo JSON
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

// Inicializa los listeners del menú para cambiar itinerarios
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

// Función debounce para optimizar las llamadas al filtrado
function debounce(func, delay) {
    return function (...args) {
        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Limpia los filtros y actualiza la tabla
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

// Ordena los resultados según la hora
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

// Función para determinar si se debe resaltar la hora (lógica existente)
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

// Función principal de filtrado de itinerarios
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
        // Si se filtra por Torn, se lista un solo registro por cada tren cuyo Torn coincida,
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
                    (!filters.torn || entry.torn.toLowerCase().includes(filters.torn.toLowerCase())) &&
                    matchesTimeRange
                );
            })  
        );
    }
    filteredData = sortResultsByTime(filteredData);
    updateTable();
}

// Actualiza la tabla de itinerarios y, para cada registro, verifica si el tren está circulando según la API
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
        const rowNumber = startIndex + index + 1;
        const horaClass = shouldHighlightTime(entry) ? 'highlighted-time' : '';

        // Verificar si el tren de itinerario coincide con alguno en circulación (API)
        let apiMatch = null;
        if (allResults.length > 0 && apiTimestamp) {
            const candidates = allResults.filter(item => {
                const candidateStation = extractProperaParada(item);
                return item.lin.toLowerCase() === entry.linia.toLowerCase() &&
                       item.dir.toLowerCase() === entry.ad.toLowerCase() &&
                       candidateStation.toLowerCase() === entry.estacio.toLowerCase();
            });
            if (candidates.length > 0) {
                // Si hay múltiples candidatos, se podría elegir el que esté más cercano al timestamp.
                // Aquí se toma el primero.
                apiMatch = candidates[0];
                // Se asigna internamente la ID de la API para seguimiento
                entry.api_id = apiMatch.id;
            }
        }

        // Si el tren está en circulación, se marca en verde
        const trenDisplay = apiMatch 
            ? `<a href="#" class="train-link" data-train="${entry.tren}" style="color:green;">${entry.tren}</a>`
            : `<a href="#" class="train-link" data-train="${entry.tren}">${entry.tren}</a>`;

        row.innerHTML = `
            <td class="row-number">${rowNumber}</td>
            <td>${entry.ad}</td>
            <td>${trenDisplay}</td>
            <td>${entry.estacio}</td>
            <td class="${horaClass}">${entry.hora}</td>
            <td>${entry.linia}</td>
            <td class="extra-col">${entry.torn || ''}</td>
            <td class="extra-col"><a href="#" class="train-s-link" data-train="${entry.tren_s}">${entry.tren_s}</a></td>
        `;

        // Listener para el enlace del tren principal
        const trainLink = row.querySelector('.train-link');
        trainLink.addEventListener('click', (e) => {
            e.preventDefault();
            clearFilters(); // Limpiar filtros existentes
            elements.tren.value = entry.tren;
            filterData();
        });
        // Listener para el enlace del tren secundario
        const trainSLink = row.querySelector('.train-s-link');
        trainSLink.addEventListener('click', (e) => {
            e.preventDefault();
            clearFilters(); // Limpiar filtros existentes
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

// Extrae la "Propera Parada" de un registro obtenido de la API
function extractProperaParada(item) {
    if (item.properes_parades) {
        try {
            let parts = item.properes_parades.split(';');
            if (parts.length > 0) {
                let firstPart = parts[0].trim();
                let parsed = JSON.parse(firstPart);
                return parsed.parada || '';
            }
        } catch (error) {
            console.error("Error al procesar properes_parades:", error);
        }
    }
    return '';
}

// Inicializa los listeners para los inputs de filtrado
function initInputListeners() {
    elements.tren.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.linia.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.ad.addEventListener('change', debounce(filterData, DEBOUNCE_DELAY));
    elements.estacio.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.torn.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY)); // Listener para Torn
    elements.horaInici.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.horaFi.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.clearFilters.addEventListener('click', clearFilters);
}

// -------------------------------
// Funciones para la API
// -------------------------------

// Verifica si existen datos en caché válidos
function isCacheValid() {
    const cachedTimestamp = localStorage.getItem('lastFetch');
    if (!cachedTimestamp) return false;
    const now = Date.now();
    return (now - parseInt(cachedTimestamp)) < CACHE_DURATION;
}

// Función recursiva para obtener los datos paginados de la API
function fetchPage(offset) {
    // Si es la primera página y hay datos en caché, se utilizan
    if (offset === 0 && isCacheValid()) {
        const cachedData = JSON.parse(localStorage.getItem('trainData'));
        const cachedTimestampVal = new Date(parseInt(localStorage.getItem('lastFetch')));
        allResults = cachedData.results;
        totalCount = cachedData.total_count;
        apiTimestamp = cachedTimestampVal;
        if(document.getElementById('timestamp')) {
            document.getElementById('timestamp').textContent = "Timestamp de acceso: " + cachedTimestampVal.toLocaleString();
        }
        if(document.getElementById('trainCount')) {
            document.getElementById('trainCount').textContent = "Trens Circulant: " + totalCount;
        }
        return Promise.resolve();
    }

    const apiUrl = `https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=${API_LIMIT}&offset=${offset}`;
    return fetch(apiUrl)
        .then(response => response.json())
        .then(dataApi => {
            if (offset === 0 && dataApi.total_count) {
                totalCount = dataApi.total_count;
                const now = new Date();
                apiTimestamp = now;
                // Guardar en caché
                localStorage.setItem('trainData', JSON.stringify({
                    results: dataApi.results,
                    total_count: dataApi.total_count
                }));
                localStorage.setItem('lastFetch', Date.now().toString());
                if(document.getElementById('timestamp')) {
                    document.getElementById('timestamp').textContent = "Timestamp de acceso: " + now.toLocaleString();
                }
                if(document.getElementById('trainCount')) {
                    document.getElementById('trainCount').textContent = "Trens Circulant: " + totalCount;
                }
            }
            if (dataApi.results && Array.isArray(dataApi.results)) {
                allResults = allResults.concat(dataApi.results);
            }
            if (offset + API_LIMIT < totalCount) {
                return fetchPage(offset + API_LIMIT);
            }
        })
        .catch(error => console.error('Error al obtener los datos de la API:', error));
}

// -------------------------------
// Inicialización General
// -------------------------------
async function init() {
    try {
        elements.resultContainer.style.display = 'none';
        filteredData = [];
        // Cargar en paralelo: estaciones, itinerarios y datos de la API
        await Promise.all([cargarEstaciones(), loadData(), fetchPage(0)]);
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

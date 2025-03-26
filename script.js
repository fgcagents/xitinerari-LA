// Variables globals
let data = [];
let cachedApiData = []; // Variable per guardar la cache de l'API
let trainMapping = {}; // Nuevo mapeo: clave = nombre del tren del JSON, valor = id de la API
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
    torn: document.getElementById('torn'),
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

// Función per carregar dades des d'un fitxer (JSON)
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

// Modificar la función loadApiCache para siempre obtener datos frescos de localStorage
function loadApiCache() {
    const cacheStr = localStorage.getItem('trainData');
    if (cacheStr) {
        try {
            const cacheObj = JSON.parse(cacheStr);
console.log("Cache actualizada desde localStorage:", new Date().toLocaleTimeString());
            // Asegurar que la estructura es correcta y devolver siempre datos frescos
            return Array.isArray(cacheObj?.results) ? cacheObj.results : [];
        } catch (err) {
            console.error("Error parsing API cache:", err);
return [];
        }
    }
    return [];
}

// Nueva función: Construir el mapeo de trenes en circulación
function buildTrainMapping() {
    trainMapping = {}; // Reiniciamos el mapeo
    const now = new Date();
    const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

    console.log('Iniciando mapeo de trenes...');
    console.log('Trenes en caché de la API:', cachedApiData.length);

    data.forEach(item => {
        const excludedKeys = ["Tren", "Linia", "A/D", "Serveis", "Torn", "Tren_S"];
        Object.keys(item).forEach(key => {
            if (!excludedKeys.includes(key) && item[key]) {
                const scheduledTime = item[key];
                const scheduledTimeMinutes = timeToMinutes(scheduledTime);

                const candidateRecords = cachedApiData.filter(apiRecord => {
                    if (!apiRecord) return false;

                    const sameLine = item.Linia.substr(0, 2).toLowerCase() === (apiRecord.lin || "").substr(0, 2).toLowerCase();
                    const sameDirection = item["A/D"].toLowerCase() === (apiRecord.dir || "").toLowerCase();
                    let stationMatch = false;

                    if (apiRecord.properes_parades) {
                        try {
                            const parts = apiRecord.properes_parades.split(';').map(p => p.trim()).filter(p => p);
                            const firstStation = parts[0] ? JSON.parse(parts[0]).parada.toLowerCase() : "";
                            const secondStation = parts[1] ? JSON.parse(parts[1]).parada.toLowerCase() : "";
                            stationMatch = key.toLowerCase() === firstStation || key.toLowerCase() === secondStation;
                        } catch (error) {
                            console.error("Error al procesar properes_parades:", error);
                        }
                    }

                    return sameLine && sameDirection && stationMatch;
                });

                if (candidateRecords.length > 0) {
                    const availableRecords = candidateRecords.filter(record => 
                        !Object.values(trainMapping).includes(record.id)
                    );

                    if (!trainMapping[item.Tren] && availableRecords.length > 0) {
                        const bestRecord = availableRecords.reduce((prev, current) => {
                            const prevDiff = Math.abs(scheduledTimeMinutes - timeToMinutes(prev.hora));
                            const currDiff = Math.abs(scheduledTimeMinutes - timeToMinutes(current.hora));
                            return currDiff < prevDiff ? current : prev;
                        });
                        trainMapping[item.Tren] = bestRecord.id;
                        console.log(`Tren ${item.Tren} asignado a ID ${bestRecord.id}`);
                    }
                } else {
                    console.log(`Tren ${item.Tren} no tiene registros candidatos.`);
                }
            }
        });
    });

    console.log('Total trenes mapeados:', Object.keys(trainMapping).length);
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
                // Al cargar un nuevo itinerario, reconstruimos el mapeo
                buildTrainMapping();
                updateTable();
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
    elements.torn.value = '';
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
        torn: elements.torn.value.trim(),
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
        // Si hay un filtro de línea activo y no hay filtro de estación
        if (filters.linia && !filters.estacio) {
            const seenTrains = new Set(); // Para controlar trenes únicos
            const trainFirstStops = new Map(); // Para guardar la primera parada de cada tren

            // Primer paso: encontrar la primera parada de cada tren que cumpla los filtros de tiempo
            data.filter(item => item.Linia.toLowerCase().includes(filters.linia.toLowerCase()))
                .forEach(item => {
                    const stations = Object.keys(item)
                        .filter(key => !['Tren', 'Linia', 'A/D', 'Serveis', 'Torn', 'Tren_S'].includes(key) && item[key])
                        .sort((a, b) => {
                            const tA = timeToMinutes(item[a]);
                            const tB = timeToMinutes(item[b]);
                            return tA - tB;
                        });

                    for (const station of stations) {
                        const timeMin = timeToMinutes(item[station]);
                        let matchesTimeRange = true;

                        if (horaIniciMin !== null) {
                            if (horaFiMin === null) {
                                matchesTimeRange = timeMin >= horaIniciMin || (timeMin < 240 && timeMin < horaIniciMin);
                            } else {
                                if (horaIniciMin > horaFiMin) {
                                    matchesTimeRange = timeMin >= horaIniciMin || timeMin <= horaFiMin;
                                } else {
                                    matchesTimeRange = timeMin >= horaIniciMin && timeMin <= horaFiMin;
                                }
                            }
                        }

                        if (matchesTimeRange && !seenTrains.has(item.Tren)) {
                            seenTrains.add(item.Tren);
                            trainFirstStops.set(item.Tren, {
                                tren: item.Tren,
                                linia: item.Linia,
                                ad: item['A/D'],
                                torn: item.Torn,
                                tren_s: item.Tren_S,
                                estacio: station,
                                hora: item[station]
                            });
                            break;
                        }
                    }
                });

            filteredData = Array.from(trainFirstStops.values())
                .filter(entry => (
                    (!filters.tren || entry.tren.toLowerCase().includes(filters.tren.toLowerCase())) &&
                    (!filters.ad || entry.ad === filters.ad) &&
                    (!filters.torn || entry.torn.toLowerCase().includes(filters.torn.toLowerCase()))
                ));
        } else {
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
    }
    filteredData = sortResultsByTime(filteredData);
    updateTable();
}

// Función para actualizar la tabla de resultados
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
        const isInCirculation = trainMapping[entry.tren] ? 'in-circulation' : ''; // Verificar si el tren está en circulación

        row.innerHTML = `
            <td class="row-number">${rowNumber}</td>
            <td>${entry.ad}</td>
            <td><a href="#" class="train-link ${isInCirculation}" data-train="${entry.tren}">${entry.tren}</a></td>
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

        // Listener para el enlace del tren_s
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
    elements.torn.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
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
        // Cargamos la cache de la API sin sustituir los datos del JSON
        cachedApiData = loadApiCache();
        console.log("API Cache carregada:", cachedApiData);
        // Construir el mapeo de trenes y actualizar la tabla
        buildTrainMapping();
        updateTable();
    } catch (error) {
        console.error('Error durant la inicialització:', error);
        showError('Error al inicialitzar l\'aplicació');
    }
    initMenuListeners();
    initInputListeners();
    if (elements.currentYear) {
        elements.currentYear.textContent = new Date().getFullYear();
    }
    
    // Actualizar el mapeo y la tabla cada 60 segundos para sincronizar con la API
    setInterval(() => {
        const newApiData = loadApiCache();
if (newApiData.length > 0) {
            cachedApiData = newApiData;
        buildTrainMapping();
        updateTable();
console.log("Datos actualizados desde localStorage:", cachedApiData.length, "registros");
        }
    }, 10000); // Reducir a 10 segundos para una actualización más frecuente
}

document.addEventListener('DOMContentLoaded', init);

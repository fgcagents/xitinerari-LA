// Variables globales y configuración de la aplicación
const APP_CONFIG = {
    itemsPerPage: 33,
    debounceDelay: 300,
    cacheDuration: 60000,
    apiEndpoint: 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=20'
};

let appState = {
    data: [],
    filteredData: [],
    currentPage: 0,
    filterTimeout: null
};

// Estructura global para hacer seguimiento de los trenes activos
const activeTrains = {
  // trainId: { apiId, linia, direccion, estacionActual, hora, marcado }
};

// Referencias a elementos del DOM
const DOM_ELEMENTS = {
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

// --- Helpers ---
const timeToMinutes = timeStr => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

const showError = message => {
    DOM_ELEMENTS.errorMessage.textContent = message;
    DOM_ELEMENTS.errorMessage.style.display = 'block';
    setTimeout(() => (DOM_ELEMENTS.errorMessage.style.display = 'none'), 5000);
};

// --- Funciones para la gestión de la API y seguimiento de trenes activos ---

// Procesa la caché de la API y actualiza la estructura activeTrains
function processApiCache() {
    const cachedData = localStorage.getItem('trainData');
    if (!cachedData) return;
  
    try {
        const apiData = JSON.parse(cachedData);
        const timestamp = localStorage.getItem('lastFetch');
        if (!timestamp) return;
    
        // Formatear el tiempo de la API
        const apiTime = new Date(parseInt(timestamp));
        const apiHour = apiTime.getHours().toString().padStart(2, '0');
        const apiMinute = apiTime.getMinutes().toString().padStart(2, '0');
        const apiTimeStr = `${apiHour}:${apiMinute}`;
    
        // Procesar cada tren de la respuesta
        apiData.results.forEach(train => {
            processTrainData(train, apiTimeStr);
        });
    } catch (error) {
        console.error('Error al procesar la caché de la API:', error);
    }
}

// Procesa los datos de un tren individual para actualizar activeTrains
function processTrainData(train, apiTimeStr) {
    if (!train.lin || !train.dir || !train.properes_parades) return;
  
    try {
        const paradas = train.properes_parades.split(';');
        if (paradas.length === 0) return;
    
        // Se espera que la primera parada venga en formato JSON
        const primeraParada = JSON.parse(paradas[0]);
    
        const trainInfo = {
            apiId: train.id,
            linia: train.lin.toLowerCase(),
            direccion: train.dir,
            estacionActual: primeraParada.parada.toLowerCase(),
            hora: apiTimeStr,
            marcado: false
        };
    
        activeTrains[train.id] = trainInfo;
    } catch (error) {
        console.error('Error al procesar tren:', train.id, error);
    }
}

// Obtiene el tiempo actual de la API en formato "HH:MM"
function getApiTime() {
    const timestamp = localStorage.getItem('lastFetch');
    if (!timestamp) return null;
  
    const apiTime = new Date(parseInt(timestamp));
    const apiHour = apiTime.getHours().toString().padStart(2, '0');
    const apiMinute = apiTime.getMinutes().toString().padStart(2, '0');
    return `${apiHour}:${apiMinute}`;
}

// Identifica y marca en los datos filtrados los trenes activos
function findActiveTrains(filteredData, apiTimeStr) {
    const apiMinutes = timeToMinutes(apiTimeStr);
    if (!apiMinutes) return [];
  
    const activeTrenesList = [];
  
    filteredData.forEach(entry => {
        const entryMinutes = timeToMinutes(entry.hora);
        // Solo considerar entradas que estén dentro de un margen de 3 minutos
        if (entryMinutes < apiMinutes || entryMinutes > apiMinutes + 3) return;
    
        Object.values(activeTrains).forEach(trainInfo => {
            if (
                trainInfo.linia === entry.linia.toLowerCase() &&
                trainInfo.direccion === entry.ad &&
                trainInfo.estacionActual === entry.estacio.toLowerCase()
            ) {
                entry.isActive = true;
                entry.apiId = trainInfo.apiId;
                activeTrenesList.push(entry);
                trainInfo.marcado = true;
            }
        });
    });
  
    return activeTrenesList;
}

// Actualiza el DOM para resaltar los trenes activos en la tabla
function updateTableWithActiveTrains(filteredData) {
    const apiTimeStr = getApiTime();
    const activeTrenesList = findActiveTrains(filteredData, apiTimeStr);
  
    document.querySelectorAll('.train-link').forEach(link => {
        link.classList.remove('active-train');
        const trainCode = link.getAttribute('data-train');
        const isActive = activeTrenesList.some(train => train.tren === trainCode);
        if (isActive) {
            link.classList.add('active-train');
            const apiTrain = activeTrenesList.find(train => train.tren === trainCode);
            if (apiTrain) {
                link.setAttribute('data-api-id', apiTrain.apiId);
            }
        }
    });
}

// Configura el seguimiento continuo: actualiza activeTrains y la tabla cada minuto
function setupActiveTrainTracking(filteredData) {
    processApiCache();
    updateTableWithActiveTrains(filteredData);
  
    setInterval(() => {
        processApiCache();
        updateTableWithActiveTrains(filteredData);
    }, 60000);
}

// --- Funcionalidad de la API de datos (ya existente) ---
const isCacheValid = () => {
    const cachedTimestamp = localStorage.getItem('lastFetch');
    return cachedTimestamp && (Date.now() - parseInt(cachedTimestamp)) < APP_CONFIG.cacheDuration;
};

const getLiveTrains = () => {
    if (!isCacheValid()) return [];
    const cachedData = localStorage.getItem('trainData');
    return cachedData ? JSON.parse(cachedData).results : [];
};

const refreshAPICache = async () => {
    try {
        const response = await fetch(APP_CONFIG.apiEndpoint);
        const data = await response.json();
        localStorage.setItem('trainData', JSON.stringify(data));
        localStorage.setItem('lastFetch', Date.now().toString());
    } catch (error) {
        console.error('Error actualizando caché API:', error);
    }
};

// --- Funcionalidad principal de la aplicación ---

// Crea una fila en la tabla para una entrada del itinerario
const createTableRow = (entry, rowNumber, apiData) => {
    const row = document.createElement('tr');
    // Se aplica la clase "active-train" si ya se marcó la entrada como activa
    const activeClass = entry.isActive ? "active-train" : "";
    const apiIdAttr = entry.apiId ? ` data-api-id="${entry.apiId}"` : "";
  
    row.innerHTML = `
        <td class="row-number">${rowNumber}</td>
        <td>${entry.ad}</td>
        <td><a href="#" class="train-link ${activeClass}" data-train="${entry.tren}"${apiIdAttr}>${entry.tren}</a></td>
        <td>${entry.estacio}</td>
        <td>${entry.hora}</td>
        <td>${entry.linia}</td>
        <td class="extra-col">${entry.torn}</td>
        <td class="extra-col"><a href="#" class="train-s-link" data-train="${entry.tren_s}">${entry.tren_s}</a></td>
    `;
  
    addRowEventListeners(row, entry);
    return row;
};

const addRowEventListeners = (row, entry) => {
    row.querySelector('.train-link').addEventListener('click', e => {
        e.preventDefault();
        clearFilters();
        DOM_ELEMENTS.tren.value = entry.tren;
        filterData();
    });
  
    row.querySelector('.train-s-link').addEventListener('click', e => {
        e.preventDefault();
        clearFilters();
        DOM_ELEMENTS.tren.value = entry.tren_s;
        filterData();
    });
};

const updateTable = () => {
    const tbody = DOM_ELEMENTS.resultats.querySelector('tbody');
    tbody.innerHTML = '';
  
    if (!appState.filteredData.length) {
        DOM_ELEMENTS.resultContainer.style.display = 'none';
        return;
    }
  
    const apiData = getLiveTrains();
    const fragment = document.createDocumentFragment();
    const { startIndex, endIndex } = getPaginationRange();
  
    appState.filteredData.slice(startIndex, endIndex).forEach((entry, index) => {
        fragment.appendChild(createTableRow(entry, startIndex + index + 1, apiData));
    });
  
    tbody.appendChild(fragment);
    DOM_ELEMENTS.resultContainer.style.display = 'block';
    handlePaginationControls();
  
    // Una vez renderizada la tabla, se actualiza la visualización de trenes activos
    updateTableWithActiveTrains(appState.filteredData);
};

const getPaginationRange = () => ({
    startIndex: appState.currentPage * APP_CONFIG.itemsPerPage,
    endIndex: (appState.currentPage + 1) * APP_CONFIG.itemsPerPage
});

const handlePaginationControls = () => {
    const loadMoreButton = document.getElementById('loadMoreButton');
    const hasMoreData = appState.filteredData.length > getPaginationRange().endIndex;
  
    if (hasMoreData && !loadMoreButton) {
        createLoadMoreButton();
    } else if (!hasMoreData && loadMoreButton) {
        loadMoreButton.remove();
    }
};

const createLoadMoreButton = () => {
    const button = document.createElement('button');
    button.id = 'loadMoreButton';
    button.className = 'clear-filters';
    button.textContent = '+ més';
    button.style.marginTop = '1rem';
    button.addEventListener('click', () => {
        appState.currentPage++;
        updateTable();
    });
    DOM_ELEMENTS.resultContainer.appendChild(button);
};

// --- Funcionalidad de carga y filtrado de datos ---

const loadData = async (filename = 'itinerari_LA51_2_0_1_asc_desc.json') => {
    try {
        DOM_ELEMENTS.loading.classList.add('visible');
        const response = await fetch(filename);
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        appState.data = await response.json();
        DOM_ELEMENTS.resultContainer.style.display = 'none';
        appState.filteredData = [];
    } catch (error) {
        console.error('Error al cargar datos:', error);
        showError('Error al cargar los datos');
    } finally {
        DOM_ELEMENTS.loading.classList.remove('visible');
    }
};

const cargarEstaciones = async () => {
    try {
        const response = await fetch('estacions.json');
        const estacionesData = await response.json();
        const datalist = document.getElementById('estacions');
        datalist.innerHTML = estacionesData.map(estacion => 
            `<option value="${estacion.value}">${estacion.name}</option>`
        ).join('');
    } catch (error) {
        console.error('Error cargando estaciones:', error);
        showError('Error al cargar las estaciones');
    }
};

const filterData = () => {
    const filters = getCurrentFilters();
    appState.currentPage = 0;
  
    if (!Object.values(filters).some(Boolean)) {
        DOM_ELEMENTS.resultContainer.style.display = 'none';
        appState.filteredData = [];
        return;
    }
  
    appState.filteredData = filters.torn ? 
        filterByTorn(filters) : 
        filterStandard(filters);
  
    appState.filteredData = sortResultsByTime(appState.filteredData);
  
    // Marcar trenes activos en los datos filtrados antes de renderizar
    const apiTimeStr = getApiTime();
    findActiveTrains(appState.filteredData, apiTimeStr);
  
    updateTable();
};

const getCurrentFilters = () => ({
    tren: DOM_ELEMENTS.tren.value.trim(),
    linia: DOM_ELEMENTS.linia.value.trim(),
    ad: DOM_ELEMENTS.ad.value.trim(),
    estacio: DOM_ELEMENTS.estacio.value.trim(),
    torn: DOM_ELEMENTS.torn.value.trim(),
    horaInici: timeToMinutes(DOM_ELEMENTS.horaInici.value.trim()),
    horaFi: timeToMinutes(DOM_ELEMENTS.horaFi.value.trim())
});

const filterByTorn = filters => {
    return appState.data
        .filter(item => item.Torn?.toLowerCase().includes(filters.torn.toLowerCase()))
        .map(processTornItem)
        .filter(entry => matchesFilters(entry, filters));
};

const processTornItem = item => {
    const stations = Object.keys(item)
        .filter(key => !['Tren', 'Linia', 'A/D', 'Serveis', 'Torn', 'Tren_S'].includes(key) && item[key])
        .sort((a, b) => timeToMinutes(item[a]) - timeToMinutes(item[b]));
  
    return stations.length ? {
        tren: item.Tren,
        linia: item.Linia,
        ad: item['A/D'],
        torn: item.Torn,
        tren_s: item.Tren_S,
        estacio: stations[0],
        hora: item[stations[0]]
    } : null;
};

const filterStandard = filters => {
    return appState.data.flatMap(item => {
        return Object.keys(item)
            .filter(key => {
                const excludedKeys = ['Tren', 'Linia', 'A/D', 'Serveis', 'Torn', 'Tren_S'];
                return !excludedKeys.includes(key) && item[key];
            })
            .map(station => createStandardEntry(item, station))
            .filter(entry => matchesFilters(entry, filters));
    });
};

const createStandardEntry = (item, station) => ({
    tren: item.Tren,
    linia: item.Linia,
    ad: item['A/D'],
    torn: item.Torn,
    tren_s: item.Tren_S,
    estacio: station,
    hora: item[station]
});

const matchesFilters = (entry, filters) => {
    const timeMatch = checkTimeMatch(entry.hora, filters.horaInici, filters.horaFi);
    return (
        (!filters.tren || entry.tren.toLowerCase().includes(filters.tren.toLowerCase())) &&
        (!filters.linia || entry.linia.toLowerCase().includes(filters.linia.toLowerCase())) &&
        (!filters.ad || entry.ad === filters.ad) &&
        (!filters.estacio || entry.estacio.toLowerCase().includes(filters.estacio.toLowerCase())) &&
        timeMatch
    );
};

const checkTimeMatch = (entryTime, start, end) => {
    const entryMinutes = timeToMinutes(entryTime);
    if (!start && !end) return true;
    if (!start) return entryMinutes <= end;
    if (!end) return entryMinutes >= start;
  
    return start > end ? 
        (entryMinutes >= start || entryMinutes <= end) : 
        (entryMinutes >= start && entryMinutes <= end);
};

const sortResultsByTime = results => results.sort((a, b) => {
    const timeA = timeToMinutes(a.hora) ?? Infinity;
    const timeB = timeToMinutes(b.hora) ?? Infinity;
    return (timeA < 240 ? timeA + 1440 : timeA) - (timeB < 240 ? timeB + 1440 : timeB);
});

// --- Event handlers y utilidades ---
const debounce = (func, delay) => {
    return (...args) => {
        clearTimeout(appState.filterTimeout);
        appState.filterTimeout = setTimeout(() => func.apply(this, args), delay);
    };
};

const clearFilters = () => {
    Object.values(DOM_ELEMENTS).forEach(element => {
        if (element?.tagName === 'INPUT' || element?.tagName === 'SELECT') element.value = '';
    });
    DOM_ELEMENTS.resultContainer.style.display = 'none';
    appState.filteredData = [];
    updateTable();
};

const initEventListeners = () => {
    const debouncedFilter = debounce(filterData, APP_CONFIG.debounceDelay);
  
    DOM_ELEMENTS.tren.addEventListener('input', debouncedFilter);
    DOM_ELEMENTS.linia.addEventListener('input', debouncedFilter);
    DOM_ELEMENTS.ad.addEventListener('change', debouncedFilter);
    DOM_ELEMENTS.estacio.addEventListener('input', debouncedFilter);
    DOM_ELEMENTS.torn.addEventListener('input', debouncedFilter);
    DOM_ELEMENTS.horaInici.addEventListener('input', debouncedFilter);
    DOM_ELEMENTS.horaFi.addEventListener('input', debouncedFilter);
    DOM_ELEMENTS.clearFilters.addEventListener('click', clearFilters);
};

// --- Inicialización ---
const init = async () => {
    try {
        if (!isCacheValid()) await refreshAPICache();
        DOM_ELEMENTS.resultContainer.style.display = 'none';
        appState.filteredData = [];
    
        await Promise.all([cargarEstaciones(), loadData()]);
    
        // Inicia el seguimiento continuo de trenes activos
        processApiCache();
        setupActiveTrainTracking(appState.filteredData);
    } catch (error) {
        console.error('Error durante la inicialización:', error);
        showError('Error al inicializar la aplicación');
    }
  
    initEventListeners();
    DOM_ELEMENTS.currentYear.textContent = new Date().getFullYear();
};

document.addEventListener('DOMContentLoaded', init);

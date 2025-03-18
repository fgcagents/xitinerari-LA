// Variables globales
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

// Helpers
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

// Funcionalidad de la API
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

// Funcionalidad principal
const shouldHighlightTime = entry => {
    const estaciones = {
        R5: ["MV", "CL", "CG"],
        R6: ["MV", "CG"],
        R50: ["MG", "ML", "CG", "CL", "CR", "QC", "PL", "MV", "ME", "AE", "CB"],
        R60: ["MG", "ML", "CG", "CR", "QC", "PA", "PL", "MV", "ME", "BE", "CP"]
    };
    const specificTrains = ["N334", "P336", "P362", "N364", "P364", "N366", "P366"];
    return estaciones[entry.linia]?.includes(entry.estacio) && !(specificTrains.includes(entry.tren) && entry.ad === "D");
};

const createTableRow = (entry, rowNumber, apiData) => {
    const row = document.createElement('tr');
    const horaClass = shouldHighlightTime(entry) ? 'highlighted-time' : '';
    const isActive = checkActiveTrain(entry, apiData);

    row.innerHTML = `
        <td class="row-number">${rowNumber}</td>
        <td>${entry.ad}</td>
        <td><a href="#" class="train-link ${isActive ? 'active-train' : ''}" 
             data-train="${entry.tren}">${entry.tren}</a></td>
        <td>${entry.estacio}</td>
        <td class="${horaClass}">${entry.hora}</td>
        <td>${entry.linia}</td>
        <td class="extra-col">${entry.torn}</td>
        <td class="extra-col"><a href="#" class="train-s-link" 
             data-train="${entry.tren_s}">${entry.tren_s}</a></td>
    `;

    addRowEventListeners(row, entry);
    return row;
};

const checkActiveTrain = (entry, apiData) => {
    const entryTime = timeToMinutes(entry.hora);
    const apiTimestamp = parseInt(localStorage.getItem('lastFetch'));
    const apiDate = new Date(apiTimestamp);
    const apiTime = apiDate.getHours() * 60 + apiDate.getMinutes();

    return apiData.some(apiTrain => {
        const primeraParada = apiTrain.properes_parades?.split(';')[0]?.trim();
        return apiTrain.lin === entry.linia &&
               apiTrain.dir === entry.ad &&
               primeraParada?.includes(entry.estacio) &&
               Math.abs(entryTime - apiTime) <= 3;
    });
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

// Funcionalidad de datos
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

// Filtrado y eventos
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

// Event handlers
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

// Inicialización
const init = async () => {
    try {
        if (!isCacheValid()) await refreshAPICache();
        DOM_ELEMENTS.resultContainer.style.display = 'none';
        await Promise.all([cargarEstaciones(), loadData()]);
        initEventListeners();
        DOM_ELEMENTS.currentYear.textContent = new Date().getFullYear();
    } catch (error) {
        console.error('Error durante la inicialización:', error);
        showError('Error al inicializar la aplicación');
    }
};

document.addEventListener('DOMContentLoaded', init);
/**
 * Constants i variables globals
 */
const ITEMS_PER_PAGE = 33;
const DEBOUNCE_DELAY = 300;
let data = [];
let currentPage = 0;
let filterTimeout;
let filteredData = [];

/**
 * Referències als elements del DOM
 */
const elements = {
    tren: document.getElementById('tren'),
    linia: document.getElementById('linia'),
    ad: document.getElementById('ad'),
    estacio: document.getElementById('estacio'),
    horaInici: document.getElementById('horaInici'),
    horaFi: document.getElementById('horaFi'),
    resultContainer: document.getElementById('resultContainer'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('errorMessage'),
    clearFilters: document.getElementById('clearFilters'),
    resultats: document.getElementById('resultats')
};

/**
 * Carrega les estacions des del fitxer JSON
 */
async function cargarEstaciones() {
    try {
        const response = await fetch('estacions.json');
        const data = await response.json();
        const datalist = document.getElementById('estacions');
        
        data.forEach(estacion => {
            const option = document.createElement('option');
            option.value = estacion.value;
            option.textContent = estacion.name;
            datalist.appendChild(option);
        });
    } catch (error) {
        console.error('Error carregant les estacions:', error);
        showError('Error carregant les estacions');
    }
}

/**
 * Actualitza el títol de la taula segons el filtre A/D seleccionat
 */
function updateTableTitle() {
    const select = document.getElementById('ad');
    const title = document.getElementById('table-title');
    const value = select.value;

    title.textContent = value === 'A' ? 'Trens Ascendents' :
                      value === 'D' ? 'Trens Descendents' :
                      'Ascendents/Descendents';
}

/**
 * Converteix una hora en format "HH:MM" a minuts des de mitjanit
 * @param {string} timeStr - Hora en format "HH:MM"
 * @returns {number|null} Minuts des de mitjanit o null si el format és invàlid
 */
function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Converteix una hora en format "8:45" o "18:45" a minuts, contemplant AM/PM
 * @param {string} timeStr - Hora en format "HH:MM" o "HH:MM AM/PM"
 * @returns {number|null} Minuts des de mitjanit o null si el format és invàlid
 */
function convertTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    let [hours, minutes] = timeStr.split(':').map(Number);
    
    if (timeStr.toLowerCase().includes('pm') && hours < 12) {
        hours += 12;
    } else if (timeStr.toLowerCase().includes('am') && hours === 12) {
        hours = 0;
    }
    
    return hours * 60 + minutes;
}

/**
 * Carrega les dades des del fitxer CSV
 * @returns {Promise<Array>} Array amb les dades carregades
 */
async function loadData() {
    try {
        elements.loading.classList.add('visible');
        const response = await fetch('itinerari_LA51_1_feiners_asc_desc.csv');
        
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        const csvText = await response.text();
        
        const parseResult = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            error: (error) => {
                console.error('Error en Parse:', error);
                throw error;
            }
        });

        if (parseResult.errors.length > 0) {
            console.warn('Advertències durant el parsing:', parseResult.errors);
        }

        data = parseResult.data;
        return data;
        
    } catch (error) {
        console.error('Error al carregar dades:', error);
        showError('Error al carregar les dades');
        throw error;
    } finally {
        elements.loading.classList.remove('visible');
    }
}

/**
 * Mostra un missatge d'error temporal
 * @param {string} message - Missatge d'error a mostrar
 */
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
    setTimeout(() => {
        elements.errorMessage.style.display = 'none';
    }, 5000);
}

/**
 * Implementa el patró debounce per evitar massa crides a una funció
 * @param {Function} func - Funció a executar
 * @param {number} delay - Temps d'espera en ms
 * @returns {Function} Funció amb debounce aplicat
 */
function debounce(func, delay) {
    return function executedFunction(...args) {
        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Neteja tots els filtres i amaga els resultats
 */
function clearFilters() {
    elements.tren.value = '';
    elements.linia.value = '';
    elements.ad.value = '';
    elements.estacio.value = '';
    elements.horaInici.value = '';
    elements.horaFi.value = '';
    elements.resultContainer.style.display = 'none';
    updateTableTitle();
}

/**
 * Ordena els resultats per hora de pas
 * @param {Array} results - Array d'objectes amb les dades dels trens
 * @returns {Array} Array ordenat per hora de pas
 */
function sortResultsByTime(results) {
    return results.sort((a, b) => {
        const timeA = timeToMinutes(a.hora);
        const timeB = timeToMinutes(b.hora);
        
        // Manejar casos de temps nul
        if (timeA === null) return 1;
        if (timeB === null) return -1;
        
        // Ajustar per horaris després de mitjanit (00:30, 01:00, etc.)
        // Si l'horari és abans de les 4:00 (240 minuts), afegir 24 hores (1440 minuts)
        const adjustedTimeA = timeA < 240 ? timeA + 1440 : timeA;
        const adjustedTimeB = timeB < 240 ? timeB + 1440 : timeB;
        
        return adjustedTimeA - adjustedTimeB;
    });
}

/**
 * Filtra les dades segons els criteris de cerca
 * Actualitza filteredData i crida a updateTable
 */
function filterData() {
    currentPage = 0; // Reiniciar a la primera pàgina
    const filters = {
        tren: elements.tren.value.toLowerCase(),
        linia: elements.linia.value.toLowerCase(),
        ad: elements.ad.value,
        estacio: elements.estacio.value.toLowerCase(),
        horaInici: elements.horaInici.value,
        horaFi: elements.horaFi.value
    };
    
    const horaIniciMinuts = timeToMinutes(filters.horaInici);
    const horaFiMinuts = timeToMinutes(filters.horaFi);
    
    // Processar i filtrar les dades
    filteredData = data.flatMap(item => 
        Object.keys(item)
            .filter(key => key !== 'Tren' && key !== 'Linia' && key !== 'A/D' && item[key])
            .map(station => ({
                tren: item.Tren,
                linia: item.Linia,
                ad: item['A/D'],
                estacio: station,
                hora: item[station]
            }))
            .filter(entry => {
                const entryTimeMinutes = convertTimeToMinutes(entry.hora);
                const matchesTimeRange = !horaIniciMinuts || !horaFiMinuts || 
                    (entryTimeMinutes >= horaIniciMinuts && entryTimeMinutes <= horaFiMinuts);
                
                return (
                    (!filters.tren || entry.tren.toLowerCase().includes(filters.tren)) &&
                    (!filters.linia || entry.linia.toLowerCase().includes(filters.linia)) &&
                    (!filters.ad || entry.ad === filters.ad) &&
                    (!filters.estacio || entry.estacio.toLowerCase().includes(filters.estacio)) &&
                    matchesTimeRange
                );
            })
    );

    // Ordenar els resultats per hora de pas
    filteredData = sortResultsByTime(filteredData);
    updateTable();
}

/**
 * Actualitza la taula amb els resultats filtrats
 * Gestiona la paginació i el botó de "Carregar més"
 */
function updateTable() {
    const tbody = elements.resultats.querySelector('tbody');
    const fragment = document.createDocumentFragment();

    // Calcular els elements a mostrar per a la pàgina actual
    const startIndex = currentPage * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const itemsToShow = filteredData.slice(startIndex, endIndex);

    // Netejar la taula abans d'afegir nous elements
    tbody.innerHTML = '';

    if (itemsToShow.length === 0 && currentPage === 0) {
        // Si no hi ha resultats i és la primera pàgina
        const row = document.createElement('tr');
        row.className = 'no-results';
        row.innerHTML = '<td colspan="5">No s\'han trobat resultats</td>';
        fragment.appendChild(row);
    } else {
        loadMoreButton?.remove();
    }
}

    // Event Listeners
    elements.tren.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.linia.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.ad.addEventListener('change', debounce(filterData, DEBOUNCE_DELAY));
    elements.estacio.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.horaInici.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.horaFi.addEventListener('input', debounce(filterData, DEBOUNCE_DELAY));
    elements.clearFilters.addEventListener('click', clearFilters);

    // Inicialitzar l'aplicació
    window.onload = async () => {
        try {
            await Promise.all([
                cargarEstaciones(),
                loadData()
            ]);
        } catch (error) {
            console.error('Error inicialitzant l\'aplicació:', error);
            showError('Error inicialitzant l\'aplicació');
        }
};
        
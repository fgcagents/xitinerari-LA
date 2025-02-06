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
 */
function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Converteix una hora en format "8:45" o "18:45" a minuts, contemplant AM/PM
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
 */
function sortResultsByTime
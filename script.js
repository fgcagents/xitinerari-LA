// Variables globals
let data = [];
let currentPage = 0;
const ITEMS_PER_PAGE = 33;
const DEBOUNCE_DELAY = 300;
let filterTimeout;
let filteredData = [];

// Elements del DOM
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

// Funció per carregar les estacions
async function cargarEstaciones() {
    try {
        const response = await fetch('estacions.json');
        const estacionesData = await response.json();
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

// Funció per actualitzar el títol de la taula
function updateTableTitle() {
    const select = document.getElementById('ad');
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

// Funcions de conversió de temps
function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

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

// Funció per carregar dades
async function loadData() {
    try {
        elements.loading.classList.add('visible');
        const response = await fetch('itinerari_LA51_1_feiners_asc_desc.json');
        
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        
        const jsonData = await response.json();
        data = jsonData; // Guardar los datos pero no mostrarlos
        elements.resultContainer.style.display = 'none'; // Asegurar que la tabla está oculta
        filteredData = []; // Inicializar el array de datos filtrados vacío
        return data;
        
    } catch (error) {
        console.error('Error al cargar dades:', error);
        elements.loading.classList.remove('visible');
        showError('Error al cargar les dades');
        throw error;
    } finally {
        elements.loading.classList.remove('visible');
    }
}

// Funcions d'utilitat
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
    setTimeout(() => {
        elements.errorMessage.style.display = 'none';
    }, 5000);
}

function debounce(func, delay) {
    return function executedFunction(...args) {
        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function clearFilters() {
    elements.tren.value = '';
    elements.linia.value = '';
    elements.ad.value = '';
    elements.estacio.value = '';
    elements.horaInici.value = '';
    elements.horaFi.value = '';
    elements.resultContainer.style.display = 'none';
    filteredData = []; // Limpiar los datos filtrados
    updateTable(); // Actualizar la tabla (estará vacía)
}

function sortResultsByTime(results) {
    return results.sort((a, b) => {
        const timeA = timeToMinutes(a.hora);
        const timeB = timeToMinutes(b.hora);

        if (timeA === null) return 1;
        if (timeB === null) return -1;

        const adjustedTimeA = timeA < 240 ? timeA + 1440 : timeA;
        const adjustedTimeB = timeB < 240 ? timeB + 1440 : timeB;

        return adjustedTimeA - adjustedTimeB;
    });
} 

// Funció principal de filtratge
function filterData() {
    // Verificar si hay algún filtro activo
    const filters = {
        tren: elements.tren.value.trim(),
        linia: elements.linia.value.trim(),
        ad: elements.ad.value.trim(),
        estacio: elements.estacio.value.trim(),
        horaInici: elements.horaInici.value.trim(),
        horaFi: elements.horaFi.value.trim()
    };

    // Debug para ver el estado de los filtros
    console.log('Estado de los filtros:', filters);

    // Comprobar si hay algún filtro activo (ignorando espacios en blanco)
    const hasActiveFilters = Object.values(filters).some(value => value !== '' && value !== undefined && value !== null);
    
    // Debug para ver si hay filtros activos
    console.log('¿Hay filtros activos?:', hasActiveFilters);
    
    if (!hasActiveFilters) {
        elements.resultContainer.style.display = 'none';
        filteredData = [];
        return;
    }

    currentPage = 0;
    
    const horaIniciMinuts = timeToMinutes(filters.horaInici);
    const horaFiMinuts = timeToMinutes(filters.horaFi);
    
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
                    (!filters.tren || entry.tren.toLowerCase().includes(filters.tren.toLowerCase())) &&
                    (!filters.linia || entry.linia.toLowerCase().includes(filters.linia.toLowerCase())) &&
                    (!filters.ad || entry.ad === filters.ad) &&
                    (!filters.estacio || entry.estacio.toLowerCase().includes(filters.estacio.toLowerCase())) &&
                    matchesTimeRange
                );
            })
    );

    filteredData = sortResultsByTime(filteredData);
    updateTable();
}

// Funció per actualitzar la taula
function updateTable() {
    const tbody = elements.resultats.querySelector('tbody');
    tbody.innerHTML = '';
    
    // Si no hay datos filtrados o no hay filtros activos, ocultar la tabla
    if (!filteredData || filteredData.length === 0) {
        elements.resultContainer.style.display = 'none';
        return;
    }

    const fragment = document.createDocumentFragment();
    const startIndex = currentPage * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const itemsToShow = filteredData.slice(startIndex, endIndex);

    itemsToShow.forEach(entry => {
        const row = document.createElement('tr');
        const rowNumber = startIndex + index + 1;
        row.innerHTML = `
            <td class="row-number">${rowNumber}</td>
            <td>${entry.ad}</td>
            <td>${entry.tren}</td>
            <td>${entry.estacio}</td>
            <td>${entry.hora}</td>
            <td>${entry.linia}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.appendChild(fragment);
    elements.resultContainer.style.display = 'block';

    // Gestionar el botón "Cargar más"
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
    } else {
        if (loadMoreButton) {
            loadMoreButton.remove();
        }
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

// Inicialització
window.onload = async () => {
    try {
        // Ocultar la tabla antes de cargar los datos
        elements.resultContainer.style.display = 'none';
        
        // Inicializar los datos filtrados como array vacío
        filteredData = [];
        
        // Cargar los datos
        await Promise.all([cargarEstaciones(), loadData()]);
        
        // No llamar a filterData() aquí
        // Asegurarse de que la tabla permanece oculta
        elements.resultContainer.style.display = 'none';
        
        console.log('Inicialización completada - La tabla debería estar oculta');
    } catch (error) {
        console.error('Error durante la inicialización:', error);
        showError('Error al inicializar la aplicación');
    }
}

document.getElementById('current-year').textContent = new Date().getFullYear();

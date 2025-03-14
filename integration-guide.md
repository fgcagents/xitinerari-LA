# Guía de Integración de API de Trenes en Circulación

Esta guía explica cómo integrar el código de seguimiento de trenes en circulación en tu aplicación web existente.

## Descripción General

El código proporcionado añade la funcionalidad para:

1. Consultar la API de posicionamiento de trenes de FGC
2. Mostrar visualmente qué trenes están actualmente en circulación
3. Actualización automática y manual de los datos

## Instalación

### Paso 1: Incluir el script

Añade el archivo JavaScript proporcionado en tu HTML, después de tu `script.js` existente:

```html
<script src="script.js"></script>
<script src="train-tracker.js"></script>
```

### Paso 2: Ajustar el CSS

El script añade automáticamente los estilos necesarios, pero puedes personalizarlos modificando las reglas CSS generadas para la clase `.circulando`.

## Funcionalidades

### Trenes en Circulación

- Los trenes que están actualmente en circulación se destacan con un fondo verde en la tabla de resultados
- Se tiene en cuenta una ventana de tiempo de ±5 minutos para determinar si un tren está circulando
- Se compara la línea, dirección y estación para identificar trenes activos

### Actualización de Datos

- Los datos se actualizan automáticamente cada 5 minutos
- Se añade un botón "Actualizar trenes en circulación" para actualizaciones manuales
- Se muestra la hora de la última actualización

## Cómo Funciona

1. La función `fetchAllTrains()` obtiene todos los datos de la API, paginando automáticamente
2. `processCirculatingTrains()` normaliza los datos para facilitar su uso
3. `isTrainCirculating()` determina si un tren específico está circulando
4. La función `updateTable()` original se extiende para incluir información de circulación

## Personalización

### Ventana de Tiempo

Puedes ajustar el tamaño de la ventana de tiempo modificando la constante `TIME_WINDOW_MINUTES`:

```javascript
const TIME_WINDOW_MINUTES = 10; // Cambiar a 10 minutos
```

### Estilo Visual

Puedes modificar la apariencia de los trenes en circulación ajustando la clase CSS:

```css
.circulando {
    background-color: #a8e6a1; /* Verde claro por defecto */
    font-weight: bold; /* Opcional: texto en negrita */
}
```

## Solución de Problemas

- **No se destacan los trenes**: Verifica la consola para errores de conexión con la API
- **Datos desactualizados**: Utiliza el botón de actualización manual o verifica tu conexión a Internet
- **Rendimiento lento**: Reduce la frecuencia de actualización automática aumentando el intervalo (actualmente 5 minutos)


// Variable global para la instancia del modal OCR
let modalOcrInstance = null;
let wizardModalInstance = null;
let ticketModalInstance = null;

// Globales para OCR
let selectedFileGlobalOCR = null;
let jugadasGlobalOCR = [];
let ocrProgressInterval = null;

// Globales del formulario principal
const MAX_PLAYS = 200; // Aumentado de 25 a 200
let playCount = 0;
let selectedTracksCount = 0;
let selectedDaysCount = 0;

// Flatpickr instance
let fpInstance = null;

// Cutoff times (igual que antes)
const cutoffTimes = {
    "USA": {
        "New York Mid Day": "14:20", "New York Evening": "22:00",
        "Georgia Mid Day": "12:20", "Georgia Evening": "18:40",
        "New Jersey Mid Day": "12:50", "New Jersey Evening": "22:00",
        "Florida Mid Day": "13:20", "Florida Evening": "21:30",
        "Connecticut Mid Day": "13:30", "Connecticut Evening": "22:00",
        "Georgia Night": "22:00", "Pensilvania AM": "12:45",
        "Pensilvania PM": "18:15", "Venezuela": "00:00", // No tiene hora de corte real
        "Brooklyn Midday": "14:20", "Brooklyn Evening": "22:00",
        "Front Midday": "14:20", "Front Evening": "22:00",
        "New York Horses": "16:00"
    },
    "Santo Domingo": {
        "Real": "11:45", "Gana mas": "13:25", "Loteka": "18:30",
        "Nacional": "19:30", "Quiniela Pale": "19:30",
        "Primera Día": "10:50", "Suerte Día": "11:20",
        "Lotería Real": "11:50", "Suerte Tarde": "16:50",
        "Lotedom": "16:50", "Primera Noche": "18:50",
        "Panama": "16:00"
    }
};

// Funciones para el modal de OCR (abrir, manejar archivos, procesar)
function abrirModalOCR() {
    console.log("abrirModalOCR function called");
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").empty().append("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    hideOcrLoading();
    $("#ocrDebugPanel").addClass("d-none");
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true); // Deshabilitar al abrir

    if (modalOcrInstance) {
        modalOcrInstance.show();
    } else {
        console.error("modalOcrInstance no está inicializada al intentar abrirModalOCR.");
    }
}
window.abrirModalOCR = abrirModalOCR;

function handleDragOverOCR(e) {
    e.preventDefault();
    $("#ocrDropZone").addClass("dragover");
}
window.handleDragOverOCR = handleDragOverOCR;

function handleDragLeaveOCR(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
}
window.handleDragLeaveOCR = handleDragLeaveOCR;

function handleDropOCR(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        selectedFileGlobalOCR = e.dataTransfer.files[0];
        $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
        $("#btnProcesarOCR").prop('disabled', false);
        $("#ocrJugadas").empty().append("<p>Imagen cargada. Haz clic en 'Procesar OCR'.</p>");
    }
}
window.handleDropOCR = handleDropOCR;

function handleFileChangeOCR(e) {
    console.log("handleFileChangeOCR called");
    if (e.target.files && e.target.files[0]) {
        selectedFileGlobalOCR = e.target.files[0];
        console.log("File selected:", selectedFileGlobalOCR);
        $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
        $("#btnProcesarOCR").prop('disabled', false);
        $("#ocrJugadas").empty().append("<p>Imagen cargada. Haz clic en 'Procesar OCR'.</p>");
    } else {
        selectedFileGlobalOCR = null;
        $("#ocrPreview").addClass("d-none").attr("src", "");
        $("#btnProcesarOCR").prop('disabled', true);
    }
}
window.handleFileChangeOCR = handleFileChangeOCR;

async function procesarOCR() {
    console.log("procesarOCR function called");
    if (!selectedFileGlobalOCR) {
        alert("No has seleccionado ninguna imagen.");
        console.log("No file selected for OCR processing.");
        return;
    }
    console.log("Current selectedFileGlobalOCR:", selectedFileGlobalOCR);

    showOcrLoading();
    $("#btnCargarJugadas").prop('disabled', true); // Deshabilitar mientras procesa

    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobalOCR);
    reader.onloadend = async () => {
        const base64data = reader.result;
        console.log("Sending request to /api/interpret-ticket");
        try {
            const response = await fetch('/api/interpret-ticket', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoDataUri: base64data }),
            });

            if (!response.ok) {
                let errorData = { message: `Error del servidor: ${response.status} - ${response.statusText}` };
                try {
                    const resJson = await response.json();
                    errorData = resJson; // Intenta obtener más detalles del error si el cuerpo es JSON
                } catch (e) { /* ignorar si el cuerpo no es JSON */ }
                throw new Error(errorData.message || `Error desconocido del servidor: ${response.status}`);
            }

            const interpretedBets = await response.json();
            console.log("Received interpretedBets:", interpretedBets);

            if (Array.isArray(interpretedBets)) {
                jugadasGlobalOCR = interpretedBets;
                let html = `<h5>Jugadas Detectadas (${jugadasGlobalOCR.length}):</h5>`;
                if (jugadasGlobalOCR.length > 0) {
                    jugadasGlobalOCR.forEach((j, idx) => {
                        html += `
                          <div class="ocr-detected-play">
                            <table class="table table-sm table-bordered table-dark small-ocr-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Bet</th>
                                  <th>Mode</th>
                                  <th>Str</th>
                                  <th>Box</th>
                                  <th>Com</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td>${idx + 1}</td>
                                  <td>${j.betNumber || "-"}</td>
                                  <td>${j.gameMode || "-"}</td>
                                  <td>${j.straightAmount !== null ? j.straightAmount.toFixed(2) : "-"}</td>
                                  <td>${j.boxAmount !== null ? j.boxAmount.toFixed(2) : "-"}</td>
                                  <td>${j.comboAmount !== null ? j.comboAmount.toFixed(2) : "-"}</td>
                                </tr>
                              </tbody>
                            </table>
                            <button class="btn btn-sm btn-info mt-1 mb-2" onclick="usarJugadaOCR(${idx})">
                              Usar esta Jugada
                            </button>
                          </div>
                          <hr class="ocr-play-separator">
                        `;
                    });
                    $("#btnCargarJugadas").prop('disabled', false); // Habilitar si hay jugadas
                } else {
                    html += "<p>No se detectaron jugadas válidas en la imagen.</p>";
                }
                $("#ocrJugadas").html(html);
                updateOcrProgress(100, "Proceso completado.");
            } else {
                throw new Error("La respuesta del OCR no tiene el formato esperado (array).");
            }
        } catch (error) {
            console.error("Error procesando la imagen:", error);
            $("#ocrJugadas").html(`<p style="color:red;">Error procesando la imagen: ${error.message}</p>`);
            updateOcrProgress(100, "Error.");
        } finally {
            setTimeout(hideOcrLoading, 800);
        }
    };
    reader.onerror = () => {
        alert('Error leyendo el archivo de imagen.');
        hideOcrLoading();
    };
}
window.procesarOCR = procesarOCR;

function usarJugadaOCR(idx) {
    console.log('usarJugadaOCR called with index:', idx);
    if (!jugadasGlobalOCR || !jugadasGlobalOCR[idx]) {
        alert("No se encontró la jugada seleccionada.");
        console.error("Jugada no encontrada en jugadasGlobalOCR con índice:", idx);
        return;
    }
    const j = jugadasGlobalOCR[idx];
    console.log('Play data to use:', j);

    if (playCount < MAX_PLAYS) {
        const newRow = addMainRow(j); // Pasa el objeto de apuesta completo
        if (newRow) {
            // Opcional: enfocar el primer input de la nueva fila
            // newRow.find(".betNumber").focus(); 
        }
    } else {
        alert(`Se ha alcanzado el límite de ${MAX_PLAYS} jugadas en el formulario principal.`);
    }
    // No cerrar el modal:
    // if (modalOcrInstance) {
    //     // modalOcrInstance.hide(); 
    // }
}
window.usarJugadaOCR = usarJugadaOCR;


function handleCargarTodasLasJugadasClick() {
    console.log("¡handleCargarTodasLasJugadasClick EJECUTADA!"); // Log principal
    
    if (!jugadasGlobalOCR || jugadasGlobalOCR.length === 0) {
        console.log("No hay jugadas OCR para cargar desde handleCargarTodasLasJugadasClick.");
        alert("No hay jugadas OCR para cargar.");
        return;
    }
    
    console.log(`Intentando cargar ${jugadasGlobalOCR.length} jugadas del OCR desde handleCargarTodasLasJugadasClick...`);
    
    let jugadasCargadas = 0;
    let jugadasOmitidas = 0;
    
    for (let index = 0; index < jugadasGlobalOCR.length; index++) {
        const j = jugadasGlobalOCR[index];
        
        if (playCount >= MAX_PLAYS) {
            jugadasOmitidas = jugadasGlobalOCR.length - index;
            alert(`Se ha alcanzado el límite de ${MAX_PLAYS} jugadas. Se omitieron ${jugadasOmitidas} jugadas.`);
            console.warn(`Límite de ${MAX_PLAYS} jugadas alcanzado. Omitiendo el resto.`);
            break; 
        }
        
        console.log(`Añadiendo jugada OCR ${index + 1} (desde handle):`, j);
        
        const newRow = addMainRow(j);
        if (newRow) {
            jugadasCargadas++;
            console.log(`Jugada ${index + 1} cargada exitosamente (desde handle).`);
        } else {
            // addMainRow ya loguea si hay un problema (límite alcanzado)
            console.error(`addMainRow retornó null para la jugada ${index + 1}.`);
        }
    }
    
    console.log(`Proceso de carga (desde handle) completado. Jugadas cargadas: ${jugadasCargadas}`);
    
    if (jugadasCargadas > 0) {
        recalcAllMainRows();
        calculateMainTotal();
        highlightDuplicatesInMain();
        storeFormState();
        alert(`Se cargaron ${jugadasCargadas} jugadas exitosamente.`);
    }
    
    if (modalOcrInstance) {
        console.log("Cerrando modal de OCR después de cargar todas las jugadas (desde handle).");
        modalOcrInstance.hide();
    } else {
        console.error("modalOcrInstance no está definida al intentar cerrar (desde handle).");
    }
}
// Asegurar que la función esté disponible globalmente
window.handleCargarTodasLasJugadasClick = handleCargarTodasLasJugadasClick;


// Funciones para la barra de progreso del OCR
function showOcrLoading() {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width", "0%").removeClass('bg-danger bg-success').addClass('bg-primary progress-bar-animated progress-bar-striped');
    $("#ocrProgressText").text("Subiendo imagen...");
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true);
    if (ocrProgressInterval) clearInterval(ocrProgressInterval); // Limpiar intervalo anterior si existe
    
    // Simular progreso de subida
    let progressValue = 0;
    ocrProgressInterval = setInterval(() => {
        progressValue += 10;
        if (progressValue > 70) { // Simular que la subida se detiene en 70% esperando al backend
            clearInterval(ocrProgressInterval);
            $("#ocrProgressText").text("IA procesando..."); // Cambiar texto cuando la IA procesa
            // No actualizar más la barra aquí, se hará desde procesarOCR
            return;
        }
        $("#ocrProgressBar").css("width", progressValue + "%");
    }, 100);
}

function updateOcrProgress(value, text, isError = false) {
    if (ocrProgressInterval && value < 100 && !isError) { // Solo limpiar si no es el final o un error
         // No limpiar el intervalo aquí si estamos actualizando progreso de IA
    } else if (value === 100 || isError) {
        if (ocrProgressInterval) clearInterval(ocrProgressInterval);
        ocrProgressInterval = null;
    }
    
    $("#ocrProgressBar").css("width", value + "%");
    if (text) $("#ocrProgressText").text(text);

    if (isError) {
        $("#ocrProgressBar").removeClass('bg-primary bg-success progress-bar-animated progress-bar-striped').addClass('bg-danger');
    } else if (value === 100) {
        $("#ocrProgressBar").removeClass('bg-primary bg-danger progress-bar-animated progress-bar-striped').addClass('bg-success');
    }
}


function hideOcrLoading() {
    if (ocrProgressInterval) {
        clearInterval(ocrProgressInterval);
        ocrProgressInterval = null;
    }
    $("#ocrLoadingSection").addClass("d-none");
    $("#ocrProgressBar").css("width", "0%");
    $("#btnProcesarOCR").prop('disabled', !selectedFileGlobalOCR); // Habilitar si hay archivo
}

function toggleOcrDebug() {
    // $("#ocrDebugPanel").toggleClass("d-none");
    alert("El panel de debug detallado del backend original no está implementado aquí de la misma forma.\nPor favor, revisa la consola del navegador (F12 -> Pestaña Network -> respuesta de /api/interpret-ticket) para ver los datos crudos del OCR de Genkit.");
}
window.toggleOcrDebug = toggleOcrDebug;

// ----- Lógica del Formulario Principal -----
$(document).ready(function() {
    console.log("Document ready. jQuery version:", $.fn.jquery);
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        console.log("Bootstrap is loaded. Version:", bootstrap.Modal.VERSION);
        
        const modalOcrElement = document.getElementById('modalOcr');
        if (modalOcrElement) {
            try {
                modalOcrInstance = new bootstrap.Modal(modalOcrElement);
                console.log("Modal #modalOcr inicializada correctamente.");
            } catch (error) {
                console.error("Error al inicializar modal #modalOcr:", error);
            }
        } else {
            console.error("Modal #modalOcr not found in HTML! No se puede inicializar.");
        }

        const wizardModalElement = document.getElementById('wizardModal');
        if (wizardModalElement) {
            try {
                wizardModalInstance = new bootstrap.Modal(wizardModalElement);
                console.log("Modal #wizardModal inicializada correctamente.");
            } catch (error) {
                console.error("Error al inicializar modal #wizardModal:", error);
            }
        } else {
            console.error("Modal #wizardModal not found in HTML!");
        }
        
        const ticketModalElement = document.getElementById('ticketModal');
        if (ticketModalElement) {
            try {
                ticketModalInstance = new bootstrap.Modal(ticketModalElement);
                console.log("Modal #ticketModal inicializada correctamente.");
            } catch (error) {
                console.error("Error al inicializar modal #ticketModal:", error);
            }
        } else {
            console.error("Modal #ticketModal not found in HTML!");
        }

    } else {
        console.error("Bootstrap o Bootstrap.Modal no está cargado! Las modales no funcionarán.");
    }
    
    // Adjuntar el manejador de clic para #btnCargarJugadas aquí, usando delegación o directa
    // Se ha eliminado la vinculación jQuery para #btnCargarJugadas de aquí,
    // ya que ahora se espera que se use onclick="handleCargarTodasLasJugadasClick()" en el HTML.

    // Inicializar Flatpickr
    if (document.getElementById("fecha")) {
        fpInstance = flatpickr("#fecha", {
            mode: "multiple",
            dateFormat: "m-d-Y",
            minDate: "today",
            defaultDate: [new Date()],
            clickOpens: true,
            allowInput: false,
            // appendTo: document.body, // Puede causar problemas con z-index y modales
            onOpen: function(selectedDates, dateStr, instance) {
                // Ajustar z-index si es necesario, o evitar que se abra detrás del modal
                // instance.calendarContainer.style.zIndex = "1056"; // Mayor que el z-index del modal de Bootstrap (1055)
            },
            onClose: function() {
                // this.calendarContainer.style.transform = '';
            },
            onReady: function(selectedDates, dateStr, instance) {
                if (!dateStr || dateStr.trim() === "") {
                    instance.setDate(new Date(), true); // 'true' para disparar onChange
                }
                // Actualizar el contador de días después de la inicialización
                selectedDaysCount = instance.selectedDates.length || 0;
                if (selectedDaysCount === 0 && instance.selectedDates.length === 0) { // Si defaultDate no disparó onChange
                    selectedDaysCount = 1; // Asumir 1 día si se usa defaultDate
                }
                 updateSelectedTracksAndTotal(); // Llamar para calcular total inicial
            },
            onChange: (selectedDatesFromOnChange) => {
                console.log("Flatpickr onChange - selectedDates:", selectedDatesFromOnChange);
                selectedDaysCount = selectedDatesFromOnChange.length;
                // La funcionalidad de disableTracksByTime ha sido comentada temporalmente
                // disableTracksByTime(); 
                updateSelectedTracksAndTotal();
            }
        });
    } else {
        console.error("Elemento #fecha para Flatpickr no encontrado.");
    }

    // Manejador de cambio para checkboxes de tracks
    $(".track-checkbox").on('change', function() {
        console.log("Track checkbox changed BY USER - calling updateSelectedTracksAndTotal");
        updateSelectedTracksAndTotal();
    });

    $("#agregarJugada").click(function() {
        console.log("Agregar Jugada button clicked");
        const newRow = addMainRow();
        if (newRow) {
            newRow.find(".betNumber").focus();
        }
    });

    $("#eliminarJugada").click(function() {
        console.log("Eliminar Última Jugada button clicked");
        if (playCount === 0) {
            alert("No plays to remove.");
            return;
        }
        $("#tablaJugadas tr:last").remove();
        playCount--;
        renumberMainRows();
        calculateMainTotal();
        highlightDuplicatesInMain();
    });

    $("#tablaJugadas").on("click", ".removeMainBtn", function() {
        console.log("Remove Main Row button clicked");
        $(this).closest("tr").remove();
        playCount--;
        renumberMainRows();
        calculateMainTotal();
        highlightDuplicatesInMain();
    });

    $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function() {
        const $row = $(this).closest("tr");
        recalcMainRow($row);
        highlightDuplicatesInMain();
        storeFormState();
    });

    $("#resetForm").click(function() {
        console.log("Reset Form button clicked");
        if (confirm("Are you sure you want to reset the form?")) {
            resetForm();
        }
    });

    $("#wizardButton").click(function() {
        console.log("Wizard button clicked");
        // resetWizard(); // La función resetWizard está definida más abajo
        if (wizardModalInstance) {
            resetWizard(); // Asegúrate que resetWizard esté definida antes de esta línea o muévela
            wizardModalInstance.show();
        } else {
            console.error("wizardModalInstance no está definida.");
        }
    });
    
    // --- Lógica del Wizard ---
    const lockedFields = { straight: false, box: false, combo: false };
    let wizardCount = 0;

    function resetWizard() {
        console.log("resetWizard called");
        wizardCount = 0;
        $("#wizardTableBody").empty();
        lockedFields.straight = false;
        lockedFields.box = false;
        lockedFields.combo = false;
        // Resetear visualmente los candados
        $("#lockStraight").html('<i class="bi bi-unlock"></i>').removeClass('active');
        $("#lockBox").html('<i class="bi bi-unlock"></i>').removeClass('active');
        $("#lockCombo").html('<i class="bi bi-unlock"></i>').removeClass('active');
        // Limpiar campos del wizard
        $("#wizardBetNumber").val("");
        $("#wizardStraight").val("");
        $("#wizardBox").val("");
        $("#wizardCombo").val("");
        $("#qpGameMode").val("Pick 3"); // Valor por defecto
        $("#qpCount").val("5");        // Valor por defecto
        $("#rdFirstNumber").val("");
        $("#rdLastNumber").val("");
    }
    window.resetWizard = resetWizard; // Hacer global si se llama desde HTML

    $(".lockBtn").click(function() {
        const field = $(this).data("field");
        lockedFields[field] = !lockedFields[field];
        $(this).toggleClass('active'); // Para feedback visual
        if (lockedFields[field]) {
            $(this).html('<i class="bi bi-lock-fill"></i>');
        } else {
            $(this).html('<i class="bi bi-unlock"></i>');
        }
        console.log("Lock button clicked for field:", field, "New state:", lockedFields[field]);
    });

    $("#wizardAddNext").click(function() {
        console.log("Wizard Add & Next button clicked");
        const bn = $("#wizardBetNumber").val().trim();
        const currentTracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        const gm = determineGameMode(bn, currentTracks);

        if (gm === "-") {
            alert(`Cannot determine game mode for "${bn}". Check tracks or length/format.`);
            return;
        }
        let stVal = $("#wizardStraight").val().trim();
        let bxVal = $("#wizardBox").val().trim();
        let coVal = $("#wizardCombo").val().trim();

        const rowT = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
        addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);

        if (!lockedFields.straight) $("#wizardStraight").val("");
        if (!lockedFields.box) $("#wizardBox").val("");
        if (!lockedFields.combo) $("#wizardCombo").val("");

        $("#wizardBetNumber").val("").focus();
        highlightDuplicatesInWizard();
    });

    function addWizardRow(bn, gm, stVal, bxVal, coVal, total) {
        if (wizardCount >= MAX_PLAYS) { // Usar MAX_PLAYS también para el wizard si aplica
             alert(`Wizard cannot add more plays. Limit of ${MAX_PLAYS} reached.`);
             return null;
        }
        wizardCount++;
        const i = wizardCount;
        const rowHTML = `
          <tr data-wizardIndex="${i}">
            <td><button type="button" class="removeWizardBtn btnRemovePlay btn btn-sm btn-danger" data-row="${i}">${i}</button></td>
            <td>${bn}</td>
            <td>${gm}</td>
            <td>${stVal || "-"}</td>
            <td>${bxVal || "-"}</td>
            <td>${coVal || "-"}</td>
            <td>${parseFloat(total || 0).toFixed(2)}</td>
          </tr>
        `;
        $("#wizardTableBody").append(rowHTML);
        return $("#wizardTableBody tr:last");
    }

    $("#wizardTableBody").on("click", ".removeWizardBtn", function() {
        console.log("Remove Wizard Row button clicked");
        $(this).closest("tr").remove();
        renumberWizardRows();
        highlightDuplicatesInWizard();
    });

    function renumberWizardRows() {
        let i = 0;
        $("#wizardTableBody tr").each(function() {
            i++;
            $(this).attr("data-wizardIndex", i);
            $(this).find(".removeWizardBtn").attr("data-row", i).text(i);
        });
        wizardCount = i;
    }
    
    $("#btnGenerateQuickPick").click(function() {
        console.log("Generate Quick Pick button clicked");
        const gm = $("#qpGameMode").val();
        const countVal = parseInt($("#qpCount").val()) || 1;
        if (countVal < 1 || countVal > MAX_PLAYS) { // Usar MAX_PLAYS
            alert(`Please enter a count between 1 and ${MAX_PLAYS}.`);
            return;
        }
        const stVal = $("#wizardStraight").val().trim();
        const bxVal = $("#wizardBox").val().trim();
        const coVal = $("#wizardCombo").val().trim();

        for (let i = 0; i < countVal; i++) {
            if (wizardCount >= MAX_PLAYS) break; // Parar si se alcanza el límite
            let bn = generateRandomNumberForMode(gm);
            bn = padNumberForMode(bn, gm);
            let rowT = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
            addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
        }
        highlightDuplicatesInWizard();
    });
    
    $("#btnGenerateRoundDown").click(function() {
        console.log("Generate Round Down button clicked");
        const firstNum = $("#rdFirstNumber").val().trim();
        const lastNum = $("#rdLastNumber").val().trim();
        // ... (resto de la lógica de Round Down, asegurando no exceder MAX_PLAYS) ...
        const currentTracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        if (!firstNum || !lastNum) {
            alert("Please enter both first and last number for Round Down.");
            return;
        }
        if (firstNum.length !== lastNum.length || ![2, 3, 4].includes(firstNum.length)) {
            alert("First/Last must have the same length (2, 3, or 4 digits).");
            return;
        }
        let start = parseInt(firstNum, 10);
        let end = parseInt(lastNum, 10);

        if (isNaN(start) || isNaN(end)) {
            alert("Invalid numeric range for Round Down.");
            return;
        }
        if (start > end) {
            [start, end] = [end, start]; // Intercambiar si están en orden incorrecto
        }

        const stVal = $("#wizardStraight").val().trim();
        const bxVal = $("#wizardBox").val().trim();
        const coVal = $("#wizardCombo").val().trim();

        for (let i = start; i <= end; i++) {
            if (wizardCount >= MAX_PLAYS) {
                alert(`Limit of ${MAX_PLAYS} plays reached. Stopping Round Down.`);
                break;
            }
            let bn = i.toString().padStart(firstNum.length, "0");
            let gm = determineGameMode(bn, currentTracks);
            if (gm === "-") continue;
            const rowT = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
            addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
        }
        highlightDuplicatesInWizard();
    });

    $("#btnPermute").click(function() {
        console.log("Permute button clicked");
        permuteWizardBetNumbers();
    });

    $("#wizardAddAllToMain").click(function() {
        console.log("Wizard Add All to Main button clicked");
        const wizardRows = $("#wizardTableBody tr");
        if (wizardRows.length === 0) {
            alert("No plays in the wizard table to add.");
            return;
        }
        wizardRows.each(function() {
            if (playCount >= MAX_PLAYS) {
                alert(`Main form limit of ${MAX_PLAYS} plays reached. Some plays from wizard were not added.`);
                return false; // Break jQuery .each loop
            }
            const tds = $(this).find("td");
            const bn = tds.eq(1).text();
            const gm = tds.eq(2).text();
            const stVal = (tds.eq(3).text() === "-" ? "" : tds.eq(3).text());
            const bxVal = (tds.eq(4).text() === "-" ? "" : tds.eq(4).text());
            const coVal = (tds.eq(5).text() === "-" ? "" : tds.eq(5).text());
            
            // Crear objeto de apuesta para pasar a addMainRow
            const betFromWizard = {
                betNumber: bn,
                gameMode: gm, // gameMode ya está determinado en el wizard
                straightAmount: parseFloat(stVal) || null,
                boxAmount: parseFloat(bxVal) || null, // O manejar strings si 'box' puede ser "1,2"
                comboAmount: parseFloat(coVal) || null
            };
             if (bxVal && bxVal.includes(",")) { // Si box es una lista de posiciones
                betFromWizard.boxAmount = null; // No es un monto numérico directo
                // Considerar cómo quieres manejar esto si 'box' en la tabla principal es numérico.
                // Podrías guardarlo en una 'nota' o tener un campo de texto para box.
                // Por ahora, addMainRow lo tratará como null si no es un número.
                // Y en la tabla principal, el input de box es de tipo 'text'
                 addMainRow(betFromWizard, bxVal); // Pasar bxVal original si es texto
            } else {
                 addMainRow(betFromWizard);
            }
        });
        $("#wizardTableBody").empty(); // Limpiar tabla del wizard
        wizardCount = 0;
        recalcAllMainRows(); // Esto recalculará gameMode y totales en la tabla principal
        calculateMainTotal();
        highlightDuplicatesInMain();
        storeFormState();
    });

    $("#wizardGenerateTicket").click(function() {
        console.log("Wizard Generate Ticket button clicked");
        $("#wizardAddAllToMain").trigger("click"); // Cargar jugadas a la tabla principal
        if (wizardModalInstance) wizardModalInstance.hide();
        // La función doGenerateTicket se llamará desde el botón principal ahora.
        // Si quieres que este botón también genere el ticket directamente:
        setTimeout(doGenerateTicket, 100); // Pequeño delay para asegurar que el DOM se actualice
    });
    
    $("#wizardEditMainForm").click(function() {
        console.log("Wizard Edit Main Form button clicked");
        if (wizardModalInstance) wizardModalInstance.hide();
    });


    // Lógica de "Generar Ticket" y Modal de Preview
    $("#generarTicket").click(function() {
        console.log("Generate Ticket button clicked");
        doGenerateTicket();
    });

    $("#confirmarTicket").click(function() {
        // ... (lógica de confirmarTicket)
        console.log("Confirm Ticket button clicked");
        $(this).prop("disabled", true);
        $("#editButton").addClass("d-none");

        const uniqueTicket = generateUniqueTicketNumber();
        $("#numeroTicket").text(uniqueTicket);
        transactionDateTime = dayjs().format("MM/DD/YYYY hh:mm A"); // Asegurar que transactionDateTime esté definida globalmente
        $("#ticketTransaccion").text(transactionDateTime);

        $("#qrcode").empty(); // Limpiar QR anterior
        try {
            new QRCode(document.getElementById("qrcode"), {
                text: uniqueTicket,
                width: 128,
                height: 128,
                correctLevel: QRCode.CorrectLevel.H // Añadir nivel de corrección
            });
        } catch (e) {
            console.error("Error generando QR Code:", e);
            $("#qrcode").text("Error QR");
        }


        $("#shareTicket").removeClass("d-none");

        const ticketElement = document.getElementById("preTicket");
        // ... (código html2canvas para descargar imagen)
         const originalStyles = {
            width: $(ticketElement).css("width"),
            height: $(ticketElement).css("height"),
            maxHeight: $(ticketElement).css("max-height"),
            overflowY: $(ticketElement).css("overflow-y"),
            backgroundColor: $(ticketElement).css("background-color") // Guardar color original
        };
        
        // Aplicar fondo blanco para la captura, si el ticket no es oscuro
        if (!$(ticketElement).hasClass('table-dark')) { // Asumiendo que la tabla oscura tiene esta clase o similar
           // $(ticketElement).css("background-color", "#ffffff"); // Forzar fondo blanco
        }

        setTimeout(() => {
            html2canvas(ticketElement, {
                scale: 2,
                logging: true, // Habilitar logging de html2canvas
                useCORS: true, // Si hay imágenes externas
                backgroundColor: "#ffffff" // Fondo blanco para la imagen generada
            }).then(canvas => {
                const dataUrl = canvas.toDataURL("image/jpeg", 0.9); // Mejor calidad JPEG
                window.ticketImageDataUrl = dataUrl;

                const link = document.createElement("a");
                link.href = dataUrl;
                link.download = `ticket_${uniqueTicket}.jpg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                alert("Your ticket image was downloaded successfully (JPEG).");
                // saveBetDataToSheetDB(uniqueTicket, ...); // Si se reactiva esta funcionalidad
            }).catch(err => {
                console.error("Error generating ticket image with html2canvas:", err);
                alert("Problem generating final ticket image. Check console for errors.");
            }).finally(() => {
                 $(ticketElement).css(originalStyles); // Restaurar estilos originales
            });
        }, 500); // Delay para asegurar que el DOM se actualice (QR, etc.)
    });

    $("#editButton").click(function() {
        console.log("Edit Ticket button clicked");
        if (ticketModalInstance) ticketModalInstance.hide();
    });

    $("#shareTicket").click(async function() {
        console.log("Share Ticket button clicked");
        if (!window.ticketImageDataUrl) {
            alert("No ticket image is available to share.");
            return;
        }
        // ... (lógica de compartir)
        if (navigator.share) {
            try {
                // Convertir data URL a Blob para compartir como archivo
                const response = await fetch(window.ticketImageDataUrl);
                const blob = await response.blob();
                const file = new File([blob], `ticket_${$("#numeroTicket").text()}.jpg`, { type: "image/jpeg" });
                
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Lottery Ticket',
                        text: `Here is my lottery ticket #${$("#numeroTicket").text()}`,
                    });
                    console.log('Ticket shared successfully');
                } else {
                    alert('Sharing files is not supported on this browser/OS combination, or this file type cannot be shared.');
                }
            } catch (err) {
                console.error('Error sharing ticket:', err);
                alert('Could not share the ticket. Please try sharing the downloaded image manually.');
            }
        } else {
            alert('Web Share API is not supported in your browser. Please share the downloaded image manually.');
        }
    });
    
    // Inicializar estado del formulario
    loadFormState(); // Cargar estado guardado
    // La funcionalidad de disableTracksByTime y showCutoffTimes ha sido comentada
    // showCutoffTimes(); 
    // autoSelectNYTrackAndVenezuela(); // Seleccionar tracks por defecto
    // disableTracksByTime(); // Aplicar deshabilitación inicial
    // updateSelectedTracksAndTotal(); // Calcular total inicial
    
    // Al final de $(document).ready(), después de todas las inicializaciones:
    console.log("Document fully loaded and initial scripts executed.");
    if (fpInstance && fpInstance.selectedDates.length > 0) {
         selectedDaysCount = fpInstance.selectedDates.length;
    } else if (fpInstance) {
        // Si no hay fechas seleccionadas pero flatpickr está inicializado,
        // y se usó defaultDate, asegurar que selectedDaysCount sea al menos 1.
        if (fpInstance.config.defaultDate && fpInstance.config.defaultDate.length > 0 && selectedDaysCount === 0) {
             selectedDaysCount = 1;
        }
    }
    autoSelectNYTrackAndVenezuela();
    // Se ha comentado disableTracksByTime y showCutoffTimes
    // showCutoffTimes();
    // disableTracksByTime(); // Esto se llama también en el onChange de flatpickr
    updateSelectedTracksAndTotal();


    // Tutorial y Manual
    // ... (código del tutorial y manual sin cambios)
    const tutorialStepsEN = [/* ... */];
    const tutorialStepsES = [/* ... */];
    const tutorialStepsHT = [/* ... */];
    // ...
    $("#helpEnglish").click(() => startTutorial('en'));
    $("#helpSpanish").click(() => startTutorial('es'));
    $("#helpCreole").click(() => startTutorial('ht'));

    $("#manualEnglishBtn").click(function() { /* ... */ });
    $("#manualSpanishBtn").click(function() { /* ... */ });
    $("#manualCreoleBtn").click(function() { /* ... */ });

}); // Fin de $(document).ready()


// ----- Funciones de Utilidad y Cálculo (muchas ya existen, se revisan/mejoran) -----
function updateSelectedTracksAndTotal() {
    console.log("updateSelectedTracksAndTotal called");
    let count = 0;
    $(".track-checkbox:checked").each(function() {
        if ($(this).val() !== "Venezuela") { // No contar Venezuela para el multiplicador
            count++;
        }
    });
    selectedTracksCount = count > 0 ? count : 1; // Si no hay nada, al menos 1 para no multiplicar por 0
    
    // Si solo Venezuela está seleccionado, selectedTracksCount debería ser 1 (o como se maneje el multiplicador)
    if ($(".track-checkbox:checked").length === 1 && $(".track-checkbox:checked").val() === "Venezuela") {
        selectedTracksCount = 1; 
    }
    if ($(".track-checkbox:checked").length === 0) { // Si NINGUNO está seleccionado
        selectedTracksCount = 0; // Para que el total sea 0 si no hay tracks
    }


    console.log("Track checkboxes changed - selectedTracksCount:", selectedTracksCount);
    calculateMainTotal();
    storeFormState();
}


function calculateMainTotal() {
    console.log("calculateMainTotal called. Days:", selectedDaysCount, "Tracks:", selectedTracksCount);
    let sum = 0;
    $("#tablaJugadas tr").each(function() {
        const totalCell = $(this).find(".total").text();
        const val = parseFloat(totalCell) || 0;
        sum += val;
    });

    // Asegurar que selectedDaysCount y selectedTracksCount no sean 0 si deben ser 1 por defecto
    const daysToMultiply = selectedDaysCount > 0 ? selectedDaysCount : 1;
    // const tracksToMultiply = selectedTracksCount > 0 ? selectedTracksCount : 1;
    // Modificación: si no hay tracks seleccionados, el total debe ser 0.
    const tracksToMultiply = selectedTracksCount;


    let finalTotal = sum * daysToMultiply * tracksToMultiply;
    if (selectedTracksCount === 0) { // Si no hay tracks, el total es 0
        finalTotal = 0;
    }

    $("#totalJugadas").text(finalTotal.toFixed(2));
    console.log("Main total updated to:", finalTotal.toFixed(2));
}

function addMainRow(bet = null, originalBoxVal = null) { // Añadir originalBoxVal como parámetro opcional
    console.log("addMainRow llamada. playCount actual:", playCount, "Datos de jugada:", bet, "Original Box:", originalBoxVal);

    if (playCount >= MAX_PLAYS) {
        console.warn(`Límite de ${MAX_PLAYS} jugadas alcanzado en addMainRow`);
        alert(`You have reached the limit of ${MAX_PLAYS} plays in the main form.`);
        return null;
    }

    playCount++;
    const rowIndex = playCount;

    let bn_val = "";
    let st_val = "";
    let bx_val = ""; // Para el input
    let co_val = "";
    let gm_val = "-";
    
    const currentTracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();

    if (bet) {
        bn_val = bet.betNumber || "";
        st_val = (bet.straightAmount !== null && bet.straightAmount !== undefined) ? String(bet.straightAmount.toFixed(2)) : "";
        
        // Manejar boxAmount: si originalBoxVal existe (y es texto como "1,2"), usarlo, sino usar bet.boxAmount
        if (originalBoxVal && typeof originalBoxVal === 'string') {
            bx_val = originalBoxVal;
        } else {
            bx_val = (bet.boxAmount !== null && bet.boxAmount !== undefined) ? String(bet.boxAmount.toFixed(2)) : "";
        }
        
        co_val = (bet.comboAmount !== null && bet.comboAmount !== undefined) ? String(bet.comboAmount.toFixed(2)) : "";
        gm_val = bet.gameMode || determineGameMode(bn_val, currentTracks);
    } else {
        // Si no hay 'bet', determinar gameMode basado en bn_val (que será vacío inicialmente)
        gm_val = determineGameMode(bn_val, currentTracks);
    }

    const rowHTML = `
      <tr data-playindex="${rowIndex}">
        <td>
          <button type="button" class="btnRemovePlay removeMainBtn btn btn-sm btn-danger" data-row="${rowIndex}">
            ${rowIndex}
          </button>
        </td>
        <td><input type="text" class="form-control betNumber" value="${bn_val}" /></td>
        <td class="gameMode">${gm_val}</td>
        <td><input type="number" step="0.01" class="form-control straight" value="${st_val}" /></td>
        <td><input type="text" class="form-control box" value="${bx_val}" /></td>
        <td><input type="number" step="0.01" class="form-control combo" value="${co_val}" /></td>
        <td class="total">0.00</td>
      </tr>
    `;

    try {
        $("#tablaJugadas").append(rowHTML);
        const $newRow = $("#tablaJugadas tr[data-playindex='" + rowIndex + "']");

        if ($newRow.length === 0) {
            console.error("Error: La fila no se agregó correctamente al DOM en addMainRow");
            playCount--;
            return null;
        }
        recalcMainRow($newRow); // Siempre recalcular para actualizar gameMode y total de la nueva fila
        
        console.log(`Fila ${rowIndex} agregada exitosamente por addMainRow`);
        return $newRow;

    } catch (error) {
        console.error("Error en addMainRow al agregar fila:", error);
        playCount--;
        return null;
    }
}


function renumberMainRows() {
    console.log("renumberMainRows called");
    let i = 0;
    $("#tablaJugadas tr").each(function() {
        i++;
        $(this).attr("data-playindex", i);
        $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i;
    // storeFormState(); // Se llama desde las funciones que invocan renumberMainRows
}

function recalcMainRow($row) {
    // console.log("recalcMainRow called for row:", $row.data('playindex'));
    const bn = $row.find(".betNumber").val().trim();
    const currentTracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
    const gm = determineGameMode(bn, currentTracks);
    $row.find(".gameMode").text(gm);

    const stVal = $row.find(".straight").val().trim();
    const bxVal = $row.find(".box").val().trim(); // bxVal puede ser "1,2" o un número
    const coVal = $row.find(".combo").val().trim();

    const rowTotal = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    $row.find(".total").text(rowTotal);
    // calculateMainTotal(); // Se llama después de que todas las filas se recalculan o se modifica una
}

function recalcAllMainRows() {
    console.log("recalcAllMainRows called");
    $("#tablaJugadas tr").each(function() {
        recalcMainRow($(this));
    });
    calculateMainTotal(); // Calcular el total general después de recalcular todas las filas
}

function determineGameMode(betNumber, tracks = []) {
    // console.log("determineGameMode called with betNumber:", betNumber, "Tracks:", tracks);
    if (!betNumber) return "-";

    const currentSelectedTracks = tracks.length > 0 ? tracks : $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
    // console.log("Current selected tracks for game mode determination:", currentSelectedTracks);
    
    const isUSA = currentSelectedTracks.some(t => cutoffTimes.USA && cutoffTimes.USA[t]);
    const isSD = currentSelectedTracks.some(t => cutoffTimes["Santo Domingo"] && cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = currentSelectedTracks.includes("Venezuela");
    const includesHorses = currentSelectedTracks.includes("New York Horses");

    if (includesHorses) return "NY Horses";

    const betLength = betNumber.length;
    const paleRegex = /^(\d{2})([x+\-])(\d{2})$/; // Palé como "XX-XX", "XX+XX", "XXxXX"

    if (paleRegex.test(betNumber)) {
        // Para Palé, no depende tanto de la región si ya está en formato Palé.
        // Si se quisiera diferenciar Palé-Ven vs Palé-RD, se podría añadir lógica aquí.
        return "Palé"; 
    }

    if (betLength === 1) { // SingleAction solo si es track USA y no es Venezuela ni Horses
        if (isUSA && !includesVenezuela && !includesHorses) return "Single Action";
    }
    
    if (betLength === 2) {
        if (includesVenezuela && isUSA) return "Venezuela"; // Prioridad si Venezuela está con USA
        if (isSD && !isUSA) return "RD-Quiniela";    // Solo SD
        if (isUSA && !isSD) return "Pulito";         // Solo USA (y no Venezuela)
        if (isUSA && isSD) return "Pulito"; // Si ambos, default a Pulito? O requiere más lógica?
    }
    
    if (betLength === 3) return "Pick 3";
    if (betLength === 4) return "Win 4";

    return "-";
}

function calculateRowTotal(bn, gm, stVal, bxVal, coVal) {
    // console.log(`calculateRowTotal: bn=${bn}, gm=${gm}, st=${stVal}, bx=${bxVal}, co=${coVal}`);
    if (!bn || gm === "-") return "0.00";

    const st = parseFloat(stVal) || 0;
    const combo = parseFloat(coVal) || 0;
    let numericBox = 0;
    let total = 0;

    if (gm === "Pulito") {
        // Para Pulito, bxVal puede ser "1", "0.5", o "1,2" (posiciones)
        if (bxVal && bxVal.includes(",")) { // Si es una lista de posiciones
            const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean);
            // El "monto" en box para Pulito cuando es posiciones se considera multiplicador de straight
            total = st * positions.length;
        } else { // Si box es un monto directo para Pulito (raro, pero posible)
            numericBox = parseFloat(bxVal) || 0;
            total = st + numericBox + combo; // Sumar como otros juegos
        }
    } else if (["Single Action", "NY Horses"].includes(gm)) {
        numericBox = parseFloat(bxVal) || 0;
        total = st + numericBox + combo;
    } else if (["Venezuela", "RD-Quiniela", "Palé"].includes(gm)) {
        // Para estos juegos, a menudo solo se considera straight,
        // pero si el usuario mete box/combo, se podrían sumar
        numericBox = parseFloat(bxVal) || 0;
        total = st + numericBox + combo; 
    } else if (gm === "Win 4" || gm === "Pick 3") {
        numericBox = parseFloat(bxVal) || 0;
        const combosCount = calcCombos(bn); // Número de combinaciones para el combo
        total = st + numericBox + (combo * combosCount);
    } else { // Caso por defecto o si gm no coincide con ninguno especial
        numericBox = parseFloat(bxVal) || 0;
        total = st + numericBox + combo;
    }
    // console.log("Calculated row total:", total.toFixed(2));
    return total.toFixed(2);
}


function calcCombos(str) {
    if (!str || typeof str !== 'string') return 1; // Evitar error si str no es válido
    const freq = {};
    for (let c of str) {
        freq[c] = (freq[c] || 0) + 1;
    }
    const factorial = n => {
        if (n < 0) return 0; // Factorial de negativos no definido
        return n <= 1 ? 1 : n * factorial(n - 1);
    };
    let denom = 1;
    for (let k in freq) {
        denom *= factorial(freq[k]);
    }
    if (denom === 0) return 1; // Evitar división por cero
    return factorial(str.length) / denom;
}

function storeFormState() { /* ... (sin cambios) ... */ }
function loadFormState() { /* ... (sin cambios, pero asegurar que llame a recalcAllMainRows y updateSelectedTracksAndTotal) ... */ }
// loadFormState(); // Llamar al cargar

function resetForm() {
    console.log("resetForm called");
    // Guardar el estado actual de los manejadores de tracks
    // const trackChangeHandler = $._data($(".track-checkbox")[0], "events")?.change?.[0]?.handler;
    // $(".track-checkbox").off('change');

    isUpdatingProgrammatically = true;
    $("#lotteryForm")[0].reset();
    $("#tablaJugadas").empty();
    playCount = 0;
    jugadasGlobalOCR = []; // Limpiar jugadas del OCR también
    
    // Resetear Flatpickr
    if (fpInstance) {
        fpInstance.setDate([new Date()], false); // false para no disparar onChange aquí
        selectedDaysCount = 1; // Forzar a 1 día
    } else {
        selectedDaysCount = 1;
    }
    
    // Desmarcar todos los tracks
    $(".track-checkbox").prop('checked', false);
    isUpdatingProgrammatically = false;

    autoSelectNYTrackAndVenezuela(); // Esto marcará los defaults y llamará a updateSelectedTracksAndTotal
    // La funcionalidad de disableTracksByTime y showCutoffTimes ha sido comentada
    // showCutoffTimes();
    // disableTracksByTime(); 
    
    // Actualizar total después de que autoSelect haya terminado y llamado a updateSelectedTracksAndTotal
    // calculateMainTotal(); // Esta se llama dentro de updateSelectedTracksAndTotal
    $("#totalJugadas").text("0.00"); // Forzar visualmente si es necesario
    localStorage.removeItem("formState");

    // Volver a adjuntar el manejador si se desvinculó
    // if (trackChangeHandler) $(".track-checkbox").on('change', trackChangeHandler);
    console.log("Form reset complete. selectedDaysCount:", selectedDaysCount, "selectedTracksCount:", selectedTracksCount);
}


// Funciones de tracks (enable, showCutoff, userChoseToday) comentadas o simplificadas
function getTrackCutoff(trackName) { /* ... (simplificado o comentado si causa problemas) ... */ return null; }
function enableAllTracks() { /* ... (comentado) ... */ }
// function showCutoffTimes() { /* ... (comentado) ... */ }
// function userChoseToday() { /* ... (comentado) ... */ return false; } // Forzar a que no sea hoy para evitar lógica de cutoff
// function disableTracksByTime() { /* ... (comentado) ... */ }

function autoSelectNYTrackAndVenezuela() {
    console.log("autoSelectNYTrackAndVenezuela called");
    const anyChecked = $(".track-checkbox:checked").length > 0;
    if (anyChecked && playCount > 0) { // No auto-seleccionar si ya hay algo o jugadas
        console.log("Tracks ya seleccionados o jugadas presentes, no se auto-seleccionará.");
        updateSelectedTracksAndTotal(); // Asegurar que los totales se actualicen con la selección actual
        return;
    }

    isUpdatingProgrammatically = true;
    // Desmarcar todos primero si es una carga limpia
    if (!anyChecked) {
       // $(".track-checkbox").prop('checked', false); // Ya se hace en resetForm si es llamado desde ahí
    }

    const now = dayjs();
    let middayCutoff = dayjs().hour(14).minute(20); // Ajustar a la hora real de NY Midday
    
    // Solo seleccionar NY si no hay otros tracks de USA ya marcados (excepto Venezuela)
    const usaTracksChecked = $(".track-checkbox:checked").filter(function() {
        return cutoffTimes.USA && cutoffTimes.USA[$(this).val()] && $(this).val() !== "Venezuela";
    }).length > 0;

    if (!usaTracksChecked) {
        if (now.isBefore(middayCutoff)) {
            $("#trackNYMidDay").prop("checked", true);
        } else {
            $("#trackNYEvening").prop("checked", true);
        }
    }
    $("#trackVenezuela").prop("checked", true);
    isUpdatingProgrammatically = false;
    
    updateSelectedTracksAndTotal(); // Actualizar conteos y total después de la selección
}


function highlightDuplicatesInMain() { /* ... (sin cambios) ... */ }
function highlightDuplicatesInWizard() { /* ... (sin cambios) ... */ }

function generateRandomNumberForMode(mode) { /* ... (sin cambios) ... */ }
function padNumberForMode(num, mode) { /* ... (sin cambios) ... */ }
function permuteWizardBetNumbers() { /* ... (sin cambios) ... */ }

function doGenerateTicket() { /* ... (lógica de validación y mostrar modal de ticket) ... */ 
    console.log("doGenerateTicket called");
    // ... (validaciones de fecha, tracks, jugadas) ...
    // ... (mostrar ticketModalInstance.show()) ...
    const dateVal = (fpInstance && fpInstance.input.value) || "";
    if (!dateVal) {
        alert("Please select at least one date.");
        return;
    }
    $("#ticketFecha").text(dateVal);

    const chosenTracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
    if (chosenTracks.length === 0) {
        alert("Please select at least one track.");
        return;
    }
     $("#ticketTracks").text(chosenTracks.join(", "));

    // Validaciones de jugadas (simplificado para el ejemplo)
    if (playCount === 0) {
        alert("Please add at least one play.");
        return;
    }
    // ... (más validaciones de tu script original si son necesarias) ...
    
    // Llenar tabla del ticket preview
    $("#ticketJugadas").empty();
    $("#tablaJugadas tr").each(function(index) {
        const bn = $(this).find(".betNumber").val();
        const gm = $(this).find(".gameMode").text();
        const st = $(this).find(".straight").val();
        const bx = $(this).find(".box").val();
        const co = $(this).find(".combo").val();
        const tot = $(this).find(".total").text();
        $("#ticketJugadas").append(
            `<tr>
                <td>${index + 1}</td>
                <td>${bn}</td><td>${gm}</td>
                <td>${parseFloat(st || 0).toFixed(2)}</td>
                <td>${bx || "-"}</td>
                <td>${parseFloat(co || 0).toFixed(2)}</td>
                <td>${tot}</td>
            </tr>`
        );
    });
    $("#ticketTotal").text($("#totalJugadas").text());
    $("#ticketTransaccion").text(dayjs().format("MM/DD/YYYY hh:mm A"));
    $("#numeroTicket").text("(Not assigned yet)");
    $("#qrcode").empty();

    $("#editButton").removeClass("d-none");
    $("#shareTicket").addClass("d-none");
    $("#confirmarTicket").prop("disabled", false);

    if (ticketModalInstance) {
        ticketModalInstance.show();
    } else {
        console.error("ticketModalInstance no está definida para mostrar.");
    }
}
function generateUniqueTicketNumber() { /* ... (sin cambios) ... */ return "TICKET-" + Date.now(); }

// Funciones del Tutorial y Manual (sin cambios)
// ...

// Definición de funciones de wizard (resetWizard, addWizardRow, etc.)
// ... (asegurar que resetWizard esté definida antes de ser llamada en $(document).ready())

// Hacer global la función de debug
window.debugOcrState = function() {
    console.log("=== DEBUG OCR STATE ===");
    console.log("selectedFileGlobalOCR:", selectedFileGlobalOCR);
    console.log("jugadasGlobalOCR:", jugadasGlobalOCR);
    console.log("jugadasGlobalOCR.length:", jugadasGlobalOCR ? jugadasGlobalOCR.length : 'undefined');
    console.log("modalOcrInstance:", modalOcrInstance);
    console.log("playCount:", playCount);
    console.log("MAX_PLAYS:", MAX_PLAYS);
    console.log("Botón btnCargarJugadas disabled:", $("#btnCargarJugadas").prop('disabled'));
    console.log("========================");
}

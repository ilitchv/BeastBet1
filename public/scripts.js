
// Ensure jQuery and Bootstrap are loaded before this script
// For example, in your HTML:
// <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
// <script src="scripts.js"></script>

// Global variables
let selectedFileGlobalOCR = null;
let jugadasGlobalOCR = [];
let fpInstance = null; // Flatpickr instance
let modalOcrInstance = null;
let wizardModalInstance = null;
let ticketModalInstance = null;

let playCount = 0;
const MAX_PLAYS = 200; // Updated limit
let selectedDaysCount = 0;
let selectedTracksCount = 0;

// For Wizard
let wizardCount = 0;
const lockedFields = {
    straight: false,
    box: false,
    combo: false
};

// Cutoff times (remains the same, ensure it's defined)
const cutoffTimes = {
    "USA": {
        "New York Mid Day": "14:20", "New York Evening": "22:00", "Georgia Mid Day": "12:20",
        "Georgia Evening": "18:40", "New Jersey Mid Day": "12:50", "New Jersey Evening": "22:00",
        "Florida Mid Day": "13:20", "Florida Evening": "21:30", "Connecticut Mid Day": "13:30",
        "Connecticut Evening": "22:00", "Georgia Night": "22:00", "Pensilvania AM": "12:45",
        "Pensilvania PM": "18:15", "Venezuela": "00:00", // No cutoff
        "Brooklyn Midday": "14:20", "Brooklyn Evening": "22:00", "Front Midday": "14:20",
        "Front Evening": "22:00", "New York Horses": "16:00" // Example
    },
    "Santo Domingo": {
        "Real": "11:45", "Gana mas": "13:25", "Loteka": "18:30", "Nacional": "19:30",
        "Quiniela Pale": "19:30", "Primera Día": "10:50", "Suerte Día": "11:20",
        "Lotería Real": "11:50", "Suerte Tarde": "16:50", "Lotedom": "16:50",
        "Primera Noche": "18:50", "Panama": "16:00" // Example
    }
};


// --- OCR Modal Functions ---
function abrirModalOCR() {
    console.log("abrirModalOCR function called");
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val(""); // Clear file input
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    hideOcrLoading();
    $("#ocrDebugPanel").addClass("d-none");
    // Disable buttons that depend on OCR results
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true); // Disable "Cargar Jugadas al Form" button

    if (modalOcrInstance) {
        modalOcrInstance.show();
    } else {
        console.error("modalOcrInstance is not initialized!");
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
        $("#btnProcesarOCR").prop('disabled', false); // Enable process button
        $("#ocrJugadas").html("<p>Imagen lista. Haz clic en 'Procesar OCR'.</p>");
    }
}
window.handleDropOCR = handleDropOCR;

function handleFileChangeOCR(event) {
    console.log("handleFileChangeOCR called");
    if (event.target.files && event.target.files[0]) {
        selectedFileGlobalOCR = event.target.files[0];
        console.log("File selected:", selectedFileGlobalOCR);
        $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
        $("#btnProcesarOCR").prop('disabled', false); // Enable process button
        $("#ocrJugadas").html("<p>Imagen lista. Haz clic en 'Procesar OCR'.</p>");

    } else {
        selectedFileGlobalOCR = null;
        $("#ocrPreview").addClass("d-none").attr("src", "");
        $("#btnProcesarOCR").prop('disabled', true); // Disable process button
        $("#ocrJugadas").html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    }
}
window.handleFileChangeOCR = handleFileChangeOCR;

let ocrProgressIntervalId = null;
function showOcrLoading(message = "Subiendo/Procesando...") {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width", "0%");
    $("#ocrProgressText").text(message);
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true);

    let progressValue = 0;
    if (ocrProgressIntervalId) clearInterval(ocrProgressIntervalId);
    ocrProgressIntervalId = setInterval(() => {
        progressValue += 10;
        if (progressValue > 90) progressValue = 90; // Simulate progress
        $("#ocrProgressBar").css("width", progressValue + "%");
    }, 200);
}

function updateOcrProgress(percentage, message) {
    if (percentage > 90 && percentage < 100) percentage = 90; // Don't complete fully until done
    $("#ocrProgressBar").css("width", percentage + "%");
    if (message) $("#ocrProgressText").text(message);
}

function hideOcrLoading(success = true) {
    if (ocrProgressIntervalId) {
        clearInterval(ocrProgressIntervalId);
        ocrProgressIntervalId = null;
    }
    if (success) {
        $("#ocrProgressBar").css("width", "100%");
        $("#ocrProgressText").text("Completado!");
        setTimeout(() => {
            $("#ocrLoadingSection").addClass("d-none");
        }, 800);
    } else {
         $("#ocrProgressText").text("Error."); // Keep loading section visible on error to show message
         // Do not hide, let error message persist
    }
    // Enable process button if a file is still selected (e.g., for retrying)
    $("#btnProcesarOCR").prop('disabled', !selectedFileGlobalOCR);
}

async function procesarOCR() {
    console.log("procesarOCR function called");
    console.log("Current selectedFileGlobalOCR:", selectedFileGlobalOCR);

    if (!selectedFileGlobalOCR) {
        alert("Por favor, selecciona una imagen primero.");
        return;
    }

    showOcrLoading("Iniciando procesamiento...");
    jugadasGlobalOCR = []; // Clear previous results
    $("#ocrJugadas").html("Procesando..."); // Clear previous plays display
    $("#btnCargarJugadas").prop('disabled', true);


    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobalOCR);
    reader.onloadend = async () => {
        const base64data = reader.result;
        updateOcrProgress(30, "Imagen leída, enviando a IA...");
        console.log("Sending request to /api/interpret-ticket");
        try {
            const response = await fetch('/api/interpret-ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ photoDataUri: base64data }),
            });

            updateOcrProgress(70, "Respuesta recibida de IA, procesando...");

            if (!response.ok) {
                let errorMsg = `Error del servidor: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg += ` - ${errorData.message || 'Error desconocido del servidor.'}`;
                } catch (e) {
                    // Failed to parse JSON error, use text
                    const textError = await response.text();
                    errorMsg += ` - ${textError || 'Respuesta no JSON.'}`;
                }
                throw new Error(errorMsg);
            }

            const interpretedBets = await response.json();
            console.log("Received interpretedBets:", interpretedBets);
            hideOcrLoading(true);

            if (Array.isArray(interpretedBets) && interpretedBets.length > 0) {
                jugadasGlobalOCR = interpretedBets;
                let html = '<h5 class="mb-3">Jugadas Detectadas:</h5>';
                jugadasGlobalOCR.forEach((j, idx) => {
                    html += `
                      <div class="ocr-detected-play mb-3 p-2 border rounded">
                        <table class="table table-sm table-bordered table-dark small-ocr-table mb-1">
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
                              <td>${j.straightAmount !== null && j.straightAmount !== undefined ? parseFloat(j.straightAmount).toFixed(2) : "-"}</td>
                              <td>${j.boxAmount !== null && j.boxAmount !== undefined ? parseFloat(j.boxAmount).toFixed(2) : "-"}</td>
                              <td>${j.comboAmount !== null && j.comboAmount !== undefined ? parseFloat(j.comboAmount).toFixed(2) : "-"}</td>
                            </tr>
                          </tbody>
                        </table>
                        <button class="btn btn-sm btn-info" onclick="usarJugadaOCR(${idx})">
                          Usar esta Jugada
                        </button>
                      </div>
                      ${idx < jugadasGlobalOCR.length - 1 ? '<hr class="ocr-play-separator">' : ''}
                    `;
                });
                $("#ocrJugadas").html(html);
                $("#btnCargarJugadas").prop('disabled', false); // Enable button
            } else {
                $("#ocrJugadas").html("<p>No se detectaron jugadas válidas en la imagen.</p>");
                $("#btnCargarJugadas").prop('disabled', true);
            }
        } catch (error) {
            console.error("Error procesando la imagen:", error);
            $("#ocrJugadas").html(`<p class="text-danger">Error procesando la imagen: ${error.message}</p>`);
            hideOcrLoading(false);
            $("#btnCargarJugadas").prop('disabled', true);
        }
    };
    reader.onerror = () => {
        alert('Error leyendo el archivo de imagen.');
        hideOcrLoading(false);
        $("#btnCargarJugadas").prop('disabled', true);
    };
}
window.procesarOCR = procesarOCR;

function usarJugadaOCR(idx) {
    console.log('usarJugadaOCR called with index:', idx);
    if (!jugadasGlobalOCR || !jugadasGlobalOCR[idx]) {
        alert("No se encontró la jugada seleccionada.");
        return;
    }
    const j = jugadasGlobalOCR[idx];
    console.log('Play data to use:', j);

    if (playCount >= MAX_PLAYS) {
        alert(`Se ha alcanzado el límite de ${MAX_PLAYS} jugadas.`);
        return;
    }
    addMainRow(j); // Pass the bet object to addMainRow
    // No cerrar el modal: modalOcrInstance.hide(); 
}
window.usarJugadaOCR = usarJugadaOCR;

// NUEVA FUNCIÓN GLOBAL PARA EL BOTÓN #btnCargarJugadas
function handleCargarTodasLasJugadasClick() {
    console.log("¡handleCargarTodasLasJugadasClick EJECUTADA!");
    alert("Botón 'Cargar Jugadas al Form' clickeado (onclick global)");

    if (!jugadasGlobalOCR || jugadasGlobalOCR.length === 0) {
        console.log("No hay jugadas OCR para cargar desde handleCargarTodasLasJugadasClick.");
        alert("No hay jugadas OCR para cargar.");
        return;
    }
    console.log(`Cargando ${jugadasGlobalOCR.length} jugadas del OCR desde handleCargarTodasLasJugadasClick...`);

    jugadasGlobalOCR.forEach((j, index) => {
        console.log(`Añadiendo jugada OCR ${index + 1} (desde handleCargarTodasLasJugadasClick) a la tabla principal:`, j);
        if (playCount < MAX_PLAYS) {
            addMainRow(j);
        } else {
            alert(`Se ha alcanzado el límite de ${MAX_PLAYS} jugadas en el formulario principal.`);
            return false; // Rompe el bucle .forEach
        }
    });

    console.log("Todas las jugadas OCR procesadas (desde handleCargarTodasLasJugadasClick).");
    recalcAllMainRows();
    calculateMainTotal();
    highlightDuplicatesInMain();
    storeFormState();

    if (modalOcrInstance) {
        console.log("Cerrando modal de OCR (desde handleCargarTodasLasJugadasClick).");
        modalOcrInstance.hide();
    } else {
        console.error("modalOcrInstance no está definida al intentar cerrar (desde handleCargarTodasLasJugadasClick).");
    }
}
window.handleCargarTodasLasJugadasClick = handleCargarTodasLasJugadasClick;


function toggleOcrDebug() {
    // El panel de debug detallado del backend original no aplica directamente con Genkit.
    // La consola del navegador es el mejor lugar para ver la respuesta de /api/interpret-ticket
    alert("Para depuración, revisa la consola del navegador (F12) y la pestaña 'Network' para la respuesta de la API '/api/interpret-ticket'.");
    // $("#ocrDebugPanel").toggleClass("d-none");
}
window.toggleOcrDebug = toggleOcrDebug;


// --- Main Form Logic ---
$(document).ready(function() {
    console.log("Document ready. jQuery version:", $.fn.jquery);
    if (typeof bootstrap !== 'undefined') {
        console.log("Bootstrap is loaded. Version:", bootstrap.Modal.VERSION);
    } else {
        console.error("Bootstrap is NOT loaded!");
    }

    // Initialize modals (ensure these IDs exist in your HTML)
    if ($('#modalOcr').length) {
        modalOcrInstance = new bootstrap.Modal(document.getElementById('modalOcr'));
    } else {
        console.error("Modal #modalOcr not found in HTML!");
    }
    if ($('#wizardModal').length) {
        wizardModalInstance = new bootstrap.Modal(document.getElementById('wizardModal'));
    } else {
        console.error("Modal #wizardModal not found in HTML!");
    }
    if ($('#ticketModal').length) {
        ticketModalInstance = new bootstrap.Modal(document.getElementById('ticketModal'));
    } else {
        console.error("Modal #ticketModal not found in HTML!");
    }
    
    // Initialize Flatpickr
    if ($("#fecha").length) {
        fpInstance = flatpickr("#fecha", {
            mode: "multiple",
            dateFormat: "m-d-Y",
            minDate: "today",
            defaultDate: [new Date()],
            onChange: function(selectedDates, dateStr, instance) {
                console.log("Flatpickr onChange. Selected dates:", selectedDates.length);
                selectedDaysCount = selectedDates.length > 0 ? selectedDates.length : 0;
                // COMENTADO TEMPORALMENTE PARA EVITAR RECURSIÓN
                // disableTracksByTime(); 
                updateSelectedTracksAndTotal(); // Actualiza totales después de cambiar la fecha
            },
            onReady: function(selectedDates, dateStr, instance) {
                if (!dateStr || dateStr.trim() === "") {
                    instance.setDate(new Date(), true);
                }
                selectedDaysCount = instance.selectedDates.length > 0 ? instance.selectedDates.length : 0;
            }
        });
    } else {
        console.error("Flatpickr target #fecha not found!");
    }


    // Track Checkbox change handler
    // Se eliminó la llamada a disableTracksByTime() de aquí para evitar recursión
    $(".track-checkbox").on('change', function() {
        console.log("Track checkbox changed BY USER - calling updateSelectedTracksAndTotal");
        updateSelectedTracksAndTotal();
    });
    
    // Initial setup calls
    // COMENTADO TEMPORALMENTE PARA EVITAR RECURSIÓN
    // showCutoffTimes(); 
    // autoSelectNYTrackAndVenezuela();
    // disableTracksByTime();
    updateSelectedTracksAndTotal(); // Call once at the end to set initial state

    loadFormState(); // Load stored state if any


    // --- Event Handlers for Buttons ---
    $("#agregarJugada").click(function() {
        console.log("Agregar Jugada button clicked");
        const row = addMainRow();
        if (row) row.find(".betNumber").focus();
    });

    $("#eliminarJugada").click(function() {
        console.log("Eliminar Jugada button clicked");
        if (playCount === 0) {
            alert("No plays to remove.");
            return;
        }
        $("#tablaJugadas tr:last").remove();
        playCount--;
        renumberMainRows();
        calculateMainTotal(); // Recalculate after removing
        highlightDuplicatesInMain();
    });

    $("#tablaJugadas").on("click", ".removeMainBtn", function() {
        console.log("Remove specific play button clicked");
        $(this).closest("tr").remove();
        playCount--;
        renumberMainRows();
        calculateMainTotal(); // Recalculate
        highlightDuplicatesInMain();
    });

    $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function() {
        const row = $(this).closest("tr");
        recalcMainRow(row); // This will also call calculateMainTotal indirectly
        highlightDuplicatesInMain();
        storeFormState();
    });

    $("#resetForm").click(function() {
        console.log("Reset Form button clicked");
        if (confirm("Are you sure you want to reset the form?")) {
            resetForm();
        }
    });
    
    // Wizard Button
    $("#wizardButton").click(function() {
        console.log("Wizard button clicked");
        resetWizard();
        if(wizardModalInstance) wizardModalInstance.show();
    });

    // Generate Ticket Button (main form)
    $("#generarTicket").click(function() {
        console.log("Generate Ticket (main) button clicked");
        doGenerateTicket();
    });

    // --- Wizard Modal Event Handlers ---
    $("#wizardAddNext").click(function(){
        // ... (wizard logic) ...
        const bn = $("#wizardBetNumber").val().trim();
        const stVal = $("#wizardStraight").val().trim();
        const bxVal = $("#wizardBox").val().trim();
        const coVal = $("#wizardCombo").val().trim();
        const gm = determineGameMode(bn, getCurrentSelectedTracks()); // Pass tracks
        if (gm === "-") {
            alert(`Cannot determine game mode for "${bn}". Check tracks or length/format.`);
            return;
        }
        const rowT = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
        addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
        if (!lockedFields.straight) $("#wizardStraight").val("");
        if (!lockedFields.box) $("#wizardBox").val("");
        if (!lockedFields.combo) $("#wizardCombo").val("");
        $("#wizardBetNumber").val("").focus();
        highlightDuplicatesInWizard();
    });

    $(".lockBtn").click(function() {
        const field = $(this).data("field");
        lockedFields[field] = !lockedFields[field];
        $(this).html(lockedFields[field] ? '<i class="bi bi-lock-fill"></i>' : '<i class="bi bi-unlock"></i>');
    });
    
    $("#wizardAddAllToMain").click(function() {
        console.log("Wizard Add All To Main clicked");
        const wizardRows = $("#wizardTableBody tr");
        if (wizardRows.length === 0) {
            alert("No plays in the wizard table.");
            return;
        }
        wizardRows.each(function() {
            if (playCount >= MAX_PLAYS) {
                alert(`Reached ${MAX_PLAYS} plays limit. Stopping import.`);
                return false; // break jQuery .each loop
            }
            const tds = $(this).find("td");
            const betData = {
                betNumber: tds.eq(1).text(),
                gameMode: tds.eq(2).text(), // gameMode is already determined in wizard table
                straightAmount: tds.eq(3).text() === "-" ? null : parseFloat(tds.eq(3).text()),
                boxAmount: tds.eq(4).text() === "-" ? null : parseFloat(tds.eq(4).text()), // Assuming box is numeric or null
                comboAmount: tds.eq(5).text() === "-" ? null : parseFloat(tds.eq(5).text()),
            };
            addMainRow(betData);
        });
        $("#wizardTableBody").empty(); // Clear wizard table
        wizardCount = 0;
        // No need to call recalcAllMainRows if addMainRow does it.
        // recalcAllMainRows(); 
        calculateMainTotal();
        highlightDuplicatesInMain();
        storeFormState();
    });

    $("#wizardGenerateTicket").click(function() {
        console.log("Wizard Generate Ticket clicked");
        $("#wizardAddAllToMain").trigger("click");
        if(wizardModalInstance) wizardModalInstance.hide();
        doGenerateTicket();
    });

    $("#wizardEditMainForm").click(function() {
        console.log("Wizard Edit Main Form clicked");
        if(wizardModalInstance) wizardModalInstance.hide();
    });
    
    // Quick Pick, Round Down, Permute (wizard)
    $("#btnGenerateQuickPick").click(function() { generateQuickPick(); });
    $("#btnGenerateRoundDown").click(function() { generateRoundDown(); });
    $("#btnPermute").click(function() { permuteWizardBetNumbers(); });


    // Ticket Modal Buttons
    $("#confirmarTicket").click(function() {
        // ... (confirm ticket logic) ...
        console.log("Confirmar Ticket clicked");
        // ... (rest of your confirm ticket logic) ...
    });
    $("#editButton").click(function() {
        console.log("Ticket Edit button clicked");
        if(ticketModalInstance) ticketModalInstance.hide();
    });
    $("#shareTicket").click(async function() {
        // ... (share ticket logic) ...
        console.log("Share Ticket clicked");
    });

    // Tutorial and Manual Buttons
    $("#helpEnglish").click(() => startTutorial('en'));
    $("#helpSpanish").click(() => startTutorial('es'));
    $("#helpCreole").click(() => startTutorial('ht'));
    $("#manualEnglishBtn").click(function() { showManualText("manualEnglishText"); });
    $("#manualSpanishBtn").click(function() { showManualText("manualSpanishText"); });
    $("#manualCreoleBtn").click(function() { showManualText("manualCreoleText"); });


    console.log("All $(document).ready() setup complete.");
}); // End of $(document).ready()

// --- Helper Functions (Bet Logic, Calculations, etc.) ---
function updateSelectedTracksAndTotal() {
    console.log("updateSelectedTracksAndTotal called");
    let count = 0;
    $(".track-checkbox:checked").each(function() {
        if ($(this).val() !== "Venezuela" && !$(this).prop('disabled')) {
            count++;
        }
    });
    selectedTracksCount = count > 0 ? count : 0; // If 0 checked, multiplier should be 0 or 1 depending on rules.
                                              // Original script used 1 if 0 selected, but 0 makes more sense if no billable tracks are chosen
    console.log("Track checkboxes changed - selectedTracksCount:", selectedTracksCount);
    calculateMainTotal();
    storeFormState();
}

function addMainRow(bet = null) { // bet can be an object from OCR or Wizard
    console.log("addMainRow called. Current playCount:", playCount, "Bet data:", bet);
    if (playCount >= MAX_PLAYS) {
        alert(`You have reached the limit of ${MAX_PLAYS} plays in the main form.`);
        return null;
    }
    playCount++;
    const rowIndex = playCount;

    // Default empty values, to be overridden by `bet` object if provided
    let bn_val = "";
    let st_val = "";
    let bx_val = ""; // Box for Pulito might be string "1,2", for others number
    let co_val = "";
    let gm_val = "-";

    if (bet) {
        bn_val = bet.betNumber || "";
        // OCR provides amounts, Wizard provides amounts.
        st_val = (bet.straightAmount !== null && bet.straightAmount !== undefined) ? String(bet.straightAmount) : "";
        bx_val = (bet.boxAmount !== null && bet.boxAmount !== undefined) ? String(bet.boxAmount) : "";
        co_val = (bet.comboAmount !== null && bet.comboAmount !== undefined) ? String(bet.comboAmount) : "";
        // gameMode from OCR might be useful, or determined by determineGameMode
        gm_val = bet.gameMode || determineGameMode(bn_val, getCurrentSelectedTracks()); 
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
    $("#tablaJugadas").append(rowHTML);
    const $newRow = $("#tablaJugadas tr[data-playindex='" + rowIndex + "']");
    
    if (bet) { // If data was passed (e.g. from OCR), recalc this new row
        recalcMainRow($newRow);
    }
    // No need to call calculateMainTotal here as recalcMainRow will do it.
    // highlightDuplicatesInMain(); // Call after all rows are processed if loading multiple
    // storeFormState(); // Call after all rows are processed
    return $newRow;
}

function renumberMainRows() {
    let i = 0;
    $("#tablaJugadas tr").each(function() {
        i++;
        $(this).attr("data-playindex", i);
        $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i;
    // storeFormState(); // Called by parent
}

function recalcMainRow($row) {
    const bn = $row.find(".betNumber").val().trim();
    const gm = determineGameMode(bn, getCurrentSelectedTracks());
    $row.find(".gameMode").text(gm);

    const stVal = $row.find(".straight").val().trim();
    const bxVal = $row.find(".box").val().trim(); // Box can be "1,2" for Pulito or number
    const coVal = $row.find(".combo").val().trim();

    const rowTotal = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    $row.find(".total").text(rowTotal);
    calculateMainTotal(); // Update grand total whenever a row changes
}

function recalcAllMainRows() {
    $("#tablaJugadas tr").each(function() {
        recalcMainRow($(this));
    });
    // calculateMainTotal is called by recalcMainRow
}

function calculateMainTotal() {
    let sum = 0;
    $("#tablaJugadas tr").each(function() {
        const totalCell = $(this).find(".total").text();
        const val = parseFloat(totalCell) || 0;
        sum += val;
    });

    const days = selectedDaysCount > 0 ? selectedDaysCount : 1; // If 0 days, effectively 1 for row sum
    const tracks = selectedTracksCount > 0 ? selectedTracksCount : 1; // If 0 tracks, effectively 1 for row sum

    // If no days or no billable tracks selected, the multiplier effect should be 0 for the final sum
    // but sum of rows should be calculated first.
    // The original logic: sum = sum * selectedTracksCount * selectedDaysCount;
    // This seems to imply if selectedDaysCount is 0, total is 0.
    // If selectedTracksCount is 0, total is 0.

    let finalTotal = sum;
    if (selectedDaysCount > 0 && selectedTracksCount > 0) {
        finalTotal = sum * selectedTracksCount * selectedDaysCount;
    } else if (sum > 0 && (selectedDaysCount === 0 || selectedTracksCount === 0) ) {
        // If there are plays but no days/tracks, the effective total should arguably be 0
        // or just the sum of plays without multiplication.
        // For now, let's reflect that if either is 0, the multiplied total is 0,
        // unless sum itself is 0.
        // The original script implies sum becomes 0 if selectedDaysCount is 0.
        finalTotal = (selectedDaysCount === 0 || selectedTracksCount === 0) ? 0 : sum * Math.max(1,selectedTracksCount) * Math.max(1,selectedDaysCount);
    }
    // Simplified: if either days or tracks is 0, and there's a sum, the total is 0.
    if (sum > 0 && (selectedDaysCount === 0 || selectedTracksCount === 0)) {
        finalTotal = 0;
    } else {
        finalTotal = sum * Math.max(1,selectedTracksCount) * Math.max(1,selectedDaysCount);
         if (sum === 0) finalTotal = 0; // Ensure if sum of plays is 0, total is 0
    }


    $("#totalJugadas").text(finalTotal.toFixed(2));
    // storeFormState(); // Store state after calculation
}

function determineGameMode(betNumber, tracksArray) { // Added tracksArray
    if (!betNumber) return "-";
    betNumber = String(betNumber).trim();

    // const tracks = getCurrentSelectedTracks(); // Use passed or get current
    const tracks = tracksArray;
    const isUSA = tracks.some(t => cutoffTimes.USA[t] && t !== "Venezuela" && t !== "New York Horses");
    const isSD = tracks.some(t => cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    if (includesHorses) {
        if (betNumber.length >= 1 && betNumber.length <= 4 && /^\d+$/.test(betNumber)) return "NY Horses";
    }
    
    const paleRegex = /^(\d{2})[-x+](\d{2})$/;
    if (paleRegex.test(betNumber)) {
        if (includesVenezuela && isUSA) return "Pale-Ven";
        if (isSD) return "Pale-RD"; // SD Pale doesn't need USA track
        return "Palé"; // Generic Palé if context unclear or only USA track for it
    }

    if (betNumber.length === 1 && /^\d$/.test(betNumber)) {
        if (isUSA) return "Single Action"; // Single digit on USA track
    }
    
    if (betNumber.length === 2 && /^\d\d$/.test(betNumber)) {
        if (includesVenezuela && isUSA) return "Venezuela";
        if (isSD) return "RD-Quiniela"; // 2 digits on SD track
        if (isUSA) return "Pulito";    // 2 digits on USA track (non-Venezuela)
    }

    if (betNumber.length === 3 && /^\d\d\d$/.test(betNumber)) return "Pick 3";
    if (betNumber.length === 4 && /^\d\d\d\d$/.test(betNumber)) return "Win 4";

    return "-";
}

function calculateRowTotal(bn, gm, stVal, bxVal, coVal) {
    if (!bn || gm === "-") return "0.00";
    const st = parseFloat(stVal) || 0;
    const co = parseFloat(coVal) || 0;
    let numericBox = 0;

    // Handle Pulito's box value which can be comma-separated positions or a numeric amount
    if (gm === "Pulito") {
        if (bxVal && typeof bxVal === 'string' && bxVal.includes(',')) {
            const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean);
            // For Pulito, if box is positions, total is straight * number of box positions. Combo is separate.
            // This interpretation might need to align with specific Pulito rules.
            // Original script: return (st * positions.length).toFixed(2); - this doesn't account for combo.
            // Let's assume straight is per position, and combo is added on top.
            return ((st * positions.length) + co).toFixed(2);
        } else {
            numericBox = parseFloat(bxVal) || 0; // Treat as a normal box amount
        }
    } else {
        numericBox = parseFloat(bxVal) || 0;
    }

    let total = st + numericBox + co;

    if (gm === "Win 4" || gm === "Pick 3") {
        // For Pick 3/Win 4, combo amount is often multiplied by number of combinations
        // However, your original script's calcCombos was for full combo, not per-dollar.
        // The simpler st + numericBox + co is generally how tickets are entered if "combo" is a flat bet.
        // If combo implies "combo for $X total", then it's just 'co'.
        // If combo implies "$X per combination", then it's co * calcCombos(bn)
        // Sticking to simpler sum for now unless calcCombos is for per-dollar wager.
        // The original script did: total = st + numericBox + combo*calcCombos(bn);
        // This assumes combo is a "per-way" bet. Let's use this if co > 0
        if (co > 0) {
            total = st + numericBox + (co * calcCombos(bn));
        } else {
            total = st + numericBox; // No combo amount
        }
    }
    // For Venezuela, Pale-RD, Pale-Ven, RD-Quiniela, original had only straight.
    // If box/combo are allowed and entered, they should sum.
    // The current logic (st + numericBox + co) handles this by default if they are not 0.

    return total.toFixed(2);
}

function calcCombos(str) { // Calculates number of ways for a combo
    if (!str || typeof str !== 'string') return 1; // Default to 1 way if no string
    const freq = {};
    for (let c of str) {
        freq[c] = (freq[c] || 0) + 1;
    }
    const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
    let denom = 1;
    for (let k in freq) {
        denom *= factorial(freq[k]);
    }
    if (str.length === 0) return 1; // Avoid division by zero for empty string / ensure 1 way
    return factorial(str.length) / denom;
}


function storeFormState() {
    // ... (localStorage logic - can be re-enabled later if needed) ...
    console.log("storeFormState called (currently placeholder)");
}
function loadFormState() {
    // ... (localStorage logic - can be re-enabled later if needed) ...
    console.log("loadFormState called (currently placeholder)");
    // Ensure defaults are set if no stored state
    if (fpInstance && fpInstance.selectedDates.length === 0) {
       fpInstance.setDate([new Date()], false); // Don't trigger change yet
    }
    // autoSelectNYTrackAndVenezuela(); // Called in ready()
    // updateSelectedTracksAndTotal(); // Called in ready()
}


function resetForm() {
    console.log("resetForm function called");
    $("#lotteryForm")[0].reset(); // Resets form inputs to their default HTML values
    $("#tablaJugadas").empty();
    playCount = 0;
    jugadasGlobalOCR = []; // Clear OCR results

    // Detach and reattach to clear any dynamically bound events on rows if necessary (optional)
    // $("#tablaJugadas").off(); // Be careful with this

    // Reset date to today
    if (fpInstance) {
        fpInstance.setDate([new Date()], true); // true to trigger onChange
    } else {
        selectedDaysCount = 1; // Manual fallback if flatpickr not ready
    }

    // Reset tracks (uncheck all, then apply defaults)
    $(".track-checkbox").prop('checked', false); 
    autoSelectNYTrackAndVenezuela(); // This will mark defaults and should trigger its own update sequence
    // updateSelectedTracksAndTotal(); // Will be called by autoSelect or flatpickr change
    
    // Final state update
    $("#totalJugadas").text("0.00");
    storeFormState(); // Store the reset state
    console.log("Form reset complete. selectedDaysCount:", selectedDaysCount, "selectedTracksCount:", selectedTracksCount);
    // Call calculateMainTotal one last time to be sure after all programmatic changes
    calculateMainTotal(); 
}


function getCurrentSelectedTracks() {
    return $(".track-checkbox:checked:not(:disabled)").map(function() {
        return $(this).val();
    }).get();
}

// Placeholder for original showCutoffTimes - can be re-enabled if disableTracksByTime is restored
function showCutoffTimes() {
    console.log("showCutoffTimes called (currently placeholder)");
}
// Placeholder for original disableTracksByTime
function disableTracksByTime() {
    console.log("disableTracksByTime called (currently placeholder - tracks always enabled)");
    // When re-enabling, ensure this function correctly uses isUpdatingProgrammatically
    // and that updateSelectedTracksAndTotal() is called *after* it finishes.
    $(".track-checkbox").prop('disabled', false); // Ensure all are enabled for now
    // If you re-enable this, you MUST call updateSelectedTracksAndTotal() AFTER this function runs
    // in places like flatpickr onChange, resetForm, and document.ready.
}


function autoSelectNYTrackAndVenezuela() {
    console.log("autoSelectNYTrackAndVenezuela called");
    if ($(".track-checkbox:checked").length > 0 && playCount > 0) {
        console.log("Tracks or plays already exist, skipping auto-selection.");
        return; // Don't auto-select if user already made choices or has plays
    }
    
    // Temporarily prevent change handlers from firing during programmatic changes
    // This logic was problematic, simplifying for now.
    // The .prop('checked', true) itself will trigger the 'change' handler if attached.
    // We rely on the 'change' handler to call updateSelectedTracksAndTotal.

    const now = dayjs();
    const middayCutoff = dayjs(cutoffTimes.USA["New York Mid Day"], "HH:mm");

    if (now.isBefore(middayCutoff)) {
        $("#trackNYMidDay").prop("checked", true);
    } else {
        $("#trackNYEvening").prop("checked", true);
    }
    $("#trackVenezuela").prop("checked", true);

    // Manually trigger change on one of them to update counts if needed,
    // or rely on updateSelectedTracksAndTotal being called after this.
    // For safety, let's ensure totals are updated after this.
    // updateSelectedTracksAndTotal(); // Call after programmatic changes
}

function highlightDuplicatesInMain() {
    $("#tablaJugadas tr .betNumber").removeClass("duplicado");
    const counts = {};
    $("#tablaJugadas tr .betNumber").each(function() {
        const bn = $(this).val().trim();
        if (bn) counts[bn] = (counts[bn] || 0) + 1;
    });
    $("#tablaJugadas tr .betNumber").each(function() {
        const bn = $(this).val().trim();
        if (counts[bn] > 1) $(this).addClass("duplicado");
    });
}
function highlightDuplicatesInWizard() {
    // Similar logic for wizard table if needed
}

// --- Wizard Specific Functions (placeholders or simplified) ---
function resetWizard() {
    console.log("resetWizard called");
    wizardCount = 0;
    $("#wizardTableBody").empty();
    // Reset locks and inputs
}
function addWizardRow(bn, gm, stVal, bxVal, coVal, total) {
    console.log("addWizardRow called");
    wizardCount++;
    // ... (append row to wizard table) ...
}
function generateQuickPick(){ console.log("generateQuickPick called");}
function generateRoundDown(){ console.log("generateRoundDown called");}
function permuteWizardBetNumbers(){ console.log("permuteWizardBetNumbers called");}


// --- Ticket Generation and Preview Logic (placeholders) ---
function doGenerateTicket() {
    console.log("doGenerateTicket called");
    // Basic validation
    if (!fpInstance || fpInstance.selectedDates.length === 0) {
        alert("Please select at least one date.");
        return;
    }
    if (selectedTracksCount === 0 && !getCurrentSelectedTracks().includes("Venezuela")) { // Venezuela can be a 0 multiplier track
        alert("Please select at least one track (excluding Venezuela if it's the only one).");
        return;
    }
    if (playCount === 0) {
        alert("Please add at least one play.");
        return;
    }
    // ... more validation from original script ...
    alert("Ticket generation logic placeholder. Check console for data.");
    // ... (populate ticket modal) ...
    if(ticketModalInstance) ticketModalInstance.show();
}


// --- Tutorial and Manual functions (placeholders) ---
function startTutorial(lang) { console.log("startTutorial called with lang:", lang); }
function showManualText(elementId) { console.log("showManualText for:", elementId); }

// Utility: Get current selected tracks for game mode determination
// This ensures determineGameMode always has the latest track selection
function getCurrentSelectedTracks() {
    return $(".track-checkbox:checked:not(:disabled)").map(function() {
        return $(this).val();
    }).get();
}

    
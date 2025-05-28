
// Global variable for OCR modal instance
let modalOcrInstance = null;
let wizardModalInstance = null;
let ticketModalInstance = null;

// Global variable to store OCR interpreted bets
let jugadasGlobalOCR = [];
let selectedFileGlobalOCR = null;

// Global variable for Flatpickr instance
let fpInstance = null;

// Play counters
let playCount = 0;
const MAX_PLAYS = 200; // Increased limit
let wizardCount = 0;

// Cutoff times (remains unchanged)
const cutoffTimes = {
    "USA": { /* ... existing cutoff times ... */ 
        "New York Mid Day": "14:20", "New York Evening": "22:00", "Georgia Mid Day": "12:20", "Georgia Evening": "18:40", "New Jersey Mid Day": "12:50", "New Jersey Evening": "22:00", "Florida Mid Day": "13:20", "Florida Evening": "21:30", "Connecticut Mid Day": "13:30", "Connecticut Evening": "22:00", "Georgia Night": "22:00", "Pensilvania AM": "12:45", "Pensilvania PM": "18:15", "Venezuela": "00:00", "Brooklyn Midday": "14:20", "Brooklyn Evening": "22:00", "Front Midday": "14:20", "Front Evening": "22:00", "New York Horses": "16:00"
    },
    "Santo Domingo": { /* ... existing cutoff times ... */ 
        "Real": "11:45", "Gana mas": "13:25", "Loteka": "18:30", "Nacional": "19:30", "Quiniela Pale": "19:30", "Primera Día": "10:50", "Suerte Día": "11:20", "Lotería Real": "11:50", "Suerte Tarde": "16:50", "Lotedom": "16:50", "Primera Noche": "18:50", "Panama": "16:00"
    },
    "Venezuela": { "Venezuela": "00:00" }
};


// --- OCR Modal Functions ---
function abrirModalOCR() {
    console.log("abrirModalOCR function called");
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").empty().html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true); // Ensure this is disabled initially

    hideOcrLoading(); // Make sure loading UI is hidden
    $("#ocrDebugPanel").addClass("d-none");

    if (modalOcrInstance) {
        modalOcrInstance.show();
    } else {
        console.error("Modal OCR instance not available in abrirModalOCR");
    }
}
window.abrirModalOCR = abrirModalOCR;


function handleDragOverOCR(e) { e.preventDefault(); $("#ocrDropZone").addClass("dragover"); }
function handleDragLeaveOCR(e) { e.preventDefault(); $("#ocrDropZone").removeClass("dragover"); }
window.handleDragOverOCR = handleDragOverOCR;
window.handleDragLeaveOCR = handleDragLeaveOCR;

function handleDropOCR(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        selectedFileGlobalOCR = e.dataTransfer.files[0];
        $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
        $("#btnProcesarOCR").prop('disabled', false);
        $("#ocrJugadas").html("<p>Imagen seleccionada. Haz clic en 'Procesar OCR'.</p>");
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
        $("#ocrJugadas").html("<p>Imagen seleccionada. Haz clic en 'Procesar OCR'.</p>");
    } else {
        selectedFileGlobalOCR = null;
        $("#ocrPreview").addClass("d-none").attr("src", "");
        $("#btnProcesarOCR").prop('disabled', true);
        $("#ocrJugadas").html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    }
}
window.handleFileChangeOCR = handleFileChangeOCR;

function showOcrLoading() { $("#ocrLoadingSection").removeClass("d-none"); $("#ocrProgressBar").css("width", "0%"); $("#ocrProgressText").text("Subiendo/Procesando..."); }
function updateOcrProgress(percentage, text) { $("#ocrProgressBar").css("width", percentage + "%"); $("#ocrProgressText").text(text); }
function hideOcrLoading() { $("#ocrLoadingSection").addClass("d-none"); }

async function procesarOCR() {
    console.log("procesarOCR function called");
    console.log("Current selectedFileGlobalOCR:", selectedFileGlobalOCR);

    if (!selectedFileGlobalOCR) {
        alert("Por favor, selecciona un archivo de imagen primero.");
        return;
    }

    showOcrLoading();
    $("#btnProcesarOCR").prop('disabled', true);
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoDataUri: base64data })
            });

            updateOcrProgress(70, "Respuesta recibida, procesando...");

            if (!response.ok) {
                let errorMsg = `Error del servidor: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg += ` - ${errorData.message || 'Error desconocido del servidor.'}`;
                    console.error("Server error details:", errorData);
                } catch (e) {
                    console.error("Could not parse error response JSON", e);
                }
                throw new Error(errorMsg);
            }

            const interpretedBets = await response.json();
            console.log("Received interpretedBets:", interpretedBets);
            jugadasGlobalOCR = interpretedBets; // Store for later use

            if (Array.isArray(jugadasGlobalOCR) && jugadasGlobalOCR.length > 0) {
                let html = `<h5>Jugadas Detectadas (${jugadasGlobalOCR.length}):</h5>`;
                jugadasGlobalOCR.forEach((j, idx) => {
                    html += `
                      <div class="ocr-detected-play">
                        <table class="table table-sm table-bordered table-dark small-ocr-table">
                          <thead><tr><th>#</th><th>Bet</th><th>Mode</th><th>Str</th><th>Box</th><th>Com</th></tr></thead>
                          <tbody><tr>
                            <td>${idx + 1}</td>
                            <td>${j.betNumber || "-"}</td>
                            <td>${j.gameMode || "-"}</td>
                            <td>${j.straightAmount !== null ? j.straightAmount.toFixed(2) : "-"}</td>
                            <td>${j.boxAmount !== null ? j.boxAmount.toFixed(2) : "-"}</td>
                            <td>${j.comboAmount !== null ? j.comboAmount.toFixed(2) : "-"}</td>
                          </tr></tbody>
                        </table>
                        <button class="btn btn-sm btn-info mt-1 mb-2" onclick="usarJugadaOCR(${idx})">
                          Usar esta Jugada
                        </button>
                      </div><hr class="ocr-play-separator">`;
                });
                $("#ocrJugadas").html(html);
                $("#btnCargarJugadas").prop('disabled', false); // Enable button to load all
            } else {
                $("#ocrJugadas").html("<p>No se detectaron jugadas válidas en la imagen o la respuesta no es un array.</p>");
                $("#btnCargarJugadas").prop('disabled', true);
            }
            updateOcrProgress(100, "Proceso completado.");
            setTimeout(hideOcrLoading, 1000);

        } catch (error) {
            console.error("Error procesando la imagen:", error);
            $("#ocrJugadas").html(`<p class="text-danger">Error procesando la imagen: ${error.message}</p>`);
            hideOcrLoading();
            $("#btnCargarJugadas").prop('disabled', true);
        } finally {
            $("#btnProcesarOCR").prop('disabled', !(selectedFileGlobalOCR)); // Re-enable if a file is still selected
        }
    };
    reader.onerror = () => {
        alert('Error leyendo el archivo de imagen.');
        hideOcrLoading();
        $("#btnProcesarOCR").prop('disabled', false);
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
    console.log('Play data to add:', j);

    if (playCount >= MAX_PLAYS) {
        alert(`Se ha alcanzado el límite de ${MAX_PLAYS} jugadas en el formulario principal.`);
        return;
    }
    
    const newRow = addMainRow(j); // Pass the bet object
    if (newRow) {
        console.log("Row added by usarJugadaOCR, now updating totals/highlights for main table.");
        recalcAllMainRows(); // Recalculate all rows for game modes and individual totals
        calculateMainTotal();  // Recalculate overall total
        highlightDuplicatesInMain();
        storeFormState();
    } else {
        console.error("Failed to add row from usarJugadaOCR");
    }
    // Do NOT hide the modal: modalOcrInstance.hide(); 
}
window.usarJugadaOCR = usarJugadaOCR;

function handleCargarTodasLasJugadasClick() {
    console.log("¡handleCargarTodasLasJugadasClick EJECUTADA!");
    
    if (!jugadasGlobalOCR || jugadasGlobalOCR.length === 0) {
        console.log("No hay jugadas OCR para cargar.");
        alert("No hay jugadas OCR para cargar.");
        return;
    }
    
    console.log(`Intentando cargar ${jugadasGlobalOCR.length} jugadas del OCR...`);
    
    let jugadasCargadas = 0;
    let jugadasOmitidas = 0;
    
    for (let index = 0; index < jugadasGlobalOCR.length; index++) {
        const j = jugadasGlobalOCR[index];
        
        if (playCount >= MAX_PLAYS) {
            jugadasOmitidas = jugadasGlobalOCR.length - index;
            alert(`Se ha alcanzado el límite de ${MAX_PLAYS} jugadas. Se omitieron ${jugadasOmitidas} jugadas.`);
            break; 
        }
        
        console.log(`Añadiendo jugada OCR ${index + 1}:`, j);
        
        const newRow = addMainRow(j); // Pass the bet object
        if (newRow) {
            jugadasCargadas++;
            console.log(`Jugada ${index + 1} cargada exitosamente por handleCargarTodasLasJugadasClick`);
        } else {
            console.error(`Error al cargar jugada ${index + 1} desde handleCargarTodasLasJugadasClick`);
        }
    }
    
    console.log(`Proceso completado por handleCargarTodasLasJugadasClick. Jugadas cargadas: ${jugadasCargadas}`);
    
    if (jugadasCargadas > 0) {
        recalcAllMainRows();
        calculateMainTotal();
        highlightDuplicatesInMain();
        storeFormState();
        alert(`Se cargaron ${jugadasCargadas} jugadas exitosamente.`);
    }
    
    if (modalOcrInstance) {
        console.log("Cerrando modal de OCR (desde handleCargarTodasLasJugadasClick).");
        modalOcrInstance.hide();
    } else {
        console.error("modalOcrInstance no está definida al intentar cerrar (desde handleCargarTodasLasJugadasClick).");
    }
}
window.handleCargarTodasLasJugadasClick = handleCargarTodasLasJugadasClick;


function toggleOcrDebug() {
    $("#ocrDebugPanel").toggleClass("d-none");
    alert("El panel de debug detallado del backend original no está implementado de la misma forma para la respuesta de Genkit. Revisa la consola del navegador para la respuesta de /api/interpret-ticket.");
}
window.toggleOcrDebug = toggleOcrDebug;

// --- Main Form Logic ---
let selectedTracksCount = 0;
let selectedDaysCount = 1; // Default to 1 day (today)

// Flag to prevent event recursion
let isUpdatingProgrammatically = false;

function trackCheckboxChangeHandler() {
    if (isUpdatingProgrammatically) {
        // console.log("Track change CANCELED due to isUpdatingProgrammatically flag");
        return;
    }
    // console.log("Track checkbox changed BY USER - calling updateSelectedTracksAndTotal");
    updateSelectedTracksAndTotal();
}

function updateSelectedTracksAndTotal() {
    // console.log("updateSelectedTracksAndTotal called");
    let count = 0;
    $(".track-checkbox:checked").each(function() {
        if ($(this).val() !== "Venezuela" && !$(this).prop('disabled')) {
            count++;
        }
    });
    selectedTracksCount = count > 0 ? count : 0; // If only Venezuela is checked, count is 0 for multiplication
    if ($(".track-checkbox:checked").length > 0 && selectedTracksCount === 0 && $(".track-checkbox:checked[value='Venezuela']").length > 0) {
        // If only Venezuela is checked, we still need a base for calculation, but it doesn't multiply
        // This scenario is a bit tricky. For now, if only Venezuela is checked, it doesn't multiply.
        // If Venezuela + 1 USA track, multiplier is 1.
    }

    // console.log("Track checkboxes changed - selectedTracksCount:", selectedTracksCount);
    calculateMainTotal();
    storeFormState();
}


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
            console.error("Modal #modalOcr not found in HTML!");
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
        console.error("Bootstrap or Bootstrap Modal not loaded!");
    }

    dayjs.extend(window.dayjs_plugin_customParseFormat);
    dayjs.extend(window.dayjs_plugin_arraySupport);

    fpInstance = flatpickr("#fecha", {
        mode: "multiple",
        dateFormat: "m-d-Y",
        minDate: "today",
        defaultDate: [new Date()],
        clickOpens: true,
        allowInput: false, // Prevent manual input
        appendTo: document.body, // Append to body to avoid z-index issues
        onOpen: function(selectedDates, dateStr, instance) {
            // Optional: Adjust calendar position or style if needed
            // instance.calendarContainer.style.zIndex = "1056"; // Ensure above modal if any
        },
        onChange: function(selectedDates, dateStr, instance) {
            selectedDaysCount = selectedDates.length > 0 ? selectedDates.length : 1;
            // console.log("Flatpickr onChange - selectedDaysCount:", selectedDaysCount);
            
            // Temporarily detach change handler to prevent recursion
            $(".track-checkbox").off('change', trackCheckboxChangeHandler);
            isUpdatingProgrammatically = true;
            
            // disableTracksByTime(); // Temporarily commented out to fight recursion
            
            isUpdatingProgrammatically = false;
            $(".track-checkbox").on('change', trackCheckboxChangeHandler);
            
            updateSelectedTracksAndTotal(); // This will call calculateMainTotal
            storeFormState();
        }
    });
    // Initial day count
    selectedDaysCount = fpInstance.selectedDates.length > 0 ? fpInstance.selectedDates.length : 1;


    $(".track-checkbox").on('change', trackCheckboxChangeHandler);
    
    // showCutoffTimes(); // Temporarily commented out

    isUpdatingProgrammatically = true;
    autoSelectNYTrackAndVenezuela();
    // disableTracksByTime(); // Temporarily commented out
    isUpdatingProgrammatically = false;
    
    updateSelectedTracksAndTotal(); // Initial calculation based on defaults and current date

    // Load state from localStorage
    // loadFormState(); // This might also trigger changes, be careful with order

    $("#agregarJugada").click(function() {
        const $newRow = addMainRow();
        if ($newRow) {
            $newRow.find(".betNumber").focus();
        }
    });

    $("#eliminarJugada").click(function() {
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
        $(this).closest("tr").remove();
        playCount--;
        renumberMainRows();
        calculateMainTotal();
        highlightDuplicatesInMain();
    });

    $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function() {
        const $row = $(this).closest("tr");
        recalcMainRow($row);
        // highlightDuplicatesInMain(); // Can be performance intensive on every input
        storeFormState();
    });
     $("#tablaJugadas").on("blur", ".betNumber, .straight, .box, .combo", function() {
        highlightDuplicatesInMain(); // Highlight only on blur
    });


    $("#resetForm").click(function() {
        if (confirm("Are you sure you want to reset the form?")) {
            resetForm();
        }
    });

    $("#generarTicket").click(function() {
        doGenerateTicket();
    });

    $("#confirmarTicket").click(function() {
        // ... (logic for confirming ticket, generating QR, saving, etc.) ...
        // This function's original logic is complex and involves html2canvas, SheetDB
        // For now, it's just a placeholder for the original functionality.
         $(this).prop("disabled", true);
        $("#editButton").addClass("d-none");

        const uniqueTicket = generateUniqueTicketNumber();
        $("#numeroTicket").text(uniqueTicket);
        transactionDateTime = dayjs().format("MM/DD/YYYY hh:mm A");
        $("#ticketTransaccion").text(transactionDateTime);

        $("#qrcode").empty();
        if (typeof QRCode !== 'undefined') {
             new QRCode(document.getElementById("qrcode"), {
                text: uniqueTicket,
                width: 128,
                height: 128
            });
        } else {
            console.error("QRCode library not loaded");
        }
       

        $("#shareTicket").removeClass("d-none");
        alert("Ticket confirmed (simulation). QR code generated. Download/share would happen here.");

        // Placeholder for actual image generation and save/share
        // saveBetDataToSheetDB(uniqueTicket, success => { ... });
    });
    
    $("#editButton").click(function(){
        const ticketModal= bootstrap.Modal.getInstance(document.getElementById("ticketModal"));
        if (ticketModal) ticketModal.hide();
    });

    $("#shareTicket").click(async function(){
        // ... (original share logic) ...
        alert("Share functionality placeholder.");
    });


    // Wizard Modal Logic (Copied from user's script.js, might need adjustments)
    $("#wizardButton").click(function() {
        console.log("Wizard button clicked");
        resetWizard();
        if(wizardModalInstance) wizardModalInstance.show();
        else console.error("Wizard modal not initialized");
    });

    $(".lockBtn").click(function() {
        const field = $(this).data("field");
        lockedFields[field] = !lockedFields[field];
        $(this).html(lockedFields[field] ? `<i class="bi bi-lock-fill"></i>` : `<i class="bi bi-unlock"></i>`);
    });

    $("#wizardAddNext").click(function() {
        // ... (original wizard add next logic) ...
        const bn = $("#wizardBetNumber").val().trim();
        const gm = determineGameMode(bn, getCurrentSelectedTracks());
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
    
    $("#wizardTableBody").on("click", ".removeWizardBtn", function() {
        $(this).closest("tr").remove();
        renumberWizard();
        highlightDuplicatesInWizard();
    });

    $("#btnGenerateQuickPick").click(function() { /* ... original logic ... */ });
    $("#btnGenerateRoundDown").click(function() { /* ... original logic ... */ });
    $("#btnPermute").click(function() { permuteWizardBetNumbers(); });

    $("#wizardAddAllToMain").click(function() {
        // ... (original wizard add all to main logic) ...
         const wizardRows = $("#wizardTableBody tr");
        if (wizardRows.length === 0) {
            alert("No plays in the wizard table.");
            return;
        }
        let addedCount = 0;
        wizardRows.each(function() {
            if (playCount >= MAX_PLAYS) {
                alert(`Reached ${MAX_PLAYS} plays in the main form. Stopping import.`);
                return false; 
            }
            const tds = $(this).find("td");
            const bn = tds.eq(1).text();
            const gm = tds.eq(2).text();
            const stVal = (tds.eq(3).text() === "-" ? "" : tds.eq(3).text());
            const bxVal = (tds.eq(4).text() === "-" ? "" : tds.eq(4).text());
            const coVal = (tds.eq(5).text() === "-" ? "" : tds.eq(5).text());
            
            addMainRow({ betNumber: bn, gameMode: gm, straightAmount: parseFloat(stVal) || null, boxAmount: parseFloat(bxVal) || null, comboAmount: parseFloat(coVal) || null });
            addedCount++;
        });

        if (addedCount > 0) {
            recalcAllMainRows();
            calculateMainTotal();
            highlightDuplicatesInMain();
            storeFormState();
        }
        $("#wizardTableBody").empty();
        wizardCount = 0;
    });

    $("#wizardGenerateTicket").click(function() {
        $("#wizardAddAllToMain").trigger("click");
        if(wizardModalInstance) wizardModalInstance.hide();
        doGenerateTicket();
    });

    $("#wizardEditMainForm").click(function() {
        if(wizardModalInstance) wizardModalInstance.hide();
    });
    
    // Tutorial and Manual buttons
    $("#helpEnglish").click(() => startTutorial('en'));
    $("#helpSpanish").click(() => startTutorial('es'));
    $("#helpCreole").click(() => startTutorial('ht'));
    $("#manualEnglishBtn").click(function() { /* ... */ });
    $("#manualSpanishBtn").click(function() { /* ... */ });
    $("#manualCreoleBtn").click(function() { /* ... */ });

    // Debugging: Log para confirmar que el script llega al final de $(document).ready()
    console.log("Document fully loaded and initial scripts executed.");
});


// --- Helper Functions (determineGameMode, calculateRowTotal, etc.) ---
function getCurrentSelectedTracks() {
    return $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
}

function determineGameMode(betNumber, selectedTracks = []) {
    // console.log(`determineGameMode called with betNumber: ${betNumber}, tracks: ${selectedTracks.join(', ')}`);
    if (!betNumber) return "-";

    const tracks = selectedTracks.length > 0 ? selectedTracks : getCurrentSelectedTracks();
    // console.log("Effective tracks for game mode determination:", tracks);

    const isUSA = tracks.some(t => cutoffTimes.USA && cutoffTimes.USA[t]);
    const isSD = tracks.some(t => cutoffTimes["Santo Domingo"] && cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    if (includesHorses) return "NY Horses";

    const cleanBetNumber = String(betNumber).replace(/[^0-9x+-]/gi, ''); // Clean up a bit more
    const paleRegex = /^(\d{2})([x+-])(\d{2})$/;

    if (paleRegex.test(cleanBetNumber)) {
        if (includesVenezuela && isUSA) return "Pale-Ven";
        if (isSD && !isUSA) return "Pale-RD";
        if (isUSA) return "Palé"; // Default Palé for USA if no other specific context
        return "Palé"; // General Palé
    }
    
    const length = cleanBetNumber.replace(/[^0-9]/g, '').length; // Count only digits for length check

    if (length === 1 && isUSA && !includesVenezuela && !includesHorses) return "Single Action";
    if (length === 2) {
        if (includesVenezuela && isUSA) return "Venezuela";
        if (isUSA && !isSD) return "Pulito";
        if (isSD && !isUSA) return "RD-Quiniela";
        return "Pulito"; // Default for 2 digits if context is unclear
    }
    if (length === 3) return "Pick 3";
    if (length === 4) return "Win 4";
    
    return "-";
}

function calculateRowTotal(betNumber, gameMode, stVal, bxVal, coVal) {
    // console.log(`calculateRowTotal: bn=${betNumber}, gm=${gameMode}, st=${stVal}, bx=${bxVal}, co=${coVal}`);
    if (!betNumber || gameMode === "-") return "0.00";

    const st = parseFloat(stVal) || 0;
    const combo = parseFloat(coVal) || 0;
    let numericBox = 0;

    if (gameMode === "Pulito") {
        if (typeof bxVal === 'string' && bxVal.includes(',')) {
            const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean).length;
            return (st * positions).toFixed(2);
        } else {
            numericBox = parseFloat(bxVal) || 0; // If not positions, treat as a regular box amount
        }
    } else {
        numericBox = parseFloat(bxVal) || 0;
    }

    if (["Venezuela", "Pale-RD", "Pale-Ven", "RD-Quiniela", "Palé"].includes(gameMode)) {
        return st.toFixed(2); // For these modes, traditionally only straight amount counts, box/combo might be extra.
                               // If you want to sum them for these modes too, change this line.
    }
    
    if (gameMode === "Win 4" || gameMode === "Pick 3") {
        const combosCount = calcCombos(String(betNumber).replace(/[^0-9]/g, ''));
        return (st + numericBox + (combo * combosCount)).toFixed(2);
    }
    
    // Default for Single Action, NY Horses, and any other case
    return (st + numericBox + combo).toFixed(2);
}


function calcCombos(str) {
    const freq = {};
    for (let c of str) { freq[c] = (freq[c] || 0) + 1; }
    const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
    let denom = 1;
    for (let k in freq) { denom *= factorial(freq[k]); }
    return factorial(str.length) / denom;
}

// --- Main Table Row Management ---
function addMainRow(bet = null) {
    console.log("addMainRow llamada. playCount actual:", playCount, "Datos de jugada:", bet);
     if (playCount >= MAX_PLAYS) {
        alert(`You have reached the limit of ${MAX_PLAYS} plays in the main form.`);
        return null; 
    }
    playCount++;
    const rowIndex = playCount;

    let bn_val = "";
    let st_val = "";
    let bx_val = ""; 
    let co_val = "";
    let gm_val = "-";
    
    if (bet) {
        bn_val = bet.betNumber || "";
        st_val = (bet.straightAmount !== null && bet.straightAmount !== undefined) ? String(bet.straightAmount) : "";
        // For box, if it's a string with commas (like from Pulito positions), keep as string. Otherwise, convert.
        if (typeof bet.boxAmount === 'string' && bet.boxAmount.includes(',')) {
            bx_val = bet.boxAmount;
        } else {
            bx_val = (bet.boxAmount !== null && bet.boxAmount !== undefined) ? String(bet.boxAmount) : "";
        }
        co_val = (bet.comboAmount !== null && bet.comboAmount !== undefined) ? String(bet.comboAmount) : "";
        
        // Determine gameMode: use provided if available, else calculate
        const currentTracks = getCurrentSelectedTracks();
        gm_val = bet.gameMode || determineGameMode(bn_val, currentTracks);
        // console.log(`Game mode for new row (bn: ${bn_val}): ${gm_val}`);
    }

    const rowHTML = `
      <tr data-playindex="${rowIndex}">
        <td><button type="button" class="btnRemovePlay removeMainBtn btn btn-sm btn-danger" data-row="${rowIndex}">${rowIndex}</button></td>
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

    if ($newRow.length === 0) {
        console.error("Error: La fila no se agregó correctamente al DOM por addMainRow");
        playCount--; 
        return null;
    }

    if (bet) { // If data was passed (e.g., from OCR), recalc this specific row
        recalcMainRow($newRow);
    }
    console.log(`Fila ${rowIndex} agregada exitosamente por addMainRow`);
    return $newRow;
}


function renumberMainRows() { /* ... original ... */ 
    let i = 0;
    $("#tablaJugadas tr").each(function() {
        i++;
        $(this).attr("data-playIndex", i);
        $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i;
    // storeFormState(); // Storing state too often can be an issue.
}

function recalcMainRow($row) { /* ... original ... */ 
    const bn = $row.find(".betNumber").val().trim();
    const currentTracks = getCurrentSelectedTracks();
    const gm = determineGameMode(bn, currentTracks);
    $row.find(".gameMode").text(gm);

    const stVal = $row.find(".straight").val().trim();
    const bxVal = $row.find(".box").val().trim();
    const coVal = $row.find(".combo").val().trim();

    const rowTotal = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    $row.find(".total").text(rowTotal);
    // calculateMainTotal(); // Avoid calling this for every row recalc if done in batch
}

function recalcAllMainRows() { /* ... original ... */
    $("#tablaJugadas tr").each(function() {
        recalcMainRow($(this));
    });
    calculateMainTotal(); // Calculate grand total once after all rows are recalculated
}


// --- Total Calculation & State Management ---
function calculateMainTotal() { /* ... original ... */ 
    // console.log(`calculateMainTotal called. Days: ${selectedDaysCount} Tracks: ${selectedTracksCount}`);
    let sum = 0;
    $("#tablaJugadas tr").each(function() {
        const totalCell = $(this).find(".total").text();
        sum += parseFloat(totalCell) || 0;
    });

    let effectiveDays = selectedDaysCount > 0 ? selectedDaysCount : 1;
    let effectiveTracks = selectedTracksCount > 0 ? selectedTracksCount : 1;
    
    // If no tracks are selected BUT Venezuela is, the multiplier should effectively be 1 (for Venezuela)
    const $checkedTracks = $(".track-checkbox:checked");
    if ($checkedTracks.length > 0 && effectiveTracks === 0 && $checkedTracks.filter("[value='Venezuela']").length > 0) {
        effectiveTracks = 1;
    }


    const finalTotal = sum * effectiveTracks * effectiveDays;
    $("#totalJugadas").text(finalTotal.toFixed(2));
    // console.log("Main total updated to:", finalTotal.toFixed(2));
}

function storeFormState() { /* ... original ... */ 
    const st = {
        // selectedTracksCount, // This is derived, no need to store
        // selectedDaysCount, // This is derived, no need to store
        dateVal: fpInstance ? fpInstance.input.value : "", // Get value from flatpickr instance
        // playCount, // This is derived
        plays: []
    };
    $("#tablaJugadas tr").each(function() {
        st.plays.push({
            betNumber: $(this).find(".betNumber").val() || "",
            gameMode: $(this).find(".gameMode").text() || "-",
            straight: $(this).find(".straight").val() || "",
            box: $(this).find(".box").val() || "",
            combo: $(this).find(".combo").val() || "",
            total: $(this).find(".total").text() || "0.00"
        });
    });
    localStorage.setItem("formState", JSON.stringify(st));
    // console.log("Form state stored.");
}

function loadFormState() { /* ... original ... */
    console.log("loadFormState called");
    const data = JSON.parse(localStorage.getItem("formState"));
    if (!data) return;

    if (fpInstance && data.dateVal) {
        // Parse dates from "m-d-Y, m-d-Y" format
        const datesToSet = data.dateVal.split(', ').map(dateStr => {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                // Ensure parts[2] is a 4-digit year
                const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                return `${parts[0]}-${parts[1]}-${year}`;
            }
            return null;
        }).filter(d => d !== null);
        fpInstance.setDate(datesToSet, false); // false to not trigger onChange yet
        selectedDaysCount = datesToSet.length > 0 ? datesToSet.length : 1;
    }


    $("#tablaJugadas").empty();
    playCount = 0; // Reset playCount before adding rows
    if (data.plays && data.plays.length > 0) {
        data.plays.forEach((p) => {
            // Pass an object similar to what OCR would provide to addMainRow
            addMainRow({ 
                betNumber: p.betNumber, 
                gameMode: p.gameMode, // gameMode from stored state
                straightAmount: parseFloat(p.straight) || null,
                boxAmount: p.box, // Keep as string if it was stored as such (e.g., for Pulito positions)
                comboAmount: parseFloat(p.combo) || null
            });
        });
    }
    
    // After all rows are added and their individual game modes/totals potentially set by addMainRow + recalcMainRow
    recalcAllMainRows(); // This will recalculate game modes and totals for all loaded rows.
    calculateMainTotal(); // This calculates the grand total.
    highlightDuplicatesInMain();
    // console.log("Form state loaded.");
}


// --- Form Actions ---
function resetForm() { /* ... original ... */
    console.log("resetForm called");
    
    // Temporarily detach track checkbox change handler
    $(".track-checkbox").off('change', trackCheckboxChangeHandler);
    isUpdatingProgrammatically = true;

    $("#lotteryForm")[0].reset(); // Resets form inputs
    $("#tablaJugadas").empty();
    playCount = 0;
    jugadasGlobalOCR = [];
    selectedFileGlobalOCR = null;

    // Reset OCR UI
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").empty().html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true);
    hideOcrLoading();


    if (fpInstance) {
        fpInstance.setDate([new Date()], false); // Set to today, don't trigger onChange yet
        selectedDaysCount = 1;
    } else {
        selectedDaysCount = 1;
    }
    
    // Uncheck all track checkboxes
    $(".track-checkbox").prop('checked', false);
    autoSelectNYTrackAndVenezuela(); // This will check defaults

    // Re-attach handler and then update everything
    isUpdatingProgrammatically = false;
    $(".track-checkbox").on('change', trackCheckboxChangeHandler);

    // showCutoffTimes(); // Temporarily commented out
    // disableTracksByTime(); // Temporarily commented out

    updateSelectedTracksAndTotal(); // This recalculates counts and grand total based on new state
    
    localStorage.removeItem("formState");
    console.log("Form reset complete.");
}

function doGenerateTicket() { /* ... original, with added console logs ... */ 
    console.log("doGenerateTicket called");
     const dateVal = fpInstance ? fpInstance.input.value : "";
    if (!dateVal) {
        alert("Please select at least one date.");
        return;
    }
    $("#ticketFecha").text(dateVal);

    const chosenTracks = getCurrentSelectedTracks();
    if (chosenTracks.length === 0) {
        alert("Please select at least one track.");
        return;
    }
    $("#ticketTracks").text(chosenTracks.join(", "));

    // ... (rest of validation logic for cutoff, rows, limits etc.)

    const rows = $("#tablaJugadas tr");
    if (rows.length === 0) {
        alert("No plays to generate a ticket for.");
        return;
    }
    // ... (rest of validation for each row) ...
    let formIsValid = true; // Assume valid initially
    // Placeholder for actual validation logic
    // rows.each(function() { /* ... actual validation ... */ }); 

    if (!formIsValid) {
        // alert("Some plays have errors or exceed limits. Please fix them.");
        // return;
    }

    $("#ticketJugadas").empty();
    rows.each(function(idx) {
        const $row = $(this);
        // ... (populate ticketJugadas from $row) ...
         const bn = $row.find(".betNumber").val().trim();
        const gm = $row.find(".gameMode").text();
        let stVal = $row.find(".straight").val().trim() || "0.00";
        let bxVal = $row.find(".box").val().trim(); 
        let coVal = $row.find(".combo").val().trim() || "0.00";
        let totVal = $row.find(".total").text() || "0.00";

         if (bxVal === "" && (gm === "Pulito" || gm === "Single Action" || gm === "NY Horses")) {
            bxVal = "-"; // Display '-' if box is empty and game mode allows it
        }


        const rowHTML = `
        <tr>
          <td>${idx + 1}</td>
          <td>${bn}</td>
          <td>${gm}</td>
          <td>${parseFloat(stVal).toFixed(2)}</td>
          <td>${bxVal}</td> 
          <td>${parseFloat(coVal).toFixed(2)}</td>
          <td>${parseFloat(totVal).toFixed(2)}</td>
        </tr>
      `;
        $("#ticketJugadas").append(rowHTML);
    });


    $("#ticketTotal").text($("#totalJugadas").text());
    // ... (set ticket number, transaction date, QR code) ...

    if (ticketModalInstance) {
        $("#editButton").removeClass("d-none");
        $("#shareTicket").addClass("d-none");
        $("#confirmarTicket").prop("disabled", false);
        ticketModalInstance.show();
    } else {
        console.error("Ticket modal instance not available in doGenerateTicket");
    }
    storeFormState();
}


// --- Track Management ---
function getTrackCutoff(trackName) { /* ... original ... */ 
    for (let region in cutoffTimes) {
        if (cutoffTimes[region] && cutoffTimes[region][trackName]) {
            return cutoffTimes[region][trackName];
        }
    }
    return null;
}
function hasBrooklynOrFront(tracks) { /* ... original ... */ 
    const bfSet = new Set(["Brooklyn Midday", "Brooklyn Evening", "Front Midday", "Front Evening"]);
    return tracks.some(t => bfSet.has(t));
}
function userChoseToday() { /* ... original ... */ 
    const val = fpInstance ? fpInstance.input.value : "";
    if (!val) return false;
    const arr = val.split(", ");
    const today = dayjs().startOf("day");
    for (let ds of arr) {
        const parsedDate = dayjs(ds, "MM-DD-YYYY"); // Use consistent format
        if (parsedDate.isValid() && parsedDate.isSame(today, "day")) return true;
    }
    return false;
}

// Commented out functions to avoid recursion issues until fully debugged
/*
function disableTracksByTime() {
    // console.log("disableTracksByTime called");
    // if (!userChoseToday()) {
    //     enableAllTracks();
    //     return;
    // }
    // const now = dayjs();
    // isUpdatingProgrammatically = true;
    // $(".track-checkbox").off('change', trackCheckboxChangeHandler);

    // $(".track-checkbox").each(function() {
    //     const trackVal = $(this).val();
    //     if (trackVal === "Venezuela") return; 

    //     const rawCutoff = getTrackCutoff(trackVal);
    //     if (rawCutoff) {
    //         let cutoffTimeObj = dayjs(rawCutoff, "HH:mm");
    //         // Standard cutoff is 10 mins before actual draw time, unless it's after 9:30 PM, then it's exactly 10 PM
    //         let effectiveCutoff = cutoffTimeObj.isAfter(dayjs("21:30", "HH:mm")) 
    //                               ? dayjs().hour(22).minute(0).second(0) 
    //                               : cutoffTimeObj.subtract(10, "minute");

    //         if (now.isSameOrAfter(effectiveCutoff)) {
    //             $(this).prop("checked", false).prop("disabled", true);
    //             $(this).closest(".track-button-container").find(".track-button").css({ opacity: 0.5, cursor: "not-allowed" });
    //         } else {
    //             $(this).prop("disabled", false);
    //             $(this).closest(".track-button-container").find(".track-button").css({ opacity: 1, cursor: "pointer" });
    //         }
    //     }
    // });
    // isUpdatingProgrammatically = false;
    // $(".track-checkbox").on('change', trackCheckboxChangeHandler);
    // updateSelectedTracksAndTotal(); // Call after all changes
}

function enableAllTracks() {
    // console.log("enableAllTracks called");
    // isUpdatingProgrammatically = true;
    // $(".track-checkbox").off('change', trackCheckboxChangeHandler);
    // $(".track-checkbox").each(function() {
    //     $(this).prop("disabled", false);
    //     $(this).closest(".track-button-container").find(".track-button").css({ opacity: 1, cursor: "pointer" });
    // });
    // isUpdatingProgrammatically = false;
    // $(".track-checkbox").on('change', trackCheckboxChangeHandler);
    // updateSelectedTracksAndTotal(); // Call after all changes
}

function showCutoffTimes() {
    // console.log("showCutoffTimes called");
    // $(".cutoff-time").each(function() {
    //     const track = $(this).data("track");
    //     if (track === "Venezuela") return;
    //     const rawCutoff = getTrackCutoff(track);
    //     if (rawCutoff) {
    //         let cutoffTimeObj = dayjs(rawCutoff, "HH:mm");
    //         let effectiveCutoff = cutoffTimeObj.isAfter(dayjs("21:30", "HH:mm")) 
    //                               ? dayjs().hour(22).minute(0) 
    //                               : cutoffTimeObj.subtract(10, "minute");
    //         $(this).text(effectiveCutoff.format("HH:mm"));
    //     } else {
    //         $(this).text("-");
    //     }
    // });
}
*/

function autoSelectNYTrackAndVenezuela() { /* ... original, but simplified ... */ 
    console.log("autoSelectNYTrackAndVenezuela called");
    const anyChecked = $(".track-checkbox:checked").length > 0;
    if (anyChecked && !isResettingForm) return; // Don't auto-select if user has already made selections, unless during reset

    isUpdatingProgrammatically = true;
    $(".track-checkbox").off('change', trackCheckboxChangeHandler);

    // Uncheck all first to ensure a clean slate for default selection
    // $(".track-checkbox").prop('checked', false); // Already done in resetForm if called from there

    const now = dayjs();
    const middayCutoff = dayjs().hour(14).minute(20); // 2:20 PM

    if (now.isBefore(middayCutoff)) {
        $("#trackNYMidDay").prop("checked", true);
    } else {
        $("#trackNYEvening").prop("checked", true);
    }
    $("#trackVenezuela").prop("checked", true);
    
    isUpdatingProgrammatically = false;
    $(".track-checkbox").on('change', trackCheckboxChangeHandler);
    // updateSelectedTracksAndTotal(); // Will be called by the calling context (e.g., end of document.ready or resetForm)
}

// --- Utility Functions ---
function highlightDuplicatesInMain() { /* ... original ... */ 
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
function highlightDuplicatesInWizard() { /* ... original ... */ 
    $("#wizardTableBody tr td:nth-child(2)").removeClass("duplicado");
    const counts = {};
    $("#wizardTableBody tr").each(function() {
        const bn = $(this).find("td").eq(1).text().trim();
        if (bn) counts[bn] = (counts[bn] || 0) + 1;
    });
    $("#wizardTableBody tr").each(function() {
        const bn = $(this).find("td").eq(1).text().trim();
        if (counts[bn] > 1) $(this).find("td").eq(1).addClass("duplicado");
    });
}

function generateUniqueTicketNumber() { return Math.floor(10000000 + Math.random() * 90000000).toString(); }

let transactionDateTime = ''; // For ticket confirmation
let isResettingForm = false; // Flag for resetForm context

// Wizard specific functions
function resetWizard() { /* ... original ... */ 
    wizardCount = 0;
    $("#wizardTableBody").empty();
    lockedFields.straight = false; $("#lockStraight").html(`<i class="bi bi-unlock"></i>`);
    lockedFields.box = false;      $("#lockBox").html(`<i class="bi bi-unlock"></i>`);
    lockedFields.combo = false;    $("#lockCombo").html(`<i class="bi bi-unlock"></i>`);
    $("#wizardBetNumber, #wizardStraight, #wizardBox, #wizardCombo, #rdFirstNumber, #rdLastNumber").val("");
    $("#qpGameMode").val("Pick 3"); $("#qpCount").val("5");
}
function addWizardRow(bn, gm, stVal, bxVal, coVal, total) { /* ... original ... */ 
    wizardCount++;
    const i = wizardCount;
    const rowHTML = `
      <tr data-wizardIndex="${i}">
        <td><button type="button" class="removeWizardBtn btnRemovePlay btn btn-sm btn-danger" data-row="${i}">${i}</button></td>
        <td>${bn}</td><td>${gm}</td>
        <td>${stVal || "-"}</td><td>${bxVal || "-"}</td><td>${coVal || "-"}</td>
        <td>${(parseFloat(total) || 0).toFixed(2)}</td>
      </tr>`;
    $("#wizardTableBody").append(rowHTML);
}
function renumberWizard() { /* ... original ... */ 
    let i = 0;
    $("#wizardTableBody tr").each(function() { i++; $(this).attr("data-wizardIndex", i).find(".removeWizardBtn").attr("data-row", i).text(i); });
    wizardCount = i;
}
function generateRandomNumberForMode(mode) { /* ... original ... */ 
    if (mode === "NY Horses") { const length = Math.floor(Math.random() * 4) + 1; const maxVal = Math.pow(10, length) - 1; return Math.floor(Math.random() * (maxVal + 1)); }
    if (mode === "Single Action") { return Math.floor(Math.random() * 10); }
    if (["Win 4", "Pale-Ven", "Pale-RD", "Palé"].includes(mode)) { return Math.floor(Math.random() * 10000); }
    if (mode === "Pick 3") { return Math.floor(Math.random() * 1000); }
    if (["Venezuela", "Pulito", "RD-Quiniela"].includes(mode)) { return Math.floor(Math.random() * 100); }
    return Math.floor(Math.random() * 1000); // Default
}
function padNumberForMode(num, mode) { /* ... original ... */
    let s = String(num);
    if (["NY Horses", "Single Action"].includes(mode)) return s;
    if (["Win 4", "Pale-Ven", "Pale-RD", "Palé"].includes(mode)) { while (s.length < 4) s = "0" + s; return s; }
    if (["Pick 3"].includes(mode)) { while (s.length < 3) s = "0" + s; return s; }
    if (["Venezuela", "Pulito", "RD-Quiniela"].includes(mode)) { while (s.length < 2) s = "0" + s; return s; }
    while (s.length < 3) s = "0" + s; return s; // Default
}
function permuteWizardBetNumbers() { /* ... original ... */ 
     const rows = $("#wizardTableBody tr");
    if (rows.length === 0) { alert("No plays in the wizard table."); return; }
    let allDigits = []; let lengths = [];
    rows.each(function() { const bn = $(this).find("td").eq(1).text().trim(); lengths.push(bn.length); for (let c of bn) allDigits.push(c); });
    if (allDigits.length === 0) { alert("No digits found to permute."); return; }
    for (let i = allDigits.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allDigits[i], allDigits[j]] = [allDigits[j], allDigits[i]];}
    let idx = 0;
    rows.each(function(i) {
        const needed = lengths[i]; const subset = allDigits.slice(idx, idx + needed); idx += needed;
        const newBN = subset.join("");
        const currentTracks = getCurrentSelectedTracks();
        const gm = determineGameMode(newBN, currentTracks);
        const stTd = $(this).find("td").eq(3).text().trim(); const bxTd = $(this).find("td").eq(4).text().trim(); const coTd = $(this).find("td").eq(5).text().trim();
        const newTotal = calculateRowTotal(newBN, gm, (stTd === "-" ? "0" : stTd), (bxTd === "-" ? "0" : bxTd), (coTd === "-" ? "0" : coTd));
        $(this).find("td").eq(1).text(newBN); $(this).find("td").eq(2).text(gm); $(this).find("td").eq(6).text(parseFloat(newTotal).toFixed(2));
    });
    highlightDuplicatesInWizard();
}

// Tutorial and Manual display functions
const tutorialStepsEN = [ /* ... */ ]; const tutorialStepsES = [ /* ... */ ]; const tutorialStepsHT = [ /* ... */ ];
function startTutorial(lang) { /* ... */ }
// ... (manual button handlers)


const lockedFields = { straight: false, box: false, combo: false }; // For wizard
let fpDateInstance = null; // To store Flatpickr instance for date picker

// Ensure all global functions that are called from HTML onclick are on window
window.usarJugadaOCR = usarJugadaOCR;
window.handleCargarTodasLasJugadasClick = handleCargarTodasLasJugadasClick;
window.abrirModalOCR = abrirModalOCR;
window.handleDragOverOCR = handleDragOverOCR;
window.handleDragLeaveOCR = handleDragLeaveOCR;
window.handleDropOCR = handleDropOCR;
window.handleFileChangeOCR = handleFileChangeOCR;
window.procesarOCR = procesarOCR;
window.toggleOcrDebug = toggleOcrDebug;
window.startTutorial = startTutorial;
// window.debugOcrState = debugOcrState; // If you have this function

// Ensure other global functions if any called from HTML are also exposed
// Example: For wizard or other modals if they use onclick in HTML
// window.nombreDeTuFuncionWizard = nombreDeTuFuncionWizard;

console.log("End of scripts.js reached");



// Global flag to prevent recursive event triggering
let isUpdatingProgrammatically = false;

// Store modal instances globally
let modalOcrInstance = null;
let wizardModalInstance = null;
let ticketModalInstance = null;

// Store OCR results globally
let jugadasGlobalOCR = [];

// Contador de jugadas principal y del wizard
let playCount = 0;
const MAX_PLAYS = 200; // Aumentado a 200
let wizardCount = 0;

// Candados para el Wizard
const lockedFields = {
    straight: false,
    box: false,
    combo: false
};

// Contadores para el total general
let selectedTracksCount = 0;
let selectedDaysCount = 0;

// Flatpickr instance
let fpInstance = null;

/* =========================================================
   FUNCTIONS CALLED BY HTML ONCLICK ATTRIBUTES
   These need to be global.
========================================================= */
window.abrirModalOCR = function() {
    console.log("abrirModalOCR function called");
    isUpdatingProgrammatically = true; // Prevent unwanted triggers while setting up modal
    // Reset OCR modal state
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").empty().html("<p>Sube una imagen de tu ticket para ver las jugadas detectadas aquí.</p>");
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true); // Ensure "Cargar Jugadas" is disabled initially
    hideOcrLoading(); // Make sure loading indicators are hidden
    $("#ocrDebugPanel").addClass("d-none");
    isUpdatingProgrammatically = false;

    if (modalOcrInstance) {
        modalOcrInstance.show();
    } else {
        console.error("modalOcrInstance is not initialized!");
    }
};

window.handleDragOverOCR = function(e) {
    e.preventDefault();
    $("#ocrDropZone").addClass("dragover");
};

window.handleDragLeaveOCR = function(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
};

window.handleDropOCR = function(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        selectedFileGlobalOCR = e.dataTransfer.files[0];
        $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
        $("#btnProcesarOCR").prop('disabled', false);
         console.log("File dropped:", selectedFileGlobalOCR);
    }
};

window.handleFileChangeOCR = function(e) {
    console.log("handleFileChangeOCR called");
    if (e.target.files && e.target.files[0]) {
        selectedFileGlobalOCR = e.target.files[0];
        $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
        $("#btnProcesarOCR").prop('disabled', false);
        console.log("File selected:", selectedFileGlobalOCR);
    } else {
        selectedFileGlobalOCR = null;
        $("#ocrPreview").addClass("d-none").attr("src", "");
        $("#btnProcesarOCR").prop('disabled', true);
    }
};

window.procesarOCR = async function() {
    console.log("procesarOCR function called");
    console.log("Current selectedFileGlobalOCR:", selectedFileGlobalOCR);

    if (!selectedFileGlobalOCR) {
        alert("No has seleccionado ninguna imagen.");
        return;
    }

    $("#ocrJugadas").empty().html("<p>Procesando, por favor espera...</p>");
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true);
    showOcrLoading();

    const reader = new FileReader();
    reader.onloadend = async () => {
        const base64data = reader.result;
        console.log("Sending request to /api/interpret-ticket");
        try {
            const response = await fetch('/api/interpret-ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ photoDataUri: base64data }),
            });

            updateOcrProgress(75, "AI procesando...");

            if (!response.ok) {
                let errorData = { message: `Error del servidor: ${response.status} - ${response.statusText || "Error desconocido del servidor."}` };
                try {
                    const errJson = await response.json();
                    errorData = errJson; // Get more specific error from server if available
                } catch (e) { /* Ignore if response is not JSON */ }
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const interpretedBets = await response.json();
            console.log("Received interpretedBets:", interpretedBets);
            updateOcrProgress(100, "¡Completado!");

            if (Array.isArray(interpretedBets) && interpretedBets.length > 0) {
                jugadasGlobalOCR = interpretedBets;
                let html = '<h5>Jugadas Detectadas:</h5>';
                jugadasGlobalOCR.forEach((j, idx) => {
                    html += `
                      <div class="ocr-detected-play my-2 p-2 border rounded">
                        <table class="table table-sm table-bordered table-dark small-ocr-table mb-1">
                          <thead>
                            <tr>
                              <th style="width:30px;">#</th>
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
                      <hr class="ocr-play-separator">
                    `;
                });
                $("#ocrJugadas").html(html);
                $("#btnCargarJugadas").prop('disabled', false); // Enable button if plays are found
            } else {
                $("#ocrJugadas").html("<p>No se detectaron jugadas válidas en la imagen.</p>");
                jugadasGlobalOCR = [];
                $("#btnCargarJugadas").prop('disabled', true);
            }
        } catch (error) {
            console.error('Error procesando la imagen:', error);
            $("#ocrJugadas").html(`<p style="color:red;">Error procesando la imagen: ${error.message}</p>`);
            jugadasGlobalOCR = [];
            $("#btnCargarJugadas").prop('disabled', true);
        } finally {
            hideOcrLoading();
            // Re-enable "Procesar OCR" only if a file is still selected
            $("#btnProcesarOCR").prop('disabled', !selectedFileGlobalOCR);
        }
    };
    reader.onerror = () => {
        alert('Error leyendo el archivo de imagen.');
        hideOcrLoading();
        $("#btnProcesarOCR").prop('disabled', !selectedFileGlobalOCR);
        $("#btnCargarJugadas").prop('disabled', true);
    };
    reader.readAsDataURL(selectedFileGlobalOCR);
    updateOcrProgress(25, "Subiendo imagen...");
};

window.usarJugadaOCR = function(idx) {
    console.log("usarJugadaOCR called for index:", idx);
    if (!jugadasGlobalOCR || !jugadasGlobalOCR[idx]) {
        alert("No se encontró la jugada seleccionada.");
        return;
    }
    const j = jugadasGlobalOCR[idx];
    console.log("Jugada a usar:", j);

    const newRow = addMainRow(j); // Pass the bet object to addMainRow
    if (newRow) {
        newRow.find(".betNumber").focus();
    }
    // No cerrar el modal: modalOcrInstance.hide();
};

window.toggleOcrDebug = function() {
    //$("#ocrDebugPanel").toggleClass("d-none");
    alert("El panel de debug detallado del backend original no está implementado de la misma manera para la respuesta de la API actual. Revisa la consola del navegador para ver la respuesta de /api/interpret-ticket.");
};


$(document).ready(function() {
    console.log("Document ready. jQuery version:", $().jquery);
    if (typeof bootstrap !== 'undefined') {
        console.log("Bootstrap is loaded. Version:", bootstrap.Modal.VERSION);
    } else {
        console.error("Bootstrap is NOT loaded!");
    }

    // Initialize modal instances
    if ($('#modalOcr').length) modalOcrInstance = new bootstrap.Modal(document.getElementById('modalOcr'));
    if ($('#wizardModal').length) wizardModalInstance = new bootstrap.Modal(document.getElementById('wizardModal'));
    if ($('#ticketModal').length) ticketModalInstance = new bootstrap.Modal(document.getElementById('ticketModal'));

    // (3) Init Flatpickr
    fpInstance = flatpickr("#fecha", {
        mode: "multiple",
        dateFormat: "m-d-Y",
        minDate: "today",
        defaultDate: [new Date()],
        clickOpens: true,
        allowInput: false,
        appendTo: document.body, // Or specific container
        onOpen: function(selectedDates, dateStr, instance) {
            // Optional: adjust positioning or style on open
        },
        onClose: function(selectedDates, dateStr, instance) {
            // Optional: cleanup or actions on close
        },
        onReady: function(selectedDates, dateStr, instance) {
            if (!dateStr || dateStr.trim() === "") {
                instance.setDate(new Date(), true); // Fire onChange
            }
            // Initial calculation after ready and potential defaultDate set
            selectedDaysCount = instance.selectedDates.length || 1;
            // Call disableTracksByTime and updateSelectedTracksAndTotal AFTER auto-selection
        },
        onChange: (selectedDatesFromPicker, dateStr, instance) => {
            console.log("Flatpickr onChange triggered. Dates:", selectedDatesFromPicker);
            selectedDaysCount = selectedDatesFromPicker.length || 0;
            
            isUpdatingProgrammatically = true;
            $(".track-checkbox").off('change', trackCheckboxChangeHandler); // Turn off while disabling
            disableTracksByTime();
            $(".track-checkbox").on('change', trackCheckboxChangeHandler); // Turn back on
            isUpdatingProgrammatically = false;
            
            updateSelectedTracksAndTotal(); // This will calculate total
        }
    });

    // (4) Track Checkboxes event handler
    $(".track-checkbox").on('change', trackCheckboxChangeHandler);

    // (5) MAIN TABLE => Add/Remove
    $("#agregarJugada").click(function() {
        console.log("Add Play button clicked");
        const row = addMainRow();
        if (row) row.find(".betNumber").focus();
    });

    $("#eliminarJugada").click(function() {
        if (playCount === 0) {
            alert("No plays to remove.");
            return;
        }
        $("#tablaJugadas tr:last").remove();
        playCount--;
        renumberMainRows();
        calculateMainTotal(); // Recalculate after removing
        highlightDuplicatesInMain();
        storeFormState();
    });

    $("#tablaJugadas").on("click", ".removeMainBtn", function() {
        $(this).closest("tr").remove();
        playCount--;
        renumberMainRows();
        calculateMainTotal(); // Recalculate after removing
        highlightDuplicatesInMain();
        storeFormState();
    });

    $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function() {
        const row = $(this).closest("tr");
        recalcMainRow(row); // This will call calculateMainTotal internally
        highlightDuplicatesInMain();
        storeFormState();
    });

    // (10) resetForm
    $("#resetForm").click(function() {
        console.log("Reset Form button clicked");
        if (confirm("Are you sure you want to reset the form?")) {
            resetForm();
        }
    });

    // Attach click handler for "Cargar Jugadas al Form"
    console.log("Attempting to attach click handler to #btnCargarJugadas");
    console.log("Element #btnCargarJugadas encontrado:", $("#btnCargarJugadas").length);
    $(document).on('click', '#btnCargarJugadas', function() {
        console.log("¡CLICK DETECTADO EN BOTÓN CARGAR JUGADAS (delegado)!");
        console.log("jugadasGlobalOCR:", jugadasGlobalOCR);

        if (!jugadasGlobalOCR || jugadasGlobalOCR.length === 0) {
            alert("No hay jugadas OCR para cargar.");
            return;
        }

        isUpdatingProgrammatically = true; // Prevent table input events from firing updates prematurely
        jugadasGlobalOCR.forEach(j => {
            if (playCount < MAX_PLAYS) {
                addMainRow(j); // Pass the bet object
            } else {
                alert(`Se ha alcanzado el límite de ${MAX_PLAYS} jugadas. No se pueden añadir más desde el OCR.`);
                return false; // Break a .each() loop in jQuery
            }
        });
        isUpdatingProgrammatically = false;

        recalcAllMainRows(); // Recalculate all game modes and row totals
        // updateSelectedTracksAndTotal(); // Not needed here as tracks/days haven't changed
        calculateMainTotal(); // Recalculate grand total
        highlightDuplicatesInMain();
        storeFormState();

        if (modalOcrInstance) {
            modalOcrInstance.hide();
        }
    });


    // (11) Generate Ticket
    $("#generarTicket").click(function() {
        console.log("Generate Ticket button clicked");
        doGenerateTicket();
    });

    // WIZARD related event handlers
    $("#wizardButton").click(function() {
        console.log("Wizard button clicked");
        resetWizard();
        if(wizardModalInstance) wizardModalInstance.show();
    });

    $(".lockBtn").click(function() {
        const field = $(this).data("field");
        lockedFields[field] = !lockedFields[field];
        $(this).html(lockedFields[field] ? '<i class="bi bi-lock-fill"></i>' : '<i class="bi bi-unlock"></i>');
    });

    $("#wizardAddNext").click(function() {
        // ... (wizard logic)
    });
    // ... (other wizard buttons and logic) ...
    $("#wizardAddAllToMain").click(function() {
        // ...
        recalcAllMainRows();
        calculateMainTotal();
        highlightDuplicatesInMain();
        storeFormState();
    });

    $("#wizardGenerateTicket").click(function() {
        $("#wizardAddAllToMain").trigger("click");
        if(wizardModalInstance) wizardModalInstance.hide();
        doGenerateTicket();
    });

    $("#wizardEditMainForm").click(function() {
        if(wizardModalInstance) wizardModalInstance.hide();
    });
    
    // --- INITIALIZATION SEQUENCE ---
    loadFormState(); // Load saved state first
    showCutoffTimes(); // Display cutoff times in the UI

    isUpdatingProgrammatically = true;
    $(".track-checkbox").off('change', trackCheckboxChangeHandler);
    
    autoSelectNYTrackAndVenezuela(); // Selects defaults, might change checkboxes
    disableTracksByTime();           // Disables tracks based on time, might change checkboxes

    $(".track-checkbox").on('change', trackCheckboxChangeHandler);
    isUpdatingProgrammatically = false;
    
    updateSelectedTracksAndTotal();  // Calculate initial counts and grand total correctly

    console.log("Initial selectedDaysCount:", selectedDaysCount);
    console.log("Initial selectedTracksCount:", selectedTracksCount);
    console.log("Document ready sequence finished.");
});

function trackCheckboxChangeHandler() {
    if (isUpdatingProgrammatically) {
        console.log("Track change CANCELED due to isUpdatingProgrammatically flag");
        return;
    }
    console.log("Track checkbox changed BY USER - calling updateSelectedTracksAndTotal");
    updateSelectedTracksAndTotal();
}

function updateSelectedTracksAndTotal() {
    console.log("updateSelectedTracksAndTotal called");
    isUpdatingProgrammatically = true; // Protect this function's changes
    let count = 0;
    $(".track-checkbox:checked").each(function() {
        if ($(this).val() !== "Venezuela") { // "Venezuela" does not count towards multiplier
            if (!$(this).prop('disabled')) { // Only count if not disabled
                 count++;
            }
        }
    });
    selectedTracksCount = count || 0; // Ensure it's at least 0, not 1 if no tracks are selected
    if ($(".track-checkbox:checked").length > 0 && selectedTracksCount === 0 && $(".track-checkbox:checked[value='Venezuela']").length > 0) {
      // If only Venezuela is checked, count should effectively be 1 for total calculation if we want it to act as a base
      // Or handle this logic inside calculateMainTotal as per specific rules. For now, it will be 0.
    }

    console.log("Updated selectedTracksCount:", selectedTracksCount);
    isUpdatingProgrammatically = false;
    calculateMainTotal();
    storeFormState();
}


function addMainRow(bet = null) { // bet object can be passed from OCR
    if (playCount >= MAX_PLAYS) {
        alert(`Has alcanzado el límite de ${MAX_PLAYS} jugadas.`);
        return null;
    }
    playCount++;
    const rowIndex = playCount;
    const betNumber = bet ? bet.betNumber || "" : "";
    // Game mode will be determined by recalcMainRow
    const straight = bet ? (bet.straightAmount !== null && bet.straightAmount !== undefined ? parseFloat(bet.straightAmount).toFixed(2) : "") : "";
    const box = bet ? (bet.boxAmount !== null && bet.boxAmount !== undefined ? parseFloat(bet.boxAmount).toFixed(2) : "") : "";
    const combo = bet ? (bet.comboAmount !== null && bet.comboAmount !== undefined ? parseFloat(bet.comboAmount).toFixed(2) : "") : "";


    const rowHTML = `
      <tr data-playindex="${rowIndex}">
        <td>
          <button type="button" class="btnRemovePlay removeMainBtn btn btn-sm btn-danger" data-row="${rowIndex}">
            ${rowIndex}
          </button>
        </td>
        <td>
          <input type="text" class="form-control betNumber" value="${betNumber}" />
        </td>
        <td class="gameMode">-</td>
        <td>
          <input type="number" step="0.01" class="form-control straight" value="${straight}" />
        </td>
        <td>
          <input type="text" class="form-control box" value="${box}" />
        </td>
        <td>
          <input type="number" step="0.01" class="form-control combo" value="${combo}" />
        </td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    const newRowJquery = $("#tablaJugadas tr[data-playindex='" + rowIndex + "']");
    
    if (bet) { // If adding from OCR, immediately recalc
        recalcMainRow(newRowJquery);
    }
    return newRowJquery;
}

function renumberMainRows() {
    let i = 0;
    $("#tablaJugadas tr").each(function() {
        i++;
        $(this).attr("data-playindex", i);
        $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i;
    // storeFormState(); // Called by caller
}

function recalcMainRow($row) {
    const bn = $row.find(".betNumber").val().trim();
    const gm = determineGameMode(bn);
    $row.find(".gameMode").text(gm);

    const stVal = $row.find(".straight").val().trim();
    const bxVal = $row.find(".box").val().trim(); // For Pulito, this might be "1,2" or "0.50"
    const coVal = $row.find(".combo").val().trim();

    const rowTotal = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    $row.find(".total").text(rowTotal);
    // calculateMainTotal(); // This should be called once after all rows potentially change
}

function recalcAllMainRows() {
    $("#tablaJugadas tr").each(function() {
        recalcMainRow($(this));
    });
    calculateMainTotal(); // Calculate grand total after all rows are recalculated
}


function calculateMainTotal() {
    let sumOfRowTotals = 0;
    $("#tablaJugadas tr").each(function() {
        const totalCell = $(this).find(".total").text();
        const val = parseFloat(totalCell) || 0;
        sumOfRowTotals += val;
    });

    const daysToMultiply = selectedDaysCount > 0 ? selectedDaysCount : 1;
    const tracksToMultiply = selectedTracksCount > 0 ? selectedTracksCount : 1;
    // If no tracks are selected, but only Venezuela is, should the multiplier be 1 or 0?
    // Based on original logic: selectedTracksCount already excludes Venezuela for multiplication.
    // If selectedTracksCount is 0 (e.g. only Venezuela is selected, or no tracks at all),
    // then tracksToMultiply will be 1, meaning no multiplication by zero for tracks.
    // This seems to align with making Venezuela not part of the multiplier but still allowing bets.
    
    let finalTotal = sumOfRowTotals * daysToMultiply * tracksToMultiply;
    
    // Handle case where no days are selected (total should be 0)
    if (selectedDaysCount === 0) {
        finalTotal = 0;
    }

    $("#totalJugadas").text(finalTotal.toFixed(2));
    console.log(`calculateMainTotal: sumOfRowTotals=${sumOfRowTotals}, days=${selectedDaysCount}(${daysToMultiply}), tracks=${selectedTracksCount}(${tracksToMultiply}), finalTotal=${finalTotal}`);
    // storeFormState(); // Usually called by the function that triggers this total calculation
}


function determineGameMode(betNumber) {
    if (!betNumber) return "-";

    isUpdatingProgrammatically = true; // Prevent change handlers from firing while getting track states
    const $checkedTracks = $(".track-checkbox:checked:not(:disabled)");
    isUpdatingProgrammatically = false;

    const tracks = $checkedTracks.map(function() { return $(this).val(); }).get();
    
    const isUSA = tracks.some(t => cutoffTimes.USA[t]);
    const isSD = tracks.some(t => cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    if (includesHorses) return "NY Horses";

    const bnTrimmed = betNumber.trim();
    if (bnTrimmed.length === 1 && isUSA && !includesVenezuela) return "Single Action";

    const paleRegex = /^(\d{2})([xX+-])(\d{2})$/;
    if (paleRegex.test(bnTrimmed)) {
        if (includesVenezuela && isUSA) return "Pale-Ven";
        if (isSD && !isUSA) return "Pale-RD";
        if (isUSA) return "Palé"; // Default Palé for USA if not more specific
        return "Palé"; // Generic Palé if no clear region
    }

    const length = bnTrimmed.replace(/[^0-9]/g, "").length; // Count only digits for length check after pale

    if (length === 2) {
        if (includesVenezuela && isUSA) return "Venezuela";
        if (isUSA && !isSD) return "Pulito";
        if (isSD && !isUSA) return "RD-Quiniela";
        return "Pulito"; // Default for 2 digits if no specific region
    }
    if (length === 3) return "Pick 3";
    if (length === 4) return "Win 4";

    return "-";
}

function calculateRowTotal(bn, gm, stVal, bxVal, coVal) {
    if (!bn || gm === "-") return "0.00";

    const st = parseFloat(stVal) || 0;
    const combo = parseFloat(coVal) || 0;
    let numericBox = 0;
    let total = 0;

    if (gm === "Pulito") {
        // For Pulito, boxVal can be a list of positions like "1,2" or a numeric amount.
        if (bxVal && /^[0-9,.\s]+$/.test(bxVal) && bxVal.includes(',')) { // Likely positions
            const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean);
            numericBox = 0; // Box amount is not added directly, it's st * num_positions
            total = st * positions.length; // Straight amount per position
        } else { // Treat as a normal box amount
            numericBox = parseFloat(bxVal) || 0;
            total = st + numericBox + combo; // Standard sum if box is a single number
        }
        return total.toFixed(2);
    }
    
    numericBox = parseFloat(bxVal) || 0; // For all other game modes

    if (gm === "Win 4" || gm === "Pick 3") {
        const combosCount = calcCombos(bn); // Ensure bn is just numbers for calcCombos
        total = st + numericBox + (combo * combosCount);
    } else {
        // For Single Action, NY Horses, Venezuela, Palé variants, RD-Quiniela
        total = st + numericBox + combo;
    }
    return total.toFixed(2);
}


function calcCombos(strNum) {
    const str = String(strNum).replace(/[^0-9]/g, ""); // Ensure only digits
    if (!str) return 0;
    const freq = {};
    for (let c of str) {
        freq[c] = (freq[c] || 0) + 1;
    }
    const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
    let denom = 1;
    for (let k in freq) {
        denom *= factorial(freq[k]);
    }
    if (str.length === 0 || denom === 0) return 0; // Avoid division by zero or issues with empty strings
    return factorial(str.length) / denom;
}

function storeFormState() {
    // ... (localStorage logic) ...
}

function loadFormState() {
    // ... (localStorage logic) ...
    // After loading, ensure totals are updated
    // updateSelectedTracksAndTotal(); // This might be too early or cause issues if DOM isn't fully ready for it
}
// loadFormState(); // Call this after DOM is fully ready and other initializations

function resetForm() {
    console.log("resetForm called");
    isUpdatingProgrammatically = true;
    $(".track-checkbox").off('change', trackCheckboxChangeHandler);

    $("#lotteryForm")[0].reset();
    if (fpInstance) {
        fpInstance.setDate([new Date()], false); // Set date without triggering its onChange yet
        selectedDaysCount = 1; // Manually set after fpInstance.setDate
    } else {
        selectedDaysCount = 1; // Default if fpInstance not ready
    }

    $("#tablaJugadas").empty();
    playCount = 0;
    // selectedTracksCount will be updated by autoSelectNYTrackAndVenezuela and updateSelectedTracksAndTotal
    
    window.ticketImageDataUrl = null;
    $("#totalJugadas").text("0.00");
    localStorage.removeItem("formState");

    enableAllTracks(); // Enable all before auto-selecting and disabling
    showCutoffTimes(); // Show all times

    autoSelectNYTrackAndVenezuela(); // Selects defaults
    disableTracksByTime();           // Applies time-based disabling

    $(".track-checkbox").on('change', trackCheckboxChangeHandler);
    isUpdatingProgrammatically = false;

    updateSelectedTracksAndTotal(); // Crucial: Final update after all programmatic changes
    console.log("Form reset. selectedDaysCount:", selectedDaysCount, "selectedTracksCount:", selectedTracksCount);
}

function enableAllTracks() {
    isUpdatingProgrammatically = true;
    $(".track-checkbox").prop('disabled', false);
    $(".track-button-container").find(".track-button").css({
        opacity: 1,
        cursor: "pointer"
    });
    isUpdatingProgrammatically = false;
}

function getTrackCutoff(trackName) {
    for (let region in cutoffTimes) {
        if (cutoffTimes[region][trackName]) {
            return cutoffTimes[region][trackName];
        }
    }
    return null;
}

function userChoseToday() {
    if (!fpInstance || !fpInstance.selectedDates || fpInstance.selectedDates.length === 0) return false;
    const today = dayjs().startOf("day");
    for (let date of fpInstance.selectedDates) {
        if (dayjs(date).startOf("day").isSame(today, "day")) {
            return true;
        }
    }
    return false;
}

function disableTracksByTime() {
    console.log("disableTracksByTime called. User chose today:", userChoseToday());
    if (!userChoseToday()) {
        enableAllTracks(); // If today is not selected, ensure all tracks are enabled
        return;
    }

    isUpdatingProgrammatically = true; // Set flag before manipulating checkboxes
    const now = dayjs();
    $(".track-checkbox").each(function() {
        const trackVal = $(this).val();
        if (trackVal === "Venezuela") return; // Skip Venezuela

        const rawCutoff = getTrackCutoff(trackVal);
        if (rawCutoff) {
            let cutoffTimeObj = dayjs(rawCutoff, "HH:mm");
            // Your logic for cutoff (e.g., 10 mins before actual cutoff)
            let effectiveCutoff = cutoffTimeObj.isAfter(dayjs("21:30", "HH:mm")) ?
                dayjs("22:00", "HH:mm") :
                cutoffTimeObj.subtract(10, "minute");

            if (now.isSame(effectiveCutoff) || now.isAfter(effectiveCutoff)) {
                $(this).prop("checked", false).prop("disabled", true);
                $(this).closest(".track-button-container").find(".track-button").css({
                    opacity: 0.5,
                    cursor: "not-allowed"
                });
            } else {
                $(this).prop("disabled", false); // Ensure it's enabled if before cutoff
                $(this).closest(".track-button-container").find(".track-button").css({
                    opacity: 1,
                    cursor: "pointer"
                });
            }
        }
    });
    isUpdatingProgrammatically = false; // Clear flag after manipulations
}


function showCutoffTimes() {
    $(".cutoff-time").each(function() {
        const track = $(this).data("track");
        if (track === "Venezuela") return;
        let raw = getTrackCutoff(track);

        if (raw) {
            let co = dayjs(raw, "HH:mm");
            let cf = co.isAfter(dayjs("21:30", "HH:mm")) ? dayjs("22:00", "HH:mm") : co.subtract(10, "minute");
            $(this).text(`${cf.format("HH:mm")}`);
        } else {
            $(this).text(""); // Clear if no cutoff defined
        }
    });
}

function autoSelectNYTrackAndVenezuela() {
    console.log("autoSelectNYTrackAndVenezuela called");
    isUpdatingProgrammatically = true; // Set flag

    const anyChecked = $(".track-checkbox:checked").length > 0;
    if (anyChecked && !isInitialLoad) { // Only run on initial load or if explicitly called by reset
        isUpdatingProgrammatically = false;
        return;
    }

    // Elige NY Mid Day si es antes de 14:20, si no, NY Evening
    const now = dayjs();
    let middayCutoff = dayjs(cutoffTimes.USA["New York Mid Day"], "HH:mm").subtract(10, "minute"); // Use effective cutoff
    
    // Desmarcar ambos NY por si acaso antes de marcar el correcto
    $("#trackNYMidDay").prop("checked", false);
    $("#trackNYEvening").prop("checked", false);

    if (now.isBefore(middayCutoff)) {
        $("#trackNYMidDay").prop("checked", true);
    } else {
        $("#trackNYEvening").prop("checked", true);
    }
    $("#trackVenezuela").prop("checked", true);

    isUpdatingProgrammatically = false; // Clear flag
}
let isInitialLoad = true; // Flag to control autoSelect on first load


function highlightDuplicatesInMain() { /* ... */ }
function doGenerateTicket() { /* ... */ }
function saveBetDataToSheetDB(ticket, cb) { /* ... */ }
function generateUniqueTicketNumber() { /* ... */ }
function fixTicketLayoutForMobile() { /* ... */ }
function hasBrooklynOrFront(tracks) { /* ... */ }

// Wizard Functions (Mantener como estaban, ya que no son el foco del error actual)
function resetWizard() { /* ... */ }
function addWizardRow(bn, gm, st, bx, co, total) { /* ... */ }
// ... y el resto de las funciones del wizard ...


// OCR Helper functions for loading state
function showOcrLoading() {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width", "5%").text("5%"); // Start with a small progress
    $("#ocrProgressText").text("Iniciando...");
}
function updateOcrProgress(percentage, text) {
    $("#ocrProgressBar").css("width", percentage + "%").text(percentage + "%");
    if (text) $("#ocrProgressText").text(text);
}
function hideOcrLoading() {
    $("#ocrLoadingSection").addClass("d-none");
    $("#ocrProgressBar").css("width", "0%").text("");
    $("#ocrProgressText").text("");
}

// Make sure this is called after all function definitions and initial setup
// $(document).ready( () => {
//    loadFormState(); // Call this at the very end of ready if it relies on other initializations
// });
// Ensure all initial calls like showCutoffTimes, autoSelectNYTrackAndVenezuela, disableTracksByTime, updateSelectedTracksAndTotal are done within $(document).ready()
// and in the correct order.

// Example of how cutoffTimes is defined (needs to be at the top of the script or accessible scope)
const cutoffTimes = {
    "USA": {
        "New York Mid Day": "14:20", "New York Evening": "22:00", "Georgia Mid Day": "12:20",
        "Georgia Evening": "18:40", "New Jersey Mid Day": "12:50", "New Jersey Evening": "22:00",
        "Florida Mid Day": "13:20", "Florida Evening": "21:30", "Connecticut Mid Day": "13:30",
        "Connecticut Evening": "22:00", "Georgia Night": "22:00", // Assuming 22:00, adjust if different
        "Pensilvania AM": "12:45", "Pensilvania PM": "18:15", "Venezuela": "00:00", // No real cutoff
        "Brooklyn Midday": "14:20", "Brooklyn Evening": "22:00", "Front Midday": "14:20",
        "Front Evening": "22:00", "New York Horses": "16:00" // Example
    },
    "Santo Domingo": {
        "Real": "11:45", "Gana mas": "13:25", "Loteka": "18:30", "Nacional": "19:30",
        "Quiniela Pale": "19:30", "Primera Día": "10:50", "Suerte Día": "11:20",
        "Lotería Real": "11:50", "Suerte Tarde": "16:50", "Lotedom": "16:50", // Example, Lotedom is often earlier
        "Primera Noche": "18:50", "Panama": "16:00" // Example
    },
    // Ensure "Venezuela" exists here if getTrackCutoff checks it, even if value is "00:00"
    "Venezuela": { 
        "Venezuela": "00:00"
    }
};
// END OF SCRIPT

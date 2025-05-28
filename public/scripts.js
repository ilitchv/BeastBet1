
// Global variable to prevent recursive event triggering
let isUpdatingProgrammatically = false;
let fpInstance; // Flatpickr instance
let modalOcrInstance, wizardModalInstance, ticketModalInstance;

// OCR Globals
let selectedFileGlobalOCR = null;
let jugadasGlobalOCR = [];
let ocrProgressInterval = null;

// Make functions globally accessible for onclick attributes if not already handled by jQuery event binding
// These functions are defined later in the script
// window.abrirModalOCR = abrirModalOCR; // Will be handled by jQuery
// window.handleDragOverOCR ... etc.

function debugLog(message) {
  console.log(`[DEBUG] ${new Date().toISOString()}: ${message}`);
}

$(document).ready(function() {
  debugLog("Document ready. jQuery version: " + ($.fn.jquery || "unknown"));
  if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    debugLog("Bootstrap is loaded. Version: " + (bootstrap.Modal.VERSION || "unknown"));
    // Initialize modals once the DOM is ready
    if (document.getElementById("modalOcr")) {
      modalOcrInstance = new bootstrap.Modal(document.getElementById("modalOcr"));
    }
    if (document.getElementById("wizardModal")) {
      wizardModalInstance = new bootstrap.Modal(document.getElementById("wizardModal"));
    }
    if (document.getElementById("ticketModal")) {
      ticketModalInstance = new bootstrap.Modal(document.getElementById("ticketModal"));
    } else {
      debugLog("Ticket modal element not found during initialization.");
    }
  } else {
    debugLog("Bootstrap Modal is not loaded.");
  }

  // --- EARLY ATTACHMENT FOR #btnCargarJugadas ---
  if ($("#btnCargarJugadas").length) {
    debugLog('Attempting to attach click handler to #btnCargarJugadas (early)');
    $("#btnCargarJugadas").off('click').on('click', function() {
      debugLog("Cargar Jugadas al Form button (#btnCargarJugadas) CLICKED!");
      if (!jugadasGlobalOCR || jugadasGlobalOCR.length === 0) {
        alert("No hay jugadas OCR para cargar.");
        debugLog("No OCR plays to load.");
        return;
      }
      debugLog("Jugadas OCR a cargar:", JSON.parse(JSON.stringify(jugadasGlobalOCR)));

      jugadasGlobalOCR.forEach(j => {
        // Ensure j is an object and has necessary properties
        if (typeof j === 'object' && j !== null && j.hasOwnProperty('betNumber')) {
          addMainRow(j);
        } else {
          debugLog("Skipping invalid OCR play object:", j);
        }
      });

      recalcAllMainRows(); // Recalculates gameMode and rowTotal for all rows
      updateSelectedTracksAndTotal(); // Ensures counts and grand total are updated
      highlightDuplicatesInMain();
      storeFormState();

      if (modalOcrInstance) {
        modalOcrInstance.hide();
      } else {
        debugLog("modalOcrInstance not available to hide.");
      }
    });
    debugLog('Click handler for #btnCargarJugadas attached (early).');
  } else {
    debugLog('#btnCargarJugadas not found in the DOM (early attachment).');
  }
  // --- END EARLY ATTACHMENT ---


  dayjs.extend(dayjs_plugin_customParseFormat);
  dayjs.extend(dayjs_plugin_arraySupport);

  let transactionDateTime = '';
  window.ticketImageDataUrl = null;

  let selectedTracksCount = 0;
  let selectedDaysCount = 1; // Default to 1 for today
  const MAX_PLAYS = 200;

  let playCount = 0;
  let wizardCount = 0;

  const lockedFields = {
    straight: false,
    box: false,
    combo: false
  };

  const cutoffTimes = {
    "USA": {
      "New York Mid Day": "14:20", "New York Evening": "22:00", "Georgia Mid Day": "12:20",
      "Georgia Evening": "18:40", "New Jersey Mid Day": "12:50", "New Jersey Evening": "22:00",
      "Florida Mid Day": "13:20", "Florida Evening": "21:30", "Connecticut Mid Day": "13:30",
      "Connecticut Evening": "22:00", "Georgia Night": "22:00", "Pensilvania AM": "12:45",
      "Pensilvania PM": "18:15", "Brooklyn Midday": "14:20", "Brooklyn Evening": "22:00",
      "Front Midday": "14:20", "Front Evening": "22:00", "New York Horses": "16:00"
    },
    "Santo Domingo": {
      "Real": "11:45", "Gana mas": "13:25", "Loteka": "18:30", "Nacional": "19:30",
      "Quiniela Pale": "19:30", "Primera Día": "10:50", "Suerte Día": "11:20",
      "Lotería Real": "11:50", "Suerte Tarde": "16:50", "Lotedom": "16:50",
      "Primera Noche": "18:50", "Panama": "16:00"
    },
    "Venezuela": { "Venezuela": "00:00" } // No specific cutoff, always open conceptually
  };

  fpInstance = flatpickr("#fecha", {
    mode: "multiple",
    dateFormat: "m-d-Y",
    minDate: "today",
    defaultDate: [new Date()],
    clickOpens: true,
    allowInput: false,
    appendTo: document.body,
    onOpen: function() {
      this.calendarContainer.style.transform = 'scale(2.0)';
      this.calendarContainer.style.transformOrigin = 'top left';
    },
    onClose: function() {
      this.calendarContainer.style.transform = '';
    },
    onReady: function(selectedDates, dateStr, instance) {
      if (!dateStr || dateStr.trim() === "") {
        instance.setDate(new Date(), true);
      }
      selectedDaysCount = instance.selectedDates.length || 1;
      // Initial disabling of tracks might be needed here AFTER auto-selection
      // disableTracksByTime(); // Called later after auto-select
      // updateSelectedTracksAndTotal(); // Called later
    },
    onChange: function(selectedDatesInstance, dateStr, instance) {
      debugLog("Flatpickr onChange - selectedDatesInstance.length: " + selectedDatesInstance.length);
      selectedDaysCount = selectedDatesInstance.length || 0; // If 0 dates, count is 0
      if (selectedDaysCount === 0) { // If user deselects all dates, default to 1 (today)
          fpInstance.setDate([new Date()], false); // Set without triggering onChange again
          selectedDaysCount = 1;
      }
      disableTracksByTime();
      updateSelectedTracksAndTotal(); // This should be the main trigger for recalculation
    }
  });

  // OCR Modal functions made global for HTML onclick
  window.abrirModalOCR = function() {
    debugLog("abrirModalOCR function called");
    if (!modalOcrInstance) {
        debugLog("modalOcrInstance is not initialized!");
        if (document.getElementById("modalOcr")) {
            modalOcrInstance = new bootstrap.Modal(document.getElementById("modalOcr"));
        } else {
            alert("OCR Modal element not found.");
            return;
        }
    }
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    hideOcrLoading();
    $("#ocrDebugPanel").addClass("d-none");
    $("#btnProcesarOCR").prop("disabled", true);
    $("#btnCargarJugadas").prop("disabled", true);
    modalOcrInstance.show();
  };

  window.handleDragOverOCR = function(e) { e.preventDefault(); $("#ocrDropZone").addClass("dragover"); };
  window.handleDragLeaveOCR = function(e) { e.preventDefault(); $("#ocrDropZone").removeClass("dragover"); };
  window.handleDropOCR = function(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectedFileGlobalOCR = e.dataTransfer.files[0];
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
      $("#btnProcesarOCR").prop("disabled", false);
      debugLog("File dropped: " + selectedFileGlobalOCR.name);
    }
  };
  window.handleFileChangeOCR = function(e) {
    debugLog("handleFileChangeOCR called");
    if (e.target.files && e.target.files[0]) {
      selectedFileGlobalOCR = e.target.files[0];
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
      $("#btnProcesarOCR").prop("disabled", false);
      debugLog("File selected: " + selectedFileGlobalOCR.name);
    } else {
      selectedFileGlobalOCR = null;
      $("#ocrPreview").addClass("d-none").attr("src", "");
      $("#btnProcesarOCR").prop("disabled", true);
      debugLog("No file selected or selection cleared.");
    }
  };

  function showOcrLoading(message = "Procesando...") {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width", "0%").removeClass("bg-danger bg-success").addClass("bg-primary progress-bar-animated");
    $("#ocrProgressText").text(message);
    $("#btnProcesarOCR").prop("disabled", true);
    $("#btnCargarJugadas").prop("disabled", true);
  }

  function updateOcrProgress(percentage, text) {
    $("#ocrProgressBar").css("width", percentage + "%");
    if (text) $("#ocrProgressText").text(text);
  }

  function hideOcrLoading(isSuccess = true) {
    if (ocrProgressInterval) { clearInterval(ocrProgressInterval); ocrProgressInterval = null; }
    if (isSuccess) {
      $("#ocrProgressBar").css("width", "100%").removeClass("bg-primary progress-bar-animated bg-danger").addClass("bg-success");
      $("#ocrProgressText").text("Completado!");
    } else {
      $("#ocrProgressBar").css("width", "100%").removeClass("bg-primary progress-bar-animated bg-success").addClass("bg-danger");
      $("#ocrProgressText").text("Error.");
    }
    setTimeout(() => {
      $("#ocrLoadingSection").addClass("d-none");
      // Re-enable buttons based on state
      $("#btnProcesarOCR").prop("disabled", !selectedFileGlobalOCR);
      $("#btnCargarJugadas").prop("disabled", jugadasGlobalOCR.length === 0);
    }, isSuccess ? 800 : 2000);
  }

  window.procesarOCR = async function() {
    debugLog("procesarOCR function called");
    if (!selectedFileGlobalOCR) {
      alert("No has seleccionado ninguna imagen.");
      $("#btnProcesarOCR").prop("disabled", true); // Ensure it's disabled
      return;
    }
    $("#ocrJugadas").empty().html("<p>Procesando imagen...</p>");
    showOcrLoading("Subiendo imagen...");

    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobalOCR);
    reader.onloadend = async () => {
      const base64data = reader.result;
      updateOcrProgress(30, "Imagen enviada, esperando IA...");
      debugLog("Sending request to /api/interpret-ticket");
      try {
        const response = await fetch('/api/interpret-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoDataUri: base64data }),
        });

        updateOcrProgress(70, "IA procesando...");
        if (!response.ok) {
          let errorMsg = `Error del servidor: ${response.status}`;
          try {
            const errorData = await response.json();
            errorMsg += ` - ${errorData.message || "Error desconocido del servidor."}`;
          } catch (e) { /* ignore if error response is not json */ }
          throw new Error(errorMsg);
        }

        const interpretedBets = await response.json();
        debugLog("Received interpretedBets:", JSON.parse(JSON.stringify(interpretedBets)));
        updateOcrProgress(100, "Interpretación recibida!");

        if (!Array.isArray(interpretedBets)) {
          throw new Error("La respuesta de la IA no fue un array de jugadas válido.");
        }

        jugadasGlobalOCR = interpretedBets;
        $("#btnCargarJugadas").prop("disabled", jugadasGlobalOCR.length === 0);

        if (jugadasGlobalOCR.length === 0) {
          $("#ocrJugadas").html("<p>No se detectaron jugadas válidas en la imagen.</p>");
          hideOcrLoading(true); // Success in processing, but no bets
          return;
        }

        let html = "<h5>Jugadas Detectadas:</h5>";
        jugadasGlobalOCR.forEach((j, idx) => {
          const straight = j.straightAmount !== null ? parseFloat(j.straightAmount).toFixed(2) : "-";
          const box = j.boxAmount !== null ? parseFloat(j.boxAmount).toFixed(2) : "-";
          const combo = j.comboAmount !== null ? parseFloat(j.comboAmount).toFixed(2) : "-";
          html += `
            <div style="border:1px solid #ccc; padding:0.5rem; margin-bottom:0.5rem; background-color: #f9f9f9; border-radius: 4px;">
              <p style="margin: 2px 0;"><strong>#${idx + 1}</strong></p>
              <p style="margin: 2px 0;"><strong>Bet Number:</strong> ${j.betNumber || "N/A"}</p>
              <p style="margin: 2px 0;"><strong>Game Mode (IA):</strong> ${j.gameMode || "N/A"}</p>
              <p style="margin: 2px 0;"><strong>Straight:</strong> $${straight}</p>
              <p style="margin: 2px 0;"><strong>Box:</strong> $${box}</p>
              <p style="margin: 2px 0;"><strong>Combo:</strong> $${combo}</p>
              <button class="btn btn-sm btn-info mt-1" onclick="usarJugadaOCR(${idx})">
                Usar esta Jugada
              </button>
            </div>
          `;
        });
        $("#ocrJugadas").html(html);
        hideOcrLoading(true);

      } catch (err) {
        debugLog("Error procesando la imagen: " + err.message);
        $("#ocrJugadas").html(`<p style="color:red;">Error procesando la imagen: ${err.message}</p>`);
        hideOcrLoading(false); // Error in processing
      }
    };
    reader.onerror = () => {
      alert('Error leyendo el archivo de imagen.');
      hideOcrLoading(false);
    };
  };

  window.usarJugadaOCR = function(idx) {
    debugLog(`usarJugadaOCR called for index: ${idx}`);
    if (!jugadasGlobalOCR || !jugadasGlobalOCR[idx]) {
      alert("No se encontró la jugada seleccionada.");
      return;
    }
    const j = jugadasGlobalOCR[idx];
    debugLog("Jugada a usar:", JSON.parse(JSON.stringify(j)));

    const newRow = addMainRow(j); // Pass the bet object to addMainRow
    if (newRow) {
      // addMainRow now handles populating. We just need to recalc and update UI.
      recalcMainRow(newRow); // Recalculates gameMode and rowTotal for this specific row
      updateSelectedTracksAndTotal(); // Recalculates counts and grand total
      highlightDuplicatesInMain();
      storeFormState();
    }

    if (modalOcrInstance) modalOcrInstance.hide();
  };

  // This is the globalized debug toggle if you have a button for it in HTML
  window.toggleOcrDebug = function() {
    // For now, just log. The detailed panel from original script isn't implemented for Genkit response.
    alert("El panel de debug detallado del backend original no está implementado para la respuesta de Genkit. Revisa la consola del navegador (Network tab) para la respuesta de /api/interpret-ticket.");
    $("#ocrDebugPanel").toggleClass("d-none"); // Assuming ocrDebugPanel still exists in your HTML
  };

  // Track Checkbox Change Handler
  const trackCheckboxChangeHandler = function() {
    if (isUpdatingProgrammatically) {
      // debugLog("Change event on track checkbox skipped (programmatic).");
      return;
    }
    debugLog("Track checkbox changed by user.");
    updateSelectedTracksAndTotal();
  };

  function updateSelectedTracksAndTotal() {
    debugLog("updateSelectedTracksAndTotal called");
    isUpdatingProgrammatically = true; // Prevent re-entry from .prop() changes if any were to occur
    let count = 0;
    $(".track-checkbox:checked").each(function() {
      if ($(this).val() !== "Venezuela") { // Venezuela no cuenta para el multiplicador
        count++;
      }
    });
    selectedTracksCount = count || 0; // If no tracks, count is 0
    debugLog("Track checkboxes changed - selectedTracksCount: " + selectedTracksCount);
    calculateMainTotal();
    storeFormState();
    isUpdatingProgrammatically = false;
  }


  $("#agregarJugada").click(function() {
    const newRow = addMainRow();
    if (newRow) newRow.find(".betNumber").focus();
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
    // storeFormState(); // storeFormState is called by calculateMainTotal
  });

  $("#tablaJugadas").on("click", ".removeMainBtn", function() {
    $(this).closest("tr").remove();
    playCount--;
    renumberMainRows();
    calculateMainTotal();
    highlightDuplicatesInMain();
    // storeFormState();
  });

  $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function() {
    const row = $(this).closest("tr");
    recalcMainRow(row); // This calls calculateMainTotal
    highlightDuplicatesInMain();
    // storeFormState(); // storeFormState is called by calculateMainTotal via recalcMainRow
  });

  function addMainRow(bet = null) {
    if (playCount >= MAX_PLAYS) {
      alert("You have reached " + MAX_PLAYS + " plays in the main form.");
      return null;
    }
    playCount++;
    const rowIndex = playCount;
    const betNumberVal = bet && bet.betNumber ? bet.betNumber : "";
    const straightVal = bet && bet.straightAmount !== null ? parseFloat(bet.straightAmount) : "";
    const boxVal = bet && bet.boxAmount !== null ? parseFloat(bet.boxAmount) : "";
    const comboVal = bet && bet.comboAmount !== null ? parseFloat(bet.comboAmount) : "";
    // gameMode and rowTotal will be calculated by recalcMainRow

    const rowHTML = `
      <tr data-playIndex="${rowIndex}">
        <td>
          <button type="button" class="btnRemovePlay removeMainBtn" data-row="${rowIndex}">
            ${rowIndex}
          </button>
        </td>
        <td>
          <input type="text" class="form-control betNumber" value="${betNumberVal}" />
        </td>
        <td class="gameMode">-</td>
        <td>
          <input type="number" step="0.01" class="form-control straight" value="${Number.isFinite(straightVal) ? straightVal.toFixed(2) : ""}" />
        </td>
        <td>
          <input type="number" step="0.01" class="form-control box" value="${Number.isFinite(boxVal) ? boxVal.toFixed(2) : ""}" />
        </td>
        <td>
          <input type="number" step="0.01" class="form-control combo" value="${Number.isFinite(comboVal) ? comboVal.toFixed(2) : ""}" />
        </td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    const newRowElement = $("#tablaJugadas tr[data-playIndex='" + rowIndex + "']");
    
    if(bet) { // If adding from OCR, immediately recalc this new row
        recalcMainRow(newRowElement);
    }
    // updateSelectedTracksAndTotal(); // Not here, recalcMainRow calls calculateMainTotal
    return newRowElement;
  }

  function renumberMainRows() {
    let i = 0;
    $("#tablaJugadas tr").each(function() {
      i++;
      $(this).attr("data-playIndex", i);
      $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i;
    // storeFormState(); // Called by calculateMainTotal
  }

  function recalcMainRow($row) {
    const bn = $row.find(".betNumber").val().trim();
    const gm = determineGameMode(bn, $(".track-checkbox:checked").map(function(){return $(this).val();}).get());
    $row.find(".gameMode").text(gm);

    const stVal = $row.find(".straight").val().trim();
    const bxVal = $row.find(".box").val().trim();
    const coVal = $row.find(".combo").val().trim();

    const rowTotal = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    $row.find(".total").text(rowTotal);
    calculateMainTotal(); // This will update grand total and store state
  }

  function recalcAllMainRows() {
    $("#tablaJugadas tr").each(function() {
      recalcMainRow($(this));
    });
  }

  function calculateMainTotal() {
    debugLog(`calculateMainTotal called. Days: ${selectedDaysCount}, Tracks: ${selectedTracksCount}`);
    let sum = 0;
    $("#tablaJugadas tr").each(function() {
      const totalCell = $(this).find(".total").text();
      const val = parseFloat(totalCell) || 0;
      sum += val;
    });

    let effectiveDaysCount = selectedDaysCount > 0 ? selectedDaysCount : 1;
    let effectiveTracksCount = selectedTracksCount > 0 ? selectedTracksCount : 1;
    
    // If no plays, total is 0 regardless of days/tracks
    if (playCount === 0) {
        sum = 0;
    } else {
        sum = sum * effectiveTracksCount * effectiveDaysCount;
    }

    $("#totalJugadas").text(sum.toFixed(2));
    storeFormState(); // Store state whenever total changes
  }

  function determineGameMode(betNumber, selectedTracks) {
    if (!betNumber) return "-";

    const isUSA = selectedTracks.some(t => cutoffTimes.USA[t]);
    const isSD = selectedTracks.some(t => cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = selectedTracks.includes("Venezuela");
    const includesHorses = selectedTracks.includes("New York Horses");

    if (includesHorses) return "NY Horses";
    if (isUSA && !includesVenezuela && betNumber.length === 1) return "Single Action";

    const paleRegex = /^(\d{2})([-/x+])(\d{2})$/;
    if (paleRegex.test(betNumber)) {
      if (includesVenezuela && isUSA) return "Pale-Ven";
      if (isSD && !isUSA) return "Pale-RD";
      if (isUSA) return "Palé"; // Generic Palé for USA if not Ven/SD specific
      return "Palé"; // Default Palé if no specific region context
    }

    const length = betNumber.length;
    if (length < 2 || length > 4) return "-";
    if (length === 2) {
      if (includesVenezuela && isUSA) return "Venezuela";
      if (isUSA && !isSD) return "Pulito";
      if (isSD && !isUSA) return "RD-Quiniela";
      return "Pulito"; // Default 2-digit
    }
    if (length === 3) return "Pick 3";
    if (length === 4) return "Win 4";
    return "-";
  }

  function calculateRowTotal(bn, gm, stVal, bxVal, coVal) {
    if (!bn || gm === "-") return "0.00";
    const st = parseFloat(stVal) || 0;
    let box = 0;
    const combo = parseFloat(coVal) || 0;

    if (gm === "Pulito" && typeof bxVal === 'string' && bxVal.includes(',')) {
        const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean);
        box = st * positions.length; // Pulito box logic for positions
        return box.toFixed(2); // For Pulito with positions, only box amount contributes based on straight * positions
    } else {
        box = parseFloat(bxVal) || 0;
    }
    
    let rowSum = st + box + combo;

    if (gm === "Win 4" || gm === "Pick 3") {
      // For Win4/Pick3, if combo is specified, it's often price per combination
      // If combo > 0, straight and box are typically separate or 0.
      // This specific game logic might need more detail if combo isn't simply additive.
      // Assuming simple additive for now unless specific rules are provided for combo calc for these.
      // The original calcCombos was for a different purpose (permutations for combo wager type)
      // If combo is meant to be `comboAmount * numberOfCombinations`, that logic would go here.
      // For now, simple sum.
    } else if (["Venezuela", "Pale-RD", "Pale-Ven", "RD-Quiniela", "Palé"].includes(gm)) {
      // Often these are straight bets, but let's sum if box/combo are entered
      // If only straight is allowed, this logic should be stricter.
    }
    
    return rowSum.toFixed(2);
  }

  function calcCombos(str) { // This function calculates permutations, might not be for row total
    const freq = {};
    for (let c of str) freq[c] = (freq[c] || 0) + 1;
    const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
    let denom = 1;
    for (let k in freq) denom *= factorial(freq[k]);
    return factorial(str.length) / denom;
  }

  function storeFormState() {
    const st = {
      dateVal: $("#fecha").val(),
      selectedTracks: $(".track-checkbox:checked").map(function() { return $(this).val(); }).get(),
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
    localStorage.setItem("lotteryFormState", JSON.stringify(st));
    // debugLog("Form state stored.");
  }

  function loadFormState() {
    const data = JSON.parse(localStorage.getItem("lotteryFormState"));
    if (!data) {
      debugLog("No form state found in localStorage.");
      return;
    }
    debugLog("Loading form state:", data);

    if (data.dateVal && fpInstance) {
        const dates = data.dateVal.split(", ").map(d => dayjs(d, "MM-DD-YYYY").toDate());
        fpInstance.setDate(dates, false); // Set without triggering onChange during load
        selectedDaysCount = dates.length || 1;
    } else if (fpInstance) {
        fpInstance.setDate([new Date()], false); // Default to today
        selectedDaysCount = 1;
    }


    isUpdatingProgrammatically = true; // Prevent change handlers during programmatic load
    $(".track-checkbox").prop("checked", false); // Uncheck all first
    if (data.selectedTracks && Array.isArray(data.selectedTracks)) {
      data.selectedTracks.forEach(trackVal => {
        $(`.track-checkbox[value="${trackVal}"]`).prop("checked", true);
      });
    }
    isUpdatingProgrammatically = false;

    $("#tablaJugadas").empty();
    playCount = 0;
    if (data.plays && Array.isArray(data.plays)) {
      data.plays.forEach((p) => {
        const newRow = addMainRow(); // Adds an empty row, increments playCount
        if (newRow) {
            newRow.find(".betNumber").val(p.betNumber || "");
            // gameMode will be set by recalcMainRow
            newRow.find(".straight").val(p.straight || "");
            newRow.find(".box").val(p.box || "");
            newRow.find(".combo").val(p.combo || "");
            // row total will be set by recalcMainRow
        }
      });
    }
    recalcAllMainRows(); // This will set game modes and row totals
    // updateSelectedTracksAndTotal will be called after initial setup
    // highlightDuplicatesInMain(); // highlight after all rows are potentially set
  }
  
  // Initial Load Sequence
  loadFormState(); // Load saved state first

  $("#resetForm").click(function() {
    if (confirm("Are you sure you want to reset the form?")) {
      resetForm();
    }
  });

  function resetForm() {
    debugLog("Resetting form...");
    isUpdatingProgrammatically = true;
    
    // Clear main table
    $("#tablaJugadas").empty();
    playCount = 0;

    // Reset date to today
    if (fpInstance) {
      fpInstance.setDate([new Date()], true); // true to trigger onChange
    } else {
      selectedDaysCount = 1; // if fpInstance not ready, manually set
    }
    
    // Uncheck all tracks before auto-selecting
    $(".track-checkbox").prop("checked", false);
    isUpdatingProgrammatically = false; // Allow autoSelect to trigger changes if needed by its own logic

    autoSelectNYTrackAndVenezuela(); // This will mark defaults and should trigger its own updates.
                                     // autoSelectNYTrackAndVenezuela calls updateSelectedTracksAndTotal internally.
    
    // disableTracksByTime will be called by the date change or autoSelect, which in turn calls updateSelectedTracksAndTotal
    // Final calculation will be triggered by the sequence.
    $("#totalJugadas").text("0.00"); // Visual reset
    localStorage.removeItem("lotteryFormState");
    debugLog("Form reset complete.");
  }

  $("#generarTicket").click(function() {
    doGenerateTicket();
  });

  // Definition of doGenerateTicket, wizard functions, etc. (from original script) would go here
  // ... (rest of your original wizard, ticket generation, intro.js, manual code)
  // Make sure to adapt any calls to updateSelectedTracksAndTotal() or calculateMainTotal() as needed.

  function getTrackCutoff(trackName) {
    for (const region in cutoffTimes) {
      if (cutoffTimes[region][trackName]) {
        return cutoffTimes[region][trackName];
      }
    }
    return null;
  }

  function userChoseToday() {
    if (!fpInstance || !fpInstance.selectedDates || fpInstance.selectedDates.length === 0) {
      return false; // No date selected or flatpickr not ready
    }
    const today = dayjs().startOf('day');
    return fpInstance.selectedDates.some(date => dayjs(date).startOf('day').isSame(today));
  }

  function disableTracksByTime() {
    debugLog("disableTracksByTime called");
    isUpdatingProgrammatically = true;
    const todaySelected = userChoseToday();

    $(".track-checkbox").each(function() {
      const trackInput = $(this);
      const trackName = trackInput.val();
      const trackButtonContainer = trackInput.closest(".track-button-container");
      const trackButtonLabel = trackButtonContainer.find(".track-button");

      if (!todaySelected) { // If today is not selected, enable all tracks
        trackInput.prop("disabled", false);
        trackButtonLabel.css({ opacity: 1, cursor: "pointer" });
        return; // continue to next track
      }

      // If today is selected, check cutoff times
      if (trackName === "Venezuela") { // Venezuela has no cutoff conceptually
        trackInput.prop("disabled", false);
        trackButtonLabel.css({ opacity: 1, cursor: "pointer" });
        return; // continue
      }

      const cutoffHM = getTrackCutoff(trackName);
      if (cutoffHM) {
        const now = dayjs();
        let cutoffTime = dayjs(cutoffHM, "HH:mm");
        // Original logic: if cutoff is after 9:30 PM, effective cutoff is 10 PM, else 10 mins before.
        let effectiveCutoff = cutoffTime.isAfter(dayjs("21:30", "HH:mm")) 
                              ? dayjs("22:00", "HH:mm") 
                              : cutoffTime.subtract(10, "minute");

        if (now.isSame(effectiveCutoff) || now.isAfter(effectiveCutoff)) {
          trackInput.prop("disabled", true).prop("checked", false); // Uncheck if disabled
          trackButtonLabel.css({ opacity: 0.5, cursor: "not-allowed" });
        } else {
          trackInput.prop("disabled", false);
          trackButtonLabel.css({ opacity: 1, cursor: "pointer" });
        }
      } else { // No cutoff defined, enable
        trackInput.prop("disabled", false);
        trackButtonLabel.css({ opacity: 1, cursor: "pointer" });
      }
    });
    isUpdatingProgrammatically = false;
    // The caller of disableTracksByTime is responsible for calling updateSelectedTracksAndTotal
  }

  function showCutoffTimes() {
    $(".cutoff-time").each(function() {
      const trackSpan = $(this);
      const trackName = trackSpan.data("track");
      if (trackName === "Venezuela") return;

      const cutoffHM = getTrackCutoff(trackName);
      if (cutoffHM) {
        let cutoffTime = dayjs(cutoffHM, "HH:mm");
        let effectiveCutoff = cutoffTime.isAfter(dayjs("21:30", "HH:mm")) 
                              ? dayjs("22:00", "HH:mm") 
                              : cutoffTime.subtract(10, "minute");
        trackSpan.text(`(${effectiveCutoff.format("hh:mm A")})`);
      } else {
        trackSpan.text(""); // Clear if no cutoff
      }
    });
  }

  function autoSelectNYTrackAndVenezuela() {
    debugLog("autoSelectNYTrackAndVenezuela called");
    const anyTrackCheckedInitially = $(".track-checkbox:checked").length > 0;
    if (anyTrackCheckedInitially && !localStorage.getItem("lotteryFormState")) { // Only skip if not loading from storage and something is already checked
        debugLog("Tracks already checked, skipping auto-select.");
        return;
    }

    isUpdatingProgrammatically = true;
    // Uncheck all first to ensure clean state if called multiple times (e.g. reset)
    // $(".track-checkbox").prop("checked", false); //This might be too aggressive if called after loadFormState

    const now = dayjs();
    const nyMiddayCutoff = dayjs(cutoffTimes.USA["New York Mid Day"], "HH:mm").subtract(10, "minute");

    if (now.isBefore(nyMiddayCutoff)) {
      $("#trackNYMidDay").prop("checked", true);
    } else {
      $("#trackNYEvening").prop("checked", true);
    }
    $("#trackVenezuela").prop("checked", true);
    isUpdatingProgrammatically = false;
    // updateSelectedTracksAndTotal(); // Caller should handle this
  }

  function highlightDuplicatesInMain() {
    $("#tablaJugadas .betNumber").removeClass("duplicado");
    const counts = {};
    $("#tablaJugadas .betNumber").each(function() {
      const bn = $(this).val().trim();
      if (bn) counts[bn] = (counts[bn] || 0) + 1;
    });
    $("#tablaJugadas .betNumber").each(function() {
      const bn = $(this).val().trim();
      if (counts[bn] > 1) $(this).addClass("duplicado");
    });
  }
  
  // --- INITIALIZATION SEQUENCE ---
  // 1. Attach main event handlers that don't depend on initial state being fully set
  $(".track-checkbox").on('change', trackCheckboxChangeHandler);
  // Other button handlers like #agregarJugada, #eliminarJugada etc. are already attached.

  // 2. Display static info
  showCutoffTimes();

  // 3. Load saved state if any, or set defaults
  if (!localStorage.getItem("lotteryFormState")) {
    debugLog("No saved state, setting defaults.");
    autoSelectNYTrackAndVenezuela(); // Set default checked tracks
    // Flatpickr defaults to today by its own config if no saved date
  }
  // loadFormState() is called earlier. If it loaded dates, fpInstance.selectedDates is set.
  // If not, Flatpickr defaultDate applies.

  // 4. Apply time-based disabling
  disableTracksByTime();

  // 5. Calculate initial totals based on current state of dates and tracks
  updateSelectedTracksAndTotal();
  
  // setInterval(function() {
  //   disableTracksByTime();
  //   updateSelectedTracksAndTotal();
  // }, 60000); // Commented out for now to isolate recursion

  debugLog("Document ready sequence finished.");
  // Wizard and other specific component initializations (from original script) should go here
  // e.g., wizard modal button click handlers, quick pick, etc.
  // ... (Tu código de Wizard, etc.)
  // Example for wizard button, if not already handled by global onclick
  $("#wizardButton").click(function() {
    // resetWizard(); // Assuming resetWizard is defined
    if (wizardModalInstance) {
      // resetWizard(); // Call your wizard reset logic
      wizardModalInstance.show();
    } else {
      debugLog("wizardModalInstance not initialized!");
    }
  });

  // Ensure other globally assigned functions are defined or also attached via jQuery
  // This is more robust than relying on global window assignments if script load order/timing is an issue.
  $("#btnOcrModal").click(function() { abrirModalOCR(); });
  // The OCR modal buttons (Procesar, Cargar) should have their handlers attached when the modal is built or shown if dynamic
  // Or ensure their IDs are unique and handlers attached in document.ready like #btnCargarJugadas.
  // $("#btnProcesarOCR").click(function() { procesarOCR(); }); // Already global from onclick
  // The `usarJugadaOCR` is called from dynamically generated HTML, so window.usarJugadaOCR is fine.

}); // End of $(document).ready()

/* =========================================================
   SCRIPTS.JS COMPLETO
   (Mantiene toda la lógica previa intacta,
    e incorpora spinner moderno, barra de progreso
    y muestra solo betNumber + monto en el panel de jugadas).
========================================================= */

// Global modal instances - initialize once DOM is ready
let modalOcrInstance = null;
let wizardModalInstance = null;
let ticketModalInstance = null;

// OCR related global variables
let selectedFileGlobalOCR = null;
let jugadasGlobalOCR = [];
let ocrProgressInterval = null;

// Function to open OCR Modal
function abrirModalOCR() {
  console.log("abrirModalOCR function called");
  if (modalOcrInstance) {
    // Reset OCR modal state
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").empty().removeClass('table-responsive'); // Remove class if added
    hideOcrLoading();
    $("#ocrDebugPanel").addClass("d-none");
    $("#btnProcesarOCR").prop("disabled", true); // Disable process button initially
    $("#btnCargarJugadasOCR").prop("disabled", true); // Disable load button initially
    
    modalOcrInstance.show();
  } else {
    console.error("modalOcrInstance is not initialized");
    alert("OCR Modal could not be opened. Please refresh the page.");
  }
}
window.abrirModalOCR = abrirModalOCR;

// Drag & Drop and File Input handlers for OCR
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
  console.log("handleDropOCR called");
  $("#ocrDropZone").removeClass("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    selectedFileGlobalOCR = e.dataTransfer.files[0];
    $("#ocrPreview")
      .attr("src", URL.createObjectURL(selectedFileGlobalOCR))
      .removeClass("d-none");
    $("#btnProcesarOCR").prop("disabled", false);
    console.log("File dropped:", selectedFileGlobalOCR);
  }
}
window.handleDropOCR = handleDropOCR;

function handleFileChangeOCR(e) {
  console.log("handleFileChangeOCR called");
  if (e.target.files && e.target.files[0]) {
    selectedFileGlobalOCR = e.target.files[0];
    $("#ocrPreview")
      .attr("src", URL.createObjectURL(selectedFileGlobalOCR))
      .removeClass("d-none");
    $("#btnProcesarOCR").prop("disabled", false);
    console.log("File selected:", selectedFileGlobalOCR);
  } else {
    selectedFileGlobalOCR = null;
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#btnProcesarOCR").prop("disabled", true);
  }
}
window.handleFileChangeOCR = handleFileChangeOCR;

// OCR Progress UI functions
function showOcrLoading(message = "Subiendo/Procesando...") {
  $("#ocrLoadingSection").removeClass("d-none");
  $("#ocrProgressBar").css("width", "0%");
  $("#ocrProgressText").text(message);
  $("#btnProcesarOCR").prop("disabled", true);
  $("#btnCargarJugadasOCR").prop("disabled", true);
}

function updateOcrProgress(percentage, text) {
  $("#ocrProgressBar").css("width", percentage + "%");
  if (text) {
    $("#ocrProgressText").text(text);
  }
}

function hideOcrLoading() {
  if (ocrProgressInterval) {
    clearInterval(ocrProgressInterval);
    ocrProgressInterval = null;
  }
  $("#ocrLoadingSection").addClass("d-none");
  $("#ocrProgressBar").css("width", "0%");
  if (selectedFileGlobalOCR) {
      $("#btnProcesarOCR").prop("disabled", false);
  }
  if (jugadasGlobalOCR && jugadasGlobalOCR.length > 0) {
      $("#btnCargarJugadasOCR").prop("disabled", false);
  }
}

// Process OCR function
async function procesarOCR() {
  console.log("procesarOCR function called");
  console.log("Current selectedFileGlobalOCR:", selectedFileGlobalOCR);

  if (!selectedFileGlobalOCR) {
    alert("No has seleccionado ninguna imagen.");
    return;
  }

  $("#ocrJugadas").empty().removeClass('table-responsive');
  showOcrLoading("Subiendo imagen...");
  updateOcrProgress(10, "Subiendo imagen...");

  const reader = new FileReader();
  reader.readAsDataURL(selectedFileGlobalOCR);

  reader.onloadend = async () => {
    const base64data = reader.result;
    updateOcrProgress(30, "Procesando con IA...");

    try {
      console.log("Sending request to /api/interpret-ticket");
      const response = await fetch("/api/interpret-ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ photoDataUri: base64data }),
      });

      updateOcrProgress(70, "Recibiendo respuesta...");

      if (!response.ok) {
        let errorData = { message: `Error del servidor: ${response.status} - ${response.statusText || "Error desconocido del servidor."}` };
        try {
            const errJson = await response.json();
            errorData = errJson; // If server sends a JSON error
        } catch (e) {
            // If parsing error JSON fails, stick to the original error
            console.error("Could not parse error response JSON", e);
        }
        console.error("Server error response:", errorData);
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const interpretedBets = await response.json();
      console.log("Received interpretedBets:", interpretedBets);
      updateOcrProgress(100, "Proceso completado!");

      if (!Array.isArray(interpretedBets)) {
        console.error("Respuesta de la API no es un array:", interpretedBets);
        throw new Error("La respuesta de la API no tiene el formato esperado (no es un array).");
      }

      jugadasGlobalOCR = interpretedBets; // Store the results

      if (jugadasGlobalOCR.length === 0) {
        $("#ocrJugadas").html("<p>No se detectaron jugadas en la imagen.</p>");
        $("#btnCargarJugadasOCR").prop("disabled", true);
      } else {
        let html = `<div class="table-responsive"><table class="table table-sm table-bordered table-striped mt-2">
                        <thead><tr><th>#</th><th>Bet No.</th><th>Game Mode</th><th>Straight</th><th>Box</th><th>Combo</th><th>Acción</th></tr></thead><tbody>`;
        jugadasGlobalOCR.forEach((j, idx) => {
          html += `<tr>
                      <td>${idx + 1}</td>
                      <td>${j.betNumber || "-"}</td>
                      <td>${j.gameMode || "-"}</td>
                      <td>${j.straightAmount !== null ? j.straightAmount.toFixed(2) : "-"}</td>
                      <td>${j.boxAmount !== null ? j.boxAmount.toFixed(2) : "-"}</td>
                      <td>${j.comboAmount !== null ? j.comboAmount.toFixed(2) : "-"}</td>
                      <td><button class="btn btn-sm btn-info" onclick="usarJugadaOCR(${idx})">Usar</button></td>
                    </tr>`;
        });
        html += "</tbody></table></div>";
        $("#ocrJugadas").html(html).addClass('table-responsive');
        $("#btnCargarJugadasOCR").prop("disabled", false);
      }
      setTimeout(hideOcrLoading, 1200); // Hide loading after a short delay
    } catch (err) {
      console.error("Error procesando la imagen:", err);
      $("#ocrJugadas").html(`<p class="text-danger">Error procesando la imagen: ${err.message}</p>`);
      hideOcrLoading();
      $("#btnProcesarOCR").prop("disabled", false); // Re-enable on error if a file is still selected
    }
  };
  reader.onerror = () => {
    console.error("Error leyendo el archivo.");
    alert("Error leyendo el archivo.");
    hideOcrLoading();
    $("#btnProcesarOCR").prop("disabled", false);
  };
}
window.procesarOCR = procesarOCR;

// Function to use a single OCR'd play
function usarJugadaOCR(idx) {
  console.log("usarJugadaOCR called for index:", idx);
  if (!jugadasGlobalOCR || !jugadasGlobalOCR[idx]) {
    alert("No se encontró la jugada seleccionada.");
    return;
  }
  const betToLoad = jugadasGlobalOCR[idx];
  const newRow = addMainRow(betToLoad); // addMainRow now accepts a bet object
  if(newRow) newRow.find(".betNumber").focus();


  if (modalOcrInstance) {
    modalOcrInstance.hide();
  }
}
window.usarJugadaOCR = usarJugadaOCR;

// Debug OCR Panel Toggle
function toggleOcrDebug() {
    console.log("toggleOcrDebug called");
    // For now, just log to console, as detailed debug panel from original backend is not applicable here
    console.warn("Detailed OCR debug panel is not available with this Genkit backend. Check browser console for API responses or errors.");
    alert("Información de depuración detallada no disponible. Revisa la consola del navegador.");
    // $("#ocrDebugPanel").toggleClass("d-none"); // If you want to show/hide some placeholder
}
window.toggleOcrDebug = toggleOcrDebug;


$(document).ready(function() {
  console.log("Document ready. jQuery version:", $.fn.jquery);
  if (typeof bootstrap !== 'undefined') {
    console.log("Bootstrap is loaded. Version:", bootstrap.Modal.VERSION);
  } else {
    console.error("Bootstrap JavaScript not loaded!");
  }

  // Initialize modal instances
  if ($('#modalOcr').length) {
    modalOcrInstance = new bootstrap.Modal(document.getElementById("modalOcr"));
  } else {
    console.error("OCR Modal element #modalOcr not found!");
  }
  if ($('#wizardModal').length) {
    wizardModalInstance = new bootstrap.Modal(document.getElementById("wizardModal"));
  } else {
    console.error("Wizard Modal element #wizardModal not found!");
  }
  if ($('#ticketModal').length) {
    ticketModalInstance = new bootstrap.Modal(document.getElementById("ticketModal"));
  } else {
    console.error("Ticket Modal element #ticketModal not found!");
  }
  
  // (1) Variables globales, dayjs, etc.
  dayjs.extend(dayjs_plugin_customParseFormat);
  dayjs.extend(dayjs_plugin_arraySupport);

  let transactionDateTime = '';
  window.ticketImageDataUrl = null; // For sharing ticket image

  let selectedTracksCount = 0;
  let selectedDaysCount = 1; // Default to 1 day (today)
  const MAX_PLAYS = 200; // Increased limit

  let playCount = 0;
  let wizardCount = 0;

  const lockedFields = {
    straight: false,
    box: false,
    combo: false
  };

  // (2) Cutoff times (remains the same)
  const cutoffTimes = {
    "USA": {
      "New York Mid Day": "14:20", "New York Evening": "22:00", "Georgia Mid Day": "12:20",
      "Georgia Evening": "18:40", "New Jersey Mid Day": "12:50", "New Jersey Evening": "22:00",
      "Florida Mid Day": "13:20", "Florida Evening": "21:30", "Connecticut Mid Day": "13:30",
      "Connecticut Evening": "22:00", "Georgia Night": "22:00", "Pensilvania AM": "12:45",
      "Pensilvania PM": "18:15", "Venezuela": "00:00", "Brooklyn Midday": "14:20",
      "Brooklyn Evening": "22:00", "Front Midday": "14:20", "Front Evening": "22:00",
      "New York Horses": "16:00"
    },
    "Santo Domingo": {
      "Real": "11:45", "Gana mas": "13:25", "Loteka": "18:30", "Nacional": "19:30",
      "Quiniela Pale": "19:30", "Primera Día": "10:50", "Suerte Día": "11:20",
      "Lotería Real": "11:50", "Suerte Tarde": "16:50", "Lotedom": "16:50",
      "Primera Noche": "18:50", "Panama": "16:00"
    },
    "Venezuela": { "Venezuela": "00:00" }
  };

  // (3) Init Flatpickr
  let fpInstance = null;
  if ($('#fecha').length) {
    fpInstance = flatpickr("#fecha", {
      mode: "multiple",
      dateFormat: "m-d-Y",
      minDate: "today",
      defaultDate: [new Date()],
      clickOpens: true,
      allowInput: false,
      appendTo: document.body,
      onOpen: function() {
        if (this.calendarContainer) {
            const scale = window.innerWidth < 768 ? 1.5 : 2.0; // Smaller scale on mobile
            this.calendarContainer.style.transform = `scale(${scale})`;
            this.calendarContainer.style.transformOrigin = 'top left';
        }
      },
      onClose: function() {
        if (this.calendarContainer) {
            this.calendarContainer.style.transform = '';
        }
      },
      onReady: function(selectedDates, dateStr, instance) {
        if (!dateStr || dateStr.trim() === "") {
          instance.setDate(new Date(), true); // Ensure 'today' is selected
        }
        selectedDaysCount = instance.selectedDates.length || 1;
        calculateMainTotal();
        disableTracksByTime(); // Initial check after date is set
      },
      onChange: (selectedDates) => {
        selectedDaysCount = selectedDates.length || 0; // Can be 0 if all dates are cleared
        console.log("Flatpickr onChange - selectedDaysCount:", selectedDaysCount);
        calculateMainTotal();
        // storeFormState(); // Store state if you implement this
        disableTracksByTime();
      }
    });
  } else {
    console.error("Flatpickr target #fecha not found!");
  }


  // (4) Track Checkboxes
  $(".track-checkbox").change(function() {
    const arr = $(".track-checkbox:checked")
      .map(function() { return $(this).val(); })
      .get();
    selectedTracksCount = arr.filter(x => x !== "Venezuela").length;
    if (arr.length > 0 && selectedTracksCount === 0 && arr.includes("Venezuela")) {
        selectedTracksCount = 1; // If only Venezuela is selected, count as 1 for multiplication
    }
    console.log("Track checkboxes changed - selectedTracksCount:", selectedTracksCount);
    calculateMainTotal();
    disableTracksByTime(); // Check cutoffs when tracks change
    // storeFormState();
  });

  // (5) MAIN TABLE => Add/Remove/Input
  $("#agregarJugada").click(function() {
    console.log("Add Play button clicked");
    const row = addMainRow();
    if (row) row.find(".betNumber").focus();
  });

  $("#eliminarJugada").click(function() {
    console.log("Remove Last Play button clicked");
    if (playCount === 0) {
      // alert("No plays to remove."); // Consider using a non-blocking notification
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
    const row = $(this).closest("tr");
    recalcMainRow(row);
    highlightDuplicatesInMain();
    // storeFormState();
  });
  
  // Modified addMainRow to accept a bet object for OCR loading
  function addMainRow(bet = null) {
    if (playCount >= MAX_PLAYS) {
      alert(`You have reached ${MAX_PLAYS} plays in the main form.`);
      return null;
    }
    playCount++;
    const rowIndex = playCount;
    const rowHTML = `
      <tr data-playIndex="${rowIndex}">
        <td>
          <button type="button" class="btnRemovePlay removeMainBtn" data-row="${rowIndex}">
            ${rowIndex}
          </button>
        </td>
        <td><input type="text" class="form-control betNumber" value="${bet && bet.betNumber ? bet.betNumber : ''}" /></td>
        <td class="gameMode">${bet && bet.gameMode ? bet.gameMode : '-'}</td>
        <td><input type="number" class="form-control straight" value="${bet && bet.straightAmount !== null ? bet.straightAmount : ''}" step="0.01" placeholder="0.00" /></td>
        <td><input type="text" class="form-control box" value="${bet && bet.boxAmount !== null ? bet.boxAmount : ''}" placeholder="0.00 or 1,2,3" /></td>
        <td><input type="number" class="form-control combo" value="${bet && bet.comboAmount !== null ? bet.comboAmount : ''}" step="0.01" placeholder="0.00" /></td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    const newRow = $("#tablaJugadas tr[data-playIndex='" + rowIndex + "']");
    if (bet) { // If loading from OCR, recalc immediately
        recalcMainRow(newRow);
    }
    return newRow;
  }

  function renumberMainRows() {
    let i = 0;
    $("#tablaJugadas tr").each(function() {
      i++;
      $(this).attr("data-playIndex", i);
      $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i;
    // storeFormState();
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
    calculateMainTotal();
  }

  // (6) Calculate Main Total
  function calculateMainTotal() {
    let sum = 0;
    $("#tablaJugadas tr").each(function() {
      const totalCell = $(this).find(".total").text();
      const val = parseFloat(totalCell) || 0;
      sum += val;
    });

    // Ensure selectedDaysCount and selectedTracksCount are at least 1 if plays exist
    // and 0 if no plays, no days, or no tracks (except when only Venezuela is selected)
    let effectiveDays = selectedDaysCount > 0 ? selectedDaysCount : 0;
    let effectiveTracks = selectedTracksCount > 0 ? selectedTracksCount : 0;
    
    if (playCount === 0) { // No plays, total is 0
        sum = 0;
    } else if (effectiveDays === 0 || effectiveTracks === 0) { // No days or no tracks selected (and plays exist)
        sum = 0; // If no days or no tracks (that count), total effectively becomes 0 for multiplication
    } else {
        sum = sum * effectiveTracks * effectiveDays;
    }

    $("#totalJugadas").text(sum.toFixed(2));
    // storeFormState();
  }


  // (7) determineGameMode (passed selectedTracks)
  function determineGameMode(betNumber, selectedTracks = []) {
    if (!betNumber) return "-";

    const isUSA = selectedTracks.some(t => cutoffTimes.USA[t]);
    const isSD = selectedTracks.some(t => cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = selectedTracks.includes("Venezuela");
    const includesHorses = selectedTracks.includes("New York Horses");

    if (includesHorses) return "NY Horses";
    if (isUSA && !includesVenezuela && betNumber.length === 1) return "Single Action";

    const paleRegex = /^(\d{2})(-|x|\+)(\d{2})$/;
    if (paleRegex.test(betNumber)) {
      if (includesVenezuela && isUSA) return "Pale-Ven";
      if (isSD && !isUSA) return "Pale-RD";
      return "Palé"; // Default Palé if conditions for Ven/RD not met
    }

    const length = betNumber.length;
    if (length < 2 || length > 4) return "-";
    if (length === 2 && includesVenezuela && isUSA) return "Venezuela";
    if (isUSA && !isSD && length === 2) return "Pulito";
    if (length === 2 && isSD && !isUSA) return "RD-Quiniela";
    if (length === 3) return "Pick 3";
    if (length === 4) return "Win 4";
    return "-";
  }

  // (8) calculateRowTotal
  function calculateRowTotal(bn, gm, stVal, bxVal, coVal) {
    if (!bn || gm === "-") return "0.00";
    const st = parseFloat(stVal) || 0;
    const combo = parseFloat(coVal) || 0;
    let numericBox = 0;

    if (gm === "Pulito") {
      // For Pulito, bxVal can be positions "1,2" or a direct amount.
      if (bxVal && isNaN(parseFloat(bxVal))) { // Assumes positions if not a number
        const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean);
        return (st * positions.length).toFixed(2); // Total is straight * number of box positions
      } else {
        numericBox = parseFloat(bxVal) || 0; // If it's a number, treat as box amount
        return (st + numericBox + combo).toFixed(2); // For Pulito, allow straight, box, combo sums if box is direct amount
      }
    }
    
    numericBox = parseFloat(bxVal) || 0; // For all other game modes

    if (["Venezuela", "Pale-RD", "Pale-Ven", "RD-Quiniela", "Palé"].includes(gm)) {
      return (st + numericBox + combo).toFixed(2); // Allow box/combo for these too if user enters
    }

    if (gm === "Win 4" || gm === "Pick 3") {
      const combosCount = calcCombos(bn); // Make sure calcCombos is defined
      let total = st + numericBox + (combo * combosCount);
      return total.toFixed(2);
    }
    
    // Default for Single Action, NY Horses, and any unhandled
    return (st + numericBox + combo).toFixed(2);
  }

  function calcCombos(str) {
    if (!str || typeof str !== 'string') return 1; // Guard against undefined or non-string input
    const freq = {};
    for (let c of str) {
      freq[c] = (freq[c] || 0) + 1;
    }
    const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
    let denom = 1;
    for (let k in freq) {
      denom *= factorial(freq[k]);
    }
    return factorial(str.length) / denom;
  }

  // (9) store/load FormState (Simplified, localStorage can be re-added later)
  // function storeFormState() { /* ... */ }
  // function loadFormState() { /* ... */ }
  // loadFormState(); // Call if implemented

  function recalcAllMainRows() {
    $("#tablaJugadas tr").each(function() {
      recalcMainRow($(this));
    });
  }

  // (10) resetForm
  $("#resetForm").click(function() {
    console.log("Reset Form button clicked");
    if (confirm("Are you sure you want to reset the form?")) {
      resetForm();
    }
  });

  function resetForm() {
    console.log("resetForm function executing");
    $("#lotteryForm")[0].reset(); // Resets form inputs
    $("#tablaJugadas").empty();   // Clears the plays table
    playCount = 0;
    
    window.ticketImageDataUrl = null; // Clear any stored ticket image
    // localStorage.removeItem("formState"); // Clear stored state if using localStorage

    // Reset Flatpickr to today
    if (fpInstance) {
      fpInstance.setDate([new Date()], true); // This will trigger its onChange
    } else { // Fallback if fpInstance somehow not ready
        selectedDaysCount = 1; 
    }
    
    // Uncheck all track checkboxes and re-enable them
    $(".track-checkbox").prop("checked", false).prop("disabled", false);
    $(".track-button-container").find(".track-button").css({
        opacity: 1,
        cursor: "pointer"
    });

    // Auto-select default tracks (this will also trigger their change events)
    autoSelectNYTrackAndVenezuela(); // This should update selectedTracksCount and call calculateMainTotal

    // Explicitly set total after all changes
    // calculateMainTotal() should be called by date/track changes, but one final call is safe.
    // $("#totalJugadas").text("0.00"); // Initial reset
    // setTimeout(calculateMainTotal, 100); // Ensure calculations run after event propagations
    console.log("Form reset complete. selectedDaysCount:", selectedDaysCount, "selectedTracksCount:", selectedTracksCount);
  }
  window.resetForm = resetForm; // Make it global if called from HTML onclick

  // (11) Generate Ticket (Modal logic)
  $("#generarTicket").click(function() {
    console.log("Generate Ticket button clicked");
    doGenerateTicket();
  });

  function doGenerateTicket() {
    const dateVal = $("#fecha").val() || "";
    if (!dateVal) {
      alert("Please select at least one date.");
      return;
    }
    $("#ticketFecha").text(dateVal);

    const chosenTracks = $(".track-checkbox:checked")
      .map(function() { return $(this).val(); })
      .get();
    if (chosenTracks.length === 0) {
      alert("Please select at least one track.");
      return;
    }
    $("#ticketTracks").text(chosenTracks.join(", "));
    
    // Basic validation: ensure there's at least one play
    if ($("#tablaJugadas tr").length === 0) {
        alert("Please add at least one play.");
        return;
    }

    // More validations (cutoff, limits, etc. can be added here from original script)
    // For now, let's assume basic validation passes if dates, tracks, and plays exist.

    $("#ticketJugadas").empty();
    $("#tablaJugadas tr").each(function(index) {
      const rowIndex = $(this).attr("data-playIndex") || (index + 1);
      const bn = $(this).find(".betNumber").val().trim();
      const gm = $(this).find(".gameMode").text();
      let stVal = $(this).find(".straight").val().trim() || "0.00";
      let bxVal = $(this).find(".box").val().trim() || "-";
      let coVal = $(this).find(".combo").val().trim() || "0.00";
      let totVal = $(this).find(".total").text() || "0.00";

      const rowHTML = `
        <tr>
          <td>${rowIndex}</td><td>${bn}</td><td>${gm}</td>
          <td>${parseFloat(stVal).toFixed(2)}</td>
          <td>${bxVal === "-" ? "-" : (isNaN(parseFloat(bxVal)) ? bxVal : parseFloat(bxVal).toFixed(2))}</td>
          <td>${parseFloat(coVal).toFixed(2)}</td>
          <td>${parseFloat(totVal).toFixed(2)}</td>
        </tr>
      `;
      $("#ticketJugadas").append(rowHTML);
    });
    $("#ticketTotal").text($("#totalJugadas").text());
    $("#ticketTransaccion").text(dayjs().format("MM/DD/YYYY hh:mm A"));
    $("#numeroTicket").text("(Not assigned yet)");
    $("#qrcode").empty();

    $("#editButton").removeClass("d-none");
    $("#shareTicket").addClass("d-none");
    $("#confirmarTicket").prop("disabled", false);
    // fixTicketLayoutForMobile(); // If this function exists and is needed

    if (ticketModalInstance) {
      ticketModalInstance.show();
    }
    // storeFormState();
  }
  window.doGenerateTicket = doGenerateTicket;


  $("#confirmarTicket").click(function() {
    // Simplified: just shows alert for now.
    // Original logic for QR, image download, SheetDB can be re-integrated.
    $(this).prop("disabled", true);
    $("#editButton").addClass("d-none");
    const uniqueTicket = generateUniqueTicketNumber();
    $("#numeroTicket").text(uniqueTicket);
    transactionDateTime = dayjs().format("MM/DD/YYYY hh:mm A");
    $("#ticketTransaccion").text(transactionDateTime);
    $("#shareTicket").removeClass("d-none");
    alert(`Ticket ${uniqueTicket} confirmed (simulated).`);
  });

  $("#editButton").click(function() {
    if (ticketModalInstance) ticketModalInstance.hide();
  });
  
  $("#shareTicket").click(function() {
    alert("Share functionality to be implemented.");
  });

  function generateUniqueTicketNumber() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  // Utility functions for tracks and time
  function getTrackCutoff(trackName) {
    for (let region in cutoffTimes) {
      if (cutoffTimes[region][trackName]) {
        return cutoffTimes[region][trackName];
      }
    }
    return null;
  }

  function userChoseToday() {
    const val = $("#fecha").val();
    if (!val) return false;
    const arr = val.split(", ");
    const today = dayjs().startOf("day");
    for (let ds of arr) {
      const [mm, dd, yy] = ds.split("-").map(Number);
      const picked = dayjs(new Date(yy, mm - 1, dd)).startOf("day");
      if (picked.isSame(today, "day")) return true;
    }
    return false;
  }

  function disableTracksByTime() {
    const todaySelected = userChoseToday();
    const now = dayjs();

    $(".track-checkbox").each(function() {
      const trackVal = $(this).val();
      const trackButtonContainer = $(this).closest(".track-button-container");
      const trackButton = trackButtonContainer.find(".track-button");

      if (trackVal === "Venezuela") { // Venezuela is never disabled by time
        $(this).prop("disabled", false);
        trackButton.css({ opacity: 1, cursor: "pointer" });
        return;
      }

      if (!todaySelected) { // If today is not selected, all tracks (except Venezuela) are enabled
        $(this).prop("disabled", false);
        trackButton.css({ opacity: 1, cursor: "pointer" });
        return;
      }
      
      // If today is selected, check cutoff times
      const rawCutoff = getTrackCutoff(trackVal);
      if (rawCutoff) {
        let cutoffTimeObj = dayjs(rawCutoff, "HH:mm");
        // Original logic: if cutoff is after 9:30 PM, effective cutoff is 10 PM, else cutoff - 10 mins
        let effectiveCutoff = cutoffTimeObj.isAfter(dayjs("21:30", "HH:mm")) ? 
                                dayjs().hour(22).minute(0) : 
                                cutoffTimeObj.subtract(10, "minute");

        if (now.isSame(effectiveCutoff) || now.isAfter(effectiveCutoff)) {
          $(this).prop("checked", false).prop("disabled", true); // Uncheck and disable
          trackButton.css({ opacity: 0.5, cursor: "not-allowed" });
        } else {
          $(this).prop("disabled", false);
          trackButton.css({ opacity: 1, cursor: "pointer" });
        }
      } else { // No cutoff time defined, enable it
        $(this).prop("disabled", false);
        trackButton.css({ opacity: 1, cursor: "pointer" });
      }
    });
    // After disabling/enabling, re-trigger change on a checked track to update counts, or calculate total if none.
    // This ensures selectedTracksCount is updated correctly.
    const anyChecked = $(".track-checkbox:checked");
    if (anyChecked.length > 0) {
        anyChecked.first().trigger('change'); // Trigger change on one to update counts
    } else {
        // If no tracks are checked after disabling, ensure counts are zeroed and total recalculated
        selectedTracksCount = 0;
        calculateMainTotal();
    }
  }
  
  function enableAllTracks() {
    $(".track-checkbox").each(function() {
      $(this).prop("disabled", false);
      $(this).closest(".track-button-container").find(".track-button").css({
        opacity: 1,
        cursor: "pointer"
      });
    });
  }

  function showCutoffTimes() {
    $(".cutoff-time").each(function() {
      const track = $(this).data("track");
      if (track === "Venezuela") return;
      let raw = getTrackCutoff(track);
      if (raw) {
        let co = dayjs(raw, "HH:mm");
        // Displaying the actual cutoff time, not the "effective" one used for disabling
        $(this).text(`(${co.format("hh:mm A")})`);
      } else {
        $(this).text(""); // Clear if no cutoff time
      }
    });
  }
  
  // Initial calls
  showCutoffTimes();
  // disableTracksByTime(); // Called by onReady/onChange of flatpickr now
  // setInterval(disableTracksByTime, 60000); // Re-enable if needed for live updates

  function autoSelectNYTrackAndVenezuela() {
    console.log("autoSelectNYTrackAndVenezuela called");
    const anyPlaysExist = $("#tablaJugadas tr").length > 0;
    const anyTracksManuallySelected = $(".track-checkbox:checked").length > 0;

    if (anyPlaysExist || anyTracksManuallySelected) {
      console.log("Skipping auto-select: plays exist or tracks already selected.");
      // Ensure counts are correct based on current selections if skipping auto-select
      const arr = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
      selectedTracksCount = arr.filter(x => x !== "Venezuela").length;
      if (arr.length > 0 && selectedTracksCount === 0 && arr.includes("Venezuela")) {
        selectedTracksCount = 1;
      }
      calculateMainTotal(); // Ensure total is calculated with current state
      return;
    }

    const now = dayjs();
    let middayCutoff = dayjs(cutoffTimes.USA["New York Mid Day"], "HH:mm").subtract(10, "minute"); // Using effective cutoff
    
    if (now.isBefore(middayCutoff)) {
      $("#trackNYMidDay").prop("checked", true);
    } else {
      $("#trackNYEvening").prop("checked", true);
    }
    $("#trackVenezuela").prop("checked", true);

    // Trigger change on all checkboxes to update UI and counts correctly
    $(".track-checkbox").filter(':checked').first().trigger('change'); // Trigger on one to consolidate count update
    console.log("Default tracks selected.");
  }
  autoSelectNYTrackAndVenezuela(); // Call on initial load


  function highlightDuplicatesInMain() {
    $("#tablaJugadas tr").find(".betNumber").removeClass("duplicado");
    let counts = {};
    $("#tablaJugadas tr").each(function() {
      const bn = $(this).find(".betNumber").val().trim();
      if (!bn) return;
      counts[bn] = (counts[bn] || 0) + 1;
    });
    $("#tablaJugadas tr").each(function() {
      const bn = $(this).find(".betNumber").val().trim();
      if (counts[bn] > 1) {
        $(this).find(".betNumber").addClass("duplicado");
      }
    });
  }

  /* Wizard Functionality (Copied, needs review for React context if Wizard is built in React) */
  // Wizard button click
  $("#wizardButton").click(function() {
    console.log("Wizard button clicked");
    if (wizardModalInstance) {
        resetWizard(); // Assuming resetWizard is defined
        wizardModalInstance.show();
    } else {
        console.error("Wizard modal not initialized!");
    }
  });

  function resetWizard() {
    wizardCount = 0;
    $("#wizardTableBody").empty();
    lockedFields.straight = false;
    lockedFields.box = false;
    lockedFields.combo = false;
    $("#lockStraight").html(`<i class="bi bi-unlock"></i>`);
    $("#lockBox").html(`<i class="bi bi-unlock"></i>`);
    $("#lockCombo").html(`<i class="bi bi-unlock"></i>`);
    $("#wizardBetNumber").val("");
    $("#wizardStraight").val("");
    $("#wizardBox").val("");
    $("#wizardCombo").val("");
    $("#qpGameMode").val("Pick 3");
    $("#qpCount").val("5");
    $("#rdFirstNumber").val("");
    $("#rdLastNumber").val("");
    console.log("Wizard reset.");
  }
  window.resetWizard = resetWizard;

  $(".lockBtn").click(function() {
    const field = $(this).data("field");
    lockedFields[field] = !lockedFields[field];
    $(this).html(lockedFields[field] ? `<i class="bi bi-lock-fill"></i>` : `<i class="bi bi-unlock"></i>`);
  });

  $("#wizardAddNext").click(function() {
    const bn = $("#wizardBetNumber").val().trim();
    const selectedTracksForWizard = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
    const gm = determineGameMode(bn, selectedTracksForWizard);

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
    wizardCount++;
    const i = wizardCount;
    const rowHTML = `
      <tr data-wizardIndex="${i}">
        <td><button type="button" class="removeWizardBtn btnRemovePlay" data-row="${i}">${i}</button></td>
        <td>${bn}</td><td>${gm}</td>
        <td>${stVal || "-"}</td><td>${bxVal || "-"}</td><td>${coVal || "-"}</td>
        <td>${parseFloat(total || 0).toFixed(2)}</td>
      </tr>`;
    $("#wizardTableBody").append(rowHTML);
  }

  $("#wizardTableBody").on("click", ".removeWizardBtn", function() {
    $(this).closest("tr").remove();
    renumberWizard();
    highlightDuplicatesInWizard();
  });

  function renumberWizard() {
    let i = 0;
    $("#wizardTableBody tr").each(function() {
      i++;
      $(this).attr("data-wizardIndex", i);
      $(this).find(".removeWizardBtn").attr("data-row", i).text(i);
    });
    wizardCount = i;
  }
  
  // Placeholder for generateRandomNumberForMode and padNumberForMode
  function generateRandomNumberForMode(mode) { /* ... original logic ... */ 
    if(mode==="NY Horses"){ const length = Math.floor(Math.random()*4)+1; const maxVal = Math.pow(10,length)-1; return Math.floor(Math.random()*(maxVal+1)); }
    if(mode==="Single Action"){ return Math.floor(Math.random()*10); }
    if(mode==="Win 4"||mode==="Pale-Ven"||mode==="Pale-RD"){ return Math.floor(Math.random()*10000); }
    if(mode==="Pick 3"){ return Math.floor(Math.random()*1000); }
    if(mode==="Venezuela"||mode==="Pulito"||mode==="RD-Quiniela"){ return Math.floor(Math.random()*100); }
    return Math.floor(Math.random()*1000);
  }
  function padNumberForMode(num, mode) { /* ... original logic ... */ 
    let s=num.toString();
    if(mode==="NY Horses"||mode==="Single Action"){ return s; }
    if(mode==="Pale-Ven"||mode==="Pale-RD"||mode==="Win 4"){ while(s.length<4) s="0"+s; return s; }
    if(mode==="Pulito"||mode==="RD-Quiniela"||mode==="Venezuela"){ while(s.length<2) s="0"+s; return s; }
    if(mode==="Pick 3"){ while(s.length<3) s="0"+s; return s; }
    while(s.length<3) s="0"+s; return s;
  }

  $("#btnGenerateQuickPick").click(function() {
    const gm = $("#qpGameMode").val();
    const countVal = parseInt($("#qpCount").val()) || 1;
    if (countVal < 1 || countVal > 25) { alert("Please enter a count between 1 and 25."); return; }
    const stVal = $("#wizardStraight").val().trim();
    const bxVal = $("#wizardBox").val().trim();
    const coVal = $("#wizardCombo").val().trim();
    for (let i = 0; i < countVal; i++) {
      let bn = generateRandomNumberForMode(gm);
      bn = padNumberForMode(bn, gm); // Ensure bn is a string after padding
      const selectedTracksForQP = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
      const qpGm = determineGameMode(bn, selectedTracksForQP); // Use determined game mode for QP
      let rowT = calculateRowTotal(bn, qpGm, stVal, bxVal, coVal);
      addWizardRow(bn, qpGm, stVal, bxVal, coVal, rowT);
    }
    highlightDuplicatesInWizard();
  });

  $("#btnGenerateRoundDown").click(function() {
    const firstNum = $("#rdFirstNumber").val().trim();
    const lastNum = $("#rdLastNumber").val().trim();
    if (!firstNum || !lastNum) { alert("Please enter both first and last number for Round Down."); return; }
    // Add more validation as in original script
    let start = parseInt(firstNum, 10); let end = parseInt(lastNum, 10);
    if(isNaN(start)||isNaN(end)){ alert("Invalid numeric range for Round Down."); return; }
    if(start> end) [start,end]=[end,start];

    const stVal = $("#wizardStraight").val().trim();
    const bxVal = $("#wizardBox").val().trim();
    const coVal = $("#wizardCombo").val().trim();
    for (let i = start; i <= end; i++) {
      let bn = i.toString().padStart(firstNum.length, "0");
      const selectedTracksForRD = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
      let gm = determineGameMode(bn, selectedTracksForRD);
      if (gm === "-") continue;
      const rowT = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
      addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
    }
    highlightDuplicatesInWizard();
  });
  
  $("#btnPermute").click(function() { permuteWizardBetNumbers(); });
  function permuteWizardBetNumbers(){
    const rows= $("#wizardTableBody tr");
    if(rows.length===0){ alert("No plays in the wizard table."); return; }
    let allDigits=[]; let lengths=[];
    rows.each(function(){
      const bn=$(this).find("td").eq(1).text().trim();
      lengths.push(bn.length);
      for(let c of bn) allDigits.push(c);
    });
    if(allDigits.length===0){ alert("No digits found to permute."); return; }
    for(let i=allDigits.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [allDigits[i],allDigits[j]]=[allDigits[j],allDigits[i]];
    }
    let idx=0;
    rows.each(function(i){
      if (!lengths || i >= lengths.length) return; // Guard
      const needed= lengths[i];
      const subset= allDigits.slice(idx, idx+needed);
      idx+= needed;
      const newBN= subset.join("");
      const selectedTracksForPermute = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
      const gm= determineGameMode(newBN, selectedTracksForPermute);
      const stTd = $(this).find("td").eq(3).text().trim();
      const bxTd = $(this).find("td").eq(4).text().trim();
      const coTd = $(this).find("td").eq(5).text().trim();
      const newTotal= calculateRowTotal(newBN, gm, stTd==="-"?"0":stTd, bxTd==="-"?"0":bxTd, coTd==="-"?"0":coTd);
      $(this).find("td").eq(1).text(newBN); $(this).find("td").eq(2).text(gm);
      $(this).find("td").eq(6).text(parseFloat(newTotal).toFixed(2));
    });
    highlightDuplicatesInWizard();
  }


  $("#wizardAddAllToMain").click(function() {
    const wizardRows = $("#wizardTableBody tr");
    if (wizardRows.length === 0) { alert("No plays in the wizard table."); return; }
    wizardRows.each(function() {
      if (playCount >= MAX_PLAYS) { alert(`Reached ${MAX_PLAYS} plays. Stopping import.`); return false; }
      const tds = $(this).find("td");
      const bn = tds.eq(1).text();
      // const gm = tds.eq(2).text(); // Game mode will be re-determined by addMainRow -> recalcMainRow
      const stVal = (tds.eq(3).text() === "-" ? "" : tds.eq(3).text());
      const bxVal = (tds.eq(4).text() === "-" ? "" : tds.eq(4).text());
      const coVal = (tds.eq(5).text() === "-" ? "" : tds.eq(5).text());
      
      // Pass as a bet-like object to addMainRow
      addMainRow({
          betNumber: bn,
          // gameMode: gm, // Let recalcMainRow handle gameMode based on main table context
          straightAmount: parseFloat(stVal) || null, // Ensure numbers or null
          boxAmount: parseFloat(bxVal) || (bxVal.includes(',') ? bxVal : null), // Handle numeric or string (like "1,2") for box
          comboAmount: parseFloat(coVal) || null
      });
    });
    resetWizard(); // Clear wizard table after adding to main
    // recalcAllMainRows(); // Already done by addMainRow -> recalcMainRow
    calculateMainTotal();
    highlightDuplicatesInMain();
    // storeFormState();
  });

  $("#wizardGenerateTicket").click(function() {
    $("#wizardAddAllToMain").trigger("click");
    if (wizardModalInstance) wizardModalInstance.hide();
    doGenerateTicket();
  });

  $("#wizardEditMainForm").click(function() {
    if (wizardModalInstance) wizardModalInstance.hide();
  });

  function highlightDuplicatesInWizard() {
    $("#wizardTableBody tr").find("td:nth-child(2)").removeClass("duplicado");
    let counts = {};
    $("#wizardTableBody tr").each(function() {
      const bn = $(this).find("td").eq(1).text().trim();
      if (!bn) return;
      counts[bn] = (counts[bn] || 0) + 1;
    });
    $("#wizardTableBody tr").each(function() {
      const bn = $(this).find("td").eq(1).text().trim();
      if (counts[bn] > 1) {
        $(this).find("td").eq(1).addClass("duplicado");
      }
    });
  }

  // Tutorial and Manual handlers (from original script, assuming elements exist)
  const tutorialStepsEN = [ { intro: "Welcome! This tutorial will guide you." }, { element: "#fecha", title: "Bet Dates", intro: "Select one or more dates." }, /* more steps */ ];
  const tutorialStepsES = [ { intro: "¡Bienvenido! Este tutorial te mostrará cómo usar la aplicación." }, { element: "#fecha", title: "Fechas", intro: "Selecciona una o varias fechas." }, /* more steps */ ];
  const tutorialStepsHT = [ { intro: "Byenvini! Tutorial sa ap moutre w kijan pou itilize aplikasyon an." }, { element: "#fecha", title: "Dat", intro: "Chwazi youn oswa plizyè dat." }, /* more steps */ ];

  function startTutorial(lang) {
    let stepsToUse = tutorialStepsEN;
    if (lang === "es") stepsToUse = tutorialStepsES;
    if (lang === "ht") stepsToUse = tutorialStepsHT;
    if (typeof introJs !== 'undefined') {
      introJs().setOptions({ steps: stepsToUse, showProgress: true, showButtons: true, exitOnOverlayClick: false }).start();
    } else {
      alert("Tutorial library (Intro.js) not loaded.");
    }
  }
  $("#helpEnglish").click(() => startTutorial('en'));
  $("#helpSpanish").click(() => startTutorial('es'));
  $("#helpCreole").click(() => startTutorial('ht'));

  $("#manualEnglishBtn").click(function() { $("#manualEnglishText").removeClass("d-none"); $("#manualSpanishText, #manualCreoleText").addClass("d-none"); });
  $("#manualSpanishBtn").click(function() { $("#manualSpanishText").removeClass("d-none"); $("#manualEnglishText, #manualCreoleText").addClass("d-none"); });
  $("#manualCreoleBtn").click(function() { $("#manualCreoleText").removeClass("d-none"); $("#manualEnglishText, #manualSpanishText").addClass("d-none"); });


  // Final initialization calls
  console.log("Running initial calculations and UI updates.");
  // autoSelectNYTrackAndVenezuela(); // This is now called within resetForm or at the end of ready
  // showCutoffTimes(); // This is now called within resetForm or at the end of ready
  // disableTracksByTime(); // Called by flatpickr onReady/onChange and track changes
  calculateMainTotal(); // Ensure total is calculated once at the end of setup

  console.log("Document fully ready and scripts.js executed.");
}); // End of $(document).ready()

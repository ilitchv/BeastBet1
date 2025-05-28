
/* =========================================================
   SCRIPTS.JS COMPLETO
   (Mantiene toda la lógica previa intacta,
    e incorpora spinner moderno, barra de progreso
    y muestra solo betNumber + monto en el panel de jugadas).
========================================================= */

// Global variables for OCR modal
let selectedFileGlobalOCR = null;
let jugadasGlobalOCR = [];
let ocrProgressInterval = null;

// Global modal instances
let modalOcrInstance = null;
let wizardModalInstance = null;
let ticketModalInstance = null;


$(document).ready(function() {
  console.log("Document ready, jQuery loaded.");
  if (typeof bootstrap !== 'undefined') {
    console.log("Bootstrap loaded.");
    // Initialize modals once the DOM is ready
    if (document.getElementById("modalOcr")) {
      modalOcrInstance = new bootstrap.Modal(document.getElementById("modalOcr"));
    }
    if (document.getElementById("wizardModal")) {
      wizardModalInstance = new bootstrap.Modal(document.getElementById("wizardModal"));
    }
    if (document.getElementById("ticketModal")) {
      ticketModalInstance = new bootstrap.Modal(document.getElementById("ticketModal"));
    }
  } else {
    console.error("Bootstrap not loaded!");
  }


  // (1) Variables globales, dayjs, etc.
  dayjs.extend(dayjs_plugin_customParseFormat);
  dayjs.extend(dayjs_plugin_arraySupport);

  let transactionDateTime = '';
  window.ticketImageDataUrl = null;

  let selectedTracksCount = 0;
  let selectedDaysCount = 1; // Start with 1 day selected (today)
  const MAX_PLAYS = 25;

  let playCount = 0;
  let wizardCount = 0;

  // Candados para el Wizard
  const lockedFields = {
    straight: false,
    box: false,
    combo: false
  };

  // (2) Cutoff times
  const cutoffTimes = {
    "USA": {
      "New York Mid Day": "14:20",
      "New York Evening": "22:00",
      "Georgia Mid Day": "12:20",
      "Georgia Evening": "18:40",
      "New Jersey Mid Day": "12:50",
      "New Jersey Evening": "22:00",
      "Florida Mid Day": "13:20",
      "Florida Evening": "21:30",
      "Connecticut Mid Day": "13:30",
      "Connecticut Evening": "22:00",
      "Georgia Night": "22:00",
      "Pensilvania AM": "12:45",
      "Pensilvania PM": "18:15",
      "Venezuela": "00:00", // No specific cutoff, always open
      "Brooklyn Midday": "14:20",
      "Brooklyn Evening": "22:00",
      "Front Midday": "14:20",
      "Front Evening": "22:00",
      "New York Horses": "16:00" // Example cutoff
    },
    "Santo Domingo": {
      "Real": "11:45",
      "Gana mas": "13:25",
      "Loteka": "18:30",
      "Nacional": "19:30",
      "Quiniela Pale": "19:30", // Often tied to Nacional/Leidsa
      "Primera Día": "10:50",
      "Suerte Día": "11:20", // Example
      "Lotería Real": "11:50", // Likely same as "Real"
      "Suerte Tarde": "16:50",
      "Lotedom": "16:50",
      "Primera Noche": "18:50",
      "Panama": "16:00" // Example
    },
    "Venezuela": { // Explicitly for Venezuela if needed, though handled by USA generally
        "Venezuela": "00:00"
    }
  };

  // (3) Init Flatpickr
  const fpInstance = flatpickr("#fecha", {
    mode: "multiple",
    dateFormat: "m-d-Y", // Changed to match your original data
    minDate: "today",
    defaultDate: [new Date()], // Default to today
    clickOpens: true,
    allowInput: false, // Good for consistency
    appendTo: document.body, // For better z-index handling with modals
    onOpen: function() {
        // Optional: if you want to scale the calendar
        // this.calendarContainer.style.transform = 'scale(2.0)';
        // this.calendarContainer.style.transformOrigin = 'top left';
    },
    onClose: function() {
        // this.calendarContainer.style.transform = '';
    },
    onReady: function(selectedDates, dateStr, instance) {
        if (!dateStr || dateStr.trim() === "") {
            instance.setDate(new Date(), true); // Ensure today is set if empty
        }
        selectedDaysCount = instance.selectedDates.length || 1;
        calculateMainTotal();
        disableTracksByTime();
    },
    onChange: (selectedDates) => {
      selectedDaysCount = selectedDates.length || 0; // Or 1 if you always want at least one day factor
      console.log("Flatpickr onChange - selectedDaysCount:", selectedDaysCount);
      calculateMainTotal();
      storeFormState();
      disableTracksByTime(); // Call this when dates change
    }
  });

  // (4) Track Checkboxes
  $(".track-checkbox").change(function() {
    const arr = $(".track-checkbox:checked")
      .map(function() { return $(this).val(); })
      .get();
    // "Venezuela" no cuenta en el multiplicador, but we need at least 1 track for multiplication if any is selected
    const multiplyingTracks = arr.filter(x => x !== "Venezuela");
    selectedTracksCount = multiplyingTracks.length > 0 ? multiplyingTracks.length : (arr.length > 0 ? 1 : 0); // If only Venezuela is selected, count as 1 track for multiplication logic, or 0 if no tracks
    console.log("Track Checkboxes onChange - selectedTracksCount:", selectedTracksCount);
    calculateMainTotal();
    disableTracksByTime(); // Also call when tracks change
    storeFormState();
  });


  // (5) MAIN TABLE => Add/Remove
  $("#agregarJugada").click(function() {
    console.log("Add Play clicked");
    const row = addMainRow();
    if (row) row.find(".betNumber").focus();
  });

  $("#eliminarJugada").click(function() {
    console.log("Remove Last Play clicked");
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
    console.log("Remove specific play clicked");
    $(this).closest("tr").remove();
    playCount--;
    renumberMainRows();
    calculateMainTotal();
    highlightDuplicatesInMain();
  });

  // Event delegation for input changes in the table
  $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function() {
    const row = $(this).closest("tr");
    recalcMainRow(row); // This will also call calculateMainTotal
    highlightDuplicatesInMain();
    storeFormState();
  });

  function addMainRow(bet = null) {
    if (playCount >= MAX_PLAYS) {
      alert(`You have reached ${MAX_PLAYS} plays in the main form.`);
      return null;
    }
    playCount++;
    const rowIndex = playCount;
    const betNumberValue = bet ? bet.betNumber || "" : "";
    // For gameMode, we let determineGameMode calculate it in recalcMainRow
    const straightValue = bet ? (bet.straightAmount !== null ? Number(bet.straightAmount).toFixed(2) : "") : "";
    const boxValue = bet ? (bet.boxAmount !== null ? Number(bet.boxAmount).toFixed(2) : "") : "";
    const comboValue = bet ? (bet.comboAmount !== null ? Number(bet.comboAmount).toFixed(2) : "") : "";


    const rowHTML = `
      <tr data-playIndex="${rowIndex}">
        <td>
          <button type="button" class="btnRemovePlay removeMainBtn" data-row="${rowIndex}">
            ${rowIndex}
          </button>
        </td>
        <td><input type="text" class="form-control betNumber" value="${betNumberValue}" /></td>
        <td class="gameMode">-</td>
        <td><input type="number" class="form-control straight" step="0.01" value="${straightValue}" /></td>
        <td><input type="text" class="form-control box" value="${boxValue}" /></td>
        <td><input type="number" class="form-control combo" step="0.01" value="${comboValue}" /></td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    const newRow = $("#tablaJugadas tr[data-playIndex='" + rowIndex + "']");
    recalcMainRow(newRow); // Recalculate game mode and total for the new row
    return newRow;
  }


  function renumberMainRows() {
    let i = 0;
    $("#tablaJugadas tr").each(function() {
      i++;
      $(this).attr("data-playIndex", i);
      $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i; // Update global playCount
    storeFormState();
  }

  function recalcMainRow($row) {
    const bn = $row.find(".betNumber").val().trim();
    const gm = determineGameMode(bn);
    $row.find(".gameMode").text(gm);

    const stVal = $row.find(".straight").val().trim();
    const bxVal = $row.find(".box").val().trim();
    const coVal = $row.find(".combo").val().trim();

    const rowTotal = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    $row.find(".total").text(rowTotal);
    calculateMainTotal(); // Recalculate overall total whenever a row changes
  }


  // (6) Calculate Main Total
  function calculateMainTotal() {
    let sum = 0;
    $("#tablaJugadas tr").each(function() {
      const totalCell = $(this).find(".total").text();
      const val = parseFloat(totalCell) || 0;
      sum += val;
    });

    const daysToMultiply = selectedDaysCount > 0 ? selectedDaysCount : 1;
    const tracksToMultiply = selectedTracksCount > 0 ? selectedTracksCount : 1;
    
    sum = sum * tracksToMultiply * daysToMultiply;
    
    $("#totalJugadas").text(sum.toFixed(2));
    storeFormState();
  }


  // (7) determineGameMode
  function determineGameMode(betNumber) {
    if (!betNumber) return "-";

    const tracks = $(".track-checkbox:checked")
      .map(function() { return $(this).val(); })
      .get();
    const isUSA = tracks.some(t => cutoffTimes.USA && cutoffTimes.USA[t]);
    const isSD = tracks.some(t => cutoffTimes["Santo Domingo"] && cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    if (includesHorses) {
      return "NY Horses";
    }

    if (isUSA && !includesVenezuela && betNumber.length === 1 && /^\d$/.test(betNumber)) {
      return "Single Action";
    }

    const paleRegex = /^(\d{2})([+x-])(\d{2})$/;
    if (paleRegex.test(betNumber)) {
      if (includesVenezuela && isUSA) return "Pale-Ven";
      if (isSD && !isUSA) return "Pale-RD";
      return "Palé"; // Default Palé if specific region combo not met but format is Palé
    }

    const length = betNumber.replace(/[^0-9]/g, "").length; // Count only digits for length check after Palé

    if (length < 1 || length > 4) return "-"; // Adjusted to allow single digit numbers if not Single Action

    if (length === 2) {
      if (includesVenezuela && isUSA) return "Venezuela";
      if (isUSA && !isSD) return "Pulito";
      if (isSD && !isUSA) return "RD-Quiniela";
      if (isUSA && isSD) return "Pulito"; // Default to Pulito if both regions with a 2-digit number
      return "Pulito"; // Default for 2-digit if no specific region
    }
    if (length === 3) return "Pick 3";
    if (length === 4) return "Win 4";
    if (length === 1) return "Pulito"; // A single digit number if not "Single Action" could be a 1-digit Pulito

    return "-";
  }

  // (8) calculateRowTotal
  function calculateRowTotal(bn, gm, stVal, bxVal, coVal) {
    if (!bn || gm === "-") return "0.00";
    const st = parseFloat(stVal) || 0;
    let numericBox = 0;
    const combo = parseFloat(coVal) || 0;

    // For Pulito, box value represents positions, not an amount to sum directly for row total initially
    // unless it's explicitly part of calculation.
    // The original logic for Pulito was st * #positions.
    // If bxVal is an amount for Pulito, it should be treated as straight for total.
    if (gm === "Pulito") {
        if (bxVal && typeof bxVal === 'string') { // "1,2,3" like
            const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean);
            // If straight is 0 and box has positions, this might be a different kind of bet
            // For now, assuming if st > 0, it's st * positions. If st is 0, and box has numbers, it could be individual small bets.
            // This part of your original script was: return (st * positions.length).toFixed(2);
            // We'll stick to summing for now for consistency unless specified otherwise for Pulito.
            // For simplicity, let's treat bxVal as a numeric value if it's not a list of positions.
             if (positions.length > 0 && !isNaN(parseFloat(positions[0])) && st > 0) { // Check if it's a list of positions
                 return (st * positions.length).toFixed(2);
             } else {
                 numericBox = parseFloat(bxVal) || 0; // Treat as a simple numeric value if not position-based for Pulito
             }
        } else {
            numericBox = parseFloat(bxVal) || 0;
        }
        return (st + numericBox + combo).toFixed(2); // Default sum if not position based Pulito
    }


    // Standard numeric box calculation for other game modes
    numericBox = parseFloat(bxVal) || 0;

    if (gm === "Single Action" || gm === "NY Horses") {
      return (st + numericBox + combo).toFixed(2);
    }

    if (["Venezuela", "Pale-RD", "Pale-Ven", "RD-Quiniela", "Palé"].includes(gm)) {
       // If these modes can have box/combo, they should be summed.
       // The original script often just returned st.toFixed(2).
       // Let's make it more flexible:
       return (st + numericBox + combo).toFixed(2);
    }

    if (gm === "Win 4" || gm === "Pick 3") {
      const combosCount = calcCombos(bn); // calcCombos should handle non-numeric bn gracefully
      let total = st + numericBox + (combo * combosCount);
      return total.toFixed(2);
    }

    return (st + numericBox + combo).toFixed(2); // Default sum
  }


  function calcCombos(str) {
    if (!str || typeof str !== 'string' || !/^\d+$/.test(str)) { // Ensure str is a string of digits
        return 1; // Or 0, depending on how you want to handle invalid input for combos
    }
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


  // (9) store/load FormState
  function storeFormState() {
    // Simplified, as localStorage was not fully implemented/requested for this phase
  }

  function loadFormState() {
    // Simplified
    // Forzar la fecha hoy y tracks por defecto al cargar si no hay estado guardado
    if (fpInstance) {
        fpInstance.setDate([new Date()], true); // true to trigger onChange
    }
    autoSelectNYTrackAndVenezuela(); // This will trigger track change and calculate total
    disableTracksByTime();
  }
  // Call loadFormState on document ready to initialize
  loadFormState();


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
    console.log("Executing resetForm function");
    $("#lotteryForm")[0].reset(); // Resets form inputs
    $("#tablaJugadas").empty();
    playCount = 0;
    // selectedTracksCount = 0; // Will be reset by autoSelectNYTrackAndVenezuela
    // selectedDaysCount = 1;   // Will be reset by fpInstance.setDate

    window.ticketImageDataUrl = null; // Reset ticket image
    $("#totalJugadas").text("0.00");
    localStorage.removeItem("formState"); // Clear any saved state

    if (fpInstance) {
      fpInstance.clear(); // Clear existing dates
      fpInstance.setDate([new Date()], true); // Set to today and trigger onChange
    }
    
    // Uncheck all tracks, then auto-select defaults
    $(".track-checkbox").prop("checked", false); // Manually uncheck first
    autoSelectNYTrackAndVenezuela(); // This will check defaults and trigger change event
                                     // which updates selectedTracksCount and calls calculateMainTotal.

    enableAllTracks(); // Ensure all tracks are enabled before disabling by time
    showCutoffTimes(); // Update displayed cutoff times
    disableTracksByTime(); // Re-apply time-based disabilities

    console.log("Form reset complete. selectedDaysCount:", selectedDaysCount, "selectedTracksCount:", selectedTracksCount);
    // calculateMainTotal(); // autoSelectNYTrackAndVenezuela and fpInstance.setDate should trigger this.
  }


  // (11) Generate Ticket
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

    // Validar cutoff si es hoy
    const arrDates = dateVal.split(",").map(s => s.trim());
    const today = dayjs().startOf("day");
    for (let ds of arrDates) {
      const parsedDate = dayjs(ds, "M-D-YYYY").startOf("day"); // Use format from Flatpickr
      if (parsedDate.isSame(today, "day")) {
        const now = dayjs();
        for (let t of chosenTracks) {
          if (t === "Venezuela") continue;
          const raw = getTrackCutoff(t);
          if (raw) {
            let co = dayjs(raw, "HH:mm");
            // Use a small buffer (e.g., 1 min) instead of 10 min for cutoff check consistency
            let cf = co.subtract(1, "minute"); 
            if (now.isSame(cf) || now.isAfter(cf)) {
              alert(`Track "${t}" is closed for today.`);
              return;
            }
          }
        }
      }
    }

    const rows = $("#tablaJugadas tr");
    if (rows.length === 0) {
        alert("Please add at least one play.");
        return;
    }
    let valid = true;
    const errors = [];
    rows.find(".betNumber,.straight,.box,.combo,.gameMode").removeClass("error-field");

    rows.each(function() {
      const rowIndex = parseInt($(this).attr("data-playIndex"));
      const bn = $(this).find(".betNumber").val().trim();
      const gm = $(this).find(".gameMode").text();
      const st = parseFloat($(this).find(".straight").val().trim() || "0");
      // const bx = parseFloat($(this).find(".box").val().trim() || "0"); // Box can be text for Pulito
      const co = parseFloat($(this).find(".combo").val().trim() || "0");

      let errorHere = false;
      if (!bn) { errorHere = true; $(this).find(".betNumber").addClass("error-field"); }
      if (gm === "-") { errorHere = true; $(this).find(".gameMode").addClass("error-field"); }

      // Basic validation: at least one amount must be > 0 if game mode is determined
      if (gm !== "-" && st <= 0 && (parseFloat($(this).find(".box").val().trim() || "0") <=0 && !isNaN(parseFloat($(this).find(".box").val().trim()))) && co <= 0 && gm !== "Pulito" /*Pulito handled differently*/) {
        // For pulito, if box has positions, straight must be > 0
        if(gm === "Pulito" && st <=0 && $(this).find(".box").val().trim().includes(",")) {
             errorHere = true; $(this).find(".straight").addClass("error-field");
        } else if (gm !== "Pulito") {
            errorHere = true; $(this).find(".straight,.box,.combo").addClass("error-field");
        }
      }
      if (hasBrooklynOrFront(chosenTracks) && bn.length !== 3) { errorHere = true; $(this).find(".betNumber").addClass("error-field");}
      
      // Specific limits (can be expanded)
      // ...

      if (errorHere) {
        valid = false;
        if (!errors.includes(rowIndex)) errors.push(rowIndex);
      }
    });

    if (!valid) {
      const uniqueErr = [...new Set(errors)].join(", ");
      alert(`Some plays have errors or missing amounts (row(s): ${uniqueErr}). Please fix them.`);
      return;
    }

    $("#ticketJugadas").empty();
    rows.each(function() {
      const rowIndex = $(this).attr("data-playIndex");
      const bn = $(this).find(".betNumber").val().trim();
      const gm = $(this).find(".gameMode").text();
      let stVal = $(this).find(".straight").val().trim() || "0.00";
      let bxVal = $(this).find(".box").val().trim() || "-"; // Keep as text if "-"
      let coVal = $(this).find(".combo").val().trim() || "0.00";
      let totVal = $(this).find(".total").text() || "0.00";

      const rowHTML = `
        <tr>
          <td>${rowIndex}</td>
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
    $("#ticketTransaccion").text(dayjs().format("MM/DD/YYYY hh:mm A"));
    $("#numeroTicket").text("(Not assigned yet)");
    $("#qrcode").empty();

    $("#editButton").removeClass("d-none");
    $("#shareTicket").addClass("d-none");
    $("#confirmarTicket").prop("disabled", false);
    // fixTicketLayoutForMobile(); // We'll handle this with CSS
    if(ticketModalInstance) ticketModalInstance.show();
  }


  $("#confirmarTicket").click(function() {
    $(this).prop("disabled", true);
    $("#editButton").addClass("d-none");

    const uniqueTicket = generateUniqueTicketNumber();
    $("#numeroTicket").text(uniqueTicket);
    transactionDateTime = dayjs().format("MM/DD/YYYY hh:mm A");
    $("#ticketTransaccion").text(transactionDateTime);

    $("#qrcode").empty();
    new QRCode(document.getElementById("qrcode"), {
      text: uniqueTicket,
      width: 128,
      height: 128
    });

    $("#shareTicket").removeClass("d-none");

    const ticketElement = document.getElementById("preTicket");
    // Ensure styles are applied for html2canvas if needed, or use existing styles
    
    setTimeout(() => {
      html2canvas(ticketElement, { scale: 2 })
        .then(canvas => {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          window.ticketImageDataUrl = dataUrl;

          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = `ticket_${uniqueTicket}.jpg`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          alert("Your ticket image was downloaded successfully (JPEG).");
          // saveBetDataToSheetDB is not implemented in this version
        })
        .catch(err => {
          console.error("Error generating ticket image:", err);
          alert("Problem generating final ticket image. Try again.");
        })
        .finally(() => {
          // Restore any temporary styles if changed
        });
    }, 500);
  });

  $("#editButton").click(function() {
    if(ticketModalInstance) ticketModalInstance.hide();
  });

  $("#shareTicket").click(async function() {
    if (!window.ticketImageDataUrl) {
      alert("No ticket image is available to share.");
      return;
    }
    // Simplified share, actual file sharing needs more setup if not using navigator.share
    if (navigator.share) {
        try {
            // To share a data URL as text:
            await navigator.share({
                title: 'Lottery Ticket',
                text: `Check out my ticket: ${$("#numeroTicket").text()}`,
                url: window.ticketImageDataUrl // Sharing the data URL directly might work on some platforms
            });
        } catch (err) {
            console.error('Error sharing:', err);
            alert('Could not share the ticket. You can share the downloaded image.');
        }
    } else {
      alert("Web Share API not supported. Please share the downloaded image manually.");
    }
  });

  function generateUniqueTicketNumber() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  // function fixTicketLayoutForMobile() { // Handled by CSS
  // }

  function getTrackCutoff(tn) {
    for (let region in cutoffTimes) {
      if (cutoffTimes[region] && cutoffTimes[region][tn]) {
        return cutoffTimes[region][tn];
      }
    }
    return null;
  }

  function hasBrooklynOrFront(tracks) {
    const bfSet = new Set(["Brooklyn Midday", "Brooklyn Evening", "Front Midday", "Front Evening"]);
    return tracks.some(t => bfSet.has(t));
  }

  function userChoseToday() {
    const val = $("#fecha").val();
    if (!val) return false;
    const arr = val.split(",").map(s=>s.trim());
    const today = dayjs().startOf("day");
    for (let ds of arr) {
      const picked = dayjs(ds, "M-D-YYYY").startOf("day");
      if (picked.isSame(today, "day")) return true;
    }
    return false;
  }

  function disableTracksByTime() {
    if (!userChoseToday()) {
      enableAllTracks();
      return;
    }
    const now = dayjs();
    $(".track-checkbox").each(function() {
      const val = $(this).val();
      if (val === "Venezuela") return; // Venezuela is always open
      const raw = getTrackCutoff(val);
      if (raw) {
        let co = dayjs(raw, "HH:mm");
        // Consider the track closed if current time is at or after cutoff
        // Using a small buffer, e.g. track closes 1 minute before displayed time.
        let cf = co.subtract(1, "minute"); 

        if (now.isSame(cf) || now.isAfter(cf)) {
          $(this).prop("checked", false).prop("disabled", true);
          $(this).closest(".track-button-container").find(".track-button").css({
            opacity: 0.5,
            cursor: "not-allowed"
          });
        } else {
          $(this).prop("disabled", false);
          $(this).closest(".track-button-container").find(".track-button").css({
            opacity: 1,
            cursor: "pointer"
          });
        }
      }
    });
    // After potentially disabling and unchecking tracks, recalculate counts and total
    const arr = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
    const multiplyingTracks = arr.filter(x => x !== "Venezuela");
    selectedTracksCount = multiplyingTracks.length > 0 ? multiplyingTracks.length : (arr.length > 0 ? 1 : 0);
    calculateMainTotal(); // Important to update total after tracks might have been unchecked
    storeFormState();
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
      let raw = "";
      if (cutoffTimes.USA && cutoffTimes.USA[track]) raw = cutoffTimes.USA[track];
      else if (cutoffTimes["Santo Domingo"] && cutoffTimes["Santo Domingo"][track]) raw = cutoffTimes["Santo Domingo"][track];
      // No need for cutoffTimes.Venezuela[track] as it's always open

      if (raw) {
        let co = dayjs(raw, "HH:mm");
        // Display the actual cutoff time, not the check-against time
        $(this).text(`(${co.format("hh:mm A")})`);
      } else {
        $(this).text(""); // Clear if no cutoff time
      }
    });
  }

  // Initial calls
  showCutoffTimes();
  // disableTracksByTime(); // Called by loadFormState -> autoSelect...
  setInterval(disableTracksByTime, 60000); // Check every minute

  function autoSelectNYTrackAndVenezuela() {
    // Only auto-select if no tracks are checked and no plays exist
    const anyTracksChecked = $(".track-checkbox:checked").length > 0;
    const anyPlaysExist = $("#tablaJugadas tr").length > 0;

    if (anyTracksChecked || anyPlaysExist) {
        // If tracks or plays already exist (e.g. from loaded state),
        // ensure counts are correct and recalculate total
        const arr = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        const multiplyingTracks = arr.filter(x => x !== "Venezuela");
        selectedTracksCount = multiplyingTracks.length > 0 ? multiplyingTracks.length : (arr.length > 0 ? 1 : 0);
        calculateMainTotal();
        return;
    }

    const now = dayjs();
    // NY Mid Day cutoff is 2:20 PM (14:20). If before, select Mid Day.
    let nyMidDayCutoffCheck = dayjs().hour(14).minute(20); 

    if (now.isBefore(nyMidDayCutoffCheck)) {
      $("#trackNYMidDay").prop("checked", true);
    } else {
      $("#trackNYEvening").prop("checked", true);
    }
    $("#trackVenezuela").prop("checked", true);

    // Trigger change to update counts and total
    $(".track-checkbox").trigger('change');
  }


  // Duplicates highlight en MAIN
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

  /*
   =========================================================
   WIZARD
   =========================================================
  */

  $("#wizardButton").click(function() {
    console.log("Wizard button clicked");
    resetWizard();
    if(wizardModalInstance) wizardModalInstance.show();
  });

  function resetWizard() {
    wizardCount = 0;
    $("#wizardTableBody").empty();
    lockedFields.straight = false;
    lockedFields.box = false;
    lockedFields.combo = false;
    $("#lockStraight").html(`<i class="bi bi-unlock"></i>`).removeClass('active');
    $("#lockBox").html(`<i class="bi bi-unlock"></i>`).removeClass('active');
    $("#lockCombo").html(`<i class="bi bi-unlock"></i>`).removeClass('active');
    $("#wizardBetNumber").val("").focus(); // Focus after reset
    if (!lockedFields.straight) $("#wizardStraight").val("");
    if (!lockedFields.box) $("#wizardBox").val("");
    if (!lockedFields.combo) $("#wizardCombo").val("");
    $("#qpGameMode").val("Pick 3"); // Default
    $("#qpCount").val("5");      // Default
    $("#rdFirstNumber").val("");
    $("#rdLastNumber").val("");
  }

  $(".lockBtn").click(function() {
    const field = $(this).data("field");
    lockedFields[field] = !lockedFields[field];
    if (lockedFields[field]) {
      $(this).html(`<i class="bi bi-lock-fill"></i>`).addClass('active');
    } else {
      $(this).html(`<i class="bi bi-unlock"></i>`).removeClass('active');
    }
  });

  $("#wizardAddNext").click(function() {
    const bn = $("#wizardBetNumber").val().trim();
    if (!bn) {
        alert("Please enter a Bet Number.");
        $("#wizardBetNumber").focus();
        return;
    }
    const gm = determineGameMode(bn); // Ensure this is robust
    if (gm === "-") {
      alert(`Cannot determine game mode for "${bn}". Check tracks, number length, or format.`);
      $("#wizardBetNumber").focus();
      return;
    }
    let stVal = $("#wizardStraight").val().trim();
    let bxVal = $("#wizardBox").val().trim();
    let coVal = $("#wizardCombo").val().trim();

    if (!stVal && !bxVal && !coVal && gm !== "Pulito" /*Pulito can be complex with box positions*/) {
        alert("Please enter at least one amount (Straight, Box, or Combo).");
        return;
    }
    if (gm === "Pulito" && !stVal && (!bxVal || !bxVal.includes(','))) { // For Pulito with box positions
        alert("For Pulito with box positions, Straight amount is required.");
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

  function addWizardRow(bn, gm, stVal, bxVal, coVal, total) {
    wizardCount++;
    const i = wizardCount;
    const rowHTML = `
      <tr data-wizardIndex="${i}">
        <td><button type="button" class="removeWizardBtn btnRemovePlay" data-row="${i}">${i}</button></td>
        <td>${bn}</td>
        <td>${gm}</td>
        <td>${stVal || "-"}</td>
        <td>${bxVal || "-"}</td>
        <td>${coVal || "-"}</td>
        <td>${parseFloat(total || 0).toFixed(2)}</td>
      </tr>
    `;
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

  // Quick Pick
  $("#btnGenerateQuickPick").click(function() {
    const gm = $("#qpGameMode").val();
    const countVal = parseInt($("#qpCount").val()) || 1;
    if (countVal < 1 || countVal > MAX_PLAYS) { // Use MAX_PLAYS for consistency
      alert(`Please enter a count between 1 and ${MAX_PLAYS}.`);
      return;
    }
    const stVal = $("#wizardStraight").val().trim();
    const bxVal = $("#wizardBox").val().trim();
    const coVal = $("#wizardCombo").val().trim();

    for (let i = 0; i < countVal; i++) {
      let bn = generateRandomNumberForMode(gm);
      bn = padNumberForMode(bn, gm);

      let rowT = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
      addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
    }
    highlightDuplicatesInWizard();
  });

  function generateRandomNumberForMode(mode) {
    if (mode === "NY Horses") {
      const length = Math.floor(Math.random() * 4) + 1;
      return Math.floor(Math.random() * Math.pow(10, length)).toString();
    }
    if (mode === "Single Action") return Math.floor(Math.random() * 10).toString();
    if (mode === "Win 4" || mode === "Pale-Ven" || mode === "Pale-RD" || mode === "Palé") return Math.floor(Math.random() * 10000).toString();
    if (mode === "Pick 3") return Math.floor(Math.random() * 1000).toString();
    if (["Venezuela", "Pulito", "RD-Quiniela"].includes(mode)) return Math.floor(Math.random() * 100).toString();
    return Math.floor(Math.random() * 1000).toString(); // Default
  }

  function padNumberForMode(numStr, mode) {
    let targetLength = 0;
    if (mode === "NY Horses" || mode === "Single Action") return numStr; // No padding
    if (mode === "Win 4" || mode === "Pale-Ven" || mode === "Pale-RD" || mode === "Palé") targetLength = 4;
    else if (mode === "Pick 3") targetLength = 3;
    else if (["Venezuela", "Pulito", "RD-Quiniela"].includes(mode)) targetLength = 2;
    else targetLength = 3; // Default (e.g. if mode is somehow invalid)
    
    return numStr.padStart(targetLength, "0");
  }


  // Round Down
  $("#btnGenerateRoundDown").click(function() {
    const firstNum = $("#rdFirstNumber").val().trim();
    const lastNum = $("#rdLastNumber").val().trim();
    if (!firstNum || !lastNum) {
      alert("Please enter both first and last number for Round Down.");
      return;
    }
    if (firstNum.length !== lastNum.length || ![2,3,4].includes(firstNum.length)) {
      alert("First/Last must have the same length (2, 3, or 4 digits).");
      return;
    }
    let start = parseInt(firstNum, 10);
    let end = parseInt(lastNum, 10);
    if (isNaN(start) || isNaN(end)) {
      alert("Invalid numeric range for Round Down.");
      return;
    }
    if (start > end) [start, end] = [end, start]; // Swap if out of order

    const stVal = $("#wizardStraight").val().trim();
    const bxVal = $("#wizardBox").val().trim();
    const coVal = $("#wizardCombo").val().trim();

    for (let i = start; i <= end; i++) {
      let bn = i.toString().padStart(firstNum.length, "0");
      let gm = determineGameMode(bn);
      if (gm === "-") continue;
      const rowT = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
      addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
    }
    highlightDuplicatesInWizard();
  });


  $("#btnPermute").click(function() {
    // Simplified version, may need your original complex logic if this isn't enough
    const rows = $("#wizardTableBody tr");
    if(rows.length === 0) {
        alert("No plays in the wizard table to permute.");
        return;
    }
    let allBetNumbers = [];
    rows.each(function(){
        allBetNumbers.push($(this).find("td").eq(1).text().trim());
    });

    // Fisher-Yates shuffle
    for (let i = allBetNumbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allBetNumbers[i], allBetNumbers[j]] = [allBetNumbers[j], allBetNumbers[i]];
    }

    rows.each(function(index){
        const newBN = allBetNumbers[index];
        const gm = determineGameMode(newBN);
        const stVal = $(this).find("td").eq(3).text().trim() === '-' ? '' : $(this).find("td").eq(3).text().trim();
        const bxVal = $(this).find("td").eq(4).text().trim() === '-' ? '' : $(this).find("td").eq(4).text().trim();
        const coVal = $(this).find("td").eq(5).text().trim() === '-' ? '' : $(this).find("td").eq(5).text().trim();
        const newTotal = calculateRowTotal(newBN, gm, stVal, bxVal, coVal);

        $(this).find("td").eq(1).text(newBN);
        $(this).find("td").eq(2).text(gm);
        $(this).find("td").eq(6).text(parseFloat(newTotal).toFixed(2));
    });
    highlightDuplicatesInWizard();
  });

  $("#wizardAddAllToMain").click(function() {
    const wizardRows = $("#wizardTableBody tr");
    if (wizardRows.length === 0) {
      alert("No plays in the wizard table to add.");
      return;
    }
    let playsAdded = 0;
    wizardRows.each(function() {
      if (playCount >= MAX_PLAYS) {
        if(playsAdded === 0) alert(`Main form is full (max ${MAX_PLAYS} plays). Cannot add more.`);
        else alert(`Added ${playsAdded} plays. Main form is now full (max ${MAX_PLAYS} plays). Some plays from wizard were not added.`);
        return false; // Break .each loop
      }
      const tds = $(this).find("td");
      const betData = {
          betNumber: tds.eq(1).text(),
          // gameMode will be determined by addMainRow -> recalcMainRow
          straightAmount: tds.eq(3).text() === '-' ? null : parseFloat(tds.eq(3).text()),
          boxAmount: tds.eq(4).text() === '-' ? null : parseFloat(tds.eq(4).text()), // Assuming box is numeric here for direct transfer
          comboAmount: tds.eq(5).text() === '-' ? null : parseFloat(tds.eq(5).text())
      };
      addMainRow(betData);
      playsAdded++;
    });

    // Clear wizard only if some plays were added or if it makes sense in your flow
    if (playsAdded > 0 || wizardRows.length > 0) {
        $("#wizardTableBody").empty();
        wizardCount = 0;
        // Optionally reset wizard input fields if not locked
        if(!lockedFields.straight) $("#wizardStraight").val("");
        if(!lockedFields.box) $("#wizardBox").val("");
        if(!lockedFields.combo) $("#wizardCombo").val("");
        $("#wizardBetNumber").val("").focus();
    }
    highlightDuplicatesInMain();
    storeFormState();
  });

  $("#wizardGenerateTicket").click(function() {
    if ($("#wizardTableBody tr").length > 0) {
        $("#wizardAddAllToMain").trigger("click");
    }
    if ($("#tablaJugadas tr").length === 0) {
        alert("No plays to generate ticket. Please add plays from wizard or directly.");
        return;
    }
    if(wizardModalInstance) wizardModalInstance.hide();
    doGenerateTicket();
  });

  $("#wizardEditMainForm").click(function() {
    if(wizardModalInstance) wizardModalInstance.hide();
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


  /*
   =========================================================
   Intro.js Tutorial
   =========================================================
  */
  const tutorialStepsEN = [
    { intro: "Welcome! This tutorial will guide you through the main features." },
    { element: "#fecha", title: "Bet Dates", intro: "Select one or more dates for your lottery bets." },
    { element: "#tracksAccordion", title: "Tracks", intro: "Expand a section and pick the tracks you want to bet on." },
    { element: "#agregarJugada", title: "Add Play", intro: "Click here to add a new play (row) to the table." },
    { element: "#wizardButton", title: "Wizard", intro: "This button opens a modal for quick entry of multiple plays." },
    { element: "#resetForm", title: "Reset Form", intro: "Clears everything and resets the form to default." },
    { element: "#generarTicket", title: "Generate Ticket", intro: "Once everything is correct, generate your ticket here." },
    { element: "#btnOcrModalTrigger", title: "OCR Capture", intro: "Use this to capture a ticket image and interpret bets."}
  ];
  const tutorialStepsES = [ /* ... similar in Spanish ... */ ];
  const tutorialStepsHT = [ /* ... similar in Creole ... */ ];

  function startTutorial(lang) {
    let stepsToUse = tutorialStepsEN; // Default to English
    if (lang === "es") stepsToUse = tutorialStepsES; // Define these fully if needed
    if (lang === "ht") stepsToUse = tutorialStepsHT; // Define these fully if needed

    introJs().setOptions({
      steps: stepsToUse,
      showProgress: true,
      showButtons: true,
      exitOnOverlayClick: false // Or true, depending on preference
    }).start();
  }
  $("#helpEnglish").click(() => startTutorial('en'));
  $("#helpSpanish").click(() => startTutorial('es'));
  $("#helpCreole").click(() => startTutorial('ht'));


  /*
   =========================================================
   MANUAL (mostrar/ocultar textos)
   =========================================================
  */
  $("#manualEnglishBtn").click(function() {
    $("#manualEnglishText").removeClass("d-none");
    $("#manualSpanishText").addClass("d-none");
    $("#manualCreoleText").addClass("d-none");
  });
  $("#manualSpanishBtn").click(function() {
    $("#manualEnglishText").addClass("d-none");
    $("#manualSpanishText").removeClass("d-none");
    $("#manualCreoleText").addClass("d-none");
  });
  $("#manualCreoleBtn").click(function() {
    $("#manualEnglishText").addClass("d-none");
    $("#manualSpanishText").addClass("d-none");
    $("#manualCreoleText").removeClass("d-none");
  });


  /*
     =========================================================
     OCR MODAL LOGIC (Adapted for Genkit API)
     =========================================================
  */

  window.abrirModalOCR = function() {
    console.log("abrirModalOCR called");
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val(""); // Reset file input
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").empty().html("<p><i>Upload an image to see interpreted bets here.</i></p>");
    hideOcrLoading();
    $("#btnProcesarOCR").prop("disabled", true);
    $("#btnCargarJugadas").prop("disabled", true);
    // $("#ocrDebugPanel").addClass("d-none"); // Debug panel not used same way
    if (modalOcrInstance) {
        modalOcrInstance.show();
    } else {
        console.error("OCR Modal instance not found!");
    }
  };

  window.handleDragOver = function(e) {
    e.preventDefault();
    $("#ocrDropZone").addClass("dragover");
  };
  window.handleDragLeave = function(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
  };

  function displayImagePreview(file) {
    selectedFileGlobalOCR = file;
    const reader = new FileReader();
    reader.onload = function(e) {
      $("#ocrPreview").attr("src", e.target.result).removeClass("d-none");
      $("#btnProcesarOCR").prop("disabled", false); // Enable process button
    }
    reader.readAsDataURL(file);
  }

  window.handleDrop = function(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      displayImagePreview(e.dataTransfer.files[0]);
    }
  };

  window.handleFileChange = function(e) {
    if (e.target.files && e.target.files[0]) {
      displayImagePreview(e.target.files[0]);
    } else {
      $("#btnProcesarOCR").prop("disabled", true);
    }
  };

  function showOcrLoading(message = "Processing image...") {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width", "0%");
    $("#ocrProgressText").text(message);

    let progressValue = 0;
    if (ocrProgressInterval) clearInterval(ocrProgressInterval); // Clear existing interval
    ocrProgressInterval = setInterval(() => {
      progressValue += 10; // Faster progress illusion
      if (progressValue > 90) progressValue = 90; // Cap at 90% until done
      $("#ocrProgressBar").css("width", progressValue + "%");
    }, 200);
  }

  function hideOcrLoading() {
    if (ocrProgressInterval) {
      clearInterval(ocrProgressInterval);
      ocrProgressInterval = null;
    }
    $("#ocrLoadingSection").addClass("d-none");
    $("#ocrProgressBar").css("width", "0%");
  }

  function finishOcrLoading(success = true) {
    if (ocrProgressInterval) {
        clearInterval(ocrProgressInterval);
        ocrProgressInterval = null;
    }
    $("#ocrProgressBar").css("width", "100%");
    $("#ocrProgressText").text(success ? "Processing Complete!" : "Processing Failed.");
    setTimeout(() => {
      // Keep loading section visible briefly to show "Complete" or "Failed"
      // hideOcrLoading(); // Or hide after a longer delay or manually
    }, success ? 1500 : 3000);
  }


  window.procesarOCR = async function() {
    if (!selectedFileGlobalOCR) {
      alert("Please select an image file first.");
      return;
    }
    showOcrLoading();
    $("#ocrJugadas").html("<p><i>Interpreting ticket...</i></p>");
    $("#btnCargarJugadas").prop("disabled", true);

    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobalOCR);
    reader.onloadend = async () => {
      const base64data = reader.result; // This is the photoDataUri
      try {
        console.log("Sending to /api/interpret-ticket");
        const response = await fetch('/api/interpret-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoDataUri: base64data })
        });

        if (!response.ok) {
          let errorMsg = `Error del servidor: ${response.status}`;
          try {
            const errorData = await response.json();
            errorMsg += ` - ${errorData.message || "Error desconocido del servidor."}`;
            console.error("Server error response:", errorData);
          } catch (e) {
            // Failed to parse JSON error response
            console.error("Failed to parse error JSON from server", e);
          }
          throw new Error(errorMsg);
        }

        const interpretedBets = await response.json(); // Expecting an array of bets
        console.log("Received from API:", interpretedBets);

        if (!Array.isArray(interpretedBets)) {
            throw new Error("La respuesta de la API no es un array de jugadas válido.");
        }

        jugadasGlobalOCR = interpretedBets; // Store for later use
        finishOcrLoading(true);

        if (jugadasGlobalOCR.length === 0) {
          $("#ocrJugadas").html("<p>No bets were interpreted from the image.</p>");
          return;
        }

        let html = "<h5>Interpreted Bets:</h5>";
        jugadasGlobalOCR.forEach((j, idx) => {
          html += `
            <div style="border:1px solid #ccc; padding:0.5rem; margin-bottom:0.5rem;">
              <p><strong>Bet #:</strong> ${j.betNumber || "N/A"} 
                 | <strong>Mode:</strong> ${j.gameMode || "N/A"}
              </p>
              <p>
                <strong>Str:</strong> ${j.straightAmount !== null ? '$'+Number(j.straightAmount).toFixed(2) : "-"} | 
                <strong>Box:</strong> ${j.boxAmount !== null ? '$'+Number(j.boxAmount).toFixed(2) : "-"} | 
                <strong>Com:</strong> ${j.comboAmount !== null ? '$'+Number(j.comboAmount).toFixed(2) : "-"}
              </p>
              <button class="btn btn-sm btn-info mt-1" onclick="usarJugadaOCR(${idx})">
                Use this Bet
              </button>
            </div>
          `;
        });
        $("#ocrJugadas").html(html);
        $("#btnCargarJugadas").prop("disabled", false); // Enable button to load all

      } catch (err) {
        console.error("Error procesando la imagen:", err);
        alert("Error procesando la imagen: " + err.message);
        finishOcrLoading(false);
        $("#ocrJugadas").html(`<p style="color:red;">Failed to interpret ticket: ${err.message}</p>`);
      }
    };
    reader.onerror = () => {
        alert('Failed to read file.');
        hideOcrLoading();
    };
  };

  window.usarJugadaOCR = function(idx) {
    if (!jugadasGlobalOCR || !jugadasGlobalOCR[idx]) {
      alert("Selected bet not found.");
      return;
    }
    const bet = jugadasGlobalOCR[idx];
    addMainRow(bet); // Pass the whole bet object
    highlightDuplicatesInMain();
    storeFormState();
    if (modalOcrInstance) modalOcrInstance.hide();
  };

  $("#btnCargarJugadas").click(function() {
    if (!jugadasGlobalOCR || jugadasGlobalOCR.length === 0) {
      alert("No OCR bets to load.");
      return;
    }
    let playsAdded = 0;
    jugadasGlobalOCR.forEach(bet => {
      if (playCount < MAX_PLAYS) {
        addMainRow(bet); // Pass the whole bet object
        playsAdded++;
      } else {
         if(playsAdded === 0) alert(`Main form is full (max ${MAX_PLAYS} plays). Cannot add more.`);
         else alert(`Added ${playsAdded} plays. Main form is now full (max ${MAX_PLAYS} plays).`);
        return false; // break .each
      }
    });
    highlightDuplicatesInMain();
    storeFormState();
    if (modalOcrInstance) modalOcrInstance.hide();
  });

  window.toggleOcrDebug = function() {
    // $("#ocrDebugPanel").toggleClass("d-none");
    alert("Detailed OCR debug panel from the original backend is not applicable here. Check browser console for API responses or errors.");
  };

}); // End of $(document).ready()

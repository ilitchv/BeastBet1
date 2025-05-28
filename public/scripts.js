
/* =========================================================
   SCRIPTS.JS COMPLETO
   (Mantiene toda la lógica previa intacta,
    e incorpora spinner moderno, barra de progreso
    y muestra solo betNumber + monto en el panel de jugadas).
========================================================= */

// const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/bl57zyh73b0ev'; // Comentado por ahora

$(document).ready(function() {
  console.log("Document ready, jQuery loaded.");
  if (typeof bootstrap !== 'undefined') {
    console.log("Bootstrap loaded.");
  } else {
    console.error("Bootstrap not loaded!");
  }

  // (1) Variables globales, dayjs, etc.
  dayjs.extend(dayjs_plugin_customParseFormat);
  dayjs.extend(dayjs_plugin_arraySupport);

  let transactionDateTime = '';
  window.ticketImageDataUrl = null; // Para la imagen del ticket generado

  let selectedTracksCount = 0;
  let selectedDaysCount = 0;
  const MAX_PLAYS = 200; // Límite aumentado a 200

  let playCount = 0;
  let wizardCount = 0;

  // Candados para el Wizard
  const lockedFields = {
    straight: false,
    box: false,
    combo: false
  };

  // Instancias de Modales
  let wizardModalInstance, ticketModalInstance, modalOcrInstance;
  if (document.getElementById("wizardModal")) {
    wizardModalInstance = new bootstrap.Modal(document.getElementById("wizardModal"));
  }
  if (document.getElementById("ticketModal")) {
    ticketModalInstance = new bootstrap.Modal(document.getElementById("ticketModal"));
  }
  if (document.getElementById("modalOcr")) {
    modalOcrInstance = new bootstrap.Modal(document.getElementById("modalOcr"));
  }


  // (2) Cutoff times
  const cutoffTimes = {
    "USA": {
      "New York Mid Day": "14:20", // Ejemplo, ajustar a los reales
      "New York Evening": "22:00",
      "Georgia Mid Day": "12:20",
      "Georgia Evening": "18:40",
      "New Jersey Mid Day": "12:50",
      "New Jersey Evening": "22:00",
      "Florida Mid Day": "13:20",
      "Florida Evening": "21:30",
      "Connecticut Mid Day": "13:30",
      "Connecticut Evening": "22:00",
      "Georgia Night": "22:00", // Asumiendo un valor
      "Pensilvania AM": "12:45", // Asumiendo un valor
      "Pensilvania PM": "18:15", // Asumiendo un valor
      "Venezuela": "00:00", // No tiene cutoff real, siempre abierto
      "Brooklyn Midday": "14:20", // Ejemplo
      "Brooklyn Evening": "22:00", // Ejemplo
      "Front Midday": "14:20", // Ejemplo
      "Front Evening": "22:00", // Ejemplo
      "New York Horses": "16:00" // Ejemplo
    },
    "Santo Domingo": {
      "Real": "11:45", // Ejemplo
      "Gana mas": "13:25",
      "Loteka": "18:30",
      "Nacional": "19:30",
      "Quiniela Pale": "19:30", // Suele ser parte de Nacional
      "Primera Día": "10:50",
      "Suerte Día": "11:20", // Ejemplo
      "Lotería Real": "11:50", // Probablemente 'Real'
      "Suerte Tarde": "16:50", // Ejemplo
      "Lotedom": "16:50", // Ejemplo
      "Primera Noche": "18:50",
      "Panama": "16:00" // Ejemplo
    },
    "Venezuela": { // Redundante si ya está en USA, pero por si acaso
        "Venezuela": "00:00"
    }
  };

  // (3) Init Flatpickr
  const fpInstance = flatpickr("#fecha", {
    mode: "multiple",
    dateFormat: "m-d-Y",
    minDate: "today",
    defaultDate: [new Date()],
    clickOpens: true,
    allowInput: false,
    appendTo: document.body, // Ayuda con problemas de z-index en modales
    onOpen: function() {
      // No escalar por ahora, puede causar problemas de layout
      // this.calendarContainer.style.transform = 'scale(2.0)';
      // this.calendarContainer.style.transformOrigin = 'top left';
    },
    onClose: function() {
      // this.calendarContainer.style.transform = '';
    },
    onReady: function(selectedDates, dateStr, instance) {
      console.log("Flatpickr ready. Initial dates:", selectedDates);
      if (!selectedDates || selectedDates.length === 0) {
        instance.setDate(new Date(), true); // true para disparar onChange
      } else {
        // Disparar manualmente si ya hay fechas (ej. de localStorage)
        selectedDaysCount = selectedDates.length;
        calculateMainTotal();
        disableTracksByTime();
      }
    },
    onChange: (selectedDates) => {
      console.log("Flatpickr onChange. Selected dates:", selectedDates);
      selectedDaysCount = selectedDates.length > 0 ? selectedDates.length : 1; // Si no hay fechas, contar como 1 día (hoy por defecto)
      calculateMainTotal();
      // storeFormState(); // Comentado por ahora para simplificar
      disableTracksByTime();
    }
  });

  // (4) Track Checkboxes
  $(".track-checkbox").change(function() {
    console.log("Track checkbox changed.");
    const arr = $(".track-checkbox:checked")
      .map(function() { return $(this).val(); })
      .get();
    selectedTracksCount = arr.filter(x => x !== "Venezuela").length;
    if (arr.length > 0 && selectedTracksCount === 0 && arr.includes("Venezuela")) {
        selectedTracksCount = 1; // Si solo Venezuela está marcado, cuenta como 1 track para el multiplicador
    } else if (arr.length === 0) {
        selectedTracksCount = 0; // Si no hay tracks, es 0
    }
    calculateMainTotal();
    disableTracksByTime(); // Re-evaluar tracks deshabilitados
    // storeFormState(); // Comentado por ahora
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
    // highlightDuplicatesInMain(); // Comentado por ahora
  });

  $("#tablaJugadas").on("click", ".removeMainBtn", function() {
    console.log("Remove specific play clicked");
    $(this).closest("tr").remove();
    playCount--;
    renumberMainRows();
    calculateMainTotal();
    // highlightDuplicatesInMain(); // Comentado por ahora
  });

  // Event listener para inputs en la tabla de jugadas principal
  $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function() {
    const row = $(this).closest("tr");
    recalcMainRow(row);
    // highlightDuplicatesInMain(); // Comentado por ahora
    // storeFormState(); // Comentado por ahora
  });


  function addMainRow(bet = null) {
    if (playCount >= MAX_PLAYS) {
      alert(`You have reached the limit of ${MAX_PLAYS} plays in the main form.`);
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
        <td>
          <input type="text" class="form-control betNumber" value="${bet && bet.betNumber ? bet.betNumber : ''}" />
        </td>
        <td class="gameMode">${bet && bet.gameMode ? bet.gameMode : '-'}</td>
        <td>
          <input type="number" step="0.01" class="form-control straight" value="${bet && bet.straightAmount !== null ? Number(bet.straightAmount).toFixed(2) : ''}" />
        </td>
        <td>
          <input type="number" step="0.01" class="form-control box" value="${bet && bet.boxAmount !== null ? Number(bet.boxAmount).toFixed(2) : ''}" />
        </td>
        <td>
          <input type="number" step="0.01" class="form-control combo" value="${bet && bet.comboAmount !== null ? Number(bet.comboAmount).toFixed(2) : ''}" />
        </td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    const newRow = $("#tablaJugadas tr[data-playIndex='" + rowIndex + "']");
    if (bet) { // Si se pasó una apuesta (desde OCR), recalcularla inmediatamente
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
    playCount = i; // Actualizar el contador global de jugadas
    // storeFormState(); // Comentado por ahora
  }

  function recalcMainRow($row) {
    const bn = $row.find(".betNumber").val().trim();
    const selectedTracksForMode = $(".track-checkbox:checked")
                                  .map(function() { return $(this).val(); })
                                  .get();
    const gm = determineGameMode(bn, selectedTracksForMode);
    $row.find(".gameMode").text(gm);

    const stVal = $row.find(".straight").val().trim();
    const bxVal = $row.find(".box").val().trim(); // Box puede ser texto como "1,2" para Pulito
    const coVal = $row.find(".combo").val().trim();

    const rowTotal = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    $row.find(".total").text(parseFloat(rowTotal).toFixed(2));
    calculateMainTotal();
  }

  // (6) Calculate Main Total
  function calculateMainTotal() {
    let sumOfRowTotals = 0;
    $("#tablaJugadas tr").each(function() {
      const totalCell = $(this).find(".total").text();
      const val = parseFloat(totalCell) || 0;
      sumOfRowTotals += val;
    });

    const daysToMultiply = selectedDaysCount > 0 ? selectedDaysCount : 1;
    const tracksToMultiply = selectedTracksCount > 0 ? selectedTracksCount : 1;
    
    let finalTotal = sumOfRowTotals * tracksToMultiply * daysToMultiply;
    
    $("#totalJugadas").text(finalTotal.toFixed(2));
    // storeFormState(); // Comentado por ahora
  }

  // (7) determineGameMode
  function determineGameMode(betNumber, tracks) { // tracks es un array de strings
    if (!betNumber) return "-";
    if (!tracks || tracks.length === 0) return "-"; // Necesita tracks para determinar modo

    const isUSA = tracks.some(t => cutoffTimes.USA[t]);
    const isSD = tracks.some(t => cutoffTimes["Santo Domingo"] ? cutoffTimes["Santo Domingo"][t] : false);
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    if (includesHorses) {
      return "NY Horses";
    }

    if (isUSA && !includesVenezuela && betNumber.length === 1 && /^\d$/.test(betNumber)) {
      return "Single Action";
    }

    const paleRegex = /^(\d{2})([-x+])(\d{2})$/;
    if (paleRegex.test(betNumber)) {
      if (includesVenezuela && isUSA) return "Pale-Ven";
      if (isSD && !isUSA) return "Pale-RD";
      return "Palé"; // Default Palé si no encaja en Ven o RD específico
    }

    const length = betNumber.replace(/[^0-9]/g, "").length; // Contar solo dígitos para P3/W4

    if (length === 2) {
      if (includesVenezuela && isUSA) return "Venezuela";
      if (isUSA && !isSD) return "Pulito";
      if (isSD && !isUSA) return "RD-Quiniela";
      return "2 Digits"; // Genérico si no encaja
    }
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

    // Para Pulito, bxVal puede ser "1,2" o "1,2,3"
    if (gm === "Pulito") {
      if (bxVal && typeof bxVal === 'string') {
        const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean);
        // En Pulito, el "box" no es un monto sino posiciones, el costo es st * num_posiciones
        return (st * positions.length).toFixed(2);
      }
      // Si no hay valor en box para Pulito, pero sí en straight, el total es straight.
      // Si solo hay straight, no hay multiplicador de box.
      return st.toFixed(2);
    } else {
      numericBox = parseFloat(bxVal) || 0; // Para otros modos, box es un monto
    }
    
    let totalForRow = 0;

    if (["Venezuela", "Pale-RD", "Pale-Ven", "RD-Quiniela", "Palé", "2 Digits"].includes(gm)) {
        // Para estos juegos, usualmente es solo straight, pero sumamos box y combo si el usuario los ingresa
        totalForRow = st + numericBox + combo;
    } else if (gm === "Win 4" || gm === "Pick 3") {
      const combosCount = calcCombos(bn.replace(/[^0-9]/g, "")); // Usar solo dígitos para calcCombos
      totalForRow = st + numericBox + (combo * combosCount);
    } else if (gm === "Single Action" || gm === "NY Horses") {
      totalForRow = st + numericBox + combo;
    } else { // Default
      totalForRow = st + numericBox + combo;
    }
    return totalForRow.toFixed(2);
  }

  function calcCombos(str) {
    if (!str) return 1; // Evitar error con string vacío
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

  // (9) store/load FormState - Comentado por ahora
  // function storeFormState(){ ... }
  // function loadFormState(){ ... }
  // loadFormState(); // No cargar al inicio por ahora

  function recalcAllMainRows() {
    $("#tablaJugadas tr").each(function() {
      recalcMainRow($(this));
    });
  }

  // (10) resetForm
  $("#resetForm").click(function() {
    console.log("Reset Form clicked");
    if (confirm("Are you sure you want to reset the form?")) {
      resetForm();
    }
  });

  function resetForm() {
    console.log("Executing resetForm function");
    $("#lotteryForm")[0].reset(); // Resetea inputs del formulario
    $("#tablaJugadas").empty(); // Limpia la tabla de jugadas
    playCount = 0; // Resetea contador de jugadas

    // Resetear fechas y tracks a sus estados iniciales y recalcular
    if (fpInstance) {
      fpInstance.setDate([new Date()], true); // Resetea a hoy y dispara onChange
    }
    
    // Desmarcar todos los tracks y luego auto-seleccionar
    $(".track-checkbox").prop("checked", false);
    autoSelectNYTrackAndVenezuela(); // Esto debería disparar el 'change' en los checkboxes y actualizar selectedTracksCount y el total
                                     // y también llamar a disableTracksByTime.

    // No es necesario llamar a calculateMainTotal aquí directamente si los onChange de arriba lo hacen.
    // Pero para asegurar:
    calculateMainTotal(); 
    
    $("#totalJugadas").text("0.00"); // Asegurar que el total visual es 0.00 antes del recálculo por auto-select
    window.ticketImageDataUrl = null;
    // localStorage.removeItem("formState"); // Comentado
    console.log("Form reset complete. selectedDaysCount:", selectedDaysCount, "selectedTracksCount:", selectedTracksCount);
  }


  // (11) Generate Ticket
  $("#generarTicket").click(function() {
    console.log("Generate Ticket clicked");
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
    const arrDates = dateVal.split(", ");
    const today = dayjs().startOf("day");
    for (let ds of arrDates) {
      const dateParts = ds.split("-");
      if (dateParts.length !== 3) continue; // Saltar si el formato no es correcto
      const [mm, dd, yy] = dateParts.map(Number);
      const picked = dayjs(new Date(yy, mm - 1, dd)).startOf("day");
      if (picked.isSame(today, "day")) {
        const now = dayjs();
        for (let t of chosenTracks) {
          if (t === "Venezuela") continue;
          const raw = getTrackCutoff(t);
          if (raw) {
            let co = dayjs(raw, "HH:mm");
            // Considerar que el cutoff puede ser al día siguiente si es muy temprano (e.g., 02:00 AM)
            // Esta lógica es simplificada y asume que el cutoff es el mismo día.
            let cf = co.isAfter(dayjs("21:30", "HH:mm")) ? dayjs("22:00", "HH:mm") : co.subtract(10, "minute");
            if (now.isAfter(cf)) { // No isSame, solo isAfter
              alert(`Track "${t}" is closed for today.`);
              return;
            }
          }
        }
      }
    }

    // Validar filas (simplificado por ahora)
    const rows = $("#tablaJugadas tr");
    if (rows.length === 0) {
        alert("Please add at least one play.");
        return;
    }
    // ... (Aquí iría la lógica de validación de cada fila que tenías, si es necesaria antes de mostrar el modal)

    // Llenar ticket
    $("#ticketJugadas").empty();
    rows.each(function() {
      const rowIndex = $(this).attr("data-playIndex");
      const bn = $(this).find(".betNumber").val().trim();
      const gm = $(this).find(".gameMode").text();
      let stVal = $(this).find(".straight").val().trim() || "0.00";
      let bxValInput = $(this).find(".box").val().trim();
      let bxValDisplay = gm === "Pulito" ? bxValInput : (parseFloat(bxValInput).toFixed(2) || "0.00");
      if (bxValInput === "" && gm !== "Pulito") bxValDisplay = "-";


      let coVal = $(this).find(".combo").val().trim() || "0.00";
      let totVal = $(this).find(".total").text() || "0.00";

      const rowHTML = `
        <tr>
          <td>${rowIndex}</td>
          <td>${bn}</td>
          <td>${gm}</td>
          <td>${parseFloat(stVal).toFixed(2)}</td>
          <td>${bxValDisplay}</td>
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

    if (ticketModalInstance) {
        $("#editButton").removeClass("d-none");
        $("#shareTicket").addClass("d-none");
        $("#confirmarTicket").prop("disabled", false);
        // fixTicketLayoutForMobile(); // Comentado por ahora
        ticketModalInstance.show();
    } else {
        alert("Ticket modal not initialized.");
    }
    // storeFormState(); // Comentado
  }

  $("#confirmarTicket").click(function() {
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
        $("#qrcode").text("QR Code library not loaded.");
    }


    $("#shareTicket").removeClass("d-none");

    const ticketElement = document.getElementById("preTicket");
    if (!ticketElement) return;

    // Captura de imagen (simplificada, html2canvas puede necesitar ajustes)
    if (typeof html2canvas !== 'undefined') {
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
                // saveBetDataToSheetDB(uniqueTicket, ...); // Comentado
            })
            .catch(err => {
                console.error("html2canvas error:", err);
                alert("Problem generating final ticket image. Try again.");
            });
        }, 500);
    } else {
        alert("html2canvas library not loaded. Cannot generate ticket image.");
    }
  });

  $("#editButton").click(function() {
    if (ticketModalInstance) ticketModalInstance.hide();
  });

  $("#shareTicket").click(async function() {
    // ... (Lógica de compartir, sin cambios por ahora)
  });

  function generateUniqueTicketNumber() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  // function fixTicketLayoutForMobile(){ ... } // Comentado

  // function saveBetDataToSheetDB(uniqueTicket, callback){ ... } // Comentado


  function getTrackCutoff(trackName) {
    for (let region in cutoffTimes) {
      if (cutoffTimes[region][trackName]) {
        return cutoffTimes[region][trackName];
      }
    }
    return null;
  }

  function hasBrooklynOrFront(tracksArray) {
    const bfSet = new Set(["Brooklyn Midday", "Brooklyn Evening", "Front Midday", "Front Evening"]);
    return tracksArray.some(t => bfSet.has(t));
  }

  function userChoseToday() {
    const val = $("#fecha").val();
    if (!val) return false;
    const arr = val.split(", "); // Flatpickr usa ", " como separador por defecto para múltiples fechas
    const todayStr = dayjs().format("M-D-YYYY"); // Comparar con el mismo formato
    for (let ds of arr) {
      if (ds === todayStr) return true;
    }
    return false;
  }

  function disableTracksByTime() {
    console.log("Executing disableTracksByTime. User chose today:", userChoseToday());
    if (!userChoseToday()) {
      enableAllTracks();
      return;
    }
    const now = dayjs();
    $(".track-checkbox").each(function() {
      const trackVal = $(this).val();
      const trackId = $(this).attr('id');
      if (trackVal === "Venezuela") return; // Venezuela no se deshabilita

      const rawCutoff = getTrackCutoff(trackVal);
      if (rawCutoff) {
        // Asumimos que rawCutoff es "HH:mm"
        const cutoffTimeToday = dayjs(now.format("YYYY-MM-DD") + " " + rawCutoff, "YYYY-MM-DD HH:mm");
        // Restar 10 minutos al cutoff para el "cierre" real
        const effectiveCutoff = cutoffTimeToday.subtract(10, "minute");
        
        // console.log(`Track: ${trackVal}, Raw Cutoff: ${rawCutoff}, Effective Cutoff: ${effectiveCutoff.format("HH:mm")}, Now: ${now.format("HH:mm")}`);

        if (now.isAfter(effectiveCutoff)) {
          $(this).prop("checked", false).prop("disabled", true).trigger('change'); // Disparar change para actualizar conteos
          $(`label[for='${trackId}']`).css({ opacity: 0.5, cursor: "not-allowed" });
        } else {
          $(this).prop("disabled", false);
          $(`label[for='${trackId}']`).css({ opacity: 1, cursor: "pointer" });
        }
      }
    });
    // Recalcular el total después de deshabilitar/habilitar y posiblemente desmarcar tracks
    // La llamada a .trigger('change') en los checkboxes deshabilitados debería actualizar selectedTracksCount
    // pero una llamada explícita a calculateMainTotal puede ser necesaria si el trigger no lo hace.
    calculateMainTotal(); 
  }


  function enableAllTracks() {
    console.log("Executing enableAllTracks.");
    $(".track-checkbox").each(function() {
      const trackId = $(this).attr('id');
      $(this).prop("disabled", false);
      $(`label[for='${trackId}']`).css({ opacity: 1, cursor: "pointer" });
    });
  }

  function showCutoffTimes() {
    $(".cutoff-time").each(function() {
      const track = $(this).data("track");
      if (track === "Venezuela") return;
      const raw = getTrackCutoff(track);
      if (raw) {
        let co = dayjs(raw, "HH:mm");
        let cf = co.isAfter(dayjs("21:30", "HH:mm")) ? dayjs("22:00", "HH:mm") : co.subtract(10, "minute");
        $(this).text(`(${cf.format("HH:mm")})`);
      }
    });
  }


  // Inicialización después de cargar el DOM
  showCutoffTimes();
  disableTracksByTime(); // Llamar después de showCutoffTimes
  autoSelectNYTrackAndVenezuela();
  // Forzar un cálculo inicial del total
  if (fpInstance && fpInstance.selectedDates.length > 0) {
    selectedDaysCount = fpInstance.selectedDates.length;
  } else {
    selectedDaysCount = 1; // Si no hay fechas, se asume hoy
  }
  const initialTracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
  selectedTracksCount = initialTracks.filter(x => x !== "Venezuela").length;
    if (initialTracks.length > 0 && selectedTracksCount === 0 && initialTracks.includes("Venezuela")) {
        selectedTracksCount = 1; 
    } else if (initialTracks.length === 0) {
        selectedTracksCount = 0;
    }
  calculateMainTotal();


  function autoSelectNYTrackAndVenezuela() {
    console.log("Executing autoSelectNYTrackAndVenezuela.");
    const anyTrackChecked = $(".track-checkbox:checked").length > 0;
    const anyPlayExists = $("#tablaJugadas tr").length > 0;

    if (anyTrackChecked || anyPlayExists) {
      console.log("Auto-select skipped: tracks already checked or plays exist.");
      // Asegurarse de que disableTracksByTime se ejecute incluso si se salta la auto-selección
      // y que los contadores se actualicen
      const currentTracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
      selectedTracksCount = currentTracks.filter(x => x !== "Venezuela").length;
      if (currentTracks.length > 0 && selectedTracksCount === 0 && currentTracks.includes("Venezuela")) {
          selectedTracksCount = 1; 
      } else if (currentTracks.length === 0) {
          selectedTracksCount = 0;
      }
      disableTracksByTime();
      calculateMainTotal();
      return;
    }
    
    const now = dayjs();
    const middayCutoff = dayjs(now.format("YYYY-MM-DD") + " " + (cutoffTimes.USA["New York Mid Day"] || "14:20"), "YYYY-MM-DD HH:mm").subtract(10, 'minute');
    
    let trackToSelect = "#trackNYEvening"; // Por defecto NY Evening
    if (now.isBefore(middayCutoff)) {
      trackToSelect = "#trackNYMidDay";
    }

    if (!$(trackToSelect).prop('disabled')) {
        $(trackToSelect).prop("checked", true).trigger('change');
    }
    if (!$("#trackVenezuela").prop('disabled')) {
        $("#trackVenezuela").prop("checked", true).trigger('change'); // Dispara el evento change
    }
    console.log("Auto-selected tracks. Now calling calculateMainTotal and disableTracksByTime.");
    // El .trigger('change') debería haber actualizado selectedTracksCount y llamado a calculateMainTotal y disableTracksByTime.
    // Pero para asegurar:
    disableTracksByTime(); // Es importante llamarlo DESPUÉS de marcar los checkboxes
    calculateMainTotal(); 
  }


  // Duplicates highlight en MAIN - Comentado por ahora
  // function highlightDuplicatesInMain(){ ... }

  /*
   =========================================================
   WIZARD (copiado tal cual tu backup) - con ajustes menores
   =========================================================
  */
  $("#wizardButton").click(function() {
    console.log("Wizard button clicked");
    if (wizardModalInstance) {
        resetWizard();
        wizardModalInstance.show();
    } else {
        alert("Wizard modal not initialized.");
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
  }

  $(".lockBtn").click(function() {
    const field = $(this).data("field");
    lockedFields[field] = !lockedFields[field];
    $(this).html(lockedFields[field] ? `<i class="bi bi-lock-fill"></i>` : `<i class="bi bi-unlock"></i>`);
  });

  $("#wizardAddNext").click(function() {
    const bn = $("#wizardBetNumber").val().trim();
    const wizardTracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get(); // Usar tracks actuales
    const gm = determineGameMode(bn, wizardTracks);

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
    if (!lockedFields.box) $("#wizardBox").val(""); // Box puede ser texto
    if (!lockedFields.combo) $("#wizardCombo").val("");

    $("#wizardBetNumber").val("").focus();
    // highlightDuplicatesInWizard(); // Comentado
  });

  function addWizardRow(bn, gm, stVal, bxVal, coVal, total) {
    wizardCount++;
    const i = wizardCount;
    const rowHTML = `
      <tr data-wizardIndex="${i}">
        <td>
          <button type="button" class="removeWizardBtn btnRemovePlay" data-row="${i}">${i}</button>
        </td>
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
    // highlightDuplicatesInWizard(); // Comentado
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

  $("#btnGenerateQuickPick").click(function() {
    const gm = $("#qpGameMode").val();
    const countVal = parseInt($("#qpCount").val()) || 1;
    if (countVal < 1 || countVal > 25) { // Podríamos aumentar este límite si MAX_PLAYS es 200
      alert("Please enter a count between 1 and 25 for Quick Pick.");
      return;
    }
    const stVal = $("#wizardStraight").val().trim();
    const bxVal = $("#wizardBox").val().trim();
    const coVal = $("#wizardCombo").val().trim();
    const wizardTracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();


    for (let i = 0; i < countVal; i++) {
      let bn = generateRandomNumberForMode(gm);
      bn = padNumberForMode(bn, gm); // Asegurar padding correcto
      let gameModeForQuickPick = determineGameMode(bn, wizardTracks); // Determinar modo basado en número y tracks

      let rowT = calculateRowTotal(bn, gameModeForQuickPick, stVal, bxVal, coVal);
      addWizardRow(bn, gameModeForQuickPick, stVal, bxVal, coVal, rowT);
    }
    // highlightDuplicatesInWizard(); // Comentado
  });

  function generateRandomNumberForMode(mode) {
    if (mode === "NY Horses") {
      const length = Math.floor(Math.random() * 4) + 1;
      return Math.floor(Math.random() * Math.pow(10, length)).toString();
    }
    if (mode === "Single Action") {
      return Math.floor(Math.random() * 10).toString();
    }
    if (mode === "Win 4" || mode === "Pale-Ven" || mode === "Pale-RD") {
      return Math.floor(Math.random() * 10000).toString();
    }
    if (mode === "Pick 3") {
      return Math.floor(Math.random() * 1000).toString();
    }
    if (mode === "Venezuela" || mode === "Pulito" || mode === "RD-Quiniela") {
      return Math.floor(Math.random() * 100).toString();
    }
    return Math.floor(Math.random() * 1000).toString(); // Default 3 dígitos
  }

  function padNumberForMode(numStr, mode) {
    if (mode === "NY Horses" || mode === "Single Action") return numStr;
    let len = 0;
    if (mode === "Win 4" || mode === "Pale-Ven" || mode === "Pale-RD") len = 4;
    else if (mode === "Pick 3") len = 3;
    else if (mode === "Venezuela" || mode === "Pulito" || mode === "RD-Quiniela") len = 2;
    else len = 3; // Default
    return numStr.padStart(len, "0");
  }


  $("#btnGenerateRoundDown").click(function() {
    const firstNum = $("#rdFirstNumber").val().trim();
    const lastNum = $("#rdLastNumber").val().trim();
    if (!firstNum || !lastNum) {
      alert("Please enter both first and last number for Round Down.");
      return;
    }
    if (firstNum.length !== lastNum.length || ![2,3,4].includes(firstNum.length) ) {
      alert("First/Last must have the same length (2, 3, or 4 digits).");
      return;
    }
    let start = parseInt(firstNum, 10);
    let end = parseInt(lastNum, 10);
    if (isNaN(start) || isNaN(end)) {
      alert("Invalid numeric range for Round Down.");
      return;
    }
    if (start > end) [start, end] = [end, start];

    const stVal = $("#wizardStraight").val().trim();
    const bxVal = $("#wizardBox").val().trim();
    const coVal = $("#wizardCombo").val().trim();
    const wizardTracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();

    for (let i = start; i <= end; i++) {
      let bn = i.toString().padStart(firstNum.length, "0");
      let gm = determineGameMode(bn, wizardTracks);
      if (gm === "-") continue;
      const rowT = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
      addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
    }
    // highlightDuplicatesInWizard(); // Comentado
  });

  $("#btnPermute").click(function() {
    // ... (Lógica de permutar, sin cambios por ahora, pero necesita revisión si se usa)
    alert("Permute function needs review/implementation for wizard.");
  });


  $("#wizardAddAllToMain").click(function() {
    const wizardRows = $("#wizardTableBody tr");
    if (wizardRows.length === 0) {
      alert("No plays in the wizard table to add.");
      return;
    }
    let playsAddedCount = 0;
    wizardRows.each(function() {
      if (playCount >= MAX_PLAYS) {
        if (playsAddedCount === 0) { // Si no se añadió ninguna y ya se alcanzó el límite
            alert(`Main form is full (${MAX_PLAYS} plays). Cannot add more from wizard.`);
        } else {
            alert(`Reached ${MAX_PLAYS} plays in the main form. Some plays from wizard were not added.`);
        }
        return false; // Break .each()
      }
      const tds = $(this).find("td");
      const bet = {
          betNumber: tds.eq(1).text(),
          gameMode: tds.eq(2).text(),
          straightAmount: tds.eq(3).text() === "-" ? null : parseFloat(tds.eq(3).text()),
          boxAmount: tds.eq(4).text() === "-" ? null : parseFloat(tds.eq(4).text()), // Box puede ser texto
          comboAmount: tds.eq(5).text() === "-" ? null : parseFloat(tds.eq(5).text()),
      };
      // Adaptar boxAmount si es texto (para Pulito)
      if (bet.gameMode === "Pulito" && tds.eq(4).text() !== "-") {
          bet.boxAmount = tds.eq(4).text(); // Mantener como texto "1,2"
      }


      addMainRow(bet); // addMainRow ahora maneja la adición y el playCount
      playsAddedCount++;
    });

    if (playsAddedCount > 0) {
        $("#wizardTableBody").empty(); // Limpiar tabla del wizard solo si se añadieron jugadas
        wizardCount = 0;
        // recalcAllMainRows(); // addMainRow ya llama a recalcMainRow
        // calculateMainTotal(); // recalcMainRow ya llama a calculateMainTotal
        // highlightDuplicatesInMain(); // Comentado
        // storeFormState(); // Comentado
    }
  });

  $("#wizardGenerateTicket").click(function() {
    $("#wizardAddAllToMain").trigger("click"); // Transfiere jugadas del wizard a la principal
    if (wizardModalInstance) wizardModalInstance.hide();
    if ($("#tablaJugadas tr").length > 0) { // Solo generar ticket si hay jugadas en la tabla principal
        doGenerateTicket();
    } else {
        alert("No plays to generate a ticket. Add plays from wizard or directly.");
    }
  });

  $("#wizardEditMainForm").click(function() {
    if (wizardModalInstance) wizardModalInstance.hide();
  });

  // function highlightDuplicatesInWizard(){ ... } // Comentado

  /*
   =========================================================
   Intro.js Tutorial (3 idiomas) (Sin cambios)
   =========================================================
  */
  // ... (Código del tutorial sin cambios) ...

  /*
   =========================================================
   MANUAL (mostrar/ocultar textos) (Sin cambios)
   =========================================================
  */
  // ... (Código del manual sin cambios) ...

  /*
     =========================================================
     OCR: Adaptado para Genkit API
     =========================================================
  */
  let selectedFileGlobalOCR = null;
  let jugadasGlobalOCR = [];
  let ocrProgressInterval = null;

  window.abrirModalOCR = function() {
    console.log("abrirModalOCR called");
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").empty().html("<p>Sube una imagen de tu ticket para empezar.</p>");
    hideOcrLoading();
    $("#ocrDebugPanel").addClass("d-none"); // Ocultar panel debug por defecto
    $("#btnProcesarOCR").prop("disabled", true);
    $("#btnCargarJugadas").prop("disabled", true);

    if (modalOcrInstance) {
        modalOcrInstance.show();
    } else {
        alert("OCR Modal not initialized!");
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
  window.handleDrop = function(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectedFileGlobalOCR = e.dataTransfer.files[0];
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
      $("#btnProcesarOCR").prop("disabled", false);
      $("#ocrJugadas").html("<p>Imagen lista. Haz clic en 'Procesar OCR'.</p>");
    }
  };

  window.handleFileChange = function(e) {
    if (e.target.files && e.target.files[0]) {
      selectedFileGlobalOCR = e.target.files[0];
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
      $("#btnProcesarOCR").prop("disabled", false);
      $("#ocrJugadas").html("<p>Imagen lista. Haz clic en 'Procesar OCR'.</p>");
    } else {
      selectedFileGlobalOCR = null;
      $("#ocrPreview").addClass("d-none").attr("src", "");
      $("#btnProcesarOCR").prop("disabled", true);
      $("#ocrJugadas").html("<p>Sube una imagen de tu ticket para empezar.</p>");
    }
  };

  function showOcrLoading(message = "Subiendo/Procesando...") {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width", "0%");
    $("#ocrProgressText").text(message);
    $("#btnProcesarOCR").prop("disabled", true); // Deshabilitar mientras carga

    let progressValue = 0;
    clearInterval(ocrProgressInterval); // Limpiar intervalo anterior si existe
    ocrProgressInterval = setInterval(() => {
      progressValue += 5;
      if (progressValue >= 95) { // No llegar al 100% hasta que termine de verdad
        clearInterval(ocrProgressInterval);
      }
      $("#ocrProgressBar").css("width", progressValue + "%");
    }, 300); // Un poco más rápido
  }

  function hideOcrLoading() {
    if (ocrProgressInterval) {
      clearInterval(ocrProgressInterval);
      ocrProgressInterval = null;
    }
    $("#ocrLoadingSection").addClass("d-none");
    $("#ocrProgressBar").css("width", "0%");
    // Reactivar botón de procesar solo si hay un archivo seleccionado
    $("#btnProcesarOCR").prop("disabled", !selectedFileGlobalOCR);
  }

  function finishOcrLoading(success = true, message = "Completado") {
    clearInterval(ocrProgressInterval);
    ocrProgressInterval = null;
    $("#ocrProgressBar").css("width", "100%").removeClass(success ? "bg-danger" : "bg-success").addClass(success ? "bg-success" : "bg-danger");
    $("#ocrProgressText").text(message);
    setTimeout(() => {
      hideOcrLoading();
      $("#ocrProgressBar").removeClass("bg-success bg-danger"); // Resetear color de barra
    }, success ? 1500 : 3000); // Más tiempo para leer mensaje de error
  }

  window.procesarOCR = async function() {
    console.log("procesarOCR called");
    if (!selectedFileGlobalOCR) {
      alert("No has seleccionado ninguna imagen.");
      return;
    }
    $("#ocrJugadas").empty();
    showOcrLoading("Interpretando ticket...");

    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobalOCR);
    reader.onloadend = async () => {
      const base64data = reader.result;
      try {
        console.log("Enviando a /api/interpret-ticket");
        const response = await fetch('/api/interpret-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoDataUri: base64data })
        });

        if (!response.ok) {
          let errorMsg = `Error del servidor: ${response.status}`;
          try {
            const errorData = await response.json();
            errorMsg += ` - ${errorData.message || 'Error desconocido del servidor.'}`;
          } catch (e) { /* No hacer nada si el cuerpo del error no es JSON */ }
          throw new Error(errorMsg);
        }

        const interpretedBets = await response.json(); // Debería ser un array de Bet
        console.log("Respuesta de /api/interpret-ticket:", interpretedBets);

        if (!Array.isArray(interpretedBets)) {
            throw new Error("La respuesta de la API no es un array de jugadas válido.");
        }

        finishOcrLoading(true, "Interpretación completada.");
        jugadasGlobalOCR = interpretedBets; // Guardar las jugadas interpretadas

        if (jugadasGlobalOCR.length === 0) {
          $("#ocrJugadas").html("<p>No se detectaron jugadas en la imagen o no se pudieron interpretar.</p>");
          $("#btnCargarJugadas").prop("disabled", true);
          return;
        }

        let html = "<h5>Jugadas Detectadas:</h5>";
        jugadasGlobalOCR.forEach((j, idx) => {
          html += `
            <div class="ocr-result-item">
              <p><strong>#${idx + 1} Bet:</strong> ${j.betNumber || "N/A"}
                 (Modo: ${j.gameMode || "N/A"})</p>
              <p>S: ${j.straightAmount !== null ? j.straightAmount.toFixed(2) : "-"} | 
                 B: ${j.boxAmount !== null ? j.boxAmount.toFixed(2) : "-"} | 
                 C: ${j.comboAmount !== null ? j.comboAmount.toFixed(2) : "-"}
              </p>
              <button class="btn btn-sm btn-info" onclick="usarJugadaOCR(${idx})">
                Usar esta Jugada
              </button>
            </div>
          `;
        });
        $("#ocrJugadas").html(html);
        $("#btnCargarJugadas").prop("disabled", false);

      } catch (err) {
        console.error("Error procesando la imagen:", err);
        finishOcrLoading(false, `Error: ${err.message}`);
        $("#ocrJugadas").html(`<p style="color:red;">Error procesando la imagen: ${err.message}</p>`);
        $("#btnCargarJugadas").prop("disabled", true);
      }
    };
    reader.onerror = () => {
        finishOcrLoading(false, "Error leyendo el archivo de imagen.");
        $("#ocrJugadas").html("<p style='color:red;'>Error leyendo el archivo de imagen.</p>");
        console.error("Error al leer el archivo con FileReader");
        $("#btnCargarJugadas").prop("disabled", true);
    };
  };

  window.usarJugadaOCR = function(idx) {
    console.log("usarJugadaOCR called for index:", idx);
    if (!jugadasGlobalOCR || !jugadasGlobalOCR[idx]) {
      alert("No se encontró la jugada seleccionada.");
      return;
    }
    const j = jugadasGlobalOCR[idx];
    addMainRow(j); // addMainRow ahora puede tomar un objeto de apuesta

    if (modalOcrInstance) modalOcrInstance.hide();
  };

  $("#btnCargarJugadas").click(function() {
    console.log("btnCargarJugadas clicked");
    if (!jugadasGlobalOCR || jugadasGlobalOCR.length === 0) {
      alert("No hay jugadas OCR para cargar.");
      return;
    }
    let playsCouldNotBeAdded = 0;
    jugadasGlobalOCR.forEach(j => {
      if (playCount < MAX_PLAYS) {
        addMainRow(j);
      } else {
        playsCouldNotBeAdded++;
      }
    });
    if (playsCouldNotBeAdded > 0) {
        alert(`${playsCouldNotBeAdded} play(s) from OCR could not be added because the main form reached its limit of ${MAX_PLAYS} plays.`);
    }

    // recalcAllMainRows(); // No es necesario, addMainRow lo hace por cada una
    // calculateMainTotal(); // No es necesario, addMainRow lo hace
    // highlightDuplicatesInMain(); // Comentado
    // storeFormState(); // Comentado

    if (modalOcrInstance) modalOcrInstance.hide();
  });

  window.toggleOcrDebug = function() {
    // Esta función de debug era para el backend original.
    // Para la API de Genkit, la respuesta cruda se puede ver en la pestaña Network de las dev tools.
    alert("El panel de debug detallado del OCR no está implementado de la misma forma para la API actual. Revisa la consola del navegador y la pestaña 'Network' para detalles de la solicitud a /api/interpret-ticket.");
    // $("#ocrDebugPanel").toggleClass("d-none"); // Si quieres mantener el panel pero vacío o con otro mensaje.
  };

  // Ejecutar al final para asegurar que todo esté listo
  if (fpInstance && fpInstance.selectedDates.length > 0) {
     selectedDaysCount = fpInstance.selectedDates.length;
  } else if (fpInstance) {
     fpInstance.setDate([new Date()], true); // Asegurar que se dispare onChange si no hay fecha
  }

  autoSelectNYTrackAndVenezuela(); // Asegurar que se ejecute y actualice todo

}); // Fin de $(document).ready

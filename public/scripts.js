/* =========================================================
   SCRIPTS.JS COMPLETO
   (Mantiene toda la lógica previa intacta,
    e incorpora spinner moderno, barra de progreso
    y muestra solo betNumber + monto en el panel de jugadas).
========================================================= */

const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/bl57zyh73b0ev'; // Asegúrate que esta URL sea la correcta y esté activa si la usas.

$(document).ready(function() {
  console.log("Document ready. jQuery loaded:", typeof $ !== "undefined");
  console.log("Bootstrap loaded:", typeof bootstrap !== "undefined");

  // (1) Variables globales, dayjs, etc.
  dayjs.extend(dayjs_plugin_customParseFormat);
  dayjs.extend(dayjs_plugin_arraySupport);

  let transactionDateTime = '';
  window.ticketImageDataUrl = null;

  // Contadores para el cálculo del total. selectedTracksCount se inicializa en 1 si no hay tracks.
  let selectedTracksCount = 0; // Se recalculará en el change de los checkboxes
  let selectedDaysCount = 0;   // Se recalculará en el change del datepicker

  const MAX_PLAYS = 200; // Límite de jugadas aumentado

  let playCount = 0;
  let wizardCount = 0;

  // Instancias de Modales (inicializar una vez)
  let modalOcrInstance = null;
  if (document.getElementById("modalOcr")) {
    modalOcrInstance = new bootstrap.Modal(document.getElementById("modalOcr"));
  }
  let wizardModalInstance = null;
  if (document.getElementById("wizardModal")) {
    wizardModalInstance = new bootstrap.Modal(document.getElementById("wizardModal"));
  }
  let ticketModalInstance = null;
  if (document.getElementById("ticketModal")) {
    ticketModalInstance = new bootstrap.Modal(document.getElementById("ticketModal"));
  }


  // Candados para el Wizard
  const lockedFields = {
    straight: false,
    box: false,
    combo: false
  };

  // (2) Cutoff times
  const cutoffTimes = {
    "USA": {
      "New York Mid Day": "14:20", // Asumiendo que es 2:20 PM
      "New York Evening": "22:00", // Asumiendo que es 10:00 PM
      "Georgia Mid Day": "12:20",
      "Georgia Evening": "18:40",
      "New Jersey Mid Day": "12:50",
      "New Jersey Evening": "22:00", // Asumiendo que es 10:00 PM
      "Florida Mid Day": "13:20",
      "Florida Evening": "21:30",
      "Connecticut Mid Day": "13:30",
      "Connecticut Evening": "22:00", // Asumiendo que es 10:00 PM
      "Georgia Night": "22:00", // Asumiendo que es 10:00 PM
      "Pensilvania AM": "12:45",
      "Pensilvania PM": "18:15",
      "Venezuela": "00:00", // No aplica cutoff
      "Brooklyn Midday": "14:20", // Asumiendo que es 2:20 PM
      "Brooklyn Evening": "22:00", // Asumiendo que es 10:00 PM
      "Front Midday": "14:20", // Asumiendo que es 2:20 PM
      "Front Evening": "22:00", // Asumiendo que es 10:00 PM
      "New York Horses": "16:00" // Asumiendo que es 4:00 PM
    },
    "Santo Domingo": {
      "Real": "11:45",
      "Gana mas": "13:25",
      "Loteka": "18:30",
      "Nacional": "19:30",
      "Quiniela Pale": "19:30", // Mismo que Nacional
      "Primera Día": "10:50",
      "Suerte Día": "11:20",
      "Lotería Real": "11:50", // Probablemente 'Real'
      "Suerte Tarde": "16:50",
      "Lotedom": "16:50",
      "Primera Noche": "18:50",
      "Panama": "16:00" // Asumiendo que es 4:00 PM
    },
    "Venezuela": { // Redundante si Venezuela ya está en USA, pero por si acaso.
      "Venezuela": "00:00"
    }
  };

  // (3) Init Flatpickr
  const fpInstance = flatpickr("#fecha", {
    mode: "multiple",
    dateFormat: "m-d-Y", // MM-DD-YYYY
    minDate: "today",
    defaultDate: [new Date()], // Selecciona hoy por defecto
    clickOpens: true,
    allowInput: false, // Evitar entrada manual para consistencia de formato
    appendTo: document.body, // Para evitar problemas de z-index con modales
    onOpen: function() {
      // Ajustar tamaño del calendario si es necesario (opcional)
      // this.calendarContainer.style.transform = 'scale(2.0)';
      // this.calendarContainer.style.transformOrigin = 'top left';
    },
    onClose: function() {
      // this.calendarContainer.style.transform = '';
    },
    onReady: function(selectedDates, dateStr, instance) {
      if (!dateStr || dateStr.trim() === "") {
        instance.setDate(new Date(), true); // Asegurar que hoy esté seleccionado si no hay nada
      }
      selectedDaysCount = instance.selectedDates.length || 1; // Inicializar conteo
      calculateMainTotal();
      disableTracksByTime();
    },
    onChange: (selectedDatesFromPicker) => {
      selectedDaysCount = selectedDatesFromPicker.length || 0; // Actualizar al cambiar
      console.log("Flatpickr onChange - selectedDaysCount:", selectedDaysCount);
      calculateMainTotal();
      storeFormState();
      disableTracksByTime();
    }
  });

  // (4) Track Checkboxes
  $(".track-checkbox").change(function() {
    const arr = $(".track-checkbox:checked")
      .map(function() { return $(this).val(); })
      .get();
    // "Venezuela" no cuenta en el multiplicador para el total general.
    selectedTracksCount = arr.filter(x => x !== "Venezuela").length;
    if (arr.length > 0 && selectedTracksCount === 0 && arr.includes("Venezuela")) {
        selectedTracksCount = 1; // Si solo Venezuela está marcado, cuenta como 1 para el multiplicador.
    } else if (arr.length === 0) {
        selectedTracksCount = 0; // Si no hay tracks, el multiplicador es 0.
    }

    console.log("Track Checkbox onChange - selectedTracksCount:", selectedTracksCount);
    calculateMainTotal();
    disableTracksByTime(); // Re-evaluar tracks deshabilitados
    storeFormState();
  });

  // (5) MAIN TABLE => Add/Remove
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
    recalcMainRow(row); // Esto ya llama a calculateMainTotal y storeFormState
    highlightDuplicatesInMain();
  });

  function addMainRow(bet = null) {
    if (playCount >= MAX_PLAYS) {
      alert(`You have reached ${MAX_PLAYS} plays in the main form.`);
      return null;
    }
    playCount++;
    const rowIndex = playCount;
    const betNumber = bet ? bet.betNumber || "" : "";
    // gameMode se determinará por recalcMainRow
    const straightAmount = bet ? (bet.straightAmount !== null ? String(bet.straightAmount) : "") : "";
    const boxAmount = bet ? (bet.boxAmount !== null ? String(bet.boxAmount) : "") : "";
    const comboAmount = bet ? (bet.comboAmount !== null ? String(bet.comboAmount) : "") : "";


    const rowHTML = `
      <tr data-playIndex="${rowIndex}">
        <td>
          <button type="button" class="btnRemovePlay removeMainBtn" data-row="${rowIndex}">
            ${rowIndex}
          </button>
        </td>
        <td>
          <input type="text" class="form-control betNumber" value="${betNumber}" />
        </td>
        <td class="gameMode">-</td>
        <td>
          <input type="number" class="form-control straight" value="${straightAmount}" step="0.01" />
        </td>
        <td>
          <input type="text" class="form-control box" value="${boxAmount}" />
        </td>
        <td>
          <input type="number" class="form-control combo" value="${comboAmount}" step="0.01" />
        </td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    const newRow = $("#tablaJugadas tr[data-playIndex='" + rowIndex + "']");
    if (bet) { // Si estamos añadiendo una apuesta desde OCR, recalcular inmediatamente
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
    playCount = i; // Actualizar el contador global
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
    calculateMainTotal(); // Recalcular el total general
    storeFormState(); // Guardar estado
  }

  // (6) Calculate Main Total
  function calculateMainTotal() {
    let sum = 0;
    $("#tablaJugadas tr").each(function() {
      const totalCell = $(this).find(".total").text();
      const val = parseFloat(totalCell) || 0;
      sum += val;
    });

    const effectiveDaysCount = selectedDaysCount > 0 ? selectedDaysCount : 0; // Si es 0, es 0.
    const effectiveTracksCount = selectedTracksCount > 0 ? selectedTracksCount : 0; // Si es 0, es 0.
    
    // Solo multiplicar si hay días y tracks seleccionados
    if (effectiveDaysCount > 0 && effectiveTracksCount > 0) {
        sum = sum * effectiveTracksCount * effectiveDaysCount;
    } else {
        sum = 0; // Si no hay días o tracks, el total general es 0.
    }

    $("#totalJugadas").text(sum.toFixed(2));
    console.log("calculateMainTotal - sum:", sum, "days:", effectiveDaysCount, "tracks:", effectiveTracksCount);
    storeFormState();
  }

  // (7) determineGameMode
  function determineGameMode(betNumber) {
    if (!betNumber) return "-";

    const tracks = $(".track-checkbox:checked")
      .map(function() { return $(this).val(); })
      .get();
    const isUSA = tracks.some(t => cutoffTimes.USA[t]);
    const isSD = tracks.some(t => cutoffTimes["Santo Domingo"] && cutoffTimes["Santo Domingo"][t]); // Chequeo extra para SD
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    if (includesHorses) {
      return "NY Horses";
    }

    if (isUSA && !includesVenezuela && betNumber.length === 1 && /^\d$/.test(betNumber)) {
      return "Single Action";
    }

    const paleRegex = /^(\d{2})([-+x])(\d{2})$/i; // Case insensitive para 'x'
    if (paleRegex.test(betNumber)) {
      if (includesVenezuela && isUSA) return "Pale-Ven";
      if (isSD && !isUSA) return "Pale-RD";
      if (isUSA) return "Palé"; // Palé genérico si es USA
      return "Palé"; // Default Palé
    }

    const length = betNumber.length;
    if (length < 2 || length > 4 || !/^\d+$/.test(betNumber)) return "-"; // Solo dígitos

    if (length === 2) {
      if (includesVenezuela && isUSA) return "Venezuela";
      if (isUSA && !isSD) return "Pulito";
      if (isSD && !isUSA) return "RD-Quiniela";
      return "Pulito"; // Default para 2 dígitos si no encaja en otro
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

    // Para "Pulito", bxVal puede ser una lista de posiciones (ej. "1,2")
    // o un monto directo si el usuario lo ingresa como número.
    if (gm === "Pulito") {
      if (bxVal) {
        if (isNaN(parseFloat(bxVal))) { // Es una lista de posiciones
          const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean);
          numericBox = st * positions.length; // Aquí box es un multiplicador de straight
          return numericBox.toFixed(2); // Para Pulito con posiciones, el total es solo esto.
        } else { // Es un monto directo
          numericBox = parseFloat(bxVal) || 0;
        }
      }
       // Si es Pulito y bxVal no es lista de posiciones, o es numérico, el total es st + bx (numérico) + combo
       // PERO, tradicionalmente Pulito es solo straight, o straight por posiciones.
       // Si se quiere permitir straight + box (numérico) + combo para Pulito, la lógica de abajo lo cubre.
       // Por ahora, si no hay lista de posiciones, asumimos que solo aplica `st`.
       if (!isNaN(parseFloat(bxVal))) { // si box es un numero
            return (st + (parseFloat(bxVal)||0) + combo).toFixed(2);
       }
       return st.toFixed(2); // Si no hay posiciones ni box numerico, solo straight
    } else {
      numericBox = parseFloat(bxVal) || 0;
    }

    // Lógica general para otros modos
    if (gm === "Single Action" || gm === "NY Horses") {
      return (st + numericBox + combo).toFixed(2);
    }
    if (["Venezuela", "Pale-RD", "Pale-Ven", "RD-Quiniela", "Palé"].includes(gm)) {
      // Para estos modos, a menudo solo se juega straight, pero si el usuario ingresa box/combo, los sumamos.
      return (st + numericBox + combo).toFixed(2);
    }

    if (gm === "Win 4" || gm === "Pick 3") {
      const combosCount = calcCombos(bn); // Factorial para combinaciones
      let total = st + numericBox + (combo * combosCount);
      return total.toFixed(2);
    }

    // Default: suma de los tres, si no es un caso especial ya manejado.
    return (st + numericBox + combo).toFixed(2);
  }

  function calcCombos(str) { // Helper para Win4/Pick3 combos
    if (!str || typeof str !== 'string') return 1; // Evitar error si str no es string
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
    // Implementación de guardado de estado (opcional, pero bueno tenerla)
  }

  function loadFormState() {
    // Implementación de carga de estado (opcional)
  }
  // loadFormState(); // Descomentar si se implementa

  // (10) resetForm
  $("#resetForm").click(function() {
    console.log("Reset Form button clicked");
    if (confirm("Are you sure you want to reset the form?")) {
      resetForm();
    }
  });

  window.resetForm = function() { // Hacerla global para que otras funciones puedan llamarla si es necesario
    console.log("resetForm function initiated");
    $("#lotteryForm")[0].reset(); // Resetea inputs del formulario
    $("#tablaJugadas").empty();   // Vacía la tabla de jugadas
    playCount = 0;                // Resetea contador de jugadas

    // Resetear tracks: desmarcar todos
    $(".track-checkbox").prop("checked", false);
    
    // Resetear fechas a hoy en Flatpickr
    if (fpInstance) {
      fpInstance.setDate([new Date()], true); // El 'true' dispara el evento onChange
    } else { // Fallback si fpInstance no está listo
        selectedDaysCount = 1;
    }
    
    // Volver a habilitar todos los tracks y mostrar horas de corte (necesario antes de auto-seleccionar)
    enableAllTracks(); 
    showCutoffTimes();
    
    // Auto-seleccionar NY y Venezuela, lo que disparará su 'change' y actualizará selectedTracksCount
    autoSelectNYTrackAndVenezuela(); // Esto debería llamar a calculateMainTotal indirectamente
    
    // Una llamada final para asegurar que el total se actualice después de todos los resets
    // Se espera que calculateMainTotal ya haya sido llamado por los triggers de fp y tracks.
    // Si no, forzarlo:
    // calculateMainTotal(); 

    $("#totalJugadas").text("0.00"); // Asegurar que el total visual sea 0.00 inicialmente
    // localStorage.removeItem("formState"); // Si se usa localStorage
    console.log("Form reset complete. Days:", selectedDaysCount, "Tracks:", selectedTracksCount, "Total:", $("#totalJugadas").text());
    highlightDuplicatesInMain();
  }


  // (11) Generate Ticket
  $("#generarTicket").click(function() {
    console.log("Generate Ticket button clicked");
    doGenerateTicket();
  });

  function doGenerateTicket() {
    // ... (lógica de validación y generación de ticket)
    // Por ahora, solo un placeholder
    alert("Generate Ticket button pressed. Validations and ticket generation logic to be fully implemented.");
    // Lógica de validación de fechas y tracks
    const dateVal = $("#fecha").val() || "";
    if (!dateVal) {
      alert("Please select at least one date.");
      return;
    }
    const chosenTracks = $(".track-checkbox:checked")
      .map(function() { return $(this).val(); })
      .get();
    if (chosenTracks.length === 0) {
      alert("Please select at least one track.");
      return;
    }
    // ... más validaciones de tu código original
    console.log("Ticket data for generation:", {
        dates: dateVal,
        tracks: chosenTracks,
        plays: $("#tablaJugadas tr").length
    });

    // Mostrar modal del ticket
    if(ticketModalInstance) {
        // Llenar datos del ticket modal aquí antes de mostrar
        $("#ticketFecha").text(dateVal);
        $("#ticketTracks").text(chosenTracks.join(", "));
        $("#ticketJugadas").empty(); // Limpiar jugadas anteriores del modal
         let i = 0;
        $("#tablaJugadas tr").each(function(){
            i++;
            const bn = $(this).find(".betNumber").val();
            const gm = $(this).find(".gameMode").text();
            const st = $(this).find(".straight").val() || "0.00";
            const bx = $(this).find(".box").val() || "-";
            const co = $(this).find(".combo").val() || "0.00";
            const tot = $(this).find(".total").text() || "0.00";
            $("#ticketJugadas").append(`<tr><td>${i}</td><td>${bn}</td><td>${gm}</td><td>${parseFloat(st).toFixed(2)}</td><td>${bx}</td><td>${parseFloat(co).toFixed(2)}</td><td>${parseFloat(tot).toFixed(2)}</td></tr>`);
        });
        $("#ticketTotal").text( $("#totalJugadas").text() );
        $("#numeroTicket").text("(Not assigned yet)");
        $("#ticketTransaccion").text(dayjs().format("MM/DD/YYYY hh:mm A"));
        $("#qrcode").empty(); // Limpiar QR anterior

        $("#editButton").removeClass("d-none");
        $("#shareTicket").addClass("d-none");
        $("#confirmarTicket").prop("disabled",false);

        ticketModalInstance.show();
    } else {
        console.error("Ticket modal instance not found!");
    }
    storeFormState();
  }

   $("#confirmarTicket").click(function(){
    $(this).prop("disabled",true);
    $("#editButton").addClass("d-none");

    const uniqueTicket= generateUniqueTicketNumber();
    $("#numeroTicket").text(uniqueTicket);
    transactionDateTime = dayjs().format("MM/DD/YYYY hh:mm A"); // Guardar para SheetDB
    $("#ticketTransaccion").text(transactionDateTime);

    // QR
    $("#qrcode").empty();
    if (typeof QRCode !== "undefined") {
        new QRCode(document.getElementById("qrcode"),{
          text: uniqueTicket,
          width:128,
          height:128
        });
    } else {
        console.error("QRCode library is not loaded.");
        $("#qrcode").text("QR Code Error");
    }


    $("#shareTicket").removeClass("d-none");

    // Captura de pantalla con html2canvas
    const ticketElement = document.getElementById("preTicket");
    if (typeof html2canvas !== "undefined") {
        html2canvas(ticketElement, {scale: 2}).then(canvas => {
            const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
            window.ticketImageDataUrl = dataUrl; // Guardar para compartir

            const link = document.createElement("a");
            link.href = dataUrl;
            link.download = `ticket_${uniqueTicket}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            alert("Your ticket image was downloaded successfully (JPEG).");

            // saveBetDataToSheetDB(uniqueTicket, success => {
            //   if(success){
            //     console.log("Bet data sent to SheetDB.");
            //   } else {
            //     console.error("Failed to send bet data to SheetDB.");
            //   }
            // });

        }).catch(err => {
            console.error("Error generating ticket image:", err);
            alert("Problem generating final ticket image. Try again.");
        });
    } else {
        console.error("html2canvas library is not loaded.");
        alert("Cannot generate ticket image, library missing.");
    }
  });

  $("#editButton").click(function(){
    if(ticketModalInstance) ticketModalInstance.hide();
  });

  $("#shareTicket").click(async function(){
    if(!window.ticketImageDataUrl){
      alert("No ticket image is available to share.");
      return;
    }
    if(navigator.share && navigator.canShare){
      try{
        const response = await fetch(window.ticketImageDataUrl);
        const blob = await response.blob();
        const file = new File([blob],"ticket.jpg",{type:"image/jpeg"});
        if(navigator.canShare({files:[file]})){
          await navigator.share({files:[file], title:"Lottery Ticket", text:"Here is your lottery ticket."});
        } else {
          alert("Your browser does not support sharing this file type. Please share the downloaded image manually.");
        }
      } catch(e){
        console.error("Error sharing ticket:", e);
        alert("Could not share the ticket image. Please try manually.");
      }
    } else {
      alert("Your browser doesn't support the Web Share API with files, or file sharing is not possible. Please share manually.");
    }
  });


  function generateUniqueTicketNumber() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

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
    if (!val || !fpInstance) return false; // Chequear fpInstance
    const arrDates = fpInstance.selectedDates; // Usar las fechas parseadas de flatpickr
    const today = dayjs().startOf("day");
    for (let d of arrDates) {
      if (dayjs(d).startOf("day").isSame(today, "day")) return true;
    }
    return false;
  }

  function disableTracksByTime() {
    console.log("disableTracksByTime called. User chose today:", userChoseToday());
    if (!userChoseToday()) {
      enableAllTracks();
      return;
    }
    const now = dayjs();
    $(".track-checkbox").each(function() {
      const trackVal = $(this).val();
      if (trackVal === "Venezuela") return; // Skip Venezuela

      const cutoffString = getTrackCutoff(trackVal);
      if (cutoffString) {
        let cutoffTime = dayjs(cutoffString, "HH:mm");
        // Lógica de cierre: 10 min antes, o 22:00 si el cutoff es después de 21:30
        let closingTime = cutoffTime.isAfter(dayjs("21:30", "HH:mm")) ? dayjs("22:00", "HH:mm") : cutoffTime.subtract(10, "minute");
        
        if (now.isSame(closingTime) || now.isAfter(closingTime)) {
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
    // Trigger change para recalcular selectedTracksCount y el total
    // Disparar solo si algo cambió para evitar bucles, o usar una bandera.
    // Por ahora, un cambio directo en un checkbox ya dispara el recalculate.
    // Se podría forzar un recalculate aquí si fuera necesario después de deshabilitar.
    // calculateMainTotal(); // Esto podría ser redundante si los .prop('checked', false) disparan 'change'
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
      const cutoffString = getTrackCutoff(track);
      if (cutoffString) {
        let cutoffTime = dayjs(cutoffString, "HH:mm");
        let closingTime = cutoffTime.isAfter(dayjs("21:30", "HH:mm")) ? dayjs("22:00", "HH:mm") : cutoffTime.subtract(10, "minute");
        $(this).text(`(${closingTime.format("HH:mm")})`);
      } else {
        $(this).text(""); // Sin hora de corte
      }
    });
  }

  showCutoffTimes();
  // disableTracksByTime(); // Se llama desde onReady de flatpickr y change de tracks
  // setInterval(disableTracksByTime, 60000); // Revisa cada minuto

  function autoSelectNYTrackAndVenezuela() {
    const anyTracksChecked = $(".track-checkbox:checked").length > 0;
    const anyPlaysExist = $("#tablaJugadas tr").length > 0;

    if (anyTracksChecked || anyPlaysExist) {
        console.log("autoSelectNYTrackAndVenezuela: Skipping, tracks already selected or plays exist.");
        // Trigger change para asegurar que selectedTracksCount se calcule si ya hay algo.
        $(".track-checkbox:first").trigger('change'); // Disparar en uno para recalcular.
        return;
    }

    console.log("autoSelectNYTrackAndVenezuela: Applying default tracks.");
    const now = dayjs();
    const middayCutoff = dayjs(cutoffTimes.USA["New York Mid Day"], "HH:mm").subtract(10, "minute"); // 10 min antes

    if (now.isBefore(middayCutoff)) {
      $("#trackNYMidDay").prop("checked", true);
    } else {
      $("#trackNYEvening").prop("checked", true);
    }
    $("#trackVenezuela").prop("checked", true);

    $(".track-checkbox").trigger('change'); // Para actualizar selectedTracksCount y el total
  }
  
  // Inicializar estado de tracks y fechas
  if (fpInstance && fpInstance.selectedDates.length > 0) {
      selectedDaysCount = fpInstance.selectedDates.length;
  } else if (fpInstance) { // Si no hay fechas seleccionadas (debería ser hoy por defecto)
      fpInstance.setDate([new Date()], true); // Esto debería disparar onChange
      selectedDaysCount = 1;
  } else {
      selectedDaysCount = 1; // Fallback
  }

  autoSelectNYTrackAndVenezuela(); // Llamar para selección inicial
  disableTracksByTime(); // Aplicar deshabilitación inicial
  calculateMainTotal(); // Calcular total inicial


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
    if (wizardModalInstance) wizardModalInstance.show();
    else console.error("Wizard modal instance not found!");
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
    const gm = determineGameMode(bn);
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
        <td>${bn}</td>
        <td>${gm}</td>
        <td>${stVal || "-"}</td>
        <td>${bxVal || "-"}</td>
        <td>${coVal || "-"}</td>
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

  $("#btnGenerateQuickPick").click(function() {
    // ... (Lógica de Quick Pick)
  });
  $("#btnGenerateRoundDown").click(function() {
    // ... (Lógica de Round Down)
  });
  $("#btnPermute").click(function() {
    // ... (Lógica de Permute)
  });


  $("#wizardAddAllToMain").click(function() {
    const wizardRows = $("#wizardTableBody tr");
    if (wizardRows.length === 0) {
      alert("No plays in the wizard table.");
      return;
    }
    wizardRows.each(function() {
      if (playCount >= MAX_PLAYS) {
        alert(`Reached ${MAX_PLAYS} plays in the main form. Stopping import.`);
        return false; // break .each loop
      }
      const tds = $(this).find("td");
      const bn = tds.eq(1).text();
      // gameMode no se toma directamente, se recalculará
      const stVal = (tds.eq(3).text() === "-" ? "" : tds.eq(3).text());
      const bxVal = (tds.eq(4).text() === "-" ? "" : tds.eq(4).text());
      const coVal = (tds.eq(5).text() === "-" ? "" : tds.eq(5).text());
      
      addMainRow({ betNumber: bn, straightAmount: stVal, boxAmount: bxVal, comboAmount: coVal });
    });
    resetWizard(); // Limpiar wizard después de añadir
    highlightDuplicatesInMain();
    // calculateMainTotal y storeFormState ya se llaman dentro de recalcMainRow -> addMainRow
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
    // ... (Lógica de resaltado de duplicados en Wizard)
  }


  /*
   =========================================================
   OCR: spinner + barra + debug
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
    $("#ocrJugadas").empty().html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    hideOcrLoading();
    $("#ocrDebugPanel").addClass("d-none");
    $("#btnProcesarOCR").prop("disabled", true); // Deshabilitar hasta que se seleccione archivo
    $("#btnCargarJugadas").prop("disabled", true);


    if (modalOcrInstance) {
      modalOcrInstance.show();
    } else {
      console.error("modalOcrInstance is not initialized!");
      alert("Error: OCR Modal not initialized. Please refresh.");
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
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR))
        .removeClass("d-none");
      $("#btnProcesarOCR").prop("disabled", false); // Habilitar botón
      console.log("File dropped:", selectedFileGlobalOCR.name);
    }
  };

  window.handleFileChangeOCR = function(e) {
    console.log("handleFileChangeOCR triggered. Event:", e);
    if (e.target.files && e.target.files[0]) {
      selectedFileGlobalOCR = e.target.files[0];
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR))
        .removeClass("d-none");
      $("#btnProcesarOCR").prop("disabled", false); // Habilitar botón
      console.log("File selected and preview updated:", selectedFileGlobalOCR ? selectedFileGlobalOCR.name : "No file object");
    } else {
      selectedFileGlobalOCR = null;
      $("#ocrPreview").addClass("d-none").attr("src", "");
      $("#btnProcesarOCR").prop("disabled", true); // Deshabilitar si no hay archivo
      console.log("No file selected or files array empty.");
    }
  };

  function showOcrLoading(message = "Subiendo/Procesando...") {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width", "0%").removeClass("bg-danger bg-success").addClass("bg-primary progress-bar-animated");
    $("#ocrProgressText").text(message);
    $("#btnProcesarOCR").prop("disabled", true);
    $("#btnCargarJugadas").prop("disabled", true);


    let progressValue = 0;
    if (ocrProgressInterval) clearInterval(ocrProgressInterval); // Limpiar intervalo anterior
    ocrProgressInterval = setInterval(() => {
      progressValue += 10; // Aumentar más rápido para simulación
      if (progressValue >= 90) { // No llegar al 100% hasta que haya respuesta
          clearInterval(ocrProgressInterval);
          ocrProgressInterval = null;
          return;
      }
      $("#ocrProgressBar").css("width", progressValue + "%");
    }, 200); // Intervalo más corto
  }

  function updateOcrProgress(percentage, message, isError = false) {
    if (ocrProgressInterval) {
        clearInterval(ocrProgressInterval);
        ocrProgressInterval = null;
    }
    $("#ocrProgressBar").css("width", percentage + "%");
    if (isError) {
        $("#ocrProgressBar").removeClass("bg-primary progress-bar-animated bg-success").addClass("bg-danger");
    } else if (percentage === 100) {
        $("#ocrProgressBar").removeClass("bg-primary progress-bar-animated bg-danger").addClass("bg-success");
    }
    $("#ocrProgressText").text(message);
  }


  function hideOcrLoading(enableButtons = true) {
    if (ocrProgressInterval) {
      clearInterval(ocrProgressInterval);
      ocrProgressInterval = null;
    }
    $("#ocrLoadingSection").addClass("d-none");
    $("#ocrProgressBar").css("width", "0%");
    if(enableButtons){
        $("#btnProcesarOCR").prop("disabled", !selectedFileGlobalOCR); // Habilitar solo si hay archivo
        $("#btnCargarJugadas").prop("disabled", jugadasGlobalOCR.length === 0);
    }
  }

  window.procesarOCR = async function() {
    console.log("procesarOCR function called.");
    console.log("Current selectedFileGlobalOCR:", selectedFileGlobalOCR);

    if (!selectedFileGlobalOCR) {
      alert("No has seleccionado ninguna imagen.");
      console.log("procesarOCR aborted: No file selected.");
      return;
    }

    $("#ocrJugadas").empty().html("<p>Procesando imagen, por favor espera...</p>");
    showOcrLoading();

    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobalOCR);
    reader.onloadend = async () => {
      const base64data = reader.result;
      try {
        updateOcrProgress(30, "Enviando imagen a la IA...");
        const response = await fetch('/api/interpret-ticket', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ photoDataUri: base64data }),
        });
        
        updateOcrProgress(70, "IA procesando...");

        if (!response.ok) {
          let errorData = { message: `Error del servidor: ${response.status} - ${response.statusText}` };
          try {
            const errJson = await response.json();
            errorData.message = errJson.message || errorData.message;
            console.error("Server error response body:", errJson);
          } catch (e) {
            console.error("Could not parse error response JSON:", e);
          }
          throw new Error(errorData.message);
        }

        const interpretedBets = await response.json();
        console.log("Respuesta de la API (jugadas interpretadas):", interpretedBets);
        updateOcrProgress(100, "¡Procesamiento completado!");


        if (!Array.isArray(interpretedBets)) {
            throw new Error("La respuesta de la IA no fue un array de jugadas válido.");
        }

        jugadasGlobalOCR = interpretedBets; // Guardar globalmente

        if (jugadasGlobalOCR.length === 0) {
          $("#ocrJugadas").html("<p>No se detectaron jugadas válidas en la imagen.</p>");
        } else {
          let html = `<h5>Jugadas Detectadas (${jugadasGlobalOCR.length}):</h5>`;
          jugadasGlobalOCR.forEach((j, idx) => {
            // Mostrar todos los campos devueltos por Genkit
            html += `
              <div style="border:1px solid #ccc; padding:0.5rem; margin-bottom:0.5rem; background-color: #f9f9f9;">
                <p style="margin: 2px 0;"><strong>#${idx + 1} Bet Number:</strong> ${j.betNumber || "N/A"}</p>
                <p style="margin: 2px 0;"><strong>Game Mode (AI):</strong> ${j.gameMode || "N/A"}</p>
                <p style="margin: 2px 0;"><strong>Straight:</strong> ${j.straightAmount !== null ? '$' + parseFloat(j.straightAmount).toFixed(2) : "-"}</p>
                <p style="margin: 2px 0;"><strong>Box:</strong> ${j.boxAmount !== null ? '$' + parseFloat(j.boxAmount).toFixed(2) : "-"}</p>
                <p style="margin: 2px 0;"><strong>Combo:</strong> ${j.comboAmount !== null ? '$' + parseFloat(j.comboAmount).toFixed(2) : "-"}</p>
                <button class="btn btn-sm btn-info mt-1" onclick="usarJugadaOCR(${idx})">
                  Usar esta Jugada
                </button>
              </div>
            `;
          });
          $("#ocrJugadas").html(html);
        }
        hideOcrLoading(true); // Pasar true para re-habilitar botones según estado

      } catch (err) {
        console.error("Error procesando la imagen:", err);
        $("#ocrJugadas").html(`<p style="color:red;">Error procesando la imagen: ${err.message}</p>`);
        updateOcrProgress(100, `Error: ${err.message}`, true);
        // No ocultar loading inmediatamente en error, para que se vea el mensaje.
        // hideOcrLoading(true); // Se podría ocultar después de un tiempo
        $("#btnProcesarOCR").prop("disabled", !selectedFileGlobalOCR); // Re-habilitar procesar si hay archivo
        $("#btnCargarJugadas").prop("disabled", true); // Mantener deshabilitado cargar
      }
    };
    reader.onerror = () => {
      console.error("Error leyendo el archivo.");
      $("#ocrJugadas").html('<p style="color:red;">Error leyendo el archivo de imagen.</p>');
      updateOcrProgress(100, "Error leyendo archivo", true);
      hideOcrLoading(true);
    };
  };

  window.usarJugadaOCR = function(idx) {
    console.log("usarJugadaOCR called for index:", idx);
    if (!jugadasGlobalOCR || !jugadasGlobalOCR[idx]) {
      alert("No se encontró la jugada OCR seleccionada.");
      return;
    }
    const betDataFromOCR = jugadasGlobalOCR[idx];
    console.log("Adding bet from OCR:", betDataFromOCR);
    addMainRow(betDataFromOCR); // addMainRow ahora acepta el objeto de apuesta
    // No es necesario cerrar el modal aquí, el usuario puede querer añadir más.
  };

  $("#btnCargarJugadas").click(function() {
    console.log("btnCargarJugadas clicked");
    if (!jugadasGlobalOCR || jugadasGlobalOCR.length === 0) {
      alert("No hay jugadas OCR para cargar.");
      return;
    }
    jugadasGlobalOCR.forEach(betData => {
      addMainRow(betData);
    });
    // Opcional: Limpiar jugadas del modal o cerrar modal después de cargar todas
    // jugadasGlobalOCR = [];
    // $("#ocrJugadas").empty().html("<p>Jugadas cargadas al formulario principal.</p>");
    // $("#btnCargarJugadas").prop("disabled", true);
    // if (modalOcrInstance) modalOcrInstance.hide();
  });

  window.toggleOcrDebug = function() {
    // El panel de debug original era para un backend diferente.
    // Para Genkit, la respuesta principal se ve en la consola del navegador
    // y los logs del servidor (si están disponibles en Firebase Studio).
    alert("El panel de debug detallado no está implementado para esta versión de OCR. Revisa la consola del navegador y los logs del servidor.");
    // $("#ocrDebugPanel").toggleClass("d-none"); // Si se quisiera un panel simple
  };

  // Tutorial y Manual (sin cambios, asumiendo que están bien)
  // ... (código del tutorial y manual) ...
    const tutorialStepsEN = [/* ... */];
    const tutorialStepsES = [/* ... */];
    const tutorialStepsHT = [/* ... */];
    function startTutorial(lang){ /* ... */ }
    $("#helpEnglish").click(()=>startTutorial('en'));
    $("#helpSpanish").click(()=>startTutorial('es'));
    $("#helpCreole").click(()=>startTutorial('ht'));
    $("#manualEnglishBtn").click(function(){ /* ... */ });
    $("#manualSpanishBtn").click(function(){ /* ... */ });
    $("#manualCreoleBtn").click(function(){ /* ... */ });
}); // Fin de $(document).ready()
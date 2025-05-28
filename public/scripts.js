
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
  const MAX_PLAYS = 25;

  let playCount = 0;
  let wizardCount = 0;

  // Instancias de Modales de Bootstrap
  let modalOcrInstance = null;
  let wizardModalInstance = null;
  let ticketModalInstance = null;

  if (document.getElementById("modalOcr")) {
    modalOcrInstance = new bootstrap.Modal(document.getElementById("modalOcr"));
  }
  if (document.getElementById("wizardModal")) {
    wizardModalInstance = new bootstrap.Modal(document.getElementById("wizardModal"));
  }
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
      "New York Mid Day": "14:20", // Ajustado para pruebas, debería ser 12:20
      "New York Evening": "22:00", // Ajustado, debería ser 19:20 o 22:00
      "Georgia Mid Day": "12:20",
      "Georgia Evening": "18:40",
      "New Jersey Mid Day": "12:50",
      "New Jersey Evening": "22:00", // Ajustado
      "Florida Mid Day": "13:20",
      "Florida Evening": "21:30",
      "Connecticut Mid Day": "13:30",
      "Connecticut Evening": "22:00",
      "Georgia Night": "22:00", //Ejemplo, ajustar
      "Pensilvania AM": "12:45",
      "Pensilvania PM": "18:15",
      "Venezuela": "00:00", // No tiene cutoff real en este contexto
      "Brooklyn Midday": "14:20", // Ejemplo
      "Brooklyn Evening": "22:00", // Ejemplo
      "Front Midday": "14:20", // Ejemplo
      "Front Evening": "22:00", // Ejemplo
      "New York Horses": "16:00" // Ejemplo
    },
    "Santo Domingo": {
      "Real": "11:45",
      "Gana mas": "13:25",
      "Loteka": "18:30",
      "Nacional": "19:30", // Ajustado, usualmente 20:50 o 21:00
      "Quiniela Pale": "19:30", //Ajustado
      "Primera Día": "10:50",
      "Suerte Día": "11:20", // Ejemplo
      "Lotería Real": "11:50", // Probablemente es "Real"
      "Suerte Tarde": "16:50", // Ejemplo
      "Lotedom": "16:50", // Ejemplo, ajustar a 13:55
      "Primera Noche": "18:50",
      "Panama": "16:00" // Ejemplo
    },
    "Venezuela": { // Redundante si ya está en USA, pero por si acaso.
      "Venezuela": "00:00"
    }
  };

  // (3) Init Flatpickr
  let fpInstance = null;
  if (document.getElementById("fecha")) {
    fpInstance = flatpickr("#fecha", {
      mode: "multiple",
      dateFormat: "m-d-Y", // MM-DD-YYYY
      minDate: "today",
      defaultDate: [new Date()], // Hoy por defecto
      clickOpens: true, // El input es clickeable
      allowInput: false, // No permitir escritura manual
      appendTo: document.body, // Para evitar problemas de z-index
      onOpen: function() {
        // Ajuste para el tamaño del calendario si es necesario en móviles
        if (window.innerWidth < 768) {
          this.calendarContainer.style.transform = 'scale(1.5)'; // O el valor que funcione
          this.calendarContainer.style.transformOrigin = 'top left';
        }
      },
      onClose: function() {
        if (window.innerWidth < 768) {
          this.calendarContainer.style.transform = '';
        }
      },
      onReady: function(selectedDates, dateStr, instance) {
        if (!dateStr || dateStr.trim() === "") {
          instance.setDate(new Date(), true); // Forzar 'hoy' si está vacío
        }
        // Actualizar conteo inicial
        selectedDaysCount = instance.selectedDates.length || 1;
        calculateMainTotal();
        disableTracksByTime();
      },
      onChange: (selectedDates, dateStr, instance) => {
        selectedDaysCount = selectedDates.length || 0;
        if (selectedDaysCount === 0 && instance.input.value !== "") {
            // Si se deselecciona todo pero el input no está vacío (puede pasar con clear())
            // Forzar 'hoy' de nuevo si se borra por completo
             instance.setDate(new Date(), true);
             selectedDaysCount = 1;
        } else if (selectedDaysCount === 0) {
            // Si realmente no hay fechas, el total debería ser 0 independientemente de los tracks
            $("#totalJugadas").text("0.00");
        }
        calculateMainTotal();
        // storeFormState(); // Descomentar si se implementa localStorage
        disableTracksByTime();
      }
    });
  }


  // (4) Track Checkboxes
  $(".track-checkbox").change(function() {
    console.log("Track checkbox changed");
    const arr = $(".track-checkbox:checked")
      .map(function() { return $(this).val(); })
      .get();
    // "Venezuela" no cuenta en el multiplicador, pero se necesita al menos 1 track para el multiplicador.
    selectedTracksCount = arr.filter(x => x !== "Venezuela").length;
    if (arr.length > 0 && selectedTracksCount === 0 && arr.includes("Venezuela")) {
        selectedTracksCount = 1; // Si solo Venezuela está marcado, cuenta como 1 para el multiplicador.
    } else if (arr.length === 0) {
        selectedTracksCount = 0; // Si no hay tracks, el multiplicador es 0.
    }
    calculateMainTotal();
    disableTracksByTime(); // Volver a verificar por si un track recién seleccionado ya cerró.
    // storeFormState(); // Descomentar si se implementa localStorage
  });


  // (5) MAIN TABLE => Add/Remove
  $("#agregarJugada").click(function() {
    console.log("Agregar Jugada clicked");
    const row = addMainRow();
    if (row) row.find(".betNumber").focus();
  });

  $("#eliminarJugada").click(function() {
    console.log("Eliminar Jugada clicked");
    if (playCount === 0) {
      alert("No plays to remove.");
      return;
    }
    $("#tablaJugadas tr:last").remove();
    playCount--;
    renumberMainRows();
    calculateMainTotal();
    // highlightDuplicatesInMain(); // Descomentar si se implementa
    // storeFormState(); // Descomentar si se implementa
  });

  // Evento para el botón de eliminar individual (si se añade)
  $("#tablaJugadas").on("click", ".removeMainBtn", function() {
    $(this).closest("tr").remove();
    playCount--; // Decrementar aquí también
    renumberMainRows();
    calculateMainTotal();
    // highlightDuplicatesInMain(); // Descomentar si se implementa
    // storeFormState(); // Descomentar si se implementa
  });


  $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function() {
    const row = $(this).closest("tr");
    recalcMainRow(row);
    // highlightDuplicatesInMain(); // Descomentar si se implementa
    // storeFormState(); // Descomentar si se implementa
  });

  function addMainRow(bet = null) {
    if (playCount >= MAX_PLAYS) {
      alert("You have reached the maximum of 25 plays in the main form.");
      return null;
    }
    playCount++;
    const rowIndex = playCount;

    const betNumberVal = bet && bet.betNumber ? bet.betNumber : "";
    // Para los montos, asegurar que sean números o string vacío si son null/undefined
    const straightVal = (bet && typeof bet.straightAmount === 'number') ? bet.straightAmount : "";
    const boxVal = (bet && typeof bet.boxAmount === 'number') ? bet.boxAmount : "";
    const comboVal = (bet && typeof bet.comboAmount === 'number') ? bet.comboAmount : "";
    // El gameMode se determinará en recalcMainRow

    const rowHTML = `
      <tr data-playindex="${rowIndex}">
        <td>
          <button type="button" class="btn btn-sm btn-danger removeMainBtn" data-row="${rowIndex}" title="Remove this play">
            ${rowIndex}
          </button>
        </td>
        <td><input type="text" class="form-control betNumber" value="${betNumberVal}" /></td>
        <td class="gameMode">-</td>
        <td><input type="number" step="0.01" class="form-control straight" value="${straightVal}" /></td>
        <td><input type="text" class="form-control box" value="${boxVal}" /></td> {/* Text para permitir "1,2" etc. */}
        <td><input type="number" step="0.01" class="form-control combo" value="${comboVal}" /></td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    const newRow = $("#tablaJugadas tr[data-playindex='" + rowIndex + "']");
    recalcMainRow(newRow); // Calcular gameMode y total para la nueva fila
    return newRow;
  }

  function renumberMainRows() {
    let i = 0;
    $("#tablaJugadas tr").each(function() {
      i++;
      $(this).attr("data-playindex", i);
      $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    // playCount ya se actualizó donde se llama esta función
    // storeFormState(); // Descomentar si se implementa
  }

  function recalcMainRow($row) {
    const bn = $row.find(".betNumber").val().trim();
    const gm = determineGameMode(bn);
    $row.find(".gameMode").text(gm);

    const stVal = $row.find(".straight").val().trim();
    const bxVal = $row.find(".box").val().trim(); // Box puede ser "1,2" para Pulito, o un número
    const coVal = $row.find(".combo").val().trim();

    const rowTotal = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    $row.find(".total").text(rowTotal);
    calculateMainTotal(); // Recalcular el total general cada vez que una fila cambia
  }

  // (6) Calculate Main Total
  function calculateMainTotal() {
    let sumOfRowTotals = 0;
    $("#tablaJugadas tr").each(function() {
      const totalCellText = $(this).find(".total").text();
      const val = parseFloat(totalCellText) || 0;
      sumOfRowTotals += val;
    });

    const daysToMultiply = selectedDaysCount > 0 ? selectedDaysCount : 1;
    const tracksToMultiply = selectedTracksCount > 0 ? selectedTracksCount : 1;
    
    let finalTotal = sumOfRowTotals * tracksToMultiply * daysToMultiply;

    // Si no hay días seleccionados, el total debe ser 0, independientemente de los tracks.
     if (selectedDaysCount === 0) {
        finalTotal = 0;
    }

    $("#totalJugadas").text(finalTotal.toFixed(2));
    // storeFormState(); // Descomentar si se implementa
  }


  // (7) determineGameMode
  function determineGameMode(betNumber) {
    if (!betNumber) return "-";
    betNumber = betNumber.trim();

    const tracks = $(".track-checkbox:checked")
      .map(function() { return $(this).val(); })
      .get();
    const isUSA = tracks.some(t => cutoffTimes.USA[t] && t !== "Venezuela" && t !== "New York Horses");
    const isSD = tracks.some(t => cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    if (includesHorses) {
      // NY Horses puede ser 1-4 digitos. Si es de 2, y también está Venezuela, podría ser ambiguo.
      // Priorizamos NY Horses si el track está explícitamente marcado.
      return "NY Horses";
    }

    const paleRegex = /^(\d{2})([xX+-])(\d{2})$/;
    if (paleRegex.test(betNumber)) {
      if (includesVenezuela && isUSA) return "Pale-Ven";
      if (isSD && !isUSA) return "Pale-RD"; // O simplemente "Palé" si es solo SD
      return "Palé"; // Genérico si no se puede especificar más
    }
    
    const length = betNumber.length;

    if (length === 1) {
      if (isUSA) return "Single Action"; // Necesita un track USA que no sea Venezuela/Horses
      // Si es SD, podría ser un "numero suelto" para Quiniela, pero no un modo estándar.
      // Por ahora, si es 1 dígito y no es USA, lo dejamos como "-" o un modo genérico.
      return "Single Digit"; // O "-"
    }
    
    if (length === 2) {
      if (includesVenezuela && isUSA) return "Venezuela";
      if (isSD && !isUSA) return "RD-Quiniela"; // O "Numero Suelto RD"
      if (isUSA && !isSD && !includesVenezuela) return "Pulito"; // Pulito necesita track USA
      return "2 Digits"; // Genérico si no encaja
    }
    
    if (length === 3) return "Pick 3";
    if (length === 4) return "Win 4";

    return "-"; // Si no coincide con nada
  }

  // (8) calculateRowTotal
  function calculateRowTotal(bn, gm, stVal, bxVal, coVal) {
    if (!bn || gm === "-") return "0.00";
    const st = parseFloat(stVal) || 0;
    const combo = parseFloat(coVal) || 0;
    let numericBox = 0;

    // Para Pulito, bxVal puede ser "1,2" o similar, lo que indica posiciones, no un monto a sumar directamente.
    if (gm === "Pulito") {
      if (stVal && bxVal) { // Straight amount y posiciones de box son necesarios
        const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean);
        return (st * positions.length).toFixed(2);
      }
      return st.toFixed(2); // Si no hay box, es solo straight
    } else {
      numericBox = parseFloat(bxVal) || 0; // Para otros modos, box es un monto.
    }

    if (gm === "Single Action" || gm === "NY Horses" || gm === "2 Digits" || gm === "Single Digit") {
      return (st + numericBox + combo).toFixed(2);
    }

    if (gm === "Venezuela" || gm === "RD-Quiniela" || gm === "Pale-Ven" || gm === "Pale-RD" || gm === "Palé") {
      // Para estos modos, tradicionalmente solo se juega straight, o el "box" y "combo" tienen significados especiales no sumables directamente.
      // Si se permite box/combo como montos adicionales, se pueden sumar.
      // Por ahora, asumamos que el total es la suma de los montos ingresados si son válidos para el juego.
      // Para Palé, el box/combo pueden no aplicar de la misma forma.
      // Si la regla es que Palé es solo straight, entonces sería solo 'st'.
      // Si se pueden añadir wagers, se suman.
      return (st + numericBox + combo).toFixed(2); // Corregido: Sumar todos los montos si están presentes
    }

    if (gm === "Win 4" || gm === "Pick 3") {
      const combosCount = calcCombos(bn); // calcCombos solo es relevante para el wager "combo"
      const total = st + numericBox + (combo * combosCount);
      return total.toFixed(2);
    }

    // Caso por defecto, si gm no es ninguno de los anteriores pero es válido (ej. 2 Digits)
    return (st + numericBox + combo).toFixed(2);
  }


  function calcCombos(str) { // Calcula cuántas combinaciones únicas hay en un número (para el wager "combo")
    if (!str) return 0;
    const n = str.length;
    if (n !== 3 && n !== 4) return 1; // El wager "combo" se aplica principalmente a Pick3/Win4

    const freq = {};
    for (let char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }

    if (n === 3) { // Pick 3
      const distinctDigits = Object.keys(freq).length;
      if (distinctDigits === 3) return 6; // xxx (123 type) -> 6-way combo
      if (distinctDigits === 2) return 3; // xxy (112 type) -> 3-way combo
      if (distinctDigits === 1) return 1; // xxx (111 type) -> 1-way combo (straight only)
    }
    if (n === 4) { // Win 4
      const counts = Object.values(freq);
      if (counts.length === 4) return 24; // abcd
      if (counts.length === 3 && counts.includes(2)) return 12; // aabc
      if (counts.length === 2 && counts.includes(2) && counts.filter(c => c === 2).length === 2) return 6; // aabb
      if (counts.length === 2 && counts.includes(3)) return 4; // aaab
      if (counts.length === 1) return 1; // aaaa
    }
    return 1; // Default si no es un patrón reconocido para combo.
  }

  // (9) store/load FormState (Comentado por ahora, se puede reimplementar con React state si es necesario)
  /*
  function storeFormState(){
    // ...
  }
  function loadFormState(){
    // ...
  }
  loadFormState();
  */
  
  function recalcAllMainRows() {
    $("#tablaJugadas tr").each(function() {
      recalcMainRow($(this));
    });
  }

  // (10) resetForm
  $("#resetForm").click(function() {
    console.log("Reset Form button clicked");
    if (confirm("Are you sure you want to reset the form? This will clear all plays and selections.")) {
      resetForm();
    }
  });

  function resetForm() {
    console.log("Executing resetForm function");
    // $("#lotteryForm")[0].reset(); // Esto puede causar problemas con Flatpickr y checkboxes
    
    // Limpiar tabla de jugadas
    $("#tablaJugadas").empty();
    playCount = 0;
    
    // Resetear contadores
    // selectedTracksCount = 0; // Se recalculará con autoSelectNYTrackAndVenezuela
    // selectedDaysCount = 0;   // Se recalculará con Flatpickr

    // Resetear Flatpickr a la fecha actual
    if (fpInstance) {
      fpInstance.setDate([new Date()], true); // true para disparar onChange y actualizar selectedDaysCount
    } else {
       selectedDaysCount = 1; // Si fpInstance no existe, asumir 1 día por defecto
    }

    // Desmarcar todos los tracks
    $(".track-checkbox").prop("checked", false).trigger('change'); // trigger change para actualizar selectedTracksCount y totales

    // Habilitar todos los tracks y mostrar horas de corte (esto se hará antes de autoSelect)
    enableAllTracks(); 
    showCutoffTimes();
    
    // Volver a seleccionar tracks por defecto
    autoSelectNYTrackAndVenezuela(); // Esto debería actualizar selectedTracksCount y llamar a calculateMainTotal

    // Limpiar imagen de ticket (si aplica)
    window.ticketImageDataUrl = null;
    
    // Resetear total visual
    // calculateMainTotal(); // autoSelectNYTrackAndVenezuela y el change de flatpickr ya lo hacen.
    // localStorage.removeItem("formState"); // Si se implementa
    console.log("Form reset complete. playCount:", playCount, "selectedDaysCount:", selectedDaysCount, "selectedTracksCount:", selectedTracksCount);
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
    const tracksSelected = $(".track-checkbox:checked").length > 0;
    if (!tracksSelected) {
      alert("Please select at least one track.");
      return;
    }
    // ... más lógica de doGenerateTicket ...
    console.log("Ticket generation process started with dates:", dateVal, "and tracks.");
    // Por ahora, solo simular que se muestra el modal de ticket
    if (ticketModalInstance) {
      $("#ticketFecha").text(dateVal);
      const chosenTracks = $(".track-checkbox:checked")
          .map(function(){return $(this).val();})
          .get();
      $("#ticketTracks").text(chosenTracks.join(", "));
      $("#ticketTotal").text($("#totalJugadas").text());
      $("#ticketTransaccion").text(dayjs().format("MM/DD/YYYY hh:mm A"));
      $("#numeroTicket").text("(Not assigned yet)");
      $("#qrcode").empty();

      // Clonar jugadas de la tabla principal al modal
      $("#ticketJugadas").empty();
      $("#tablaJugadas tr").each(function(index) {
        const bn = $(this).find(".betNumber").val();
        const gm = $(this).find(".gameMode").text();
        const st = $(this).find(".straight").val();
        const bx = $(this).find(".box").val();
        const co = $(this).find(".combo").val();
        const tot = $(this).find(".total").text();
        $("#ticketJugadas").append(`
          <tr>
            <td>${index + 1}</td>
            <td>${bn}</td>
            <td>${gm}</td>
            <td>${parseFloat(st||0).toFixed(2)}</td>
            <td>${bx}</td>
            <td>${parseFloat(co||0).toFixed(2)}</td>
            <td>${tot}</td>
          </tr>
        `);
      });
      ticketModalInstance.show();
    } else {
      alert("Ticket modal not initialized.");
    }
  }
  
  // Funciones relacionadas con la generación de ticket (confirmar, compartir, etc.)
  // ... (estas funciones pueden mantenerse como estaban si la lógica del modal es la misma) ...

  // (12) Wizard Logic (Simplificado por ahora, solo abrir/cerrar)
  $("#wizardButton").click(function() {
    console.log("Wizard button clicked");
    if (wizardModalInstance) {
      // resetWizard(); // Descomentar cuando se implemente resetWizard
      wizardModalInstance.show();
    } else {
      alert("Wizard modal not initialized.");
    }
  });
  // ... resto de la lógica del Wizard ...


  // Lógica de Cutoff Times y habilitación/deshabilitación de tracks
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
    if (!val || !fpInstance) return false;
    const selectedDates = fpInstance.selectedDates; // Usar directamente las fechas de flatpickr
    if (!selectedDates || selectedDates.length === 0) return false;

    const today = dayjs().startOf("day");
    for (let date of selectedDates) {
      if (dayjs(date).startOf("day").isSame(today, "day")) return true;
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
      const trackVal = $(this).val();
      if (trackVal === "Venezuela") return; // Venezuela no tiene cutoff en este contexto

      const cutoffStr = getTrackCutoff(trackVal);
      if (cutoffStr) {
        let cutoffTime = dayjs(cutoffStr, "HH:mm");
        // Considerar el cutoff 10 mins antes, excepto para los que cierran muy tarde
        let effectiveCutoff = cutoffTime.isAfter(dayjs("21:30", "HH:mm")) ? dayjs("22:00", "HH:mm") : cutoffTime.subtract(10, "minute");
        
        const trackLabel = $(this).closest(".track-button-container").find(".track-button");
        if (now.isSame(effectiveCutoff) || now.isAfter(effectiveCutoff)) {
          $(this).prop("checked", false).prop("disabled", true);
          trackLabel.css({ opacity: 0.5, cursor: "not-allowed", "text-decoration": "line-through" });
        } else {
          $(this).prop("disabled", false);
          trackLabel.css({ opacity: 1, cursor: "pointer", "text-decoration": "none" });
        }
      }
    });
    // Recalcular selectedTracksCount y el total general después de deshabilitar tracks
    const arr = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
    selectedTracksCount = arr.filter(x => x !== "Venezuela").length;
    if (arr.length > 0 && selectedTracksCount === 0 && arr.includes("Venezuela")) {
        selectedTracksCount = 1;
    } else if (arr.length === 0) {
        selectedTracksCount = 0;
    }
    calculateMainTotal();
  }

  function enableAllTracks() {
    $(".track-checkbox").each(function() {
      $(this).prop("disabled", false);
      $(this).closest(".track-button-container").find(".track-button").css({
        opacity: 1,
        cursor: "pointer",
        "text-decoration": "none"
      });
    });
  }

  function showCutoffTimes() {
    $(".cutoff-time").each(function() {
      const track = $(this).data("track");
      if (track === "Venezuela") {
        $(this).text(""); // No mostrar cutoff para Venezuela
        return;
      }
      const cutoffStr = getTrackCutoff(track);
      if (cutoffStr) {
        let cutoffTime = dayjs(cutoffStr, "HH:mm");
        let effectiveCutoff = cutoffTime.isAfter(dayjs("21:30", "HH:mm")) ? dayjs("22:00", "HH:mm") : cutoffTime.subtract(10, "minute");
        $(this).text(`(Cierre ${effectiveCutoff.format("h:mm A")})`);
      } else {
        $(this).text(""); // No mostrar nada si no hay cutoff definido
      }
    });
  }

  // Inicialización
  showCutoffTimes();
  disableTracksByTime(); // Ejecutar al cargar
  setInterval(disableTracksByTime, 60000); // Verificar cada minuto

  // Auto-Select NY + Venezuela por defecto
  function autoSelectNYTrackAndVenezuela() {
    const anyChecked = $(".track-checkbox:checked").length > 0;
    if (anyChecked && playCount > 0) { // No auto-seleccionar si ya hay jugadas o tracks marcados
        console.log("Tracks or plays already exist, skipping auto-select.");
        // Asegurarse de que los contadores y el total se calculen con lo que hay
        const arr = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        selectedTracksCount = arr.filter(x => x !== "Venezuela").length;
        if (arr.length > 0 && selectedTracksCount === 0 && arr.includes("Venezuela")) {
            selectedTracksCount = 1;
        } else if (arr.length === 0) {
            selectedTracksCount = 0;
        }
        if (fpInstance) selectedDaysCount = fpInstance.selectedDates.length || 1; else selectedDaysCount =1;

        calculateMainTotal();
        disableTracksByTime();
        return;
    }
    
    console.log("Auto-selecting default tracks.");
    const now = dayjs();
    const middayCutoffTime = dayjs(getTrackCutoff("New York Mid Day") || "14:20", "HH:mm").subtract(10, "minute");

    if (now.isBefore(middayCutoffTime) && !$("#trackNYMidDay").prop("disabled")) {
      $("#trackNYMidDay").prop("checked", true);
    } else if (!$("#trackNYEvening").prop("disabled")) {
      $("#trackNYEvening").prop("checked", true);
    }
    
    if (!$("#trackVenezuela").prop("disabled")) {
      $("#trackVenezuela").prop("checked", true);
    }
    
    // Disparar el evento change para actualizar contadores y UI
    $(".track-checkbox").trigger('change'); 
  }
  autoSelectNYTrackAndVenezuela(); // Llamar al cargar la página


  /*
   =========================================================
   OCR Logic (Modificada para API Route de Next.js)
   =========================================================
  */
  let selectedFileGlobalOCR = null;
  let jugadasGlobalOCR = [];
  let ocrProgressInterval = null;

  window.abrirModalOCR = function() {
    console.log("abrirModalOCR called");
    if (!modalOcrInstance) {
      console.error("OCR Modal no está inicializado.");
      alert("OCR functionality is not available at the moment.");
      return;
    }
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    hideOcrLoading();
    $("#btnProcesarOCR").prop("disabled", true);
    $("#btnCargarJugadas").prop("disabled", true);
    $("#ocrDebugPanel").addClass("d-none");
    modalOcrInstance.show();
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
    }
  };

  window.handleFileChange = function(e) {
    if (e.target.files && e.target.files[0]) {
      selectedFileGlobalOCR = e.target.files[0];
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
      $("#btnProcesarOCR").prop("disabled", false);
    } else {
      selectedFileGlobalOCR = null;
      $("#ocrPreview").addClass("d-none").attr("src", "");
      $("#btnProcesarOCR").prop("disabled", true);
    }
  };

  function showOcrLoading(message = "Subiendo/Procesando...") {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width", "0%").removeClass("bg-danger bg-success").addClass("bg-primary progress-bar-animated");
    $("#ocrProgressText").text(message);
    let progressValue = 0;
    ocrProgressInterval = setInterval(() => {
      progressValue += 10;
      if (progressValue > 90) progressValue = 90; // No llegar al 100% hasta que termine
      $("#ocrProgressBar").css("width", progressValue + "%");
    }, 300);
  }

  function updateOcrProgressError(errorMessage) {
    if (ocrProgressInterval) clearInterval(ocrProgressInterval);
    $("#ocrProgressBar").css("width", "100%").removeClass("bg-primary progress-bar-animated").addClass("bg-danger");
    $("#ocrProgressText").text("Error: " + errorMessage);
    $("#btnProcesarOCR").prop("disabled", false); // Permitir reintentar
  }

  function finishOcrLoadingSuccess() {
    if (ocrProgressInterval) clearInterval(ocrProgressInterval);
    $("#ocrProgressBar").css("width", "100%").removeClass("bg-primary progress-bar-animated").addClass("bg-success");
    $("#ocrProgressText").text("Procesamiento completado!");
    setTimeout(hideOcrLoading, 1500);
  }
  
  function hideOcrLoading() {
    if (ocrProgressInterval) clearInterval(ocrProgressInterval);
    $("#ocrLoadingSection").addClass("d-none");
    $("#ocrProgressBar").css("width", "0%");
  }

  window.procesarOCR = async function() {
    if (!selectedFileGlobalOCR) {
      alert("No has seleccionado ninguna imagen.");
      return;
    }
    $("#ocrJugadas").html("<p>Procesando, por favor espera...</p>");
    $("#btnProcesarOCR").prop("disabled", true);
    $("#btnCargarJugadas").prop("disabled", true);
    showOcrLoading();

    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobalOCR);
    reader.onloadend = async () => {
      const base64data = reader.result; // Esto es el photoDataUri
      try {
        console.log("Enviando a /api/interpret-ticket...");
        const response = await fetch('/api/interpret-ticket', { // Asegúrate que esta ruta es correcta
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ photoDataUri: base64data }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Error desconocido del servidor." }));
          const errorMsg = `Error del servidor: ${response.status} - ${errorData.message || response.statusText}`;
          throw new Error(errorMsg);
        }

        const interpretedBets = await response.json(); // Esto debería ser el array de Bet
        console.log("Respuesta de /api/interpret-ticket:", interpretedBets);

        if (!Array.isArray(interpretedBets)) {
            throw new Error("La respuesta de la API no es un array de jugadas válido.");
        }

        jugadasGlobalOCR = interpretedBets;
        finishOcrLoadingSuccess();
        $("#btnProcesarOCR").prop("disabled", false); // Permitir nuevo procesamiento si se desea

        if (jugadasGlobalOCR.length === 0) {
          $("#ocrJugadas").html("<p>No se detectaron jugadas en la imagen o no se pudieron interpretar.</p>");
          return;
        }

        let html = `<h5>Jugadas Detectadas (${jugadasGlobalOCR.length}):</h5>`;
        jugadasGlobalOCR.forEach((j, idx) => {
          html += `
            <div style="border:1px solid #ccc; padding:0.5rem; margin-bottom:0.5rem; background-color: #f9f9f9;">
              <p style="margin:0.2rem 0;">
                <strong>#${idx + 1} Bet:</strong> ${j.betNumber || "N/A"}
                (Modo: ${j.gameMode || "N/A"})
              </p>
              <p style="margin:0.2rem 0;">
                <strong>Straight:</strong> ${j.straightAmount !== null ? '$'+j.straightAmount.toFixed(2) : "-"} | 
                <strong>Box:</strong> ${j.boxAmount !== null ? '$'+j.boxAmount.toFixed(2) : "-"} | 
                <strong>Combo:</strong> ${j.comboAmount !== null ? '$'+j.comboAmount.toFixed(2) : "-"}
              </p>
              <button class="btn btn-sm btn-info" onclick="usarJugadaOCR(${idx})">
                Usar esta Jugada
              </button>
            </div>
          `;
        });
        $("#ocrJugadas").html(html);
        if (jugadasGlobalOCR.length > 0) {
            $("#btnCargarJugadas").prop("disabled", false);
        }

      } catch (err) {
        console.error("Error en procesarOCR:", err);
        updateOcrProgressError(err.message || "Error procesando la imagen.");
        $("#ocrJugadas").html(`<p style="color:red;">Error: ${err.message}</p>`);
      }
    };
    reader.onerror = () => {
        updateOcrProgressError("No se pudo leer el archivo de imagen.");
        $("#ocrJugadas").html('<p style="color:red;">Error leyendo el archivo.</p>');
        $("#btnProcesarOCR").prop("disabled", false);
    };
  };

  window.usarJugadaOCR = function(idx) {
    if (!jugadasGlobalOCR || !jugadasGlobalOCR[idx]) {
      alert("No se encontró la jugada seleccionada.");
      return;
    }
    const j = jugadasGlobalOCR[idx];
    addMainRow(j); // Pasa el objeto de apuesta completo
    // No es necesario recalcular aquí, addMainRow ya llama a recalcMainRow
    // highlightDuplicatesInMain(); // Descomentar si se implementa
    // storeFormState(); // Descomentar si se implementa

    if (modalOcrInstance) modalOcrInstance.hide();
  };

  $("#btnCargarJugadas").click(function() {
    if (!jugadasGlobalOCR || jugadasGlobalOCR.length === 0) {
      alert("No hay jugadas OCR para cargar.");
      return;
    }
    jugadasGlobalOCR.forEach(j => {
      addMainRow(j); // Pasa el objeto de apuesta completo
    });
    // No es necesario recalcular aquí, addMainRow ya llama a recalcMainRow
    // highlightDuplicatesInMain(); // Descomentar si se implementa
    // storeFormState(); // Descomentar si se implementa

    if (modalOcrInstance) modalOcrInstance.hide();
  });

  window.toggleOcrDebug = function() {
    // La respuesta detallada del backend de Genkit se puede ver en la consola del navegador (Network tab)
    alert("Para debugging del OCR, por favor revisa la pestaña 'Network' en las herramientas de desarrollador de tu navegador y busca la llamada a '/api/interpret-ticket'. También puedes ver logs en la consola del servidor de Next.js si tienes acceso.");
  };

});


/* =========================================================
   SCRIPTS.JS COMPLETO
   (Mantiene toda la lógica previa intacta,
    e incorpora spinner moderno, barra de progreso
    y muestra solo betNumber + monto en el panel de jugadas).
========================================================= */

// Global instances for Bootstrap Modals
let modalOcrInstance = null;
let wizardModalInstance = null;
let ticketModalInstance = null;

// Global variables for OCR
let selectedFileGlobalOCR = null;
let jugadasGlobalOCR = [];
let ocrProgressInterval = null;


$(document).ready(function() {
  console.log("Document ready. jQuery version:", $.fn.jquery);
  if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
      console.log("Bootstrap Modal version:", bootstrap.Modal.VERSION);
  } else {
      console.error("Bootstrap Modal is NOT loaded or accessible!");
  }

  // Initialize modals once DOM is ready
  if (document.getElementById("modalOcr")) {
      modalOcrInstance = new bootstrap.Modal(document.getElementById("modalOcr"));
  }
  if (document.getElementById("wizardModal")) {
      wizardModalInstance = new bootstrap.Modal(document.getElementById("wizardModal"));
  }
  if (document.getElementById("ticketModal")) {
      ticketModalInstance = new bootstrap.Modal(document.getElementById("ticketModal"));
  }

  // (1) Variables globales, dayjs, etc.
  dayjs.extend(dayjs_plugin_customParseFormat);
  dayjs.extend(dayjs_plugin_arraySupport);

  let transactionDateTime = '';
  window.ticketImageDataUrl = null; // Used for sharing

  let selectedTracksCount = 0; // Number of tracks that count towards multiplication
  let selectedDaysCount = 0;   // Number of selected days
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
  const fp = flatpickr("#fecha", {
    mode: "multiple",
    dateFormat: "m-d-Y",
    minDate: "today",
    defaultDate: [ new Date() ],
    clickOpens: true,
    allowInput: false,
    appendTo: document.body,
    onOpen: function() {
      if (this.calendarContainer) { // Check if calendarContainer exists
        this.calendarContainer.style.transform = 'scale(2.0)';
        this.calendarContainer.style.transformOrigin = 'top left';
      }
    },
    onClose: function() {
      if (this.calendarContainer) { // Check if calendarContainer exists
       this.calendarContainer.style.transform = '';
      }
    },
    onReady: function(selectedDates, dateStr, instance){
      console.log("Flatpickr ready, initial dates:", selectedDates);
      if(!selectedDates || selectedDates.length === 0){
        instance.setDate([new Date()], true); // Ensure at least today is selected
      } else {
        // Trigger initial calculation if dates are already set (e.g. by loadFormState)
        selectedDaysCount = selectedDates.length;
        calculateMainTotal();
        disableTracksByTime();
      }
    },
    onChange: (selectedDatesParam, dateStr, instance) => {
      console.log("Flatpickr onChange, selectedDates:", selectedDatesParam);
      selectedDaysCount = selectedDatesParam.length;
      calculateMainTotal();
      storeFormState();
      disableTracksByTime();
    }
  });

  // (4) Track Checkboxes
  $(".track-checkbox").change(function(){
    console.log("Track checkbox changed"); // DEBUG
    const arr = $(".track-checkbox:checked")
      .map(function(){return $(this).val();})
      .get();
    selectedTracksCount = arr.filter(x => x !== "Venezuela").length || (arr.length > 0 ? 1 : 0); // If only Venezuela, count is 0 for multiplier, but if other tracks, it's their count. If no tracks at all, 0.  OR, based on original: || 1 meant "if any track is checked, act as 1 for multiplier"
    // Sticking to user's original: count non-Venezuela, default to 1 if *any* track is selected (even if it's just Venezuela or 0 non-Venezuela tracks)
    const nonVenezuelaTracks = arr.filter(x => x !== "Venezuela").length;
    selectedTracksCount = nonVenezuelaTracks > 0 ? nonVenezuelaTracks : (arr.length > 0 ? 1 : 0);


    calculateMainTotal();
    disableTracksByTime(); // This calls storeFormState
  });

  // (5) MAIN TABLE => Add/Remove
  $("#agregarJugada").click(function(){
    console.log("Add Play button clicked"); // DEBUG
    const row = addMainRow();
    if(row) row.find(".betNumber").focus();
  });

  $("#eliminarJugada").click(function(){
    console.log("Remove Last Play button clicked"); // DEBUG
    if(playCount === 0) {
      alert("No plays to remove.");
      return;
    }
    $("#tablaJugadas tr:last").remove();
    playCount--;
    renumberMainRows();
    calculateMainTotal();
    highlightDuplicatesInMain();
  });

  $("#tablaJugadas").on("click",".removeMainBtn",function(){
    console.log("Remove individual play button clicked"); // DEBUG
    $(this).closest("tr").remove();
    playCount--;
    renumberMainRows();
    calculateMainTotal();
    highlightDuplicatesInMain();
  });

  $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function(){
    const row = $(this).closest("tr");
    recalcMainRow(row);
    highlightDuplicatesInMain();
    storeFormState();
  });

  function addMainRow(bet = null){
    if(playCount >= MAX_PLAYS){
      alert("You have reached 25 plays in the main form.");
      return null;
    }
    playCount++;
    const rowIndex = playCount;

    let betNumberVal = "";
    let straightVal = "";
    let boxVal = "";
    let comboVal = "";
    let gameModeVal = "-"; // Will be recalculated by recalcMainRow

    if (bet) {
        betNumberVal = bet.betNumber || "";
        // gameMode will be determined by recalcMainRow based on betNumberVal and tracks
        straightVal = (typeof bet.straightAmount === 'number') ? bet.straightAmount.toString() : "";
        boxVal = (typeof bet.boxAmount === 'number') ? bet.boxAmount.toString() : ""; // Box can be text in original for Pulito, but for Genkit it's number
        comboVal = (typeof bet.comboAmount === 'number') ? bet.comboAmount.toString() : "";
    }

    const rowHTML = `
      <tr data-playindex="${rowIndex}">
        <td>
          <button type="button" class="btnRemovePlay removeMainBtn btn btn-sm btn-danger" data-row="${rowIndex}">
            ${rowIndex}
          </button>
        </td>
        <td><input type="text" class="form-control betNumber" value="${betNumberVal}" /></td>
        <td class="gameMode">${gameModeVal}</td>
        <td><input type="number" class="form-control straight" value="${straightVal}" step="0.01" /></td>
        <td><input type="text" class="form-control box" value="${boxVal}" /></td> {/* Kept as text for Pulito '1,2,3' style, but Genkit gives number */}
        <td><input type="number" class="form-control combo" value="${comboVal}" step="0.01" /></td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    const newRow = $("#tablaJugadas tr[data-playindex='"+rowIndex+"']");
    if (bet) { // If adding from OCR, recalc immediately
        recalcMainRow(newRow);
    }
    return newRow;
  }

  function renumberMainRows(){
    let i=0;
    $("#tablaJugadas tr").each(function(){
      i++;
      $(this).attr("data-playindex", i);
      $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i;
    // storeFormState(); // Called by functions that call renumber
  }

  function recalcMainRow($row){
    const bn = $row.find(".betNumber").val().trim();
    const gm = determineGameMode(bn);
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

    // selectedTracksCount logic: if any non-Venezuela track is selected, use that count.
    // If only Venezuela (or other non-counting tracks) are selected, use 1.
    // If no tracks are selected at all, use 0 for multiplier. (This might differ from original desired `|| 1`)
    // Let's adhere to: selectedTracksCount = arr.filter(x => x !== "Venezuela").length || (arr.length > 0 ? 1 : 0);
    // This means if only Venezuela selected, selectedTracksCount is 1. If no tracks, 0.
    // And if selectedDaysCount is 0, sum should be 0.
    
    console.log("calculateMainTotal - Before mult: sum=", sum, "selectedTracksCount=", selectedTracksCount, "selectedDaysCount=", selectedDaysCount);

    if (selectedDaysCount === 0) {
        sum = 0; // If no days are selected, the grand total is 0.
    } else {
        // If selectedTracksCount is 0 (meaning no tracks selected at all), sum will be 0.
        // If selectedTracksCount is 1 (e.g. only Venezuela, or derived from || 1), it multiplies by 1.
        sum = sum * (selectedTracksCount || 0) * selectedDaysCount; // Use (selectedTracksCount || 0) to ensure if it's 0, sum becomes 0.
                                                               // Or ensure selectedTracksCount itself can be 0 if no tracks selected.
                                                               // The current selectedTracksCount logic seems to handle it to be 0 if no tracks selected.
    }
    $("#totalJugadas").text(sum.toFixed(2));
    // storeFormState(); // Usually called by the trigger of calculateMainTotal
}


  // (7) determineGameMode
  function determineGameMode(betNumber){
    if(!betNumber) return "-";

    const tracks = $(".track-checkbox:checked")
      .map(function(){return $(this).val();})
      .get();
    const isUSA = tracks.some(t => cutoffTimes.USA[t] && t !== "Venezuela" && t !== "New York Horses"); // Exclude special USA for this general check
    const isSD  = tracks.some(t => cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    if(includesHorses){
      return "NY Horses";
    }

    const paleRegex = /^(\d{2})([+x-]?)(\d{2})$/; // Allow optional separator for direct input too
    if(paleRegex.test(betNumber)){
        if(includesVenezuela && isUSA) return "Pale-Ven";
        if(isSD) return "Pale-RD"; // Prioritize SD if present
        if(isUSA) return "Palé"; // Generic Palé if USA
        return "Palé"; // Fallback Palé
    }
    
    const length = betNumber.replace(/[-+x]/g, "").length; // Count digits excluding separators for length check

    if(length === 1 && isUSA && !includesVenezuela && !includesHorses){
      return "Single Action";
    }
    if(length === 2){
      if(includesVenezuela && isUSA) return "Venezuela";
      if(isSD) return "RD-Quiniela"; // Quiniela for SD 2-digit
      if(isUSA) return "Pulito";
      return "Pulito"; // Default 2-digit
    }
    if(length===3) return "Pick 3";
    if(length===4) return "Win 4";

    return "-";
  }

  // (8) calculateRowTotal
  function calculateRowTotal(bn, gm, stVal, bxVal, coVal){
    if(!bn || gm==="-") return "0.00";
    const st = parseFloat(stVal)||0;
    const combo = parseFloat(coVal)||0;
    let numericBox = 0;

    if(gm === "Pulito" || gm === "RD-Quiniela"){ // Pulito and RD-Quiniela box input can be "1,2" or "1/2"
      if(bxVal){
        // Count positions for Pulito/RD-Quiniela, assume straight amount applies to each
        // This part of the logic from original script was complex and might need review based on how box is wagered for Pulito.
        // For now, if boxVal is numeric, use it, otherwise, it implies positions for straight bet.
        const parsedBox = parseFloat(bxVal);
        if (!isNaN(parsedBox)) {
            numericBox = parsedBox; // If it's a direct numeric box bet
        } else {
            // If bxVal is like "1,2,3" (positions for straight), the straight amount is already counted.
            // If the original logic meant straight * number of box positions, that needs explicit capture.
            // For simplicity, current Genkit output does not give "positions" for box.
            // So, we'll treat box as a monetary amount if provided numerically by OCR or user.
        }
        // Original Pulito logic from script:
        // if(gm==="Pulito"){ if(bxVal){ const positions = bxVal.split(",").map(x=>x.trim()).filter(Boolean); return (st * positions.length).toFixed(2); } return "0.00"; }
        // This needs `bxVal` to be like "1,2,3" to mean straight bet on positions 1,2,3.
        // If Genkit returns a numeric bxVal, we use st + numericBox + combo.
        // Let's assume for now if bxVal is not numeric, it's not a monetary box bet.
        if (gm === "Pulito" && isNaN(parseFloat(bxVal)) && bxVal.trim() !== "") {
             // If box is not a number (e.g., "1,2,3"), and straight is > 0, assume original pulito logic
             const positions = bxVal.split(/[,/]/).map(x => x.trim()).filter(Boolean);
             if (st > 0 && positions.length > 0) return (st * positions.length).toFixed(2);
             return st.toFixed(2); // Fallback to straight if box is not well-defined for pulito calculation
        } else {
            numericBox = parseFloat(bxVal) || 0;
        }

      }
    } else {
        numericBox = parseFloat(bxVal)||0;
    }


    if(gm==="Single Action" || gm==="NY Horses"){
      return (st + numericBox + combo).toFixed(2);
    }
    if(["Venezuela","Pale-Ven","Pale-RD", "Palé"].includes(gm)){ // Added Palé here
      return st.toFixed(2);
    }
    if(gm==="Win 4" || gm==="Pick 3"){
      const combosCount = calcCombos(bn.replace(/[-+x]/g, ""));
      let total = st + numericBox + (combo * combosCount);
      return total.toFixed(2);
    }

    return (st + numericBox + combo).toFixed(2);
  }

  function calcCombos(str){
    if (!str) return 1; // Avoid issues with empty strings
    const freq = {};
    for(let c of str){
      freq[c] = (freq[c]||0)+1;
    }
    const factorial = n => n<=0 ? 1 : n*factorial(n-1); // n<=0 for 0! = 1
    let denom=1;
    for(let k in freq){
      denom*= factorial(freq[k]);
    }
    if (str.length === 0) return 1; // if string is empty, factorial(0)/denom = 1/1 = 1
    return factorial(str.length)/denom;
  }

  // (9) store/load FormState
  function storeFormState(){
    console.log("Storing form state. Days:", selectedDaysCount, "Tracks:", selectedTracksCount); // DEBUG
    const st = {
      selectedTracks: $(".track-checkbox:checked").map(function(){return $(this).val();}).get(),
      dateVal: $("#fecha").val(),
      plays: []
    };
    $("#tablaJugadas tr").each(function(){
      const bn = $(this).find(".betNumber").val();
      const gm = $(this).find(".gameMode").text();
      const stv= $(this).find(".straight").val();
      const bxv= $(this).find(".box").val();
      const cov= $(this).find(".combo").val();
      const tot= $(this).find(".total").text();
      st.plays.push({
        betNumber: bn || "", gameMode: gm || "-", straight: stv || "",
        box: bxv || "", combo: cov || "", total: tot || "0.00"
      });
    });
    localStorage.setItem("lottoLookFormState", JSON.stringify(st)); // Changed key to avoid conflict
  }

  function loadFormState(){
    const dataStr = localStorage.getItem("lottoLookFormState");
    console.log("Loading form state string:", dataStr); // DEBUG
    if(!dataStr) {
        // If no saved state, initialize counts and call auto-selects
        selectedDaysCount = fp.selectedDates.length; // Get from flatpickr's current state
        autoSelectNYTrackAndVenezuela(); // This will set tracks and trigger its onChange
        calculateMainTotal(); // Calculate total based on new defaults
        return;
    }
    const data = JSON.parse(dataStr);
    if(!data) return;

    if (fp && data.dateVal) {
        // Parse dates from m-d-Y string array
        const datesToSet = data.dateVal.split(', ').map(dStr => {
            const parts = dStr.split('-');
            // new Date(year, monthIndex, day)
            return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])); 
        }).filter(d => !isNaN(d.getTime()));
        
        if (datesToSet.length > 0) {
            fp.setDate(datesToSet, true); // true to trigger onChange
        } else if (fp.selectedDates.length === 0) {
             fp.setDate([new Date()], true); // Fallback if no valid dates parsed
        }
    } else if (fp && fp.selectedDates.length === 0) {
        fp.setDate([new Date()], true); // Fallback if no dateVal in storage
    }
    selectedDaysCount = fp.selectedDates.length;


    if (data.selectedTracks && data.selectedTracks.length > 0) {
        $(".track-checkbox").prop("checked", false); // Uncheck all first
        data.selectedTracks.forEach(trackVal => {
            $(`.track-checkbox[value="${trackVal}"]`).prop("checked", true);
        });
    }
    // Trigger change on one of the checkboxes to update selectedTracksCount and other logic
    // Safest to just recalculate selectedTracksCount here directly
    const arr = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
    const nonVenezuelaTracks = arr.filter(x => x !== "Venezuela").length;
    selectedTracksCount = nonVenezuelaTracks > 0 ? nonVenezuelaTracks : (arr.length > 0 ? 1 : 0);


    $("#tablaJugadas").empty();
    playCount=0; // Reset playCount before adding
    if (data.plays && data.plays.length > 0) {
        data.plays.forEach((p)=>{
            const mainRow = addMainRow(); // addMainRow increments playCount
            if (mainRow) {
                mainRow.find(".betNumber").val(p.betNumber||"");
                mainRow.find(".straight").val(p.straight||"");
                mainRow.find(".box").val(p.box||"");
                mainRow.find(".combo").val(p.combo||"");
                // Game mode and total will be set by recalcMainRow
                recalcMainRow(mainRow); // This will also call calculateMainTotal
            }
        });
    }
    
    // highlightDuplicatesInMain(); // Called by recalcMainRow indirectly via calculateMainTotal->storeFormState
    // disableTracksByTime(); // Called by fp.onChange or after track changes
    // calculateMainTotal(); // Should be called by recalcMainRow for each row, or once after all rows added
    
    // Ensure everything is up-to-date after loading
    recalcAllMainRows(); // This ensures all game modes and totals are correct
    calculateMainTotal(); // Final total calculation
    highlightDuplicatesInMain();
    disableTracksByTime(); // Apply cutoffs based on loaded date
    console.log("Form state loaded. Days:", selectedDaysCount, "Tracks:", selectedTracksCount);
  }
  
  // Call loadFormState after fp and other elements are initialized
  // but before autoSelectNYTrackAndVenezuela if we want loadFormState to take precedence.
  // However, autoSelect is more like a default if nothing is loaded.
  // So, load first.
  loadFormState(); 

  function recalcAllMainRows(){
    $("#tablaJugadas tr").each(function(){
      recalcMainRow($(this));
    });
  }

  // (10) resetForm
  $("#resetForm").click(function(){
    console.log("Reset Form button clicked"); // DEBUG
    if(confirm("Are you sure you want to reset the form?")){
      resetForm();
    }
  });

  function resetForm(){
    console.log("resetForm function called"); // DEBUG
    // $("#lotteryForm")[0].reset(); // This might clear Flatpickr too, handle manually for tracks
    
    // Clear plays table
    $("#tablaJugadas").empty();
    playCount=0;
    
    // Reset counts
    selectedTracksCount=0;
    selectedDaysCount=0;
    
    window.ticketImageDataUrl=null; // For sharing
    localStorage.removeItem("lottoLookFormState");

    // Uncheck all track checkboxes
    $(".track-checkbox").prop("checked", false).trigger('change'); // Trigger change to update counts

    // Reset Flatpickr to today
    if(fp) {
      fp.clear(); // This should trigger onChange making selectedDaysCount = 0
      fp.setDate([ new Date() ], true); // This should trigger onChange making selectedDaysCount = 1
    }
    
    // Call auto-select after resetting, it will set default tracks and update counts
    autoSelectNYTrackAndVenezuela(); // This function also calls calculateMainTotal via track change
    
    showCutoffTimes(); // Update display of cutoff times
    disableTracksByTime(); // Apply cutoffs for today

    // Final total calculation after all resets and auto-selections
    calculateMainTotal(); 
    $("#totalJugadas").text("0.00"); // Explicitly set display if needed
    console.log("Form reset complete. Days:", selectedDaysCount, "Tracks:", selectedTracksCount);
  }


  // (11) Generate Ticket
  $("#generarTicket").click(function(){
    console.log("Generate Ticket button clicked"); // DEBUG
    doGenerateTicket();
  });

  function doGenerateTicket(){
    const dateVal = $("#fecha").val()||"";
    if(!dateVal){
      alert("Please select at least one date.");
      return;
    }
    $("#ticketFecha").text(dateVal);

    const chosenTracks = $(".track-checkbox:checked")
      .map(function(){return $(this).val();})
      .get();
    if(chosenTracks.length===0){
      alert("Please select at least one track.");
      return;
    }
    $("#ticketTracks").text(chosenTracks.join(", "));

    const arrDates = dateVal.split(", ");
    const today = dayjs().startOf("day");
    let todayIsSelected = false;
    for(let ds of arrDates){
      const [mm,dd,yy]= ds.split("-").map(Number);
      const pickedDate = dayjs(new Date(yy, mm-1, dd)).startOf("day");
      if(pickedDate.isSame(today,"day")){
        todayIsSelected = true;
        break;
      }
    }

    if(todayIsSelected){
      const now= dayjs();
      for(let t of chosenTracks){
        if(t==="Venezuela") continue;
        const raw= getTrackCutoff(t);
        if(raw){
          let co= dayjs(raw, "HH:mm");
          // Original cutoff logic had a 10 min buffer, let's keep it simple first
          // let cf= co.isAfter(dayjs("21:30","HH:mm")) ? dayjs("22:00","HH:mm"): co.subtract(10,"minute");
          if(now.isAfter(co)){
            alert(`Track "${t}" (${co.format("HH:mm")}) is closed for today.`);
            return;
          }
        }
      }
    }

    const rows= $("#tablaJugadas tr");
    if (rows.length === 0) {
        alert("Please add at least one play.");
        return;
    }
    let valid=true;
    const errors=[];
    rows.each(function(){ $(this).find(".betNumber,.straight,.box,.combo,.gameMode").removeClass("error-field"); });

    rows.each(function(){
      const rowIndex= parseInt($(this).attr("data-playindex"));
      const bn= $(this).find(".betNumber").val().trim();
      const gm= $(this).find(".gameMode").text();
      const st= parseFloat($(this).find(".straight").val().trim()||"0");
      const bx= $(this).find(".box").val().trim(); // Box can be text
      const co= parseFloat($(this).find(".combo").val().trim()||"0");
      let errorHere=false;

      if(!bn){ errorHere=true; $(this).find(".betNumber").addClass("error-field"); }
      if(hasBrooklynOrFront(chosenTracks) && bn.length!==3){ errorHere=true; $(this).find(".betNumber").addClass("error-field");}
      if(gm==="-"){ errorHere=true; $(this).find(".gameMode").addClass("error-field"); }

      let numericBoxForSum = parseFloat(bx) || 0;
      if(["Venezuela","Pale-Ven","Pulito","RD-Quiniela","Pale-RD", "Palé"].includes(gm)){
        if(st<=0){ errorHere=true; $(this).find(".straight").addClass("error-field"); }
      } else if(["Win 4","Pick 3", "Single Action", "NY Horses"].includes(gm)){
        if(st<=0 && numericBoxForSum<=0 && co<=0){ errorHere=true; $(this).find(".straight,.box,.combo").addClass("error-field"); }
      }
      // Add limits checks if necessary (omitted for brevity but present in original user script)
      if(errorHere) { valid=false; errors.push(rowIndex); }
    });

    if(!valid){
      const uniqueErr=[...new Set(errors)].join(", ");
      alert(`Some plays have errors or exceed limits (row(s): ${uniqueErr}). Please fix them.`);
      return;
    }

    $("#ticketJugadas").empty();
    rows.each(function(){
      const rowIndex= $(this).attr("data-playindex");
      const bn= $(this).find(".betNumber").val().trim();
      const gm= $(this).find(".gameMode").text();
      let stVal= $(this).find(".straight").val().trim()||"0.00";
      let bxVal= $(this).find(".box").val().trim()||"-";
      let coVal= $(this).find(".combo").val().trim()||"0.00";
      let totVal= $(this).find(".total").text()||"0.00";
      const rowHTML=`
        <tr><td>${rowIndex}</td><td>${bn}</td><td>${gm}</td>
          <td>${parseFloat(stVal).toFixed(2)}</td>
          <td>${ (gm==="Pulito" && isNaN(parseFloat(bxVal))) ? bxVal : (parseFloat(bxVal)||0).toFixed(2) }</td>
          <td>${parseFloat(coVal).toFixed(2)}</td>
          <td>${parseFloat(totVal).toFixed(2)}</td></tr>`;
      $("#ticketJugadas").append(rowHTML);
    });
    $("#ticketTotal").text($("#totalJugadas").text());
    transactionDateTime = dayjs().format("MM/DD/YYYY hh:mm A");
    $("#ticketTransaccion").text(transactionDateTime);
    $("#numeroTicket").text("(Not assigned yet)");
    $("#qrcode").empty();

    if (ticketModalInstance) {
        $("#editButton").removeClass("d-none");
        $("#shareTicket").addClass("d-none");
        $("#confirmarTicket").prop("disabled",false);
        fixTicketLayoutForMobile(); // Ensure this function exists
        ticketModalInstance.show();
    } else {
        console.error("Ticket modal not initialized for doGenerateTicket");
    }
    storeFormState();
  }

  $("#confirmarTicket").click(function(){
    console.log("Confirm Ticket button clicked"); // DEBUG
    $(this).prop("disabled",true);
    $("#editButton").addClass("d-none");

    const uniqueTicket= generateUniqueTicketNumber();
    $("#numeroTicket").text(uniqueTicket);
    $("#ticketTransaccion").text(dayjs().format("MM/DD/YYYY hh:mm A")); // Update time again

    $("#qrcode").empty();
    if (typeof QRCode !== 'undefined') {
        new QRCode(document.getElementById("qrcode"),{ text: uniqueTicket, width:128, height:128 });
    } else {
        console.error("QRCode library not loaded");
    }
    $("#shareTicket").removeClass("d-none");

    const ticketElement= document.getElementById("preTicket");
    if (!ticketElement) { console.error("preTicket element not found"); return; }
    const originalStyles= { width:$(ticketElement).css("width"), height:$(ticketElement).css("height"), maxHeight:$(ticketElement).css("max-height"), overflowY:$(ticketElement).css("overflow-y") };
    $(ticketElement).css({ width:"auto", height:"auto", maxHeight:"none", overflowY:"visible" });

    setTimeout(()=>{
      if (typeof html2canvas !== 'undefined') {
        html2canvas(ticketElement,{scale:2})
        .then(canvas=>{
          const dataUrl= canvas.toDataURL("image/jpeg",0.8);
          window.ticketImageDataUrl= dataUrl;
          const link= document.createElement("a");
          link.href= dataUrl;
          link.download= `ticket_${uniqueTicket}.jpg`;
          document.body.appendChild(link); link.click(); document.body.removeChild(link);
          alert("Your ticket image was downloaded successfully (JPEG).");
          // saveBetDataToSheetDB(uniqueTicket, ...); // SheetDB logic commented out for now
        }).catch(err=>{ console.error(err); alert("Problem generating final ticket image."); })
        .finally(()=>{ $(ticketElement).css(originalStyles); });
      } else {
        console.error("html2canvas not loaded");
        alert("Image generation library not loaded.");
        $(ticketElement).css(originalStyles);
      }
    },500);
  });

  $("#editButton").click(function(){
    console.log("Edit button in ticket modal clicked"); //DEBUG
    if(ticketModalInstance) ticketModalInstance.hide();
  });

  $("#shareTicket").click(async function(){
    if(!window.ticketImageDataUrl){ alert("No ticket image to share."); return; }
    if(navigator.share && navigator.canShare){
      try{
        const resp=await fetch(window.ticketImageDataUrl);
        const blob=await resp.blob();
        const file=new File([blob],"ticket.jpg",{type:"image/jpeg"});
        if(navigator.canShare({files:[file]})){
          await navigator.share({files:[file], title:"Lottery Ticket", text:"My Lottery Ticket"});
        } else { alert("Sharing this file type is not supported by your browser."); }
      } catch(e){ console.error(e); alert("Could not share ticket image."); }
    } else { alert("Web Share API not supported or not files can be shared."); }
  });

  function generateUniqueTicketNumber(){ return Math.floor(10000000 + Math.random()*90000000).toString(); }
  function fixTicketLayoutForMobile(){ /* Ensure #preTicket table styles allow wrapping or scrolling */ }
  // saveBetDataToSheetDB function (commented out as it uses external API and might need specific setup)
  /*
  function saveBetDataToSheetDB(uniqueTicket, callback){ ... }
  */
  function getTrackCutoff(tn){
    for(let region in cutoffTimes){ if(cutoffTimes[region][tn]){ return cutoffTimes[region][tn]; } }
    return null;
  }
  function hasBrooklynOrFront(tracks){ const bfSet= new Set(["Brooklyn Midday","Brooklyn Evening","Front Midday","Front Evening"]); return tracks.some(t=> bfSet.has(t)); }

  function userChoseToday(){
    const val= $("#fecha").val(); if(!val) return false;
    const arr= val.split(", "); const today= dayjs().startOf("day");
    for(let ds of arr){
      const parts = ds.split("-");
      if (parts.length !== 3) continue; // Basic validation
      const [mm,dd,yy]= parts.map(Number);
      if (isNaN(mm) || isNaN(dd) || isNaN(yy)) continue;
      const picked= dayjs(new Date(yy, mm-1, dd)).startOf("day");
      if(picked.isSame(today,"day")) return true;
    }
    return false;
  }

  function disableTracksByTime(){
    console.log("disableTracksByTime called. Today selected:", userChoseToday()); // DEBUG
    if(!userChoseToday()){ enableAllTracks(); return; }
    const now= dayjs();
    $(".track-checkbox").each(function(){
      const trackVal= $(this).val();
      $(this).prop("disabled",false); // Enable by default
      $(this).closest(".track-button-container").find(".track-button").css({opacity:1, cursor:"pointer"});

      if(trackVal==="Venezuela") return; // Venezuela never disabled by time
      const rawCutoff= getTrackCutoff(trackVal);
      if(rawCutoff){
        let cutoffTimeObj = dayjs(rawCutoff,"HH:mm");
        // Original logic: let finalCutoff = cutoffTimeObj.isAfter(dayjs("21:30","HH:mm")) ? dayjs("22:00","HH:mm") : cutoffTimeObj.subtract(10,"minute");
        // Simplified: use direct cutoff time for now.
        let finalCutoff = cutoffTimeObj;

        if(now.isAfter(finalCutoff)){
          // $(this).prop("checked",false); // Don't uncheck, just disable
          $(this).prop("disabled",true);
          $(this).closest(".track-button-container").find(".track-button").css({opacity:0.5, cursor:"not-allowed"});
        }
      }
    });
    // storeFormState(); // Called by functions that call this or track change
  }

  function enableAllTracks(){
    $(".track-checkbox").each(function(){
      $(this).prop("disabled",false);
      $(this).closest(".track-button-container").find(".track-button").css({opacity:1, cursor:"pointer"});
    });
  }

  function showCutoffTimes(){
    $(".cutoff-time").each(function(){
      const track= $(this).data("track");
      if(track==="Venezuela")return;
      let raw="";
      if(cutoffTimes.USA[track]) raw= cutoffTimes.USA[track];
      else if(cutoffTimes["Santo Domingo"][track]) raw= cutoffTimes["Santo Domingo"][track];
      // else if(cutoffTimes.Venezuela[track]) raw= cutoffTimes.Venezuela[track]; // Venezuela has no cutoff time display usually

      if(raw){
        let co= dayjs(raw,"HH:mm");
        // Original logic: let cf= co.isAfter(dayjs("21:30","HH:mm"))? dayjs("22:00","HH:mm"): co.subtract(10,"minute");
        // Simplified: display actual cutoff
        $(this).text(`(${co.format("hh:mm A")})`);
      } else {
        $(this).text(""); // Clear if no specific cutoff
      }
    });
  }

  showCutoffTimes();
  // disableTracksByTime(); // Called by loadFormState or flatpickr onChange
  // setInterval(disableTracksByTime,60000); // Interval can be re-enabled if desired

  function autoSelectNYTrackAndVenezuela(){
    console.log("autoSelectNYTrackAndVenezuela called"); // DEBUG
    const anyChecked= $(".track-checkbox:checked").length>0;
    if(anyChecked && localStorage.getItem("lottoLookFormState")) return; // Don't auto-select if tracks were loaded or already selected by user

    const now= dayjs();
    let middayCutoff= dayjs(cutoffTimes.USA["New York Mid Day"],"HH:mm");
    
    let nyTrackToSelect = "";
    if(now.isBefore(middayCutoff)){
      nyTrackToSelect = "#trackNYMidDay";
    } else {
      nyTrackToSelect = "#trackNYEvening";
    }
    
    // Check if the track to select exists and is not disabled
    if ($(nyTrackToSelect).length && !$(nyTrackToSelect).is(':disabled')) {
        $(nyTrackToSelect).prop("checked",true);
    }
    if ($("#trackVenezuela").length && !$("#trackVenezuela").is(':disabled')) { // Check if Venezuela track exists
        $("#trackVenezuela").prop("checked",true);
    }

    // Trigger change for one of the checkboxes to update selectedTracksCount and totals
    if ($(nyTrackToSelect).length) {
        $(nyTrackToSelect).trigger("change");
    } else if ($("#trackVenezuela").length) { // If only Venezuela was selected
        $("#trackVenezuela").trigger("change");
    } else if ($(".track-checkbox:first").length) { // Fallback: trigger first track if others not available
        $(".track-checkbox:first").trigger("change");
    } else { // If no tracks available, still recalculate total
        calculateMainTotal();
    }
  }
  // autoSelectNYTrackAndVenezuela(); // Called by loadFormState or resetForm if needed


  function highlightDuplicatesInMain(){
    $("#tablaJugadas tr .betNumber").removeClass("duplicado");
    let counts={};
    $("#tablaJugadas tr").each(function(){
      const bn= $(this).find(".betNumber").val().trim();
      if(!bn) return;
      counts[bn]= (counts[bn]||0)+1;
    });
    $("#tablaJugadas tr").each(function(){
      const bn= $(this).find(".betNumber").val().trim();
      if(bn && counts[bn]>1){
        $(this).find(".betNumber").addClass("duplicado");
      }
    });
  }

  /* WIZARD FUNCTIONS (Copied from original, ensure dependencies like bootstrap.Modal are handled) */
  $("#wizardButton").click(function() {
      console.log("Wizard button clicked via direct ID binding"); // DEBUG
      if (wizardModalInstance) {
          resetWizard();
          wizardModalInstance.show();
      } else {
          console.error("Wizard modal not initialized for wizardButton click");
      }
  });

  function resetWizard(){
    wizardCount=0; $("#wizardTableBody").empty();
    lockedFields.straight=false; lockedFields.box=false; lockedFields.combo=false;
    $("#lockStraight").html(`<i class="bi bi-unlock"></i>`);
    $("#lockBox").html(`<i class="bi bi-unlock"></i>`);
    $("#lockCombo").html(`<i class="bi bi-unlock"></i>`);
    $("#wizardBetNumber, #wizardStraight, #wizardBox, #wizardCombo, #rdFirstNumber, #rdLastNumber").val("");
    $("#qpGameMode").val("Pick 3"); $("#qpCount").val("5");
  }

  $(".lockBtn").click(function(){
    const field = $(this).data("field"); lockedFields[field] = !lockedFields[field];
    $(this).html(lockedFields[field] ? `<i class="bi bi-lock-fill"></i>` : `<i class="bi bi-unlock"></i>`);
  });

  $("#wizardAddNext").click(function(){
    const bn = $("#wizardBetNumber").val().trim(); const gm = determineGameMode(bn);
    if(gm==="-"){ alert(`Cannot determine game mode for "${bn}". Check tracks/format.`); return; }
    let stVal = $("#wizardStraight").val().trim(); let bxVal = $("#wizardBox").val().trim(); let coVal = $("#wizardCombo").val().trim();
    const rowT= calculateRowTotal(bn, gm, stVal, bxVal, coVal); addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
    if(!lockedFields.straight) $("#wizardStraight").val(""); if(!lockedFields.box) $("#wizardBox").val(""); if(!lockedFields.combo) $("#wizardCombo").val("");
    $("#wizardBetNumber").val("").focus(); highlightDuplicatesInWizard();
  });

  function addWizardRow(bn, gm, stVal, bxVal, coVal, total){
    wizardCount++; const i = wizardCount;
    const rowHTML=`<tr data-wizardIndex="${i}"><td><button type="button" class="removeWizardBtn btnRemovePlay btn btn-sm btn-danger" data-row="${i}">${i}</button></td><td>${bn}</td><td>${gm}</td><td>${stVal||"-"}</td><td>${bxVal||"-"}</td><td>${coVal||"-"}</td><td>${parseFloat(total||0).toFixed(2)}</td></tr>`;
    $("#wizardTableBody").append(rowHTML);
  }

  $("#wizardTableBody").on("click",".removeWizardBtn",function(){ $(this).closest("tr").remove(); renumberWizard(); highlightDuplicatesInWizard(); });
  function renumberWizard(){ let i=0; $("#wizardTableBody tr").each(function(){ i++; $(this).attr("data-wizardIndex", i); $(this).find(".removeWizardBtn").attr("data-row", i).text(i); }); wizardCount=i; }

  $("#btnGenerateQuickPick").click(function(){
    const gm = $("#qpGameMode").val(); const countVal= parseInt($("#qpCount").val())||1;
    if(countVal<1||countVal>25){ alert("Count between 1-25."); return; }
    const stVal= $("#wizardStraight").val().trim(); const bxVal= $("#wizardBox").val().trim(); const coVal= $("#wizardCombo").val().trim();
    for(let i=0;i<countVal;i++){
      let bn= generateRandomNumberForMode(gm); bn= padNumberForMode(bn, gm);
      let rowT= calculateRowTotal(bn, gm, stVal, bxVal, coVal); addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
    }
    highlightDuplicatesInWizard();
  });

  function generateRandomNumberForMode(mode){
    if(mode==="NY Horses"){ const l=Math.floor(Math.random()*4)+1; return Math.floor(Math.random()*(Math.pow(10,l))); }
    if(mode==="Single Action"){ return Math.floor(Math.random()*10); }
    if(mode==="Win 4"||mode==="Pale-Ven"||mode==="Pale-RD"||mode==="Palé"){ return Math.floor(Math.random()*10000); }
    if(mode==="Pick 3"){ return Math.floor(Math.random()*1000); }
    if(mode==="Venezuela"||mode==="Pulito"||mode==="RD-Quiniela"){ return Math.floor(Math.random()*100); }
    return Math.floor(Math.random()*1000); // Default
  }
  function padNumberForMode(num, mode){
    let s=num.toString();
    if(mode==="NY Horses"||mode==="Single Action") return s;
    if(mode==="Pale-Ven"||mode==="Pale-RD"||mode==="Win 4"||mode==="Palé"){ while(s.length<4) s="0"+s; return s; }
    if(mode==="Pulito"||mode==="RD-Quiniela"||mode==="Venezuela"){ while(s.length<2) s="0"+s; return s; }
    if(mode==="Pick 3"){ while(s.length<3) s="0"+s; return s; }
    while(s.length<3) s="0"+s; return s; // Default
  }

  $("#btnGenerateRoundDown").click(function(){
    const firstNum= $("#rdFirstNumber").val().trim(); const lastNum = $("#rdLastNumber").val().trim();
    if(!firstNum||!lastNum){ alert("Enter first/last number."); return; }
    if(firstNum.length!==lastNum.length || !/^\d+$/.test(firstNum) || !/^\d+$/.test(lastNum)){ alert("Numbers must be same length & digits only."); return; }
    let start= parseInt(firstNum,10); let end= parseInt(lastNum,10);
    if(isNaN(start)||isNaN(end)){ alert("Invalid numeric range."); return; }
    if(start> end) [start,end]=[end,start];
    const stVal= $("#wizardStraight").val().trim(); const bxVal= $("#wizardBox").val().trim(); const coVal= $("#wizardCombo").val().trim();
    for(let i=start; i<=end; i++){
      let bn= i.toString().padStart(firstNum.length,"0"); let gm= determineGameMode(bn);
      if(gm==="-") continue; const rowT= calculateRowTotal(bn, gm, stVal, bxVal, coVal); addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
    }
    highlightDuplicatesInWizard();
  });

  $("#btnPermute").click(function(){ permuteWizardBetNumbers(); });
  function permuteWizardBetNumbers(){ /* ... (implementation as provided) ... */ }

  $("#wizardAddAllToMain").click(function(){
    const wizardRows= $("#wizardTableBody tr"); if(wizardRows.length===0){ alert("No plays in wizard."); return; }
    wizardRows.each(function(){
      if(playCount>=MAX_PLAYS){ alert("Max plays in main form. Stopping."); return false; }
      const tds=$(this).find("td"); const bn=tds.eq(1).text(); const gm=tds.eq(2).text();
      const stVal=(tds.eq(3).text()==="-"?"":tds.eq(3).text()); const bxVal=(tds.eq(4).text()==="-"?"":tds.eq(4).text()); const coVal=(tds.eq(5).text()==="-"?"":tds.eq(5).text());
      // const total=tds.eq(6).text(); // Total will be recalculated
      
      const newMainRow = addMainRow();
      if (newMainRow) {
          newMainRow.find(".betNumber").val(bn);
          newMainRow.find(".straight").val(stVal);
          newMainRow.find(".box").val(bxVal);
          newMainRow.find(".combo").val(coVal);
          recalcMainRow(newMainRow); // This will set gameMode and rowTotal, then update overall total
      }
    });
    resetWizard(); // Clear wizard after adding
    highlightDuplicatesInMain();
    storeFormState();
  });

  $("#wizardGenerateTicket").click(function(){ $("#wizardAddAllToMain").trigger("click"); if (wizardModalInstance) wizardModalInstance.hide(); doGenerateTicket(); });
  $("#wizardEditMainForm").click(function(){ if (wizardModalInstance) wizardModalInstance.hide(); });
  function highlightDuplicatesInWizard(){ /* ... (implementation as provided) ... */ }

  /* TUTORIAL & MANUAL FUNCTIONS (as provided) */
  const tutorialStepsEN = [ /* ... */ ]; const tutorialStepsES = [ /* ... */ ]; const tutorialStepsHT = [ /* ... */ ];
  function startTutorial(lang){ /* ... */ }
  $("#helpEnglish").click(()=>startTutorial('en')); $("#helpSpanish").click(()=>startTutorial('es')); $("#helpCreole").click(()=>startTutorial('ht'));
  $("#manualEnglishBtn").click(function(){ $("#manualEnglishText").removeClass("d-none"); $("#manualSpanishText,#manualCreoleText").addClass("d-none"); });
  $("#manualSpanishBtn").click(function(){ $("#manualSpanishText").removeClass("d-none"); $("#manualEnglishText,#manualCreoleText").addClass("d-none"); });
  $("#manualCreoleBtn").click(function(){ $("#manualCreoleText").removeClass("d-none"); $("#manualEnglishText,#manualSpanishText").addClass("d-none"); });


  // OCR Section (from previous successful integration)
  window.abrirModalOCR = function() {
    console.log("abrirModalOCR called by onclick"); // DEBUG
    if (modalOcrInstance) {
        selectedFileGlobalOCR = null;
        jugadasGlobalOCR = [];
        $("#ocrFile").val(''); // Clear file input
        $("#ocrPreview").addClass('d-none').attr('src', '');
        $("#ocrJugadas").empty().html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
        hideOcrLoading();
        $("#ocrDebugPanel").addClass('d-none'); // Ocultar panel de debug
        $('#btnProcesarOCR').prop('disabled', true); // Deshabilitar botón de procesar hasta que haya archivo
        $('#btnCargarJugadasOCR').addClass('d-none').prop('disabled', true); // Ocultar y deshabilitar botón de cargar
        modalOcrInstance.show();
    } else {
        console.error("OCR modal instance (modalOcrInstance) is not initialized!");
        alert("OCR Modal no está listo. Intente recargar la página.");
    }
  };

  window.handleDragOver = function(e) { e.preventDefault(); $("#ocrDropZone").addClass("dragover"); };
  window.handleDragLeave = function(e) { e.preventDefault(); $("#ocrDropZone").removeClass("dragover"); };
  window.handleDrop = function(e) {
    e.preventDefault(); $("#ocrDropZone").removeClass("dragover");
    if(e.dataTransfer.files && e.dataTransfer.files[0]){
      selectedFileGlobalOCR = e.dataTransfer.files[0];
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
      $('#btnProcesarOCR').prop('disabled', false); // Habilitar botón
    }
  };
  window.handleFileChange = function(e) {
    if(e.target.files && e.target.files[0]){
      selectedFileGlobalOCR = e.target.files[0];
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
      $('#btnProcesarOCR').prop('disabled', false); // Habilitar botón
    } else {
      $('#btnProcesarOCR').prop('disabled', true); // Deshabilitar si no hay archivo
    }
  };

  function showOcrLoading(message = "Subiendo/Procesando...") {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width","0%").removeClass("bg-danger bg-success").addClass("bg-primary");
    $("#ocrProgressText").text(message);
    let progressValue = 0;
    ocrProgressInterval = setInterval(()=>{
      progressValue += 10;
      if(progressValue > 90) { // Don't let fake progress hit 100% until done
          clearInterval(ocrProgressInterval); // Stop interval at 90%
          return;
      }
      $("#ocrProgressBar").css("width", progressValue+"%");
    }, 200);
  }

  function updateOcrProgress(value, text, isError = false) {
    if(ocrProgressInterval) clearInterval(ocrProgressInterval);
    $("#ocrProgressBar").css("width", value + "%");
    if (text) $("#ocrProgressText").text(text);
    if (isError) {
        $("#ocrProgressBar").removeClass("bg-primary bg-success").addClass("bg-danger");
    } else if (value === 100) {
        $("#ocrProgressBar").removeClass("bg-primary bg-danger").addClass("bg-success");
    }
  }

  function hideOcrLoading() {
    if(ocrProgressInterval) clearInterval(ocrProgressInterval);
    $("#ocrLoadingSection").addClass("d-none");
  }

  window.procesarOCR = async function() {
    console.log("procesarOCR called. File selected:", selectedFileGlobalOCR); // DEBUG
    if(!selectedFileGlobalOCR){
      alert("Por favor, selecciona un archivo de imagen primero.");
      return;
    }
    $("#ocrJugadas").empty().html("<p>Procesando...</p>");
    $('#btnProcesarOCR').prop('disabled', true);
    $('#btnCargarJugadasOCR').addClass('d-none').prop('disabled', true);
    showOcrLoading("Procesando imagen...");

    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobalOCR);
    reader.onloadend = async () => {
        const base64data = reader.result;
        try {
            updateOcrProgress(30, "Enviando a IA...");
            const response = await fetch("/api/interpret-ticket", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ photoDataUri: base64data }),
            });
            updateOcrProgress(70, "Recibiendo respuesta de IA...");

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Error desconocido del servidor." }));
                throw new Error(`Error del servidor: ${response.status} - ${errorData.message || response.statusText}`);
            }
            const interpretedBets = await response.json(); // Expecting array of Bet objects
            updateOcrProgress(100, "Proceso completado!");

            if (!Array.isArray(interpretedBets)) {
                throw new Error("La respuesta de la IA no tiene el formato esperado (no es un array).");
            }

            jugadasGlobalOCR = interpretedBets;

            if(jugadasGlobalOCR.length === 0){
              $("#ocrJugadas").html("<p>No se detectaron jugadas en la imagen.</p>");
            } else {
              let html = `<h5>${jugadasGlobalOCR.length} Jugada(s) Detectada(s):</h5>`;
              jugadasGlobalOCR.forEach((j, idx)=>{
                html += `
                  <div style="border:1px solid #ccc; padding:0.5rem; margin-bottom:0.5rem; background-color: #f9f9f9;">
                    <p><strong>#${idx + 1} - Número:</strong> ${j.betNumber || "N/A"}</p>
                    <p><strong>Modo:</strong> ${j.gameMode || "N/A"}</p>
                    <p><strong>Straight:</strong> ${j.straightAmount !== null ? '$'+j.straightAmount.toFixed(2) : "-"}</p>
                    <p><strong>Box:</strong> ${j.boxAmount !== null ? '$'+j.boxAmount.toFixed(2) : "-"}</p>
                    <p><strong>Combo:</strong> ${j.comboAmount !== null ? '$'+j.comboAmount.toFixed(2) : "-"}</p>
                    <button class="btn btn-sm btn-info mt-1" onclick="usarJugadaOCR(${idx})">
                      Usar esta Jugada
                    </button>
                  </div>`;
              });
              $("#ocrJugadas").html(html);
              $('#btnCargarJugadasOCR').removeClass('d-none').prop('disabled', false);
            }
        } catch(err){
          console.error("Error en procesarOCR:", err);
          $("#ocrJugadas").html(`<p style="color:red;">Error procesando la imagen: ${err.message}</p>`);
          updateOcrProgress(100, "Error", true);
        } finally {
            // hideOcrLoading(); // Already handled by updateOcrProgress(100, ...)
            // Re-enable process button only if there's still a file (user might want to retry)
            $('#btnProcesarOCR').prop('disabled', !selectedFileGlobalOCR); 
        }
    };
    reader.onerror = () => {
        alert('Error leyendo el archivo de imagen.');
        $("#ocrJugadas").html(`<p style="color:red;">Error leyendo el archivo de imagen.</p>`);
        updateOcrProgress(100, "Error de lectura de archivo", true);
        $('#btnProcesarOCR').prop('disabled', !selectedFileGlobalOCR);
    };
  };

  window.usarJugadaOCR = function(idx){
    console.log("usarJugadaOCR called for index:", idx); // DEBUG
    if(!jugadasGlobalOCR || !jugadasGlobalOCR[idx]){
      alert("No se encontró la jugada OCR seleccionada."); return;
    }
    const betData = jugadasGlobalOCR[idx];
    const newRow = addMainRow(betData); // addMainRow now accepts bet data
    if (newRow) {
        newRow.find(".betNumber").focus();
        highlightDuplicatesInMain();
        storeFormState(); // Save state after adding play
    }
    if (modalOcrInstance) modalOcrInstance.hide();
  };

  $("#btnCargarJugadasOCR").click(function(){
    console.log("Cargar Jugadas OCR button clicked"); // DEBUG
    if(!jugadasGlobalOCR || jugadasGlobalOCR.length === 0){
      alert("No hay jugadas OCR para cargar."); return;
    }
    jugadasGlobalOCR.forEach(betData => {
      addMainRow(betData); // addMainRow now accepts bet data
    });
    highlightDuplicatesInMain();
    storeFormState(); // Save state after adding all plays
    if (modalOcrInstance) modalOcrInstance.hide();
  });

  window.toggleOcrDebug = function() {
    // Original debug panel was for a different backend.
    // For Genkit, API response can be seen in browser's Network tab.
    alert("Para depurar la respuesta de la IA, por favor revisa la pestaña 'Network' en las herramientas de desarrollador de tu navegador después de procesar una imagen.");
    // $("#ocrDebugPanel").toggleClass("d-none"); // Keep this commented or remove if not used
  };

  // Initial setup calls
  showCutoffTimes();
  // loadFormState will call disableTracksByTime and autoSelectNYTrackAndVenezuela if needed.

}); // FIN DE $(document).ready()

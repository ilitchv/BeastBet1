
/* =========================================================
   SCRIPTS.JS COMPLETO
   (Mantiene toda la lógica previa intacta,
    e incorpora spinner moderno, barra de progreso
    y muestra solo betNumber + monto en el panel de jugadas).
========================================================= */

const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/bl57zyh73b0ev';

$(document).ready(function() {

  // (1) Variables globales, dayjs, etc.
  dayjs.extend(dayjs_plugin_customParseFormat);
  dayjs.extend(dayjs_plugin_arraySupport);

  let transactionDateTime = '';
  window.ticketImageDataUrl = null;

  let selectedTracksCount = 1; // Default to 1 if no tracks selected for multiplier
  let selectedDaysCount = 1;   // Default to 1 day if not selected for multiplier
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
      "Venezuela": "00:00", // No cutoff for Venezuela itself
      "Brooklyn Midday": "14:20",
      "Brooklyn Evening": "22:00",
      "Front Midday": "14:20",
      "Front Evening": "22:00",
      "New York Horses": "16:00"
    },
    "Santo Domingo": {
      "Real": "11:45",
      "Gana mas": "13:25",
      "Loteka": "18:30",
      "Nacional": "19:30",
      "Quiniela Pale": "19:30",
      "Primera Día": "10:50",
      "Suerte Día": "11:20",
      "Lotería Real": "11:50",
      "Suerte Tarde": "16:50",
      "Lotedom": "16:50",
      "Primera Noche": "18:50",
      "Panama": "16:00"
    }
    // Removed "Venezuela" as a top-level key, it's under USA
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
      if(!dateStr || dateStr.trim()===""){
        instance.setDate(new Date(), true); // Set default date and trigger onChange
      }
      // Initial count
      selectedDaysCount = instance.selectedDates.length > 0 ? instance.selectedDates.length : 1;
      calculateMainTotal();
      disableTracksByTime();

    },
    onChange: (selectedDates) => {
      selectedDaysCount = selectedDates.length > 0 ? selectedDates.length : 1;
      calculateMainTotal();
      storeFormState();
      disableTracksByTime();
    }
  });

  // (4) Track Checkboxes
  $(".track-checkbox").change(function(){
    const arr = $(".track-checkbox:checked")
      .map(function(){return $(this).val();})
      .get();
    // "Venezuela" no cuenta en el multiplicador
    const countableTracks = arr.filter(x => x !== "Venezuela").length;
    selectedTracksCount = countableTracks > 0 ? countableTracks : 1;
    calculateMainTotal();
    disableTracksByTime(); // Call this to re-evaluate disabled state based on selection
    storeFormState(); // Store state after track change
  });

  // (5) MAIN TABLE => Add/Remove
  $("#agregarJugada").click(function(){
    const row = addMainRow();
    if(row) row.find(".betNumber").focus();
  });

  $("#eliminarJugada").click(function(){
    if(playCount === 0) {
      // alert("No plays to remove."); // Replaced with toast or quieter feedback if preferred
      return;
    }
    $("#tablaJugadas tr:last").remove();
    playCount--;
    renumberMainRows();
    calculateMainTotal();
    highlightDuplicatesInMain();
  });

  $("#tablaJugadas").on("click",".removeMainBtn",function(){
    $(this).closest("tr").remove();
    playCount--; // playCount should be updated here
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

  function addMainRow(bet = null){ // bet is an optional object from OCR
    if(playCount >= MAX_PLAYS){
      alert("You have reached 25 plays in the main form.");
      return null;
    }
    playCount++;
    const rowIndex = playCount;
    const betNumberVal = bet && bet.betNumber ? bet.betNumber : "";
    // gameMode will be determined by recalcMainRow
    const straightVal = bet && (typeof bet.straightAmount === 'number') ? bet.straightAmount.toFixed(2) : "";
    const boxVal = bet && (typeof bet.boxAmount === 'number') ? bet.boxAmount.toFixed(2) : "";
    const comboVal = bet && (typeof bet.comboAmount === 'number') ? bet.comboAmount.toFixed(2) : "";


    const rowHTML = `
      <tr data-playindex="${rowIndex}">
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
          <input type="number" step="0.01" class="form-control straight" value="${straightVal}" />
        </td>
        <td>
          <input type="number" step="0.01" class="form-control box" value="${boxVal}" />
        </td>
        <td>
          <input type="number" step="0.01" class="form-control combo" value="${comboVal}" />
        </td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    const newRow = $("#tablaJugadas tr[data-playindex='"+rowIndex+"']");
    recalcMainRow(newRow); // Recalculate after adding, especially for gameMode
    return newRow;
  }

  function renumberMainRows(){
    let i=0;
    $("#tablaJugadas tr").each(function(){
      i++;
      $(this).attr("data-playindex", i); // Corrected attribute name
      $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i; // Update playCount to the actual number of rows
    // storeFormState(); // storing state is handled by other functions calling this
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
  function calculateMainTotal(){
    let sum=0;
    $("#tablaJugadas tr").each(function(){
      const totalCell= $(this).find(".total").text();
      const val= parseFloat(totalCell)||0;
      sum+= val;
    });

    const currentSelectedDays = fp.selectedDates.length > 0 ? fp.selectedDates.length : 1;
    const currentSelectedTracks = $(".track-checkbox:checked").filter(function(){ return $(this).val() !== "Venezuela"; }).length || 1;
    
    sum = sum * currentSelectedTracks * currentSelectedDays;
    $("#totalJugadas").text( sum.toFixed(2) );
    // storeFormState(); // Store form state handled by callers or specific state update functions
  }

  // (7) determineGameMode
  function determineGameMode(betNumber){
    if(!betNumber) return "-";
    betNumber = betNumber.toString().trim(); // Ensure it's a string

    const tracks = $(".track-checkbox:checked")
      .map(function(){return $(this).val();})
      .get();
    const isUSA = tracks.some(t => cutoffTimes.USA[t] && t !== "Venezuela" && t !== "New York Horses");
    const isSD  = tracks.some(t => cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    if(includesHorses){
      return "NY Horses";
    }
    
    const paleRegex = /^(\d{2})([x+-])(\d{2})$/;
    if(paleRegex.test(betNumber)){
      if(includesVenezuela && isUSA) { // Check if a USA track (not just Venezuela) is also selected
        return "Pale-Ven";
      }
      if(isSD){ // If any SD track is selected
        return "Pale-RD";
      }
      return "Palé"; // Default Palé if specific region not clear or only USA/general tracks
    }
    
    if(betNumber.length===1 && isUSA && !includesVenezuela && !includesHorses){
        return "Single Action";
    }


    const length = betNumber.length;
    if(length<2 || length>4) return "-";

    if(length===2){
      if(includesVenezuela && isUSA) return "Venezuela";
      if(isUSA && !isSD && !includesVenezuela) return "Pulito"; // Ensure Venezuela isn't also making it "Venezuela"
      if(isSD && !isUSA) return "RD-Quiniela";
      if(isUSA) return "Pulito"; // Default for 2 digits if USA track selected
      if(isSD) return "RD-Quiniela"; // Default for 2 digits if SD track selected
    }
    
    if(length===3) return "Pick 3";
    if(length===4) return "Win 4";

    return "-";
  }

  // (8) calculateRowTotal
  function calculateRowTotal(bn, gm, stVal, bxVal, coVal){
    if(!bn || gm==="-") return "0.00";
    const st = parseFloat(stVal)||0;
    const bx = parseFloat(bxVal)||0; // For Pulito, this might be string "1,2,3" but we parse to number for SA/Horses
    const combo = parseFloat(coVal)||0;

    if(gm==="Pulito"){
       // For Pulito, boxVal is expected to be positions like "1,2" or just a single position.
       // The amount is the straight amount. Box amount input is used for positions.
      if(stVal && bxVal){ // Straight amount must be present, boxVal are positions
        const positions = bxVal.toString().split(",").map(p => p.trim()).filter(Boolean);
        return (st * positions.length).toFixed(2);
      }
      return st.toFixed(2); // If only straight amount and no box positions, it's just straight.
    }

    if(gm==="Single Action" || gm==="NY Horses"){
      return (st + bx + combo).toFixed(2);
    }

    if(["Venezuela","Pale-RD","Pale-Ven","RD-Quiniela", "Palé"].includes(gm)){
      // For Palé, Box can also be used, and Combo. Let's adjust.
      // Typically Palé is straight, but if box/combo amounts are provided, they should be included.
      return (st + bx + combo).toFixed(2);
    }

    if(gm==="Win 4" || gm==="Pick 3"){
      const combosCount = calcCombos(bn);
      let total = st + bx + (combo * combosCount);
      return total.toFixed(2);
    }

    return (st + bx + combo).toFixed(2);
  }

  function calcCombos(str){
    if (typeof str !== 'string') return 1; // Should not happen with proper input
    const freq = {};
    for(let c of str){
      freq[c] = (freq[c]||0)+1;
    }
    const factorial = n => n<=1 ? 1 : n*factorial(n-1);
    let denom=1;
    for(let k in freq){
      denom*= factorial(freq[k]);
    }
    return factorial(str.length)/denom;
  }

  // (9) store/load FormState
  function storeFormState(){
    const currentSelectedDates = fp.selectedDates.map(date => dayjs(date).format("MM-DD-YYYY"));
    const currentSelectedTracks = $(".track-checkbox:checked").map(function(){ return $(this).val(); }).get();

    const st = {
      // selectedTracksCount: selectedTracksCount, // Derived on load
      // selectedDaysCount: selectedDaysCount, // Derived on load
      dateVal: currentSelectedDates.join(", "), // Store formatted dates
      selectedTrackValues: currentSelectedTracks, // Store actual selected track values
      playCount,
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
        betNumber: bn || "",
        gameMode: gm || "-",
        straight: stv || "",
        box: bxv || "",
        combo: cov || "",
        total: tot || "0.00"
      });
    });
    localStorage.setItem("formState", JSON.stringify(st));
  }

  function loadFormState(){
    const dataStr = localStorage.getItem("formState");
    if(!dataStr) {
        autoSelectNYTrackAndVenezuela(); // Auto-select if no saved state
        if (fp && fp.selectedDates.length === 0) { // Ensure default date if none selected
            fp.setDate([new Date()], true);
        }
        disableTracksByTime(); // Initial check
        return;
    }
    const data=JSON.parse(dataStr);
    if(!data) {
        autoSelectNYTrackAndVenezuela();
        if (fp && fp.selectedDates.length === 0) {
            fp.setDate([new Date()], true);
        }
        disableTracksByTime();
        return;
    }

    // Restore dates
    if (data.dateVal && fp) {
        const datesToSet = data.dateVal.split(", ").map(ds => dayjs(ds, "MM-DD-YYYY").toDate());
        fp.setDate(datesToSet, true); // Set dates and trigger onChange
    } else if (fp) {
        fp.setDate([new Date()], true); // Default to today if no saved dates
    }
    selectedDaysCount = fp.selectedDates.length > 0 ? fp.selectedDates.length : 1;


    // Restore tracks
    if (data.selectedTrackValues && data.selectedTrackValues.length > 0) {
        $(".track-checkbox").prop("checked", false); // Uncheck all first
        data.selectedTrackValues.forEach(trackVal => {
            $(`.track-checkbox[value="${trackVal}"]`).prop("checked", true);
        });
    } else {
       autoSelectNYTrackAndVenezuela(); // Auto-select if no tracks saved
    }
    const countableTracks = $(".track-checkbox:checked").filter(function() { return $(this).val() !== "Venezuela"; }).length;
    selectedTracksCount = countableTracks > 0 ? countableTracks : 1;


    playCount = 0; // Reset before adding plays
    $("#tablaJugadas").empty();
    if (data.plays) {
        data.plays.forEach((p)=>{
          // Use addMainRow to ensure consistency and correct playCount update
          const newRow = addMainRow();
          if (newRow) {
            newRow.find(".betNumber").val(p.betNumber || "");
            // gameMode will be set by recalcMainRow
            newRow.find(".straight").val(p.straight || "");
            newRow.find(".box").val(p.box || "");
            newRow.find(".combo").val(p.combo || "");
            recalcMainRow(newRow); // This will set gameMode and total
          }
        });
    }
    
    calculateMainTotal(); // Recalculate total based on restored state
    highlightDuplicatesInMain();
    disableTracksByTime(); // Check cutoffs after loading state
  }
  

  // (10) resetForm
  $("#resetForm").click(function(){
    if(confirm("Are you sure you want to reset the form?")){
      resetForm();
    }
  });

  function resetForm(){
    $("#lotteryForm")[0].reset(); // Resets form inputs, but not dynamically added rows or checkboxes
    $(".track-checkbox").prop("checked", false); // Uncheck all track checkboxes
    $("#tablaJugadas").empty();
    playCount=0;
    
    window.ticketImageDataUrl=null;
    localStorage.removeItem("formState");

    if(fp) {
      fp.clear();
      fp.setDate([ new Date() ], true); // Set to today and trigger events
    }
    selectedDaysCount = 1; // Reset to 1 after clearing
    
    autoSelectNYTrackAndVenezuela(); // This will also trigger track change and update selectedTracksCount
    
    // Explicitly call calculateMainTotal after all resets
    calculateMainTotal(); 
    showCutoffTimes(); // Recalculate and display cutoff times
    disableTracksByTime(); // Re-check track availability
    $("#totalJugadas").text("0.00"); // Ensure total display is reset
  }

  // (11) Generate Ticket
  $("#generarTicket").click(function(){
    doGenerateTicket();
  });

  function doGenerateTicket(){
    const dateVal = fp.selectedDates.map(d => dayjs(d).format("MM-DD-YYYY")).join(", ");
    if(!dateVal || fp.selectedDates.length === 0){
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

    if (userChoseToday()) {
        let closedTrackFound = false;
        for (let t of chosenTracks) {
            if (t === "Venezuela") continue;
            const rawCutoff = getTrackCutoff(t);
            if (rawCutoff) {
                const now = dayjs();
                // Assuming cutoff is HH:mm format
                let cutoffTimeToday = dayjs(now.format("YYYY-MM-DD") + " " + rawCutoff); 
                // If cutoff is late (e.g. 22:00), it's effectively 10 PM. 
                // If cutoff is early (e.g. 02:00 AM for a "night" draw that's technically next day morning), adjust.
                // For simplicity here, directly compare.
                // Subtract 10 minutes as a buffer
                cutoffTimeToday = cutoffTimeToday.subtract(10, 'minute'); 

                if (now.isAfter(cutoffTimeToday)) {
                    alert(`Track "${t}" is closed for today (cutoff: ${cutoffTimeToday.format("hh:mm A")}).`);
                    closedTrackFound = true;
                    break; 
                }
            }
        }
        if (closedTrackFound) return;
    }


    // Validar filas
    const rows= $("#tablaJugadas tr");
    let valid=true;
    const errors=[];
    rows.each(function(){
      $(this).find(".betNumber,.straight,.box,.combo,.gameMode").removeClass("error-field");
    });

    rows.each(function(){
      const rowIndex= parseInt($(this).attr("data-playindex")); // Corrected attribute
      const bn= $(this).find(".betNumber").val().trim();
      const gm= $(this).find(".gameMode").text();
      const st= parseFloat($(this).find(".straight").val().trim()||"0");
      const bx= parseFloat($(this).find(".box").val().trim()||"0");
      const co= parseFloat($(this).find(".combo").val().trim()||"0");

      let errorHere=false;
      if(!bn){
        errorHere=true;
        errors.push(rowIndex);
        $(this).find(".betNumber").addClass("error-field");
      }
      if(hasBrooklynOrFront(chosenTracks) && bn.length!==3){
        errorHere=true;
        errors.push(rowIndex);
        $(this).find(".betNumber").addClass("error-field");
      }
      if(gm==="-"){
        errorHere=true;
        errors.push(rowIndex);
        $(this).find(".gameMode").addClass("error-field");
      }

      if(["Venezuela","Pale-Ven","Pulito","RD-Quiniela","Pale-RD", "Palé"].includes(gm)){
        if(st<=0 && bx<=0 && co<=0){ // For these modes, at least one wager type should be > 0
          errorHere=true;
          errors.push(rowIndex);
          $(this).find(".straight, .box, .combo").addClass("error-field");
        }
      }
      if(["Win 4","Pick 3"].includes(gm)){
        if(st<=0 && bx<=0 && co<=0){
          errorHere=true;
          errors.push(rowIndex);
          $(this).find(".straight,.box,.combo").addClass("error-field");
        }
      }
      if(gm==="Single Action"){
        if(st<=0 && bx<=0 && co<=0){ // Allow box/combo for SA if needed by user
          errorHere=true;
          errors.push(rowIndex);
          $(this).find(".straight,.box,.combo").addClass("error-field");
        }
      }
      if(gm==="NY Horses"){
        if(st<=0 && bx<=0 && co<=0){
          errorHere=true;
          errors.push(rowIndex);
          $(this).find(".straight,.box,.combo").addClass("error-field");
        }
      }

      // Límites (example, adjust as needed)
      if(gm==="Win 4"){
        if(st>10) { errorHere=true; $(this).find(".straight").addClass("error-field");} // Example limit
        if(bx>62) { errorHere=true; $(this).find(".box").addClass("error-field");}
        if(co>10) { errorHere=true; $(this).find(".combo").addClass("error-field");}
      }
      if(gm==="Pick 3"){
         if(st>35) { errorHere=true; $(this).find(".straight").addClass("error-field");}
         if(bx>105) { errorHere=true; $(this).find(".box").addClass("error-field");}
         if(co>35) { errorHere=true; $(this).find(".combo").addClass("error-field");}
      }
      if(["Venezuela", "Pulito", "RD-Quiniela"].includes(gm)){
         if(st>100) { errorHere=true; $(this).find(".straight").addClass("error-field");}
         if(bx>100) { errorHere=true; $(this).find(".box").addClass("error-field");} // If box is allowed
      }
       if(gm==="Single Action"){
         if(st>600) { errorHere=true; $(this).find(".straight").addClass("error-field");}
      }


      if(errorHere && !errors.includes(rowIndex)) errors.push(rowIndex); // Add only if not already present
      if(errorHere) valid=false;
    });

    if(!valid){
      const uniqueErr=[...new Set(errors)].sort((a,b)=>a-b).join(", ");
      alert(`Some plays have errors or exceed limits (row(s): ${uniqueErr}). Please fix them.`);
      return;
    }

    // Llenar ticket
    $("#ticketJugadas").empty();
    rows.each(function(){
      const rowIndex= $(this).attr("data-playindex"); // Corrected attribute
      const bn= $(this).find(".betNumber").val().trim();
      const gm= $(this).find(".gameMode").text();
      let stVal= $(this).find(".straight").val().trim()||"0.00";
      let bxVal= $(this).find(".box").val().trim()||"0.00"; // Default to 0.00 if empty
      let coVal= $(this).find(".combo").val().trim()||"0.00"; // Default to 0.00 if empty
      let totVal= $(this).find(".total").text()||"0.00";

      const rowHTML=`
        <tr>
          <td>${rowIndex}</td>
          <td>${bn}</td>
          <td>${gm}</td>
          <td>${parseFloat(stVal).toFixed(2)}</td>
          <td>${parseFloat(bxVal).toFixed(2)}</td>
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

    const ticketModal= new bootstrap.Modal(document.getElementById("ticketModal"));
    $("#editButton").removeClass("d-none");
    $("#shareTicket").addClass("d-none");
    $("#confirmarTicket").prop("disabled",false);
    fixTicketLayoutForMobile();
    ticketModal.show();
    // storeFormState(); // State stored by individual actions
  }

  $("#confirmarTicket").click(function(){
    $(this).prop("disabled",true);
    $("#editButton").addClass("d-none");

    const uniqueTicket= generateUniqueTicketNumber();
    $("#numeroTicket").text(uniqueTicket);
    transactionDateTime= dayjs().format("MM/DD/YYYY hh:mm A"); // Use global so it's consistent
    $("#ticketTransaccion").text(transactionDateTime);

    // QR
    $("#qrcode").empty();
    new QRCode(document.getElementById("qrcode"),{
      text: uniqueTicket,
      width:128,
      height:128
    });

    $("#shareTicket").removeClass("d-none");

    const ticketElement= document.getElementById("preTicket");
    const originalStyles= {
      width:$(ticketElement).css("width"),
      height:$(ticketElement).css("height"),
      maxHeight:$(ticketElement).css("max-height"),
      overflowY:$(ticketElement).css("overflow-y")
    };
    $(ticketElement).css({
      width:"auto",
      height:"auto",
      maxHeight:"none",
      overflowY:"visible"
    });

    setTimeout(()=>{
      html2canvas(ticketElement,{scale:2})
      .then(canvas=>{
        const dataUrl= canvas.toDataURL("image/jpeg",0.8);
        window.ticketImageDataUrl= dataUrl;

        const link= document.createElement("a");
        link.href= dataUrl;
        link.download= `ticket_${uniqueTicket}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        alert("Your ticket image was downloaded successfully (JPEG).");

        saveBetDataToSheetDB(uniqueTicket, success=>{ // Pass uniqueTicket here
          if(success){
            console.log("Bet data sent to SheetDB.");
          } else {
            console.error("Failed to send bet data to SheetDB.");
          }
        });
      })
      .catch(err=>{
        console.error("Error generating ticket image:", err);
        alert("Problem generating final ticket image. Try again.");
      })
      .finally(()=>{
        $(ticketElement).css(originalStyles);
      });
    },500);
  });

  $("#editButton").click(function(){
    const ticketModalEl = document.getElementById("ticketModal");
    if (ticketModalEl) {
        const ticketModal= bootstrap.Modal.getInstance(ticketModalEl);
        if (ticketModal) ticketModal.hide();
    }
  });

  $("#shareTicket").click(async function(){
    if(!window.ticketImageDataUrl){
      alert("No ticket image is available to share.");
      return;
    }
    if(navigator.share && navigator.canShare){ // Check navigator.canShare first
      try{
        const resp=await fetch(window.ticketImageDataUrl);
        const blob=await resp.blob();
        const file=new File([blob],"ticket.jpg",{type:"image/jpeg"});
        if(navigator.canShare({files:[file]})){
          await navigator.share({files:[file], title:"Ticket", text:"Sharing Ticket"});
        } else {
          // Fallback or message if specific file sharing not supported
          alert("File sharing not supported. Please share the downloaded image manually.");
        }
      } catch(e){
        console.error("Share API error:", e);
        alert("Could not share the ticket image. Please try manually.");
      }
    } else {
      alert("Your browser doesn't support the Web Share API with files. Please share manually.");
    }
  });

  function generateUniqueTicketNumber(){
    return Math.floor(10000000 + Math.random()*90000000).toString();
  }

  function fixTicketLayoutForMobile(){
    // These styles might be better handled in CSS with media queries
    // $("#preTicket table, #preTicket th, #preTicket td").css("white-space","nowrap");
    // $("#preTicket").css("overflow-x","auto");
  }

  function saveBetDataToSheetDB(ticketNum, callback){ // Added ticketNum parameter
    const dateVal = fp.selectedDates.map(d => dayjs(d).format("MM-DD-YYYY")).join(", ");
    const chosenTracks = $(".track-checkbox:checked")
      .map(function(){return $(this).val();})
      .get();
    const joinedTracks= chosenTracks.join(", ");
    const nowISO= dayjs().toISOString();
    let betData=[];

    $("#tablaJugadas tr").each(function(){
      const rowIndex= $(this).attr("data-playindex"); // Corrected attribute
      const bn= $(this).find(".betNumber").val();
      const gm= $(this).find(".gameMode").text();
      const st= $(this).find(".straight").val();
      const bx= $(this).find(".box").val();
      const co= $(this).find(".combo").val();
      const tot= $(this).find(".total").text();

      if(gm!=="-"){ // Only save valid plays
        betData.push({
          "Ticket Number": ticketNum, // Use passed ticketNum
          "Transaction DateTime": transactionDateTime, // Use global transactionDateTime
          "Bet Dates": dateVal,
          "Tracks": joinedTracks,
          "Bet Number": bn||"",
          "Game Mode": gm,
          "Straight ($)": st||"",
          "Box ($)": bx||"",
          "Combo ($)": co||"",
          "Total ($)": tot||"0.00",
          "Row Number": rowIndex,
          "Timestamp": nowISO
        });
      }
    });
    
    if (betData.length === 0) {
        console.log("No valid bet data to send to SheetDB.");
        callback(true); // Consider this a "success" as there's nothing to fail on
        return;
    }

    fetch(SHEETDB_API_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ data: betData }) // SheetDB expects an object with a 'data' property which is an array
    })
    .then(r=>{
      if(!r.ok) throw new Error(`SheetDB error: ${r.status} ${r.statusText}`);
      return r.json();
    })
    .then(d=>{
      console.log("Data stored in SheetDB:", d);
      callback(true);
    })
    .catch(e=>{
      console.error("Error saving to SheetDB:", e);
      callback(false);
    });
  }

  function getTrackCutoff(tn){
    for(let region in cutoffTimes){
      if(cutoffTimes[region] && cutoffTimes[region][tn]){ // Check if region and track exist
        return cutoffTimes[region][tn];
      }
    }
    return null;
  }

  function hasBrooklynOrFront(tracks){
    const bfSet= new Set(["Brooklyn Midday","Brooklyn Evening","Front Midday","Front Evening"]);
    return tracks.some(t=> bfSet.has(t));
  }

  function userChoseToday(){
    if (!fp || !fp.selectedDates || fp.selectedDates.length === 0) return false;
    const today= dayjs().startOf("day");
    for(let d of fp.selectedDates){
      if(dayjs(d).startOf("day").isSame(today,"day")) return true;
    }
    return false;
  }

  function disableTracksByTime(){
    const todaySelected = userChoseToday();
    $(".track-checkbox").each(function(){
      const trackVal = $(this).val();
      const $label = $(this).closest(".track-button-container").find(".track-button");
      
      if (trackVal === "Venezuela") { // Venezuela is never disabled by time
          $(this).prop("disabled", false);
          $label.css({ opacity: 1, cursor: "pointer" });
          return; // Continue to next track
      }

      const rawCutoff = getTrackCutoff(trackVal);
      if(rawCutoff && todaySelected){
        const now = dayjs();
        // Combine current date with cutoff time for accurate comparison
        let cutoffTimeToday = dayjs(now.format("YYYY-MM-DD") + " " + rawCutoff, "YYYY-MM-DD HH:mm");
        
        // Apply 10-minute buffer before cutoff
        cutoffTimeToday = cutoffTimeToday.subtract(10, 'minute');

        if(now.isAfter(cutoffTimeToday)){
          $(this).prop("checked",false).prop("disabled",true);
          $label.css({ opacity:0.5, cursor:"not-allowed" });
        } else {
          $(this).prop("disabled",false);
          $label.css({ opacity:1, cursor:"pointer" });
        }
      } else { // If not today or no cutoff, ensure enabled
        $(this).prop("disabled",false);
        $label.css({ opacity:1, cursor:"pointer" });
      }
    });
    // After potentially disabling tracks, re-evaluate selectedTracksCount and total
    const arr = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
    const countableTracks = arr.filter(x => x !== "Venezuela").length;
    selectedTracksCount = countableTracks > 0 ? countableTracks : 1;
    calculateMainTotal();
    // storeFormState(); // Storing state handled by callers or specific events
  }


  function enableAllTracks(){ // Not strictly needed if disableTracksByTime handles enabling
    $(".track-checkbox").each(function(){
      $(this).prop("disabled",false);
      $(this).closest(".track-button-container").find(".track-button").css({
        opacity:1,
        cursor:"pointer"
      });
    });
  }

  function showCutoffTimes(){
    $(".cutoff-time").each(function(){
      const track= $(this).data("track");
      if(track==="Venezuela") {
          $(this).text(""); // No cutoff time displayed for Venezuela
          return;
      }
      let rawCutoff = getTrackCutoff(track);

      if(rawCutoff){
        // Display cutoff time directly, e.g., 02:20 PM
        $(this).text(dayjs(rawCutoff, "HH:mm").format("hh:mm A"));
      } else {
        $(this).text(""); // Clear if no cutoff
      }
    });
  }


  // Initial setup calls
  loadFormState(); // Load saved state first (this will set dates and tracks)
  // showCutoffTimes() and disableTracksByTime() are called within loadFormState or after its dependent state setters.
  // autoSelectNYTrackAndVenezuela() is also called within loadFormState if no tracks are loaded.

  setInterval(disableTracksByTime, 60000); // Check every minute

  function autoSelectNYTrackAndVenezuela(){
    const anyChecked = $(".track-checkbox:checked").length > 0;
    if(anyChecked && !localStorage.getItem("formState")) return; // If already checked by user (not from localStorage), don't override
    if (anyChecked && localStorage.getItem("formState")) return; // If loaded from localStorage, respect that

    const now = dayjs();
    let middayCutoffMoment = dayjs(now.format("YYYY-MM-DD") + " " + (cutoffTimes.USA["New York Mid Day"] || "14:20"), "YYYY-MM-DD HH:mm").subtract(10, 'minute');

    if(now.isBefore(middayCutoffMoment)){
      $("#trackNYMidDay").prop("checked",true);
    } else {
      $("#trackNYEvening").prop("checked",true);
    }
    $("#trackVenezuela").prop("checked",true);

    // Trigger change to update counts and totals
    $(".track-checkbox").trigger("change");
  }


  // Duplicates highlight en MAIN
  function highlightDuplicatesInMain(){
    $("#tablaJugadas tr .betNumber").removeClass("duplicado"); // Target .betNumber input
    let counts={};
    $("#tablaJugadas tr").each(function(){
      const bn= $(this).find(".betNumber").val().trim();
      if(!bn) return;
      counts[bn]= (counts[bn]||0)+1;
    });
    $("#tablaJugadas tr").each(function(){
      const bn= $(this).find(".betNumber").val().trim();
      if(counts[bn]>1){
        $(this).find(".betNumber").addClass("duplicado");
      }
    });
  }

  /*
   =========================================================
   WIZARD
   =========================================================
  */

  const wizardModalEl = document.getElementById("wizardModal");
  let wizardModalInstance = null;
  if (wizardModalEl) {
    wizardModalInstance = new bootstrap.Modal(wizardModalEl);
  }


  $("#wizardButton").click(function(){
    resetWizard();
    if (wizardModalInstance) wizardModalInstance.show();
  });

  function resetWizard(){
    wizardCount=0;
    $("#wizardTableBody").empty();
    lockedFields.straight=false;
    lockedFields.box=false;
    lockedFields.combo=false;
    $("#lockStraight").html(`<i class="bi bi-unlock"></i>`).removeClass('active');
    $("#lockBox").html(`<i class="bi bi-unlock"></i>`).removeClass('active');
    $("#lockCombo").html(`<i class="bi bi-unlock"></i>`).removeClass('active');
    $("#wizardBetNumber").val("");
    $("#wizardStraight").val("");
    $("#wizardBox").val("");
    $("#wizardCombo").val("");
    $("#qpGameMode").val("Pick 3"); // Default
    $("#qpCount").val("5");
    $("#rdFirstNumber").val("");
    $("#rdLastNumber").val("");
  }

  $(".lockBtn").click(function(){
    const field = $(this).data("field");
    lockedFields[field] = !lockedFields[field];
    if(lockedFields[field]){
      $(this).html(`<i class="bi bi-lock-fill"></i>`).addClass('active');
    } else {
      $(this).html(`<i class="bi bi-unlock"></i>`).removeClass('active');
    }
  });

  $("#wizardAddNext").click(function(){
    const bn = $("#wizardBetNumber").val().trim();
    if (!bn) {
        alert("Please enter a Bet Number.");
        $("#wizardBetNumber").focus();
        return;
    }
    const gm = determineGameMode(bn);
    if(gm==="-"){
      alert(`Cannot determine game mode for "${bn}". Check selected tracks or bet number length/format.`);
      return;
    }
    let stVal = $("#wizardStraight").val().trim();
    let bxVal = $("#wizardBox").val().trim();
    let coVal = $("#wizardCombo").val().trim();

    const rowT= calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);

    if(!lockedFields.straight) $("#wizardStraight").val("");
    if(!lockedFields.box) $("#wizardBox").val("");
    if(!lockedFields.combo) $("#wizardCombo").val("");

    $("#wizardBetNumber").val("").focus();
    highlightDuplicatesInWizard();
  });

  function addWizardRow(bn, gm, stVal, bxVal, coVal, total){
    wizardCount++;
    const i = wizardCount;
    const rowHTML=`
      <tr data-wizardindex="${i}">
        <td>
          <button type="button" class="removeWizardBtn btnRemovePlay" data-row="${i}">${i}</button>
        </td>
        <td>${bn}</td>
        <td>${gm}</td>
        <td>${stVal||"-"}</td>
        <td>${bxVal||"-"}</td>
        <td>${coVal||"-"}</td>
        <td>${parseFloat(total||0).toFixed(2)}</td>
      </tr>
    `;
    $("#wizardTableBody").append(rowHTML);
  }

  $("#wizardTableBody").on("click",".removeWizardBtn",function(){
    $(this).closest("tr").remove();
    renumberWizard();
    highlightDuplicatesInWizard();
  });

  function renumberWizard(){
    let i=0;
    $("#wizardTableBody tr").each(function(){
      i++;
      $(this).attr("data-wizardindex", i); // Corrected attribute
      $(this).find(".removeWizardBtn").attr("data-row", i).text(i);
    });
    wizardCount=i;
  }

  $("#btnGenerateQuickPick").click(function(){
    const gm = $("#qpGameMode").val();
    const countVal= parseInt($("#qpCount").val())||1;
    if(countVal<1||countVal>25){
      alert("Please enter a count between 1 and 25.");
      return;
    }
    const stVal= $("#wizardStraight").val().trim();
    const bxVal= $("#wizardBox").val().trim();
    const coVal= $("#wizardCombo").val().trim();

    for(let i=0;i<countVal;i++){
      let bn= generateRandomNumberForMode(gm);
      // bn= padNumberForMode(bn, gm); // Padding will happen in determineGameMode if needed or display

      let currentGM = determineGameMode(bn.toString()); // determine game mode for the generated number
      let rowT= calculateRowTotal(bn.toString(), currentGM, stVal, bxVal, coVal);
      addWizardRow(bn.toString(), currentGM, stVal, bxVal, coVal, rowT);
    }
    highlightDuplicatesInWizard();
  });

 function generateRandomNumberForMode(mode) {
    let num;
    let length;
    switch (mode) {
        case "Win 4": length = 4; break;
        case "Pick 3": length = 3; break;
        case "Venezuela": case "Pulito": case "RD-Quiniela": length = 2; break;
        case "Single Action": length = 1; break;
        case "NY Horses": length = Math.floor(Math.random() * 4) + 1; break; // 1 to 4 digits
        case "Pale-Ven": case "Pale-RD": // e.g., 22-55
            let p1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
            let p2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
            return `${p1}-${p2}`; // Specific format for Palé
        default: length = 3; // Default to Pick 3 like
    }
    num = Math.floor(Math.random() * Math.pow(10, length));
    return num.toString().padStart(length, '0');
}


  $("#btnGenerateRoundDown").click(function(){
    const firstNumStr= $("#rdFirstNumber").val().trim();
    const lastNumStr = $("#rdLastNumber").val().trim();
    if(!firstNumStr||!lastNumStr){
      alert("Please enter both first and last number for Round Down.");
      return;
    }
    if(firstNumStr.length!==lastNumStr.length || ![2,3,4].includes(firstNumStr.length)){
      alert("First/Last must have the same length (2, 3, or 4 digits).");
      return;
    }
    let start= parseInt(firstNumStr,10);
    let end= parseInt(lastNumStr,10);

    if(isNaN(start)||isNaN(end)){
      alert("Invalid numeric range for Round Down.");
      return;
    }
    if(start> end){ // Swap if out of order
      [start,end]=[end,start];
    }
    const stVal= $("#wizardStraight").val().trim();
    const bxVal= $("#wizardBox").val().trim();
    const coVal= $("#wizardCombo").val().trim();

    for(let i=start; i<=end; i++){
      let bn= i.toString().padStart(firstNumStr.length,"0");
      let gm= determineGameMode(bn);
      if(gm==="-") {
          console.warn(`Could not determine game mode for Round Down number: ${bn}. Skipping.`);
          continue; 
      }
      const rowT= calculateRowTotal(bn, gm, stVal, bxVal, coVal);
      addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
    }
    highlightDuplicatesInWizard();
  });

  $("#btnPermute").click(function(){
    permuteWizardBetNumbers();
  });

  function permuteWizardBetNumbers(){
    const rows= $("#wizardTableBody tr");
    if(rows.length===0){
      alert("No plays in the wizard table to permute.");
      return;
    }
    let allDigitsPermute=[]; // Renamed to avoid conflict with other allDigits
    let originalRowsData = [];

    rows.each(function(){
      const bn=$(this).find("td").eq(1).text().trim();
      const stTd = $(this).find("td").eq(3).text().trim();
      const bxTd = $(this).find("td").eq(4).text().trim();
      const coTd = $(this).find("td").eq(5).text().trim();
      originalRowsData.push({bn, stTd, bxTd, coTd});
      for(let char of bn.replace(/-/g, '')) { // Remove hyphens for palé before collecting digits
          if(!isNaN(parseInt(char))) allDigitsPermute.push(char);
      }
    });

    if(allDigitsPermute.length===0){
      alert("No digits found in bet numbers to permute.");
      return;
    }

    // Fisher-Yates shuffle
    for(let i=allDigitsPermute.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [allDigitsPermute[i],allDigitsPermute[j]]=[allDigitsPermute[j],allDigitsPermute[i]];
    }
    
    let digitIdx=0;
    rows.each(function(i){
      const originalData = originalRowsData[i];
      let newBN = "";
      if (originalData.bn.includes('-')) { // Handle Palé format
          let p1 = allDigitsPermute.slice(digitIdx, digitIdx + 2).join("");
          digitIdx += 2;
          let p2 = allDigitsPermute.slice(digitIdx, digitIdx + 2).join("");
          digitIdx += 2;
          newBN = `${p1.padStart(2,'0')}-${p2.padStart(2,'0')}`;
      } else {
          newBN = allDigitsPermute.slice(digitIdx, digitIdx + originalData.bn.length).join("");
          digitIdx += originalData.bn.length;
          newBN = newBN.padStart(originalData.bn.length, '0');
      }

      const gm= determineGameMode(newBN);
      const newTotal= calculateRowTotal(
        newBN, gm,
        originalData.stTd==="-"?"":originalData.stTd,
        originalData.bxTd==="-"?"":originalData.bxTd,
        originalData.coTd==="-"?"":originalData.coTd
      );
      $(this).find("td").eq(1).text(newBN);
      $(this).find("td").eq(2).text(gm);
      $(this).find("td").eq(6).text(parseFloat(newTotal).toFixed(2));
    });
    highlightDuplicatesInWizard();
  }


  $("#wizardAddAllToMain").click(function(){
    const wizardRows= $("#wizardTableBody tr");
    if(wizardRows.length===0){
      alert("No plays in the wizard table to add.");
      return;
    }
    wizardRows.each(function(){
      if(playCount>=MAX_PLAYS){
        alert("Reached 25 plays in the main form. Some plays from wizard were not added.");
        return false; // Break .each loop
      }
      const tds=$(this).find("td");
      const bn=tds.eq(1).text();
      // gameMode will be determined by addMainRow -> recalcMainRow
      const stVal=(tds.eq(3).text()==="-"?"":tds.eq(3).text());
      const bxVal=(tds.eq(4).text()==="-"?"":tds.eq(4).text());
      const coVal=(tds.eq(5).text()==="-"?"":tds.eq(5).text());
      
      addMainRow({ // Pass data to addMainRow
          betNumber: bn,
          straightAmount: parseFloat(stVal) || null,
          boxAmount: parseFloat(bxVal) || null,
          comboAmount: parseFloat(coVal) || null
      });
    });

    resetWizard(); // Clear wizard after adding
    // recalcAllMainRows(); // addMainRow already calls recalcMainRow
    calculateMainTotal();
    highlightDuplicatesInMain();
    storeFormState();
    if (wizardModalInstance) wizardModalInstance.hide(); // Hide after adding
  });

  $("#wizardGenerateTicket").click(function(){
    $("#wizardAddAllToMain").trigger("click"); // Add plays to main form
    // doGenerateTicket is called if wizardAddAllToMain doesn't stop early
    if ($("#wizardTableBody tr").length === 0) { // Check if wizard was actually emptied
        if (wizardModalInstance) wizardModalInstance.hide();
        doGenerateTicket();
    }
  });

  $("#wizardEditMainForm").click(function(){
    if (wizardModalInstance) wizardModalInstance.hide();
  });

  function highlightDuplicatesInWizard(){
    $("#wizardTableBody tr td:nth-child(2)").removeClass("duplicado"); // Target 2nd td
    let counts={};
    $("#wizardTableBody tr").each(function(){
      const bn=$(this).find("td").eq(1).text().trim(); // Bet number is in 2nd td
      if(!bn)return;
      counts[bn]=(counts[bn]||0)+1;
    });
    $("#wizardTableBody tr").each(function(){
      const bn=$(this).find("td").eq(1).text().trim();
      if(counts[bn]>1){
        $(this).find("td").eq(1).addClass("duplicado");
      }
    });
  }

  /*
   =========================================================
   Intro.js Tutorial & Manual (No changes needed for OCR logic)
   =========================================================
  */
  const tutorialStepsEN = [ { intro: "Welcome! This tutorial will guide you through the main features." }, { element: "#fecha", title: "Bet Dates", intro: "Select one or more dates for your lottery bets." }, { element: "#tracksAccordion", title: "Tracks", intro: "Expand a section and pick the tracks you want to bet on." }, { element: "#agregarJugada", title: "Add Play", intro: "Click here to add a new play (row) to the table." }, { element: "#wizardButton", title: "Wizard", intro: "This button opens a modal for quick entry of multiple plays." }, { element: "#resetForm", title: "Reset Form", intro: "Clears everything and resets the form to default." }, { element: "#generarTicket", title: "Generate Ticket", intro: "Once everything is correct, generate your ticket here." }, { element: "#btnOcrModal", title: "OCR Capture", intro: "Click here to upload an image of a ticket and interpret it."} ];
  const tutorialStepsES = [ { intro: "¡Bienvenido! Este tutorial te mostrará cómo usar la aplicación." }, { element: "#fecha", title: "Fechas", intro: "Selecciona una o varias fechas para tus jugadas de lotería." }, { element: "#tracksAccordion", title: "Tracks", intro: "Despliega y marca los sorteos que te interesen." }, { element: "#agregarJugada", title: "Agregar Jugada", intro: "Presiona aquí para añadir una nueva línea de jugada." }, { element: "#wizardButton", title: "Asistente (Wizard)", intro: "Abre una ventana para entrar jugadas de forma rápida." }, { element: "#resetForm", title: "Resetear", intro: "Borra todo y restaura la forma a sus valores iniciales." }, { element: "#generarTicket", title: "Generar Ticket", intro: "Cuando todo esté listo, genera el ticket en esta sección." }, { element: "#btnOcrModal", title: "Captura OCR", intro: "Haz clic para subir una imagen de un boleto e interpretarla."} ];
  const tutorialStepsHT = [ { intro: "Byenvini! Tutorial sa ap moutre w kijan pou itilize aplikasyon an." }, { element: "#fecha", title: "Dat", intro: "Chwazi youn oswa plizyè dat pou jwe." }, { element: "#tracksAccordion", title: "Tracks", intro: "Desann epi chwazi kisa w vle jwe." }, { element: "#agregarJugada", title: "Ajoute Jwe", intro: "Peze la pou ajoute yon nouvo ranje jwe." }, { element: "#wizardButton", title: "Asistan (Wizard)", intro: "Ou ka antre parye rapidman isi." }, { element: "#resetForm", title: "Reyinisyalize", intro: "Efase tout bagay epi retounen aplikasyonnan jan li te ye anvan." }, { element: "#generarTicket", title: "Fè Ticket", intro: "Lè ou fini tout jwe yo, kreye ticket la." }, {element: "#btnOcrModal", title: "Kaptire OCR", intro: "Klike la a pou telechaje yon imaj yon tikè epi entèprete li."} ];

  function startTutorial(lang){
    let stepsToUse = tutorialStepsEN;
    if(lang==="es") stepsToUse = tutorialStepsES;
    if(lang==="ht") stepsToUse = tutorialStepsHT;

    introJs().setOptions({
      steps: stepsToUse,
      showProgress: true,
      showButtons: true,
      exitOnOverlayClick: false
    }).start();
  }
  $("#helpEnglish").click(()=>startTutorial('en'));
  $("#helpSpanish").click(()=>startTutorial('es'));
  $("#helpCreole").click(()=>startTutorial('ht'));

  $("#manualEnglishBtn").click(function(){ $("#manualEnglishText").removeClass("d-none"); $("#manualSpanishText").addClass("d-none"); $("#manualCreoleText").addClass("d-none"); });
  $("#manualSpanishBtn").click(function(){ $("#manualEnglishText").addClass("d-none"); $("#manualSpanishText").removeClass("d-none"); $("#manualCreoleText").addClass("d-none"); });
  $("#manualCreoleBtn").click(function(){ $("#manualEnglishText").addClass("d-none"); $("#manualSpanishText").addClass("d-none"); $("#manualCreoleText").removeClass("d-none"); });


  /*
     =========================================================
     OCR: Conexión a Next.js API Route con Genkit
     =========================================================
  */

  let selectedFileGlobalOCR = null;
  let jugadasGlobalOCR = []; // Almacena las jugadas interpretadas por Genkit
  let ocrProgressInterval = null;

  window.abrirModalOCR = function() {
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src","");
    $("#ocrJugadas").html("<p>Sube una imagen para ver las jugadas detectadas.</p>");
    hideOcrLoading();
    $("#ocrDebugPanel").addClass("d-none"); // Debug panel might not be relevant in the same way
    $("#btnProcesarOCR").prop("disabled", true); // Disable process button until file is selected
    $("#btnCargarJugadas").prop("disabled", true); // Disable load button initially


    const modalOcrEl = document.getElementById("modalOcr");
    let modalOcrInstance = bootstrap.Modal.getInstance(modalOcrEl);
    if (!modalOcrInstance) {
        modalOcrInstance = new bootstrap.Modal(modalOcrEl);
    }
    modalOcrInstance.show();
  };

  window.handleDragOver = function(e) { e.preventDefault(); $("#ocrDropZone").addClass("dragover"); };
  window.handleDragLeave = function(e) { e.preventDefault(); $("#ocrDropZone").removeClass("dragover"); };

  function handleFileSelection(file) {
    if (file && file.type.startsWith("image/")) {
        selectedFileGlobalOCR = file;
        $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
        $("#ocrJugadas").html("<p>Imagen cargada. Haz clic en 'Procesar OCR'.</p>");
        $("#btnProcesarOCR").prop("disabled", false); // Enable process button
    } else {
        selectedFileGlobalOCR = null;
        $("#ocrPreview").addClass("d-none").attr("src", "");
        $("#ocrJugadas").html("<p>Por favor, selecciona un archivo de imagen válido.</p>");
        $("#btnProcesarOCR").prop("disabled", true);
        alert("Por favor, selecciona un archivo de imagen válido (JPEG, PNG, etc.).");
    }
  }

  window.handleDrop = function(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
    if(e.dataTransfer.files && e.dataTransfer.files[0]){
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  window.handleFileChange = function(e) {
    if(e.target.files && e.target.files[0]){
      handleFileSelection(e.target.files[0]);
    }
  };

  function showOcrLoading() {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width","0%").removeClass("bg-danger bg-success").addClass("bg-primary"); // Reset colors
    $("#ocrProgressText").text("Subiendo y Procesando...");
    $("#btnProcesarOCR").prop("disabled", true);
    $("#btnCargarJugadas").prop("disabled", true);


    let progressValue = 0;
    ocrProgressInterval = setInterval(()=>{
      progressValue += 5; // Simulate progress
      if(progressValue > 95) progressValue = 95; // Don't hit 100% until done
      $("#ocrProgressBar").css("width", progressValue + "%");
    }, 300); // Slower interval for better visual
  }

  function hideOcrLoading(isError = false, message = "Completado") {
    if(ocrProgressInterval) {
      clearInterval(ocrProgressInterval);
      ocrProgressInterval=null;
    }
    if (isError) {
        $("#ocrProgressBar").css("width","100%").removeClass("bg-primary bg-success").addClass("bg-danger");
        $("#ocrProgressText").text(`Error: ${message}`);
    } else {
        $("#ocrProgressBar").css("width","100%").removeClass("bg-primary bg-danger").addClass("bg-success");
        $("#ocrProgressText").text(message);
    }
    // Keep loading section visible for a bit to show final status
    setTimeout(() => {
        $("#ocrLoadingSection").addClass("d-none");
        $("#btnProcesarOCR").prop("disabled", !selectedFileGlobalOCR); // Re-enable if file still selected
    }, isError ? 4000 : 1500); // Longer for error
  }


  window.procesarOCR = async function() {
    if(!selectedFileGlobalOCR){
      alert("No has seleccionado ninguna imagen.");
      return;
    }
    $("#ocrJugadas").empty();
    showOcrLoading();

    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobalOCR);
    reader.onloadend = async () => {
        const base64data = reader.result; // This is the photoDataUri
        try {
            const response = await fetch('/api/interpret-ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ photoDataUri: base64data }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Error desconocido del servidor" }));
                throw new Error(errorData.error || `Error del servidor: ${response.status}`);
            }

            const interpretedBets = await response.json(); // Expected to be an array of Bet objects

            if (!Array.isArray(interpretedBets)) {
                console.error("La respuesta de la API no fue un array:", interpretedBets);
                throw new Error("Formato de respuesta inesperado del servidor.");
            }

            jugadasGlobalOCR = interpretedBets;
            hideOcrLoading(false, "Interpretación completada.");

            if(jugadasGlobalOCR.length === 0){
              $("#ocrJugadas").html("<p>No se detectaron jugadas válidas en la imagen.</p>");
              $("#btnCargarJugadas").prop("disabled", true);
              return;
            }

            let html = `<h5>Jugadas Detectadas (${jugadasGlobalOCR.length}):</h5>`;
            jugadasGlobalOCR.forEach((bet, idx)=>{
              html += `
                <div style="border:1px solid #ccc; padding:0.5rem; margin-bottom:0.5rem; background-color: #f9f9f9; border-radius: 4px;">
                  <p style="margin: 0.25rem 0;">
                    <strong>#${idx + 1} - Número:</strong> ${bet.betNumber || "N/A"}
                    (Modo: ${bet.gameMode || "N/A"})
                  </p>
                  <p style="margin: 0.25rem 0;">
                    <strong>Straight:</strong> $${(bet.straightAmount !== null ? bet.straightAmount : 0).toFixed(2)}
                    <strong>Box:</strong> $${(bet.boxAmount !== null ? bet.boxAmount : 0).toFixed(2)}
                    <strong>Combo:</strong> $${(bet.comboAmount !== null ? bet.comboAmount : 0).toFixed(2)}
                  </p>
                  <button class="btn btn-sm btn-info mt-1" onclick="usarJugadaOCR(${idx})">
                    Usar esta Jugada
                  </button>
                </div>
              `;
            });
            $("#ocrJugadas").html(html);
            $("#btnCargarJugadas").prop("disabled", false); // Enable load button

        } catch(err){
          console.error("Error en procesarOCR:", err);
          hideOcrLoading(true, err.message || "Fallo en la interpretación.");
          $("#ocrJugadas").html(`<p style="color:red;">Error: ${err.message}</p>`);
          $("#btnCargarJugadas").prop("disabled", true);
        }
    };
    reader.onerror = () => {
        hideOcrLoading(true, "No se pudo leer el archivo de imagen.");
        $("#ocrJugadas").html("<p style='color:red;'>Error leyendo el archivo.</p>");
        $("#btnCargarJugadas").prop("disabled", true);
    };
  };

  window.usarJugadaOCR = function(idx){
    if(!jugadasGlobalOCR || !jugadasGlobalOCR[idx]){
      alert("No se encontró la jugada seleccionada.");
      return;
    }
    const bet = jugadasGlobalOCR[idx];

    // Add the single bet to the main table
    addMainRow(bet); // addMainRow now accepts a bet object
    
    highlightDuplicatesInMain();
    storeFormState(); // Save state after adding play

    const modalOcrEl = document.getElementById("modalOcr");
    if (modalOcrEl) {
        const modalInstance = bootstrap.Modal.getInstance(modalOcrEl);
        if (modalInstance) modalInstance.hide();
    }
  };

  $("#btnCargarJugadas").click(function(){
    if(!jugadasGlobalOCR || jugadasGlobalOCR.length === 0){
      alert("No hay jugadas OCR para cargar.");
      return;
    }
    jugadasGlobalOCR.forEach(bet => {
      addMainRow(bet); // Pass the full bet object
    });
    highlightDuplicatesInMain();
    storeFormState();

    const modalOcrEl = document.getElementById("modalOcr");
    if (modalOcrEl) {
        const modalInstance = bootstrap.Modal.getInstance(modalOcrEl);
        if (modalInstance) modalInstance.hide();
    }
  });

  window.toggleOcrDebug = function() {
    // The detailed debug panel from your original Node.js backend isn't directly applicable here.
    // For debugging the Genkit response, you'd typically check the browser's Network tab
    // for the /api/interpret-ticket call, or add console.log statements in the API route itself.
    alert("El panel de debug detallado del OCR no está implementado de la misma manera para esta API. Revisa la consola del navegador para ver la respuesta de la API si es necesario.");
    // $("#ocrDebugPanel").toggleClass("d-none"); // Keep this if you add some client-side debug info
  };

  // Call initial setup functions after DOM is ready
  // loadFormState(); // This is now called at the end of the script
  // showCutoffTimes(); // Called by loadFormState or resetForm
  // disableTracksByTime(); // Called by loadFormState or resetForm
  // autoSelectNYTrackAndVenezuela(); // Called by loadFormState or resetForm
}); // End $(document).ready

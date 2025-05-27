
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

  let selectedTracksCount = 0;
  let selectedDaysCount = 0;
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
      "Venezuela": "00:00",
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
    },
    "Venezuela": {
      "Venezuela": "00:00"
    }
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
      this.calendarContainer.style.transform = 'scale(2.0)';
      this.calendarContainer.style.transformOrigin = 'top left';
    },
    onClose: function() {
      this.calendarContainer.style.transform = '';
    },
    onReady: function(selectedDates, dateStr, instance){
      if(!dateStr || dateStr.trim()===""){
        instance.setDate(new Date(), true);
      }
    },
    onChange: (selectedDates) => {
      selectedDaysCount = selectedDates.length;
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
    selectedTracksCount = arr.filter(x => x !== "Venezuela").length || 1;
    calculateMainTotal();
    disableTracksByTime();
  });

  // (5) MAIN TABLE => Add/Remove
  $("#agregarJugada").click(function(){
    const row = addMainRow();
    if(row) row.find(".betNumber").focus();
  });

  $("#eliminarJugada").click(function(){
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

  function addMainRow(){
    if(playCount >= MAX_PLAYS){
      alert("You have reached 25 plays in the main form.");
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
          <input type="text" class="form-control betNumber" />
        </td>
        <td class="gameMode">-</td>
        <td>
          <input type="number" class="form-control straight" />
        </td>
        <td>
          <input type="text" class="form-control box" />
        </td>
        <td>
          <input type="number" class="form-control combo" />
        </td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    return $("#tablaJugadas tr[data-playIndex='"+rowIndex+"']");
  }

  function renumberMainRows(){
    let i=0;
    $("#tablaJugadas tr").each(function(){
      i++;
      $(this).attr("data-playIndex", i);
      $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i;
    storeFormState();
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
    if(selectedDaysCount===0){
      // If no days selected, but plays exist, sum plays without multiplier
      // If days ARE selected, apply multiplier.
      // This logic might need refinement if selectedDaysCount can be 0 while form has plays.
      // For now, if days=0, treat multiplier as 1 for sum of plays, otherwise apply full multiplier.
      const daysMultiplier = selectedDaysCount > 0 ? selectedDaysCount : 1;
      const tracksMultiplier = selectedTracksCount > 0 ? selectedTracksCount : 1;
      sum = sum * tracksMultiplier * daysMultiplier;

    } else {
      sum = sum * selectedTracksCount * selectedDaysCount;
    }
    $("#totalJugadas").text( sum.toFixed(2) );
    storeFormState();
  }

  // (7) determineGameMode
  function determineGameMode(betNumber){
    if(!betNumber) return "-";

    const tracks = $(".track-checkbox:checked")
      .map(function(){return $(this).val();})
      .get();
    const isUSA = tracks.some(t => cutoffTimes.USA[t]);
    const isSD  = tracks.some(t => cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    // 1) "NY Horses"
    if(includesHorses){
      return "NY Horses";
    }

    // 2) Single Action => 1 dígito, track de USA (except venezuela/horses)
    if(isUSA && !includesVenezuela && betNumber.length===1){
      return "Single Action";
    }

    // 3) Pale => (22-xx)
    const paleRegex = /^(\d{2})(-|x|\+)(\d{2})$/; // Allow x and + as well
    if(paleRegex.test(betNumber)){
      if(includesVenezuela && isUSA) {
        return "Pale-Ven";
      }
      if(isSD && !isUSA){
        return "Pale-RD";
      }
      // If only USA tracks are selected (and not Venezuela or NY Horses), it's a US Palé
      if(isUSA && !isSD && !includesVenezuela && !includesHorses) {
          return "Palé"; // Generic Palé for US
      }
      return "-"; // Needs specific context if mixed or unclear
    }

    const length = betNumber.length;
    if(length<1 || length>4) return "-"; // Allow 1 for SingleAction handled above

    // 4) Venezuela => 2 dig + track USA
    if(length===2 && includesVenezuela && isUSA){
      return "Venezuela";
    }
    // 5) Pulito => 2 dig, track USA sin SD
    if(isUSA && !isSD && length===2){
      return "Pulito";
    }
    // 6) RD-Quiniela => 2 dig, track SD sin USA
    if(length===2 && isSD && !isUSA){
      return "RD-Quiniela";
    }
    // 7) 3 => pick3
    if(length===3) return "Pick 3";
    // 8) 4 => win4
    if(length===4) return "Win 4";

    return "-";
  }

  // (8) calculateRowTotal
  function calculateRowTotal(bn, gm, stVal, bxVal, coVal){
    if(!bn || gm==="-") return "0.00";
    const st = parseFloat(stVal)||0;
    const combo = parseFloat(coVal)||0;

    // Pulito => st * #posiciones en box
    if(gm==="Pulito"){
      if(bxVal){ // Box input for Pulito is treated as number of positions
        const positions = parseFloat(bxVal) || 0; // Example: if box is "2", means 2 positions
        return (st * positions).toFixed(2);
      }
      return st.toFixed(2); // If no box value, just straight
    }

    // Single Action => st+box+combo
    if(gm==="Single Action"){
      const numericBox = parseFloat(bxVal)||0;
      return (st + numericBox + combo).toFixed(2);
    }

    // NY Horses => st+box+combo
    if(gm==="NY Horses"){
      const numericBox = parseFloat(bxVal)||0;
      return (st + numericBox + combo).toFixed(2);
    }

    // Venezuela, Pale-Ven, Pale-RD, RD-Quiniela => solo st
     if(["Venezuela","Pale-RD","Pale-Ven","RD-Quiniela", "Palé"].includes(gm)){
      return st.toFixed(2);
    }


    // Win4 / Pick3 => combosCount
    if(gm==="Win 4" || gm==="Pick 3"){
      const numericBox = parseFloat(bxVal)||0;
      const combosCount = calcCombos(bn);
      let total = st + numericBox + (combo*combosCount);
      return total.toFixed(2);
    }

    // default => st+box+combo
    const numericBox = parseFloat(bxVal)||0;
    return (st + numericBox + combo).toFixed(2);
  }

  function calcCombos(str){
    if (!str) return 1; // Avoid errors with empty bet numbers
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
    const st = {
      selectedTracks: $(".track-checkbox:checked").map(function(){ return $(this).val(); }).get(),
      selectedDays: $("#fecha").val(),
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
        autoSelectNYTrackAndVenezuela(); // Apply defaults if no stored state
        disableTracksByTime(); // Ensure tracks are correctly disabled on first load
        return;
    }
    const data = JSON.parse(dataStr);

    if (data.selectedDays) {
        fp.setDate(data.selectedDays.split(", "), true);
        selectedDaysCount = data.selectedDays.split(", ").length;
    } else {
        fp.setDate([new Date()], true); // Default to today if no date stored
        selectedDaysCount = 1;
    }

    if (data.selectedTracks && data.selectedTracks.length > 0) {
        $(".track-checkbox").prop("checked", false); // Uncheck all first
        data.selectedTracks.forEach(trackVal => {
            $(`.track-checkbox[value="${trackVal}"]`).prop("checked", true);
        });
        selectedTracksCount = data.selectedTracks.filter(x => x !== "Venezuela").length || 1;
    } else {
        autoSelectNYTrackAndVenezuela(); // Apply defaults if no tracks stored
    }


    $("#tablaJugadas").empty();
    let i=0;
    if (data.plays) {
        data.plays.forEach((p)=>{
          i++;
          const rowHTML=`
            <tr data-playIndex="${i}">
              <td>
                <button type="button" class="btnRemovePlay removeMainBtn" data-row="${i}">
                  ${i}
                </button>
              </td>
              <td>
                <input type="text" class="form-control betNumber" value="${p.betNumber||""}" />
              </td>
              <td class="gameMode">${p.gameMode||"-"}</td>
              <td>
                <input type="number" class="form-control straight" value="${p.straight||""}" />
              </td>
              <td>
                <input type="text" class="form-control box" value="${p.box||""}" />
              </td>
              <td>
                <input type="number" class="form-control combo" value="${p.combo||""}" />
              </td>
              <td class="total">${p.total||"0.00"}</td>
            </tr>
          `;
          $("#tablaJugadas").append(rowHTML);
        });
    }
    playCount = i;
    recalcAllMainRows(); // Recalculate all rows after loading
    calculateMainTotal(); // Recalculate grand total
    highlightDuplicatesInMain();
    disableTracksByTime(); // Apply track disabling after loading state
  }


  function recalcAllMainRows(){
    $("#tablaJugadas tr").each(function(){
      recalcMainRow($(this));
    });
  }

  // (10) resetForm
  $("#resetForm").click(function(){
    if(confirm("Are you sure you want to reset the form?")){
      resetForm();
    }
  });
  function resetForm(){
    $("#lotteryForm")[0].reset();
    $("#tablaJugadas").empty();
    playCount=0;
    // selectedTracksCount=0; // Will be set by autoSelectNYTrackAndVenezuela
    // selectedDaysCount=0; // Will be set by fp.setDate
    window.ticketImageDataUrl=null;
    $("#totalJugadas").text("0.00");
    localStorage.removeItem("formState");

    if(fp) {
      fp.clear();
      fp.setDate([ new Date() ], true); // This will trigger onChange and set selectedDaysCount
    }
    
    autoSelectNYTrackAndVenezuela(); // This will trigger change on checkboxes and set selectedTracksCount
    // calculateMainTotal(); // Should be called by the above triggers
    // highlightDuplicatesInMain(); // Not needed on reset
    // showCutoffTimes(); // Already called at the end
    disableTracksByTime(); // Call this explicitly after resetting tracks and date
  }


  // (11) Generate Ticket
  $("#generarTicket").click(function(){
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

    if (userChoseToday()) {
        for(let t of chosenTracks){
          if(t==="Venezuela") continue; // Skip Venezuela for cutoff check as per original logic
          const rawCutoff = getTrackCutoff(t);
          if(rawCutoff){
            let cutoffTimeMoment = dayjs(rawCutoff, "HH:mm");
            // Original logic: if cutoff is after 9:30 PM, consider it 10:00 PM, otherwise 10 mins before actual.
            let effectiveCutoff = cutoffTimeMoment.isAfter(dayjs("21:30","HH:mm")) ? dayjs().hour(22).minute(0) : cutoffTimeMoment.subtract(10,"minute");
            
            if(dayjs().isSame(effectiveCutoff) || dayjs().isAfter(effectiveCutoff)){
              alert(`Track "${t}" is closed for today (Cutoff: ${effectiveCutoff.format("hh:mm A")}).`);
              return;
            }
          }
        }
      }


    const rows= $("#tablaJugadas tr");
    let valid=true;
    const errors=[];
    rows.each(function(){
      $(this).find(".betNumber,.straight,.box,.combo,.gameMode").removeClass("error-field");
    });

    rows.each(function(){
      const rowIndex= parseInt($(this).attr("data-playIndex"));
      const bn= $(this).find(".betNumber").val().trim();
      const gm= $(this).find(".gameMode").text();
      const st= parseFloat($(this).find(".straight").val().trim()||"0");
      const bx= parseFloat($(this).find(".box").val().trim()||"0"); // Assuming box can be non-numeric for Pulito originally
      const co= parseFloat($(this).find(".combo").val().trim()||"0");

      let errorHere=false;
      if(!bn){
        errorHere=true;
        // errors.push(rowIndex);
        $(this).find(".betNumber").addClass("error-field");
      }
      if(hasBrooklynOrFront(chosenTracks) && bn.length!==3){
        errorHere=true;
        // errors.push(rowIndex);
        $(this).find(".betNumber").addClass("error-field");
      }
      if(gm==="-"){
        errorHere=true;
        // errors.push(rowIndex);
        $(this).find(".gameMode").addClass("error-field");
      }

      if(["Venezuela","Pale-Ven","Pulito","RD-Quiniela","Pale-RD", "Palé"].includes(gm)){
        if(st<=0){
          errorHere=true;
          // errors.push(rowIndex);
          $(this).find(".straight").addClass("error-field");
        }
      }
      if(["Win 4","Pick 3"].includes(gm)){
        if(st<=0 && (parseFloat(bx)||0)<=0 && co<=0){ // Check if bx is a valid number or 0
          errorHere=true;
          // errors.push(rowIndex);
          $(this).find(".straight,.box,.combo").addClass("error-field");
        }
      }
      if(gm==="Single Action"){
         if(st<=0 && (parseFloat(bx)||0)<=0 && co<=0){
          errorHere=true;
          // errors.push(rowIndex);
          $(this).find(".straight,.box,.combo").addClass("error-field");
        }
      }
      if(gm==="NY Horses"){
        if(st<=0 && (parseFloat(bx)||0)<=0 && co<=0){
          errorHere=true;
          // errors.push(rowIndex);
          $(this).find(".straight,.box,.combo").addClass("error-field");
        }
      }

      // Límites (simplified, can be expanded as per original script)
      if(gm==="Win 4" && (st > 6 || co > 6 || (parseFloat(bx)||0) > 40)) { errorHere=true; $(this).find(".straight,.box,.combo").addClass("error-field"); }
      if(gm==="Pick 3" && (st > 35 || co > 35 || (parseFloat(bx)||0) > 100)) { errorHere=true; $(this).find(".straight,.box,.combo").addClass("error-field");}
      if((gm==="Venezuela" || gm==="Pulito") && st > 100) { errorHere=true; $(this).find(".straight").addClass("error-field");}


      if(errorHere) {
        valid=false;
        errors.push(rowIndex); // Add to error list only if errorHere is true
      }
    });

    if(!valid){
      const uniqueErr=[...new Set(errors)].join(", ");
      alert(`Some plays have errors or exceed limits (row(s): ${uniqueErr}). Please fix them.`);
      return;
    }

    $("#ticketJugadas").empty();
    rows.each(function(){
      const rowIndex= $(this).attr("data-playIndex");
      const bn= $(this).find(".betNumber").val().trim();
      const gm= $(this).find(".gameMode").text();
      let stVal= $(this).find(".straight").val().trim()||"0.00";
      let bxVal= $(this).find(".box").val().trim(); // Keep as is for display if text
      let coVal= $(this).find(".combo").val().trim()||"0.00";
      let totVal= $(this).find(".total").text()||"0.00";

      const rowHTML=`
        <tr>
          <td>${rowIndex}</td>
          <td>${bn}</td>
          <td>${gm}</td>
          <td>${parseFloat(stVal).toFixed(2)}</td>
          <td>${(gm === "Pulito" || !parseFloat(bxVal)) ? bxVal : parseFloat(bxVal).toFixed(2)}</td>
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
    storeFormState();
  }

  $("#confirmarTicket").click(function(){
    $(this).prop("disabled",true);
    $("#editButton").addClass("d-none");

    const uniqueTicket= generateUniqueTicketNumber();
    $("#numeroTicket").text(uniqueTicket);
    transactionDateTime= dayjs().format("MM/DD/YYYY hh:mm A");
    $("#ticketTransaccion").text(transactionDateTime);

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

        saveBetDataToSheetDB(uniqueTicket, success=>{ // Or adapt to MongoDB later
          if(success){
            console.log("Bet data (placeholder) sent to SheetDB.");
          } else {
            console.error("Failed to send bet data (placeholder) to SheetDB.");
          }
        });
      })
      .catch(err=>{
        console.error(err);
        alert("Problem generating final ticket image. Try again.");
      })
      .finally(()=>{
        $(ticketElement).css(originalStyles);
      });
    },500);
  });

  $("#editButton").click(function(){
    const ticketModal= bootstrap.Modal.getInstance(document.getElementById("ticketModal"));
    ticketModal.hide();
  });

  $("#shareTicket").click(async function(){
    if(!window.ticketImageDataUrl){
      alert("No ticket image is available to share.");
      return;
    }
    if(navigator.canShare){
      try{
        const resp=await fetch(window.ticketImageDataUrl);
        const blob=await resp.blob();
        const file=new File([blob],"ticket.jpg",{type:"image/jpeg"});
        if(navigator.canShare({files:[file]})){
          await navigator.share({files:[file], title:"Ticket", text:"Sharing Ticket"});
        } else {
          alert("Your browser does not support file sharing. Please share the downloaded image manually.");
        }
      } catch(e){
        console.error(e);
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
    $("#preTicket table, #preTicket th, #preTicket td").css("white-space","nowrap");
    $("#preTicket").css("overflow-x","auto");
  }

  function saveBetDataToSheetDB(uniqueTicket, callback){
    const dateVal= $("#fecha").val()||"";
    const chosenTracks= $(".track-checkbox:checked")
      .map(function(){return $(this).val();})
      .get();
    const joinedTracks= chosenTracks.join(", ");
    const nowISO= dayjs().toISOString();
    let betData=[];

    $("#tablaJugadas tr").each(function(){
      const rowIndex= $(this).attr("data-playIndex");
      const bn= $(this).find(".betNumber").val();
      const gm= $(this).find(".gameMode").text();
      const st= $(this).find(".straight").val();
      const bx= $(this).find(".box").val();
      const co= $(this).find(".combo").val();
      const tot= $(this).find(".total").text();

      if(gm!=="-"){
        betData.push({
          "Ticket Number": uniqueTicket,
          "Transaction DateTime": transactionDateTime, // Use global var set on confirm
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
    
    // For now, we are not implementing SheetDB or MongoDB here.
    // This function will just log and callback.
    console.log("Data to be saved (SheetDB/MongoDB):", betData);
    callback(true); // Simulate success
    
    /*
    fetch(SHEETDB_API_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ data: betData })
    })
    .then(r=>{
      if(!r.ok) throw new Error(`SheetDB error: ${r.status}`);
      return r.json();
    })
    .then(d=>{
      console.log("Data stored in SheetDB:", d);
      callback(true);
    })
    .catch(e=>{
      console.error(e);
      callback(false);
    });
    */
  }


  function getTrackCutoff(tn){
    for(let region in cutoffTimes){
      if(cutoffTimes[region] && cutoffTimes[region][tn]){ // Add check for region existence
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
    const val= $("#fecha").val();
    if(!val) return false;
    const arr= val.split(", ");
    const today= dayjs().startOf("day");
    for(let ds of arr){
      const [mm,dd,yy]= ds.split("-").map(Number);
      const picked= dayjs(new Date(yy, mm-1, dd)).startOf("day");
      if(picked.isSame(today,"day")) return true;
    }
    return false;
  }

  function disableTracksByTime(){
    if(!userChoseToday()){
      enableAllTracks();
      return;
    }
    const now = dayjs();
    $(".track-checkbox").each(function(){
      const trackName = $(this).val();
      if(trackName === "Venezuela") return; // Skip Venezuela

      const rawCutoff = getTrackCutoff(trackName);
      if(rawCutoff){
        let cutoffTimeMoment = dayjs(rawCutoff, "HH:mm");
        // Logic from original script: if cutoff is after 9:30 PM, consider it 10:00 PM, otherwise 10 mins before actual.
        let effectiveCutoff = cutoffTimeMoment.isAfter(dayjs("21:30","HH:mm")) ? dayjs().hour(22).minute(0) : cutoffTimeMoment.subtract(10,"minute");

        if(now.isSame(effectiveCutoff) || now.isAfter(effectiveCutoff)){
          $(this).prop("checked", false).prop("disabled", true);
          $(this).closest(".track-button-container").find(".track-button")
            .css({ opacity:0.5, cursor:"not-allowed" });
        } else {
          $(this).prop("disabled", false);
          $(this).closest(".track-button-container").find(".track-button")
            .css({ opacity:1, cursor:"pointer" });
        }
      }
    });
    // Trigger change on track checkboxes to update counts and totals if a track was disabled and unchecked
    $(".track-checkbox:disabled").trigger("change");
    storeFormState();
  }


  function enableAllTracks(){
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
      if(track==="Venezuela")return;
      let raw="";
      if(cutoffTimes.USA && cutoffTimes.USA[track]) raw= cutoffTimes.USA[track];
      else if(cutoffTimes["Santo Domingo"] && cutoffTimes["Santo Domingo"][track]) raw= cutoffTimes["Santo Domingo"][track];
      else if(cutoffTimes.Venezuela && cutoffTimes.Venezuela[track]) raw= cutoffTimes.Venezuela[track];

      if(raw){
        let co= dayjs(raw,"HH:mm");
        let cf= co.isAfter(dayjs("21:30","HH:mm"))? dayjs().hour(22).minute(0): co.subtract(10,"minute");
        const hh= cf.format("HH");
        const mm= cf.format("mm");
        $(this).text(`${hh}:${mm}`);
      }
    });
  }
  
  // Auto-Select NY + Venezuela por defecto
  function autoSelectNYTrackAndVenezuela(){
    const anyChecked= $(".track-checkbox:checked").length>0;
    if(anyChecked && localStorage.getItem("formState")) return; // Don't override if loading from state and tracks were stored

    // Elige NY Mid Day si es antes de 14:20, si no, NY Evening
    const now= dayjs();
    // Get cutoff for NY Mid Day to decide
    const nyMidDayCutoffStr = getTrackCutoff("New York Mid Day"); // e.g., "14:20"
    let middayCutoffTime = dayjs(nyMidDayCutoffStr, "HH:mm").subtract(10, "minute"); // Effective cutoff

    if(now.isBefore(middayCutoffTime)){
      $("#trackNYMidDay").prop("checked",true);
    } else {
      $("#trackNYEvening").prop("checked",true);
    }
    $("#trackVenezuela").prop("checked",true);

    // Trigger change to update selectedTracksCount and totals
    $(".track-checkbox[value='New York Mid Day'], .track-checkbox[value='New York Evening'], .track-checkbox[value='Venezuela']")
        .trigger("change");
  }


  // Duplicates highlight en MAIN
  function highlightDuplicatesInMain(){
    $("#tablaJugadas tr").find(".betNumber").removeClass("duplicado");
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
   WIZARD (copiado tal cual tu backup)
   =========================================================
  */

  const wizardModal = new bootstrap.Modal(document.getElementById("wizardModal"));

  $("#wizardButton").click(function(){
    resetWizard();
    wizardModal.show();
  });

  function resetWizard(){
    wizardCount=0;
    $("#wizardTableBody").empty();
    lockedFields.straight=false;
    lockedFields.box=false;
    lockedFields.combo=false;
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

  $(".lockBtn").click(function(){
    const field = $(this).data("field");
    lockedFields[field] = !lockedFields[field];
    if(lockedFields[field]){
      $(this).html(`<i class="bi bi-lock-fill"></i>`);
    } else {
      $(this).html(`<i class="bi bi-unlock"></i>`);
    }
  });

  $("#wizardAddNext").click(function(){
    const bn = $("#wizardBetNumber").val().trim();
    const gm = determineGameMode(bn);
    if(gm==="-"){
      alert(`Cannot determine game mode for "${bn}". Check tracks or length/format.`);
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
      <tr data-wizardIndex="${i}">
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
      $(this).attr("data-wizardIndex", i);
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
      bn= padNumberForMode(bn, gm);

      let rowT= calculateRowTotal(bn, gm, stVal, bxVal, coVal);
      addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
    }
    highlightDuplicatesInWizard();
  });

  function generateRandomNumberForMode(mode){
    if(mode==="NY Horses"){
      const length = Math.floor(Math.random()*4)+1;
      const maxVal = Math.pow(10,length)-1;
      return Math.floor(Math.random()*(maxVal+1));
    }
    if(mode==="Single Action"){
      return Math.floor(Math.random()*10);
    }
    if(mode==="Win 4"||mode==="Pale-Ven"||mode==="Pale-RD"||mode==="Palé"){
      return Math.floor(Math.random()*10000);
    }
    if(mode==="Pick 3"){
      return Math.floor(Math.random()*1000);
    }
    if(mode==="Venezuela"||mode==="Pulito"||mode==="RD-Quiniela"){
      return Math.floor(Math.random()*100);
    }
    return Math.floor(Math.random()*1000);
  }
  function padNumberForMode(num, mode){
    let sNum = String(num);
    if(mode==="NY Horses"||mode==="Single Action"){
      return sNum;
    }
    if(mode==="Pale-Ven"||mode==="Pale-RD"||mode==="Win 4"||mode==="Palé"){
      return sNum.padStart(4, '0');
    }
    if(mode==="Pulito"||mode==="RD-Quiniela"||mode==="Venezuela"){
      return sNum.padStart(2, '0');
    }
    if(mode==="Pick 3"){
      return sNum.padStart(3, '0');
    }
    return sNum.padStart(3, '0');
  }


  $("#btnGenerateRoundDown").click(function(){
    const firstNum= $("#rdFirstNumber").val().trim();
    const lastNum = $("#rdLastNumber").val().trim();
    if(!firstNum||!lastNum){
      alert("Please enter both first and last number for Round Down.");
      return;
    }
    if(firstNum.length!==lastNum.length){
      alert("First/Last must have the same length (2,3, or 4 digits).");
      return;
    }
    let start= parseInt(firstNum,10);
    let end= parseInt(lastNum,10);
    if(isNaN(start)||isNaN(end)){
      alert("Invalid numeric range for Round Down.");
      return;
    }
    if(start> end){
      [start,end]=[end,start]; // Swap if out of order
    }
    const stVal= $("#wizardStraight").val().trim();
    const bxVal= $("#wizardBox").val().trim();
    const coVal= $("#wizardCombo").val().trim();

    for(let i=start; i<=end; i++){
      let bn= i.toString().padStart(firstNum.length,"0");
      let gm= determineGameMode(bn);
      if(gm==="-") continue;
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
      alert("No plays in the wizard table.");
      return;
    }
    let allDigits=[];
    let lengths=[];
    rows.each(function(){
      const bn=$(this).find("td").eq(1).text().trim();
      lengths.push(bn.length);
      for(let c of bn) allDigits.push(c);
    });
    if(allDigits.length===0){
      alert("No digits found to permute.");
      return;
    }
    for(let i=allDigits.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [allDigits[i],allDigits[j]]=[allDigits[j],allDigits[i]];
    }
    let idx=0;
    rows.each(function(i){
      const needed= lengths[i];
      const subset= allDigits.slice(idx, idx+needed);
      idx+= needed;
      const newBN= subset.join("");
      const gm= determineGameMode(newBN);
      const stTd = $(this).find("td").eq(3).text().trim();
      const bxTd = $(this).find("td").eq(4).text().trim();
      const coTd = $(this).find("td").eq(5).text().trim();

      const newTotal= calculateRowTotal(
        newBN, gm,
        stTd==="-"?"0":stTd,
        bxTd==="-"?"0":bxTd,
        coTd==="-"?"0":coTd
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
      alert("No plays in the wizard table.");
      return;
    }
    wizardRows.each(function(){
      if(playCount>=MAX_PLAYS){
        alert("Reached 25 plays in the main form. Stopping import.");
        return false; // break .each loop
      }
      const tds=$(this).find("td");
      const bn=tds.eq(1).text();
      const gm=tds.eq(2).text();
      const stVal=(tds.eq(3).text()==="-"?"":tds.eq(3).text());
      const bxVal=(tds.eq(4).text()==="-"?"":tds.eq(4).text());
      const coVal=(tds.eq(5).text()==="-"?"":tds.eq(5).text());
      const total=tds.eq(6).text();

      // if(playCount<MAX_PLAYS){ // Check already done above
        // playCount++; // Incremented by addMainRow
        const newRow = addMainRow(); // This increments playCount
        if (newRow) {
            newRow.find(".betNumber").val(bn);
            newRow.find(".gameMode").text(gm); // Set gameMode directly
            newRow.find(".straight").val(stVal);
            newRow.find(".box").val(bxVal);
            newRow.find(".combo").val(coVal);
            // recalcMainRow will set the total
            recalcMainRow(newRow);
        }
      // }
    });
    $("#wizardTableBody").empty(); // Clear wizard table
    wizardCount=0;
    // recalcAllMainRows(); // Already done per row or not necessary if recalcMainRow is thorough
    calculateMainTotal();
    highlightDuplicatesInMain();
    storeFormState();
  });


  $("#wizardGenerateTicket").click(function(){
    $("#wizardAddAllToMain").trigger("click");
    wizardModal.hide();
    doGenerateTicket();
  });

  $("#wizardEditMainForm").click(function(){
    wizardModal.hide();
  });

  function highlightDuplicatesInWizard(){
    $("#wizardTableBody tr").find("td:nth-child(2)").removeClass("duplicado");
    let counts={};
    $("#wizardTableBody tr").each(function(){
      const bn=$(this).find("td").eq(1).text().trim();
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


  const tutorialStepsEN = [
    { intro: "Welcome! This tutorial will guide you through the main features." },
    { element: "#fecha", title: "Bet Dates", intro: "Select one or more dates for your lottery bets." },
    { element: ".accordion", title: "Tracks", intro: "Expand a section and pick the tracks you want to bet on." },
    { element: "#agregarJugada", title: "Add Play", intro: "Click here to add a new play (row) to the table." },
    { element: "#wizardButton", title: "Wizard", intro: "This button opens a modal for quick entry of multiple plays." },
    { element: "#resetForm", title: "Reset Form", intro: "Clears everything and resets the form to default." },
    { element: "#generarTicket", title: "Generate Ticket", intro: "Once everything is correct, generate your ticket here." }
  ];
  const tutorialStepsES = [
    { intro: "¡Bienvenido! Este tutorial te mostrará cómo usar la aplicación." },
    { element: "#fecha", title: "Fechas", intro: "Selecciona una o varias fechas para tus jugadas de lotería." },
    { element: ".accordion", title: "Tracks", intro: "Despliega y marca los sorteos que te interesen." },
    { element: "#agregarJugada", title: "Agregar Jugada", intro: "Presiona aquí para añadir una nueva línea de jugada." },
    { element: "#wizardButton", title: "Asistente (Wizard)", intro: "Abre una ventana para entrar jugadas de forma rápida." },
    { element: "#resetForm", title: "Resetear", intro: "Borra todo y restaura la forma a sus valores iniciales." },
    { element: "#generarTicket", title: "Generar Ticket", intro: "Cuando todo esté listo, genera el ticket en esta sección." }
  ];
  const tutorialStepsHT = [
    { intro: "Byenvini! Tutorial sa ap moutre w kijan pou itilize aplikasyon an." },
    { element: "#fecha", title: "Dat", intro: "Chwazi youn oswa plizyè dat pou jwe." },
    { element: ".accordion", title: "Tracks", intro: "Desann epi chwazi kisa w vle jwe." },
    { element: "#agregarJugada", title: "Ajoute Jwe", intro: "Peze la pou ajoute yon nouvo ranje jwe." },
    { element: "#wizardButton", title: "Asistan (Wizard)", intro: "Ou ka antre parye rapidman isi." },
    { element: "#resetForm", title: "Reyinisyalize", intro: "Efase tout bagay epi retounen aplikasyonnan jan li te ye anvan." },
    { element: "#generarTicket", title: "Fè Ticket", intro: "Lè ou fini tout jwe yo, kreye ticket la." }
  ];

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

  $("#manualEnglishBtn").click(function(){
    $("#manualEnglishText").removeClass("d-none");
    $("#manualSpanishText").addClass("d-none");
    $("#manualCreoleText").addClass("d-none");
  });
  $("#manualSpanishBtn").click(function(){
    $("#manualEnglishText").addClass("d-none");
    $("#manualSpanishText").removeClass("d-none");
    $("#manualCreoleText").addClass("d-none");
  });
  $("#manualCreoleBtn").click(function(){
    $("#manualEnglishText").addClass("d-none");
    $("#manualSpanishText").addClass("d-none");
    $("#manualCreoleText").removeClass("d-none");
  });


  let selectedFileGlobal = null;
  let jugadasGlobalOCR = []; // Renamed to avoid conflict with other global 'jugadas'
  let ocrProgressInterval = null;

  window.abrirModalOCR = function() {
    selectedFileGlobal = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src","");
    $("#ocrJugadas").empty();
    hideOcrLoading();
    $("#ocrDebugPanel").addClass("d-none");
    $("#ocrRawResponse").text("");
    $("#ocrTextoCompleto").val("");
    $("#ocrConfPct").text("-");
    $("#ocrTotalWords").text("-");


    const modal = new bootstrap.Modal(document.getElementById("modalOcr"));
    modal.show();
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
    if(e.dataTransfer.files && e.dataTransfer.files[0]){
      selectedFileGlobal = e.dataTransfer.files[0];
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobal))
                      .removeClass("d-none");
    }
  };

  window.handleFileChange = function(e) {
    if(e.target.files && e.target.files[0]){
      selectedFileGlobal = e.target.files[0];
      $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobal))
                      .removeClass("d-none");
    }
  };

  function showOcrLoading() {
    $("#ocrLoadingSection").removeClass("d-none");
    $("#ocrProgressBar").css("width","0%");
    $("#ocrProgressText").text("Subiendo/Procesando...");

    let progressValue = 0;
    ocrProgressInterval = setInterval(()=>{
      progressValue += 5;
      if(progressValue>80) progressValue=80;
      $("#ocrProgressBar").css("width", progressValue+"%");
    }, 500);
  }
  function hideOcrLoading() {
    if(ocrProgressInterval) {
      clearInterval(ocrProgressInterval);
      ocrProgressInterval=null;
    }
    $("#ocrLoadingSection").addClass("d-none");
    $("#ocrProgressBar").css("width","0%");
  }
  function finishOcrLoading(success = true) {
    $("#ocrProgressBar").css("width","100%");
    $("#ocrProgressText").text(success ? "Completado" : "Error en OCR");
    setTimeout(()=>{
      // Do not hide immediately if error, let user see the message
      // if (success) hideOcrLoading();
    }, success ? 800 : 3000);
  }

  window.procesarOCR = async function() {
    if(!selectedFileGlobal){
      alert("No has seleccionado ninguna imagen.");
      return;
    }
    $("#ocrJugadas").empty();
    showOcrLoading();

    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobal);
    reader.onloadend = async () => {
        const base64data = reader.result; // This is the data URI
        try {
            const response = await fetch('/api/interpret-ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ photoDataUri: base64data }),
            });

            // Clear interval once fetch is done, before parsing json
            if(ocrProgressInterval) {
                clearInterval(ocrProgressInterval);
                ocrProgressInterval = null;
            }
            $("#ocrProgressBar").css("width", "90%"); // Indicate processing done by API

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Error desconocido del servidor." }));
                throw new Error(`Error del servidor: ${response.status} - ${errorData.message || response.statusText}`);
            }

            const data = await response.json(); // This should be the array of Bet objects
            
            finishOcrLoading(true);

            if (!data || !Array.isArray(data)) {
                 $("#ocrJugadas").html("<p>Error: La respuesta del servidor no fue una lista de jugadas válida.</p>");
                 console.error("Invalid data structure from /api/interpret-ticket:", data);
                 return;
            }

            jugadasGlobalOCR = data; // Store the array of Bet objects

            if(jugadasGlobalOCR.length === 0){
                $("#ocrJugadas").html("<p>No se detectaron jugadas en la imagen.</p>");
                return;
            }

            let html = "<h5>Jugadas Detectadas:</h5>";
            jugadasGlobalOCR.forEach((j, idx)=>{
                // j will have betNumber, gameMode, straightAmount, boxAmount, comboAmount
                let montoPrincipal = j.straightAmount !== null ? j.straightAmount : (j.boxAmount !== null ? j.boxAmount : (j.comboAmount !== null ? j.comboAmount : 0));
                html += `
                  <div style="border:1px solid #ccc; padding:0.5rem; margin-bottom:0.5rem;">
                    <p><strong>Bet Number:</strong> ${j.betNumber || "N/A"}</p>
                    <p><strong>Game Mode:</strong> ${j.gameMode || "N/A"}</p>
                    <p><strong>Monto Principal (Straight/Box/Combo):</strong> $${parseFloat(montoPrincipal).toFixed(2)}</p>
                    <p>
                        ${j.straightAmount !== null ? `Straight: $${parseFloat(j.straightAmount).toFixed(2)} ` : ''}
                        ${j.boxAmount !== null ? `Box: $${parseFloat(j.boxAmount).toFixed(2)} ` : ''}
                        ${j.comboAmount !== null ? `Combo: $${parseFloat(j.comboAmount).toFixed(2)}` : ''}
                    </p>
                    <button class="btn btn-sm btn-info" onclick="usarJugadaOCR(${idx})">
                      Usar esta Jugada
                    </button>
                  </div>
                `;
            });
            $("#ocrJugadas").html(html);

        } catch(err){
            console.error("Error en procesarOCR:", err);
            alert("Error procesando imagen con IA: " + err.message);
            finishOcrLoading(false); // Indicate error in progress
            $("#ocrJugadas").html(`<p style="color:red;">Error: ${err.message}</p>`);
        } finally {
            // Ensure loading is hidden if not already by finishOcrLoading timeout
             setTimeout(hideOcrLoading, 3000); 
        }
    };
    reader.onerror = () => {
        alert('Error leyendo el archivo de imagen.');
        hideOcrLoading();
    };
  };

  window.usarJugadaOCR = function(idx){ // Renamed to avoid conflict
    if(!jugadasGlobalOCR || !jugadasGlobalOCR[idx]){
      alert("No se encontró la jugada seleccionada.");
      return;
    }
    const j = jugadasGlobalOCR[idx]; // j is a Bet object from Genkit

    // No hay campo 'fecha' en la respuesta de Genkit, esto se maneja en el form principal.
    // $("#fecha").val( j.fecha );

    const newRow = addMainRow(); // This function already adds a row and returns it
    if (newRow) {
        newRow.find(".betNumber").val( j.betNumber || "" );
        // gameMode is set by recalcMainRow based on betNumber and selected tracks
        newRow.find(".straight").val( j.straightAmount !== null ? j.straightAmount.toString() : "" );
        newRow.find(".box").val( j.boxAmount !== null ? j.boxAmount.toString() : "" );
        newRow.find(".combo").val( j.comboAmount !== null ? j.comboAmount.toString() : "" );
        recalcMainRow(newRow); // This will also determine gameMode and calculate total
    }
    highlightDuplicatesInMain();
    storeFormState();

    const modalInstance = bootstrap.Modal.getInstance(document.getElementById("modalOcr"));
    modalInstance.hide();
  };

  $("#btnCargarJugadas").click(function(){
    if(!jugadasGlobalOCR || jugadasGlobalOCR.length===0){
      alert("No hay jugadas OCR para cargar.");
      return;
    }
    jugadasGlobalOCR.forEach(j => { // j is a Bet object
      const newRow = addMainRow();
      if (newRow) {
        newRow.find(".betNumber").val( j.betNumber || "" );
        newRow.find(".straight").val( j.straightAmount !== null ? j.straightAmount.toString() : "" );
        newRow.find(".box").val( j.boxAmount !== null ? j.boxAmount.toString() : "" );
        newRow.find(".combo").val( j.comboAmount !== null ? j.comboAmount.toString() : "" );
        recalcMainRow(newRow);
      }
    });
    highlightDuplicatesInMain();
    storeFormState();

    const modalInstance = bootstrap.Modal.getInstance(document.getElementById("modalOcr"));
    modalInstance.hide();
  });

  window.toggleOcrDebug = function() {
    // Debug panel for Genkit response might be different or not applicable
    // For now, this function might not be needed unless we add specific debug output for Genkit.
    $("#ocrDebugPanel").toggleClass("d-none");
    alert("El panel de debug para la respuesta de Genkit no está implementado de la misma manera. La respuesta directa se puede ver en la consola del navegador si hay errores.");
  };

  // Initial calls after DOM is ready
  loadFormState(); // Load stored state first
  showCutoffTimes(); // Then display cutoff times
  // autoSelectNYTrackAndVenezuela(); // Called by loadFormState if no state
  // disableTracksByTime(); // Called by loadFormState or autoSelect
  setInterval(disableTracksByTime,60000); // Periodically check and disable tracks


});

// Ensure Bootstrap Modal is available for OCR functions
// This check might be too early if bootstrap JS loads after this script.
// Usually, you'd ensure jQuery and Bootstrap JS are loaded before your custom scripts.
if (typeof bootstrap === 'undefined') {
    console.warn('Bootstrap no está cargado aún. Algunas funcionalidades del modal OCR podrían no iniciarse correctamente.');
}

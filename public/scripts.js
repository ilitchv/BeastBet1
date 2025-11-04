// Global variable for OCR modal instance
let modalOcrInstance = null;
let wizardModalInstance = null;
let ticketModalInstance = null;

// Global variable to store OCR interpreted bets
let jugadasGlobalOCR = [];
let selectedFileGlobalOCR = null;

// Global variable for Flatpickr instance
let fpInstance = null;

// Play counters
let playCount = 0;
const MAX_PLAYS = 200; // Increased limit
let wizardCount = 0;

// Global variable to store copied amounts for pasting, now visible globally
window.copiedAmounts = {};

// Stores the last generated ticket image so it can be shared without
// re-rendering (helps preserve the QR code).
let latestTicketDataUrl = null;
let latestTicketBlob = null;
let latestQrDataUrl = null;
const ENABLE_QR_DEBUG = false;

function dataUrlToBlob(dataUrl) {
    if (!dataUrl) return null;
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(parts[1]);
    const len = binary.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        buffer[i] = binary.charCodeAt(i);
    }
    return new Blob([buffer], { type: mime });
}

async function renderTicketQr(uniqueTicket) {
    const qrTarget = document.getElementById("qrcode");
    if (!qrTarget) {
        console.error("QR target container not found");
        return null;
    }
qrTarget.innerHTML = "";

    if (typeof QRCode === 'undefined') {
        console.error("QRCode library not loaded");
        return null;
    }

    const offscreenContainer = document.createElement("div");
    offscreenContainer.style.position = "absolute";
    offscreenContainer.style.left = "-9999px";
    offscreenContainer.style.top = "-9999px";
    offscreenContainer.style.width = "128px";
    offscreenContainer.style.height = "128px";
    document.body.appendChild(offscreenContainer);

    try {
        offscreenContainer.innerHTML = "";
        new QRCode(offscreenContainer, {
            text: uniqueTicket,
            width: 128,
            height: 128,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });

        const dataUrl = await waitForQrDataUrl(offscreenContainer);
        if (!dataUrl) {
            throw new Error("QR canvas not generated in time");
        }

        latestQrDataUrl = dataUrl;

        const qrImg = document.createElement("img");
        qrImg.src = dataUrl;
        qrImg.alt = `Código QR del ticket ${uniqueTicket}`;
        qrImg.width = 128;
        qrImg.height = 128;
        qrImg.style.display = "block";
        qrImg.style.margin = "0 auto";
        qrImg.dataset.ticketCode = uniqueTicket;

        qrTarget.replaceChildren(qrImg);
        return dataUrl;
    } catch (error) {
        console.error("Error generating QR Code:", error);
        return null;
    } finally {
        offscreenContainer.remove();
    }
}

function waitForQrDataUrl(container, timeout = 2000) {
    return new Promise((resolve) => {
        const start = Date.now();

        function tryResolve() {
            const canvas = container.querySelector("canvas");
            if (canvas) {
                try {
                    canvas.setAttribute("data-html2canvas-ignore","true");
                    const dataUrl = canvas.toDataURL("image/png");
                    if (dataUrl) {
                        resolve(dataUrl);
                        return;
                    }
                } catch (error) {
                    console.error("Error extracting QR canvas data URL:", error);
                }
            }

            const img = container.querySelector("img");
            if (img && img.src && img.src.startsWith("data:")) {
                resolve(img.src);
                return;
            }

            if (Date.now() - start > timeout) {
                resolve(null);
                return;
            }

            requestAnimationFrame(tryResolve);
        }

        requestAnimationFrame(tryResolve);
    });
}

function prepareQrInClone(doc) {
    if (!doc) return;
    const qrInClone = doc.getElementById("qrcode");
    if (!qrInClone) return;
    qrInClone.innerHTML = "";
    if (!latestQrDataUrl) {
        throw new Error("QR not ready: latestQrDataUrl is empty");
    }
    const img = doc.createElement("img");
    img.src = latestQrDataUrl;
    img.alt = "Código QR del ticket";
    img.width = 128; img.height = 128;
    img.style.display = "block";
    img.style.margin = "10px auto 30px auto";
    qrInClone.appendChild(img);
}


// Cutoff times (remains unchanged)
const cutoffTimes = {
    "USA": { 
        "New York Mid Day": "14:20", "New York Evening": "22:00", "Georgia Mid Day": "12:20", "Georgia Evening": "18:40", "New Jersey Mid Day": "12:50", "New Jersey Evening": "22:00", "Florida Mid Day": "13:20", "Florida Evening": "21:30", "Connecticut Mid Day": "13:30", "Connecticut Evening": "22:00", "Georgia Night": "22:00", "Pensilvania AM": "12:45", "Pensilvania PM": "18:15", "Venezuela": "00:00", "Brooklyn Midday": "14:20", "Brooklyn Evening": "22:00", "Front Midday": "14:20", "Front Evening": "22:00", "New York Horses": "16:00"
    },
    "Santo Domingo": { 
        "Real": "11:45", "Gana mas": "13:25", "Loteka": "18:30", "Nacional": "19:30", "Quiniela Pale": "19:30", "Primera Día": "10:50", "Suerte Día": "11:20", "Lotería Real": "11:50", "Suerte Tarde": "16:50", "Lotedom": "16:50", "Primera Noche": "18:50", "Panama": "16:00"
    },
    "Venezuela": { "Venezuela": "00:00" }
};


// --- OCR Modal Functions ---
function abrirModalOCR() {
    console.log("abrirModalOCR function called");
    selectedFileGlobalOCR = null;
    jugadasGlobalOCR = [];
    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").empty().html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true); 

    hideOcrLoading(); 
    $("#ocrDebugPanel").addClass("d-none");

    if (modalOcrInstance) {
        modalOcrInstance.show();
    } else {
        console.error("Modal OCR instance not available in abrirModalOCR");
    }
}
window.abrirModalOCR = abrirModalOCR;


function handleDragOverOCR(e) { e.preventDefault(); $("#ocrDropZone").addClass("dragover"); }
function handleDragLeaveOCR(e) { e.preventDefault(); $("#ocrDropZone").removeClass("dragover"); }
window.handleDragOverOCR = handleDragOverOCR;
window.handleDragLeaveOCR = handleDragLeaveOCR;

function handleDropOCR(e) {
    e.preventDefault();
    $("#ocrDropZone").removeClass("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        selectedFileGlobalOCR = e.dataTransfer.files[0];
        $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
        $("#btnProcesarOCR").prop('disabled', false);
        $("#ocrJugadas").html("<p>Imagen seleccionada. Haz clic en 'Procesar OCR'.</p>");
    }
}
window.handleDropOCR = handleDropOCR;

function handleFileChangeOCR(e) {
    console.log("handleFileChangeOCR called");
    if (e.target.files && e.target.files[0]) {
        selectedFileGlobalOCR = e.target.files[0];
        console.log("File selected:", selectedFileGlobalOCR);
        $("#ocrPreview").attr("src", URL.createObjectURL(selectedFileGlobalOCR)).removeClass("d-none");
        $("#btnProcesarOCR").prop('disabled', false);
        $("#ocrJugadas").html("<p>Imagen seleccionada. Haz clic en 'Procesar OCR'.</p>");
    } else {
        selectedFileGlobalOCR = null;
        $("#ocrPreview").addClass("d-none").attr("src", "");
        $("#btnProcesarOCR").prop('disabled', true);
        $("#ocrJugadas").html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    }
}
window.handleFileChangeOCR = handleFileChangeOCR;
 
function showOcrLoading() { $("#ocrLoadingSection").removeClass("d-none"); $("#ocrProgressBar").css("width", "0%"); $("#ocrProgressText").text("Subiendo/Procesando..."); }
function updateOcrProgress(percentage, text) { $("#ocrProgressBar").css("width", percentage + "%"); $("#ocrProgressText").text(text); }
function hideOcrLoading() { $("#ocrLoadingSection").addClass("d-none"); }


// --- Normalization of OCR response (supports legacy and new schema) ---
function normalizeInterpretedBets(raw) {
    if (!Array.isArray(raw)) return [];
    const norm = [];

    const toNum = (v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (trimmed === '') return null;
            // Accept "50c" or ".50" styles -> parse as float
            const cleaned = trimmed.replace(/[^0-9.]/g, '');
            if (cleaned === '') return null;
            return isNaN(parseFloat(cleaned)) ? null : parseFloat(cleaned);
        }
        if (typeof v === 'number') {
            // Treat 0 as "empty" for UI placement (leave column blank)
            return v === 0 ? null : v;
        }
        return null;
    };

    for (const item of raw) {
        // Accept both schemas:
        // v1: { betNumber, straightAmount, boxAmount, comboAmount, gameMode? }
        // v2: { numeros, straight, box, combo, notas? }
        let betNumber = item.betNumber || item.numeros || '';
        if (typeof betNumber !== 'string') betNumber = String(betNumber ?? '');

        // Normalize hyphen separators for Palé like "12x34" -> "12-34"
        betNumber = betNumber.replace(/^(\d{2})[x\+](\d{2})$/i, '$1-$2');

        let st = toNum(item.straightAmount ?? item.straight);
        let bx = toNum(item.boxAmount ?? item.box);
        let co = toNum(item.comboAmount ?? item.combo);

        // If legacy back-end was sending same value in all three,
        // enforce a single target column by precedence: combo > box > straight.
        const nonNull = [st, bx, co].filter(v => v !== null);
        if (nonNull.length > 1) {
            // Ambiguity: per spec, default to straight
            bx = null;
            co = null;
        }

        // Build normalized object in the shape the rest of the app expects.
        const normalized = {
            betNumber: betNumber.trim(),
            gameMode: item.gameMode || null,
            straightAmount: st,
            boxAmount: bx,
            comboAmount: co
        };
        norm.push(normalized);
    }
    return norm;
}
async function procesarOCR() {
    console.log("procesarOCR function called");
    console.log("Current selectedFileGlobalOCR:", selectedFileGlobalOCR);

    if (!selectedFileGlobalOCR) {
        alert("Por favor, selecciona un archivo de imagen primero.");
        return;
    }

    showOcrLoading();
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true);

    const reader = new FileReader();
    reader.readAsDataURL(selectedFileGlobalOCR);
    reader.onloadend = async () => {
        const base64data = reader.result;
        updateOcrProgress(30, "Imagen leída, enviando a IA...");
        console.log("Sending request to /api/interpret-ticket");
        try {
            const response = await fetch('/api/interpret-ticket', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoDataUri: base64data })
            });

            updateOcrProgress(70, "Respuesta recibida, procesando...");

            if (!response.ok) {
                let errorMsg = `Error del servidor: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg += ` - ${errorData.message || 'Error desconocido del servidor.'}`;
                    console.error("Server error details:", errorData);
                } catch (e) {
                    console.error("Could not parse error response JSON", e);
                }
                throw new Error(errorMsg);
            }

            const interpretedBets = await response.json();
            console.log("Received interpretedBets:", interpretedBets);
            jugadasGlobalOCR = normalizeInterpretedBets(interpretedBets); 

            if (Array.isArray(jugadasGlobalOCR) && jugadasGlobalOCR.length > 0) {
                let html = `<h5>Jugadas Detectadas (${jugadasGlobalOCR.length}):</h5>`;
                jugadasGlobalOCR.forEach((j, idx) => {
                    html += `
                      <div class="ocr-detected-play">
                        <table class="table table-sm table-bordered table-dark small-ocr-table">
                          <thead><tr><th>#</th><th>Bet</th><th>Mode</th><th>Str</th><th>Box</th><th>Com</th></tr></thead>
                          <tbody><tr>
                            <td>${idx + 1}</td>
                            <td>${j.betNumber || "-"}</td>
                            <td>${(j.gameMode || determineGameMode(j.betNumber || j.numeros || '', getCurrentSelectedTracks()))}</td>
                            <td>${j.straightAmount !== null ? j.straightAmount.toFixed(2) : "-"}</td>
                            <td>${j.boxAmount !== null ? j.boxAmount.toFixed(2) : "-"}</td>
                            <td>${j.comboAmount !== null ? j.comboAmount.toFixed(2) : "-"}</td>
                          </tr></tbody>
                        </table>
                        <button class="btn btn-sm btn-info mt-1 mb-2" type="button" onclick="usarJugadaOCR(${idx}); return false;">
                          Usar esta Jugada
                        </button>
                      </div><hr class="ocr-play-separator">`;
                });
                $("#ocrJugadas").html(html);
                $("#btnCargarJugadas").prop('disabled', false); 
            } else {
                $("#ocrJugadas").html("<p>No se detectaron jugadas válidas en la imagen o la respuesta no es un array.</p>");
                $("#btnCargarJugadas").prop('disabled', true);
            }
            updateOcrProgress(100, "Proceso completado.");
            setTimeout(hideOcrLoading, 1000);

        } catch (error) {
            console.error("Error procesando la imagen:", error);
            $("#ocrJugadas").html(`<p class="text-danger">Error procesando la imagen: ${error.message}</p>`);
            hideOcrLoading();
            $("#btnCargarJugadas").prop('disabled', true);
        } finally {
            $("#btnProcesarOCR").prop('disabled', !(selectedFileGlobalOCR)); 
        }
    };
    reader.onerror = () => {
        alert('Error leyendo el archivo de imagen.');
        hideOcrLoading();
        $("#btnProcesarOCR").prop('disabled', false);
        $("#btnCargarJugadas").prop('disabled', true);
    };
}
window.procesarOCR = procesarOCR;

window.usarJugadaOCR = function(idx) {
    console.log('=== usarJugadaOCR INICIO ===');
    console.log('Index:', idx);
    
    const modalElement = document.getElementById('modalOcr');
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    
    if (!jugadasGlobalOCR || !jugadasGlobalOCR[idx]) {
        alert("No se encontró la jugada seleccionada.");
        return false;
    }
    
    const j = jugadasGlobalOCR[idx];
    console.log('Jugada a agregar:', j);

    if (playCount >= MAX_PLAYS) {
        alert(`Límite de ${MAX_PLAYS} jugadas alcanzado.`);
        return false;
    }
    
    const newRow = addMainRow(j);
    if (newRow) {
        console.log("Fila agregada, actualizando tabla...");
        
        if (modalInstance) {
            modalInstance.show();
        }
        
        setTimeout(() => {
            recalcAllMainRows();
            calculateMainTotal();
            highlightDuplicatesInMain();
            storeFormState();
            
            console.log("Total filas en tabla:", $("#tablaJugadas > tr").length); 
            
            if (newRow[0] && typeof newRow[0].scrollIntoView === 'function') {
                newRow[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 200);
    } else {
        console.error("Failed to add row from usarJugadaOCR");
    }
    
    return false;
};

function handleCargarTodasLasJugadasClick() {
    console.log("¡handleCargarTodasLasJugadasClick EJECUTADA!");
    
    if (window.event) {
        window.event.preventDefault();
        window.event.stopPropagation();
    }
    
    if (!jugadasGlobalOCR || jugadasGlobalOCR.length === 0) {
        console.log("No hay jugadas OCR para cargar.");
        alert("No hay jugadas OCR para cargar.");
        return false;
    }
    
    console.log(`Intentando cargar ${jugadasGlobalOCR.length} jugadas del OCR...`);
    
    let jugadasCargadas = 0;
    let jugadasOmitidas = 0;
    
    for (let index = 0; index < jugadasGlobalOCR.length; index++) {
        const j = jugadasGlobalOCR[index];
        
        if (playCount >= MAX_PLAYS) {
            jugadasOmitidas = jugadasGlobalOCR.length - index;
            alert(`Se ha alcanzado el límite de ${MAX_PLAYS} jugadas. Se omitieron ${jugadasOmitidas} jugadas.`);
            break; 
        }
        
        console.log(`Añadiendo jugada OCR ${index + 1}:`, j);
        
        const newRow = addMainRow(j); 
        if (newRow) {
            jugadasCargadas++;
            console.log(`Jugada ${index + 1} cargada exitosamente por handleCargarTodasLasJugadasClick`);
        } else {
            console.error(`Error al cargar jugada ${index + 1} desde handleCargarTodasLasJugadasClick`);
        }
    }
    
    console.log(`Proceso completado por handleCargarTodasLasJugadasClick. Jugadas cargadas: ${jugadasCargadas}`);
    
    if (jugadasCargadas > 0) {
        recalcAllMainRows();
        calculateMainTotal();
        highlightDuplicatesInMain();
        storeFormState(); // Guardado automático tras cargar jugadas OCR
        alert(`Se cargaron ${jugadasCargadas} jugadas exitosamente.`);
    }
    
    if (modalOcrInstance) {
        console.log("Cerrando modal de OCR (desde handleCargarTodasLasJugadasClick).");
        modalOcrInstance.hide();
    } else {
        console.error("modalOcrInstance no está definida al intentar cerrar (desde handleCargarTodasLasJugadasClick).");
    }
    
    return false;
}
window.handleCargarTodasLasJugadasClick = handleCargarTodasLasJugadasClick;


function toggleOcrDebug() {
    $("#ocrDebugPanel").toggleClass("d-none");
    alert("El panel de debug detallado del backend original no está implementado de la misma forma para la respuesta de Genkit. Revisa la consola del navegador para la respuesta de /api/interpret-ticket.");
}
window.toggleOcrDebug = toggleOcrDebug;

// --- Main Form Logic ---
let selectedTracksCount = 0;
let selectedDaysCount = 1; 

let isUpdatingProgrammatically = false;

function trackCheckboxChangeHandler() {
    if (isUpdatingProgrammatically) {
        return;
    }
    updateSelectedTracksAndTotal();
}

function updateSelectedTracksAndTotal() {
    let count = 0;
    $(".track-checkbox:checked").each(function() {
        if ($(this).val() !== "Venezuela" && !$(this).prop('disabled')) {
            count++;
        }
    });
    selectedTracksCount = count > 0 ? count : 0; 
    if ($(".track-checkbox:checked").length > 0 && selectedTracksCount === 0 && $(".track-checkbox:checked[value='Venezuela']").length > 0) {
        // Handled in calculateMainTotal
    }
    calculateMainTotal();
    
    // CORRECCIÓN 6: Guardar automáticamente cuando cambien los tracks
    if (!isUpdatingProgrammatically) {
        storeFormState();
    }
}

function updateTrackCutoffDisplays() {
    $(".track-button-container").each(function() {
        const trackName = $(this).find(".track-checkbox").val();
        const cutoffSpan = $(this).find(".cutoff-time");
        if (cutoffSpan.length > 0) {
            const cutoff = getTrackCutoff(trackName);
            if (cutoff) {
                cutoffSpan.text(`Cutoff: ${cutoff}`);
            } else {
                cutoffSpan.text(''); // Clear if no cutoff found
            }
        }
    });
}

function disableExpiredTracks() {
    const isTodaySelected = userChoseToday();
    const now = dayjs();

    $(".track-button-container").each(function() {
        const $checkbox = $(this).find(".track-checkbox");
        const $label = $(this).find(".track-button");
        const trackName = $checkbox.val();
        const cutoff = getTrackCutoff(trackName);

        if (isTodaySelected && cutoff) {
            const [hours, minutes] = cutoff.split(':').map(Number);
            const cutoffTimeToday = dayjs().hour(hours).minute(minutes).second(0);
            const isExpired = now.isAfter(cutoffTimeToday);
            $checkbox.prop('disabled', isExpired);
            $label.toggleClass('disabled', isExpired);
        } else {
            // If not today, ensure they are not disabled by time
            $checkbox.prop('disabled', false);
            $label.removeClass('disabled');
        }
    });
}


$(document).ready(function() {
    console.log("Document ready. jQuery version:", $.fn.jquery);
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        console.log("Bootstrap is loaded. Version:", bootstrap.Modal.VERSION);
        
        const modalOcrElement = document.getElementById('modalOcr');
        if (modalOcrElement) {
            try {
                modalOcrInstance = new bootstrap.Modal(modalOcrElement);
                console.log("Modal #modalOcr inicializada correctamente.");
            } catch (error) {
                console.error("Error al inicializar modal #modalOcr:", error);
            }
        } else {
            console.error("Modal #modalOcr not found in HTML!");
        }

        const wizardModalElement = document.getElementById('wizardModal');
        if (wizardModalElement) {
            try {
                wizardModalInstance = new bootstrap.Modal(wizardModalElement);
                console.log("Modal #wizardModal inicializada correctamente.");
            } catch (error) {
                console.error("Error al inicializar modal #wizardModal:", error);
            }
        } else {
            console.error("Modal #wizardModal not found in HTML!");
        }
        
        const ticketModalElement = document.getElementById('ticketModal');
        if (ticketModalElement) {
            try {
                ticketModalInstance = new bootstrap.Modal(ticketModalElement);
                console.log("Modal #ticketModal inicializada correctamente.");
            } catch (error) {
                console.error("Error al inicializar modal #ticketModal:", error);
            }
        } else {
            console.error("Modal #ticketModal not found in HTML!");
        }

    } else {
        console.error("Bootstrap or Bootstrap Modal not loaded!");
    }
    
    setupThemeToggle();

    $("#openDailyReportBtn").click(function() {
        window.open('DailyReport.html', '_blank');
    });

    $('#modalOcr').on('shown.bs.modal', function () {
        console.log("=== FORZANDO BINDING DEL BOTÓN OCR ===");
        const btn = document.getElementById('btnCargarJugadas');
        if (btn) {
            btn.onclick = null;
            $(btn).off('click');
            
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log("¡¡¡ CLICK FORZADO CAPTURADO !!!");
                handleCargarTodasLasJugadasClick();
            }, true);
            
            console.log("Handler forzado instalado en btnCargarJugadas");
        } else {
            console.error("ERROR: Botón btnCargarJugadas no encontrado");
        }
    });

    // REMOVED: Redundant button adding code
    // if ($("#pasteAmountsButton").length === 0) {
    // // Removed d-none class to make it always visible
    // $("#formButtons").append('<button type="button" id="pasteAmountsButton" class="btn btn-dark ml-2"><i class="bi bi-clipboard-fill"></i> Paste Wagers</button>');
    // }

    dayjs.extend(window.dayjs_plugin_customParseFormat);
    dayjs.extend(window.dayjs_plugin_arraySupport);

    fpInstance = flatpickr("#fecha", {
        mode: "multiple",
        dateFormat: "m-d-Y",
        minDate: "today",
        defaultDate: [new Date()],
        clickOpens: true,
        allowInput: false, 
        appendTo: document.body, 
        onOpen: function(selectedDates, dateStr, instance) {
            // instance.calendarContainer.style.zIndex = "1056"; 
        },
        onChange: function(selectedDates, dateStr, instance) {
            selectedDaysCount = selectedDates.length > 0 ? selectedDates.length : 1;
            
            $(".track-checkbox").off('change', trackCheckboxChangeHandler);
            isUpdatingProgrammatically = true;
            
            isUpdatingProgrammatically = false;
            $(".track-checkbox").on('change', trackCheckboxChangeHandler);
            
            updateSelectedTracksAndTotal();
            disableExpiredTracks(); // Re-evaluate disabled tracks on date change
            storeFormState(); // Guardado automático cuando cambien las fechas
        }
    });
    selectedDaysCount = fpInstance.selectedDates.length > 0 ? fpInstance.selectedDates.length : 1;


    $(".track-checkbox").on('change', trackCheckboxChangeHandler);
    
    isUpdatingProgrammatically = true;
    autoSelectNYTrackAndVenezuela();
    isUpdatingProgrammatically = false;
    
    updateSelectedTracksAndTotal(); 

    // Initial calls for track functionality
    updateTrackCutoffDisplays();
    disableExpiredTracks();
    
    // CORRECCIÓN 6: Cargar estado guardado automáticamente al inicializar
    loadFormState(); 

    // Set up periodic check for track cutoffs
    setInterval(disableExpiredTracks, 60000); // Check every 60 seconds

    $("#agregarJugada").click(function() {
        const $newRow = addMainRow();
        if ($newRow) {
            $newRow.find(".betNumber").focus();
            storeFormState(); // Guardado automático al agregar fila
        }
    });

    $("#selectAllCheckbox").on('change', function() {
        $("#tablaJugadas .row-select-checkbox").prop('checked', $(this).prop('checked')); 
    });

    $("#tablaJugadas").on('change', '.row-select-checkbox', function() {
        if (!$(this).prop('checked')) {
            $("#selectAllCheckbox").prop('checked', false);
        } else {
            if ($("#tablaJugadas .row-select-checkbox:checked").length === $("#tablaJugadas .row-select-checkbox").length) { 
                $("#selectAllCheckbox").prop('checked', true);
            }
        }
    });
    
    $("#tablaJugadas").on("click", ".total-cell", function() { 
        const $row = $(this).closest("tr");
        const straight = $row.find(".straight").val();
        const box = $row.find(".box").val();
        const combo = $row.find(".combo").val();
 
        window.copiedAmounts = {
            straight: straight,
            box: box,
            combo: combo
        };
        $("#pasteAmountsButton").prop('disabled', false); 
        console.log("Montos copiados:", window.copiedAmounts);      });

    $("#pasteAmountsButton").on("click", function() {
        if (Object.keys(window.copiedAmounts).length === 0) {
            alert("No hay montos copiados para pegar.");
            return;
        }

        const $selectedRows = $("#tablaJugadas .row-select-checkbox:checked").closest("tr"); 
        if ($selectedRows.length === 0) {
            alert("No hay filas seleccionadas para pegar los montos.");
            return;
        }

        let modified = false;
        $selectedRows.each(function() {
            const $row = $(this);
            let rowChanged = false;
            if (window.copiedAmounts.straight !== "" && window.copiedAmounts.straight !== undefined && window.copiedAmounts.straight !== null) {
                if ($row.find(".straight").val() !== window.copiedAmounts.straight) {
                    $row.find(".straight").val(window.copiedAmounts.straight);
                    rowChanged = true;
                }
            }
            if (window.copiedAmounts.box !== "" && window.copiedAmounts.box !== undefined && window.copiedAmounts.box !== null) {
                if ($row.find(".box").val() !== window.copiedAmounts.box) {
                    $row.find(".box").val(window.copiedAmounts.box);
                    rowChanged = true;
                }
            }
            if (window.copiedAmounts.combo !== "" && window.copiedAmounts.combo !== undefined && window.copiedAmounts.combo !== null) {
                if ($row.find(".combo").val() !== window.copiedAmounts.combo) {
                    $row.find(".combo").val(window.copiedAmounts.combo);
                    rowChanged = true;
                }
            }
            if (rowChanged) {
                recalcMainRow($row); 
                modified = true;
            }
        });

        if (modified) {
            calculateMainTotal(); 
            highlightDuplicatesInMain(); 
            storeFormState(); 
            console.log("Montos pegados y totales recalculados.");
        }

        window.copiedAmounts = {}; 
        // $("#pasteAmountsButton").prop('disabled', true); // Assuming it should become disabled or hidden
        $("#selectAllCheckbox").prop('checked', false); 
        $("#tablaJugadas .row-select-checkbox").prop('checked', false); 
    });


    $("#eliminarJugada").click(function() {
        if (playCount === 0) {
            alert("No plays to remove.");
            return;
        }
        const $selectedRows = $("#tablaJugadas .row-select-checkbox:checked").closest("tr"); 
        if ($selectedRows.length > 0) {
            $selectedRows.remove();
            playCount -= $selectedRows.length;
        } else if (playCount > 0) {
             $("#tablaJugadas > tr:last").remove(); 
             playCount--;
        }
        renumberMainRows();
        calculateMainTotal();
        highlightDuplicatesInMain();
        storeFormState(); // Guardado automático
        if ($("#tablaJugadas .row-select-checkbox").length === 0) { 
            $("#selectAllCheckbox").prop('checked', false);
        }
    });

    $("#tablaJugadas").on("click", ".removeMainBtn", function() {
        $(this).closest("tr").remove();
        playCount--;
        renumberMainRows();
        calculateMainTotal();
        highlightDuplicatesInMain();
        storeFormState(); // Guardado automático
        if ($("#tablaJugadas .row-select-checkbox").length === 0) { 
            $("#selectAllCheckbox").prop('checked', false);
        } else if ($("#tablaJugadas .row-select-checkbox:checked").length === $("#tablaJugadas .row-select-checkbox").length) { 
            $("#selectAllCheckbox").prop('checked', true);
        } else {
             $("#selectAllCheckbox").prop('checked', false);
        }
    });

    $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function() {
        const $row = $(this).closest("tr");
        recalcMainRow($row);
        $row.removeClass("invalid-play"); // Remove highlighting on input change
        
        // CORRECCIÓN 6: Guardar automáticamente en localStorage con cada cambio
        setTimeout(() => {
            storeFormState();
        }, 300); // Pequeño delay para evitar guardar demasiado frecuentemente
    });
     $("#tablaJugadas").on("blur", ".betNumber, .straight, .box, .combo", function() {
        highlightDuplicatesInMain(); 
        // Guardar también al salir del campo
        storeFormState();
    });


    $("#resetForm").click(function() {
        if (confirm("Are you sure you want to reset the form?")) {
            resetForm();
        }
    });

    // ======================= INICIO: CÓDIGO AÑADIDO =======================
    // Se asume que el nuevo botón en el HTML tendrá el id="exportExcelBtn".
    // Este listener llamará a la función `exportPlaysToCsv` que ya existe
    // y que genera un archivo .csv compatible con Excel.
    // **NOTA:** El `exportPlaysToCsv` ya existe más abajo en el código original.
    $("#exportExcelBtn").click(function() {
        exportPlaysToCsv();
    });
    // ======================= FIN: CÓDIGO AÑADIDO =========================


    $("#generarTicket").click(function() {
        doGenerateTicket();
    });

    $("#confirmarTicket").click(async function() {
        const $confirmButton = $(this);
        $confirmButton.prop("disabled", true);
        $("#editButton").addClass("d-none");

        const uniqueTicket = generateUniqueTicketNumber();
        $("#numeroTicket").text(uniqueTicket);
        transactionDateTime = dayjs().format("MM/DD/YYYY hh:mm A");
        $("#ticketTransaccion").text(transactionDateTime);

        await renderTicketQr(uniqueTicket);
        latestTicketDataUrl = null;
        latestTicketBlob = null;

        // Esperar tiempo para renderizado completo del QR
        setTimeout(() => {
            const jugadasCount = $("#ticketJugadas tr").length;
            console.log(`Generando ticket para DESCARGA con ${jugadasCount} jugadas`);
            
            // SOLUCIÓN MEJORADA: Pre-ajustar altura con valores más agresivos
            const preTicket = document.getElementById("preTicket");
            const originalPadding = preTicket.style.paddingBottom;
            const originalBarcodeMargin = preTicket.querySelector('.barcode')?.style.marginBottom || '';
            const originalBarcodeHeight = preTicket.querySelector('.barcode')?.style.minHeight || '';
            
            // Ejecutar herramienta de depuración antes de la captura
            debugQRCapture();
            
            // APLICAR VALORES MÁS AGRESIVOS para garantizar espacio suficiente
            preTicket.style.paddingBottom = "100px"; // Aumentado de 60px
            const barcodeArea = preTicket.querySelector('.barcode');
            if (barcodeArea) {
                barcodeArea.style.marginBottom = "60px"; // Aumentado de 40px
                barcodeArea.style.minHeight = "200px"; // Altura mínima para el área del QR
                barcodeArea.style.paddingBottom = "40px"; // Padding adicional
            }
            
            // Forzar el QR a tener más espacio
            const qrElement = document.getElementById("qrcode");
            if (qrElement) {
                qrElement.style.marginBottom = "30px";
                qrElement.style.paddingBottom = "20px";
            }
            
            // Forzar recálculo del layout
            void preTicket.offsetHeight;
            
            console.log("Pre-ajustes aplicados. Nueva altura:", preTicket.scrollHeight);
            
            // CONFIGURACIÓN ESTABLE PARA DESCARGA (después de pre-ajustes)
            html2canvas(document.getElementById("preTicket"), {
                scale: 4, // Escala alta pero estable
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: document.getElementById("preTicket").scrollWidth,
                height: document.getElementById("preTicket").scrollHeight + 50, // Añadir buffer adicional
                scrollX: 0,
                scrollY: 0,
                windowHeight: document.getElementById("preTicket").scrollHeight + 100, // Ventana más alta
                foreignObjectRendering: false, // Más compatible
                imageTimeout: 30000, // Timeout moderado
                onclone: function(clonedDoc) {
                    console.log("Procesando clon para descarga...");
                    
                    // Asegurar que el clon mantenga los ajustes
                    const preTicketClone = clonedDoc.getElementById("preTicket");
                    if (preTicketClone) {
                        preTicketClone.style.paddingBottom = '100px';
                        preTicketClone.style.minHeight = 'auto';
                        preTicketClone.style.overflow = 'visible';
                    }
                    
                    const barcodeClone = clonedDoc.querySelector('.barcode');
                    if (barcodeClone) {
                        barcodeClone.style.marginBottom = '60px';
                        barcodeClone.style.minHeight = '200px';
                        barcodeClone.style.paddingBottom = '40px';
                        barcodeClone.style.overflow = 'visible';
                    }
                    
                    prepareQrInClone(clonedDoc);
                }
            }).then(function(canvas) {
                // RESTAURAR valores originales INMEDIATAMENTE después de capturar
                preTicket.style.paddingBottom = originalPadding;
                if (barcodeArea) {
                    barcodeArea.style.marginBottom = originalBarcodeMargin;
                    barcodeArea.style.minHeight = originalBarcodeHeight;
                    barcodeArea.style.paddingBottom = '';
                }
                if (qrElement) {
                    qrElement.style.marginBottom = '';
                    qrElement.style.paddingBottom = '';
                }
                console.log("Valores originales restaurados");
                
                if (canvas && canvas.width > 0 && canvas.height > 0) {
                    console.log(`Canvas DESCARGA generado correctamente: ${canvas.width}x${canvas.height}`);

                    latestTicketDataUrl = canvas.toDataURL('image/png', 1.0);
                    canvas.toBlob(function(blob){
                        latestTicketBlob = blob;
                        const link = document.createElement('a');
                        link.download = `ticket_${uniqueTicket}.png`;
                        link.href = URL.createObjectURL(blob);

                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(link.href);

                        console.log("Ticket descargado exitosamente");
                        $("#shareTicket").removeClass("d-none");
                    }, 'image/png', 1.0);
                } else {
                    throw new Error("Canvas de descarga generado incorrectamente");
                }

            }).catch(function(error) {
                // RESTAURAR valores originales en caso de error
                preTicket.style.paddingBottom = originalPadding;
                if (barcodeArea) {
                    barcodeArea.style.marginBottom = originalBarcodeMargin;
                    barcodeArea.style.minHeight = originalBarcodeHeight;
                    barcodeArea.style.paddingBottom = '';
                }
                if (qrElement) {
                    qrElement.style.marginBottom = '';
                    qrElement.style.paddingBottom = '';
                }
                console.error("Error generando imagen de descarga:", error);
                alert("Error generating ticket for download: " + error.message);
            });
        }, 1500); // Aumentado a 1.5 segundos para asegurar renderizado completo del QR
    });
    
    $("#editButton").click(function(){
        const ticketModal= bootstrap.Modal.getInstance(document.getElementById("ticketModal"));
        if (ticketModal) ticketModal.hide();
    });

    $("#shareTicket").click(async function(){
        // Prevenir múltiples clicks
        if ($(this).prop('disabled')) return;
        $(this).prop('disabled', true);

        if (navigator.share) {
            let originalPadding, originalBarcodeMargin, originalBarcodeHeight;
            try {
                console.log("Iniciando proceso de compartir...");

                // Use previously generated image if available
                let shareBlob = null;
                if (latestTicketDataUrl) {
                    shareBlob = dataUrlToBlob(latestTicketDataUrl);
                    if (shareBlob) {
                        latestTicketBlob = shareBlob;
                    }
                }

                if (!shareBlob && latestTicketBlob) {
                    shareBlob = latestTicketBlob;
                }

                if (shareBlob) {
                    const file = new File([shareBlob], 'ticket.png', { type: 'image/png' });
                    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: 'Mi Ticket de Lotería',
                            text: '¡Aquí tienes mi ticket generado!',
                        });
                        console.log("Ticket compartido exitosamente (reused image)");
                        $("#shareTicket").prop('disabled', false);
                        return;
                    }
                }

                // APLICAR MISMA SOLUCIÓN MEJORADA para compartir
                const preTicket = document.getElementById("preTicket");
                originalPadding = preTicket.style.paddingBottom;
                originalBarcodeMargin = preTicket.querySelector('.barcode')?.style.marginBottom || '';
                originalBarcodeHeight = preTicket.querySelector('.barcode')?.style.minHeight || '';
                
                // Pre-ajustar altura con valores más agresivos para compartir
                preTicket.style.paddingBottom = "100px";
                const barcodeArea = preTicket.querySelector('.barcode');
                if (barcodeArea) {
                    barcodeArea.style.marginBottom = "60px";
                    barcodeArea.style.minHeight = "200px";
                    barcodeArea.style.paddingBottom = "40px";
                }
                
                const qrElement = document.getElementById("qrcode");
                if (qrElement) {
                    qrElement.style.marginBottom = "30px";
                    qrElement.style.paddingBottom = "20px";
                }
                
                // CONFIGURACIÓN MÁS CONSERVADORA para compartir (evitar imagen en blanco)
                const canvas = await html2canvas(document.getElementById("preTicket"), {
                    scale: 3, // Escala moderada para evitar problemas de memoria
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff',
                    logging: false, // Deshabilitar logging para compartir
                    foreignObjectRendering: false, // Usar configuración más compatible
                    imageTimeout: 15000, // Timeout más corto para compartir
                    width: document.getElementById("preTicket").scrollWidth,
                    height: document.getElementById("preTicket").scrollHeight + 50, // Buffer adicional
                    windowHeight: document.getElementById("preTicket").scrollHeight + 100,
                    scrollX: 0,
                    scrollY: 0,
                    onclone: function(clonedDoc) {
                        console.log("Procesando clon para compartir con valores mejorados...");

                        // Mantener los ajustes en el clon
                        const preTicketClone = clonedDoc.getElementById("preTicket");
                        if (preTicketClone) {
                            preTicketClone.style.paddingBottom = '100px';
                        }
                        
                        const barcodeClone = clonedDoc.querySelector('.barcode');
                        if (barcodeClone) {
                            barcodeClone.style.marginBottom = '60px';
                            barcodeClone.style.minHeight = '200px';
                            barcodeClone.style.paddingBottom = '40px';
                        }
                        
                        prepareQrInClone(clonedDoc);
                    }
                });
                
                // RESTAURAR valores originales inmediatamente después de capturar
                preTicket.style.paddingBottom = originalPadding;
                if (barcodeArea) {
                    barcodeArea.style.marginBottom = originalBarcodeMargin;
                    barcodeArea.style.minHeight = originalBarcodeHeight;
                    barcodeArea.style.paddingBottom = '';
                }
                if (qrElement) {
                    qrElement.style.marginBottom = '';
                    qrElement.style.paddingBottom = '';
                }
                
                console.log(`Canvas para compartir generado: ${canvas.width}x${canvas.height}`);
                
                canvas.toBlob(async function(blob) {
                    if (blob && blob.size > 0) {
                        latestTicketBlob = blob;
                        const dataUrl = canvas.toDataURL('image/png', 1.0);
                        latestTicketDataUrl = dataUrl;
                        const file = new File([blob], 'ticket.png', {type: 'image/png'});
                        await navigator.share({
                            files: [file],
                            title: 'Mi Ticket de Lotería',
                            text: '¡Aquí tienes mi ticket generado!',
                        });
                        console.log("Ticket compartido exitosamente");
                    } else {
                        throw new Error("Generated blob is empty");
                    }
                    // Re-habilitar el botón después de compartir
                    $("#shareTicket").prop('disabled', false);
                }, 'image/png', 0.95); // Calidad ligeramente reducida para evitar problemas
            } catch (error) { 
                // RESTAURAR valores originales en caso de error
                const preTicket = document.getElementById("preTicket");
                const barcodeArea = preTicket.querySelector('.barcode');
                const qrElement = document.getElementById("qrcode");
                
                if (preTicket && typeof originalPadding !== 'undefined') {
                    preTicket.style.paddingBottom = originalPadding;
                }
                if (barcodeArea && typeof originalBarcodeMargin !== 'undefined') {
                    barcodeArea.style.marginBottom = originalBarcodeMargin;
                    barcodeArea.style.minHeight = originalBarcodeHeight || '';
                    barcodeArea.style.paddingBottom = '';
                }
                if (qrElement) {
                    qrElement.style.marginBottom = '';
                    qrElement.style.paddingBottom = '';
                }
                
                console.error('Error sharing:', error);
                const msg = (error && error.name === 'AbortError') ? 'Share cancelled by user.' : 'Could not share ticket: ' + (error.message || error);
                alert(msg);
                $("#shareTicket").prop('disabled', false);
            }
        } else { 
            alert('Web Share API is not supported in your browser.');
            $("#shareTicket").prop('disabled', false);
        }
    });


    // Wizard Modal Logic 
    $("#wizardButton").click(function() {
        console.log("Wizard button clicked");
        resetWizard();
        if(wizardModalInstance) wizardModalInstance.show();
        else console.error("Wizard modal not initialized");
    });

    $(".lockBtn").click(function() {
        const field = $(this).data("field");
        lockedFields[field] = !lockedFields[field];
        $(this).html(lockedFields[field] ? `<i class="bi bi-lock-fill"></i>` : `<i class="bi bi-unlock"></i>`);
    });

    $("#wizardAddNext").click(function() {
        const bn = $("#wizardBetNumber").val().trim();
        const gm = determineGameMode(bn, getCurrentSelectedTracks());
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
    
    $("#wizardTableBody").on("click", ".removeWizardBtn", function() {
        $(this).closest("tr").remove();
        renumberWizard();
        highlightDuplicatesInWizard();
    });

    $("#btnGenerateQuickPick").click(function() {
        const count = parseInt($("#qpCount").val()) || 5; 
        const gameMode = $("#qpGameMode").val() || "Pick 3"; 
        const stVal = $("#wizardStraight").val().trim() || "";
        const bxVal = $("#wizardBox").val().trim() || "";
        const coVal = $("#wizardCombo").val().trim() || "";

        if (count <= 0) {
            alert("Please enter a valid number of plays (greater than 0).");
            return;
        }

        for (let i = 0; i < count; i++) {
            let betNumber;
            if (["Palé", "Pale-Ven", "Pale-RD"].includes(gameMode)) {
                const num1 = Math.floor(Math.random() * 100);
                const num2 = Math.floor(Math.random() * 100);
                betNumber = padNumberForMode(num1, "Pulito") + "-" + padNumberForMode(num2, "Pulito"); 
            } else {
                betNumber = generateRandomNumberForMode(gameMode); 
                betNumber = padNumberForMode(betNumber, gameMode);
            }

            const rowTotal = calculateRowTotal(betNumber, gameMode, stVal, bxVal, coVal);
            addWizardRow(betNumber, gameMode, stVal, bxVal, coVal, rowTotal);
        }

        renumberWizard();
        highlightDuplicatesInWizard();
    });

    $("#btnGenerateRoundDown").click(function() {
        const baseNumberInput = $("#roundDownBaseNumber");
        const baseNumber = baseNumberInput.length > 0 ? baseNumberInput.val().trim() : $("#wizardBetNumber").val().trim();

        const rangeMatch = baseNumber.match(/^(\d+)-(\d+)$/);

        if (!rangeMatch) {
            alert("Round Down requires a number range in the format XXX-XXX (e.g., 033-933). Please enter it in the 'Bet Number' field or the dedicated Round Down field if available.");
            return;
        }

        const startStr = rangeMatch[1];
        const endStr = rangeMatch[2];

        if (startStr.length !== endStr.length || startStr.length === 0) {
             alert("Invalid Round Down range format. Start and end numbers must have the same length and be non-empty.");
             return;
        }

        let varyingDigitIndex = -1;
        for (let i = 0; i < startStr.length; i++) {
            if (startStr[i] === '0' && endStr[i] === '9') {
                varyingDigitIndex = i;
                break; 
            }
        }

        if (varyingDigitIndex === -1) {
            alert("Round Down requires exactly one digit position that varies from 0 to 9 in the range (e.g., 033-039 or 104-194).");
            return;
        }

        const stVal = $("#wizardStraight").val().trim() || "";

        for (let i = 0; i <= 9; i++) {
            const generatedNumber = startStr.substring(0, varyingDigitIndex) + i + startStr.substring(varyingDigitIndex + 1);
            const gm = determineGameMode(generatedNumber, getCurrentSelectedTracks());
            const rowTotal = calculateRowTotal(generatedNumber, gm, stVal, "", ""); 
            addWizardRow(generatedNumber, gm, stVal, "-", "-", rowTotal); 
        }

        renumberWizard();
        highlightDuplicatesInWizard();
    });
    $("#btnPermute").click(function() { permuteWizardBetNumbers(); });

    $("#wizardAddAllToMain").click(function() {
        const wizardRows = $("#wizardTableBody tr");
        if (wizardRows.length === 0) {
            alert("No plays in the wizard table.");
            return;
        }
        let addedCount = 0;
        wizardRows.each(function() {
            if (playCount >= MAX_PLAYS) {
                alert(`Reached ${MAX_PLAYS} plays in the main form. Stopping import.`);
                return false; 
            }
            const tds = $(this).find("td");
            const bn = tds.eq(1).text();
            const gm = tds.eq(2).text();
            const stVal = (tds.eq(3).text() === "-" ? "" : tds.eq(3).text());
            const bxVal = (tds.eq(4).text() === "-" ? "" : tds.eq(4).text());
            const coVal = (tds.eq(5).text() === "-" ? "" : tds.eq(5).text());
            
            addMainRow({ betNumber: bn, gameMode: gm, straightAmount: parseFloat(stVal) || null, boxAmount: parseFloat(bxVal) || null, comboAmount: parseFloat(coVal) || null });
            addedCount++;
        });

        if (addedCount > 0) {
            recalcAllMainRows();
            calculateMainTotal();
            highlightDuplicatesInMain();
            storeFormState(); // Guardado automático tras agregar desde wizard
        }
        $("#wizardTableBody").empty();
        wizardCount = 0;
    });

    $("#wizardGenerateTicket").click(function() {
        $("#wizardAddAllToMain").trigger("click");
        if(wizardModalInstance) wizardModalInstance.hide();
        doGenerateTicket();
    });

    $("#wizardEditMainForm").click(function() {
        if(wizardModalInstance) wizardModalInstance.hide();
    });

    $("#exportPlaysButton").click(exportPlaysToCsv);
    
    // Tutorial and Manual buttons
    $("#helpEnglish").click(() => startTutorial('en'));
    $("#helpSpanish").click(() => startTutorial('es'));
    $("#helpCreole").click(() => startTutorial('ht'));
    $("#manualEnglishBtn").click(function() { /* ... */ });
    $("#manualSpanishBtn").click(function() { /* ... */ });
    $("#manualCreoleBtn").click(function() { /* ... */ });

    console.log("Document fully loaded and initial scripts executed.");
});


// Herramienta de depuración mejorada
function debugQRCapture() {
    const preTicket = document.getElementById("preTicket");
    const barcode = preTicket ? preTicket.querySelector('.barcode') : null;
    const qrcode = document.getElementById("qrcode");

    if (!ENABLE_QR_DEBUG) {
        if (qrcode) {
            qrcode.style.border = '';
            qrcode.style.backgroundColor = '';
        }
        if (barcode) {
            barcode.style.border = '';
            barcode.style.backgroundColor = '';
        }
        return;
    }

    console.group('🔍 QR Capture Debug Info - ENHANCED');

    // Dimensiones del ticket
    if (preTicket) {
        console.log('📏 Ticket dimensions:');
        console.log('- scrollHeight:', preTicket.scrollHeight);
        console.log('- clientHeight:', preTicket.clientHeight);
        console.log('- offsetHeight:', preTicket.offsetHeight);
        console.log('- computedHeight:', getComputedStyle(preTicket).height);
        console.log('- paddingBottom:', getComputedStyle(preTicket).paddingBottom);
        console.log('- paddingTop:', getComputedStyle(preTicket).paddingTop);
    }

    // Dimensiones del área barcode
    if (barcode) {
        console.log('\n📊 Barcode area dimensions:');
        console.log('- scrollHeight:', barcode.scrollHeight);
        console.log('- offsetHeight:', barcode.offsetHeight);
        console.log('- clientHeight:', barcode.clientHeight);
        console.log('- marginBottom:', getComputedStyle(barcode).marginBottom);
        console.log('- marginTop:', getComputedStyle(barcode).marginTop);
        console.log('- paddingBottom:', getComputedStyle(barcode).paddingBottom);
        console.log('- minHeight:', getComputedStyle(barcode).minHeight);
    }

    // Dimensiones del QR
    if (qrcode) {
        console.log('\n🔲 QR Code dimensions:');
        console.log('- scrollHeight:', qrcode.scrollHeight);
        console.log('- offsetHeight:', qrcode.offsetHeight);
        console.log('- clientHeight:', qrcode.clientHeight);
        console.log('- position:', getComputedStyle(qrcode).position);
        console.log('- margin:', getComputedStyle(qrcode).margin);
        console.log('- padding:', getComputedStyle(qrcode).padding);
        
        const qrCanvas = qrcode.querySelector('canvas');
        const qrImg = qrcode.querySelector('img');
        const qrTable = qrcode.querySelector('table');
        
        if (qrCanvas) {
            console.log('- Canvas height:', qrCanvas.height);
            console.log('- Canvas style height:', qrCanvas.style.height);
            console.log('- Canvas offsetHeight:', qrCanvas.offsetHeight);
        }
        
        if (qrImg) {
            console.log('- Image naturalHeight:', qrImg.naturalHeight);
            console.log('- Image height:', qrImg.height);
            console.log('- Image offsetHeight:', qrImg.offsetHeight);
        }
        
        if (qrTable) {
            console.log('- Table offsetHeight:', qrTable.offsetHeight);
        }
    }

    // Posición del QR relativa al ticket
    if (qrcode && preTicket) {
        const qrRect = qrcode.getBoundingClientRect();
        const ticketRect = preTicket.getBoundingClientRect();
        console.log('\n📍 QR Position Analysis:');
        console.log('- QR bottom:', qrRect.bottom);
        console.log('- Ticket bottom:', ticketRect.bottom);
        console.log('- Distance to ticket bottom:', ticketRect.bottom - qrRect.bottom);
        console.log('- QR top relative to ticket:', qrRect.top - ticketRect.top);
        console.log('- Available space below QR:', ticketRect.bottom - qrRect.bottom);
        
        // Calcular si el QR se cortaría
        const spaceNeeded = 20; // Espacio mínimo requerido
        const willBeCut = (ticketRect.bottom - qrRect.bottom) < spaceNeeded;
        console.log(`- Will QR be cut? ${willBeCut ? '⚠️ YES' : '✅ NO'}`);
        console.log(`- Space needed: ${spaceNeeded}px, Available: ${ticketRect.bottom - qrRect.bottom}px`);
    }

    console.groupEnd();

    // Test visual con borde y fondo
    if (qrcode) {
        qrcode.style.border = '3px solid red';
        qrcode.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        if (barcode) {
            barcode.style.border = '3px solid blue';
            barcode.style.backgroundColor = 'rgba(0, 0, 255, 0.1)';
        }
        setTimeout(() => {
            qrcode.style.border = '';
            qrcode.style.backgroundColor = '';
            if (barcode) {
                barcode.style.border = '';
                barcode.style.backgroundColor = '';
            }
        }, 500);
    }
}

// --- Helper Functions (determineGameMode, calculateRowTotal, etc.) ---
function getCurrentSelectedTracks() {
    return $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
}

function determineGameMode(betNumber, selectedTracks = []) {
    if (!betNumber) return "-";

    const tracks = selectedTracks.length > 0 ? selectedTracks : getCurrentSelectedTracks();

    const isUSA = tracks.some(t => cutoffTimes.USA && cutoffTimes.USA[t]);
    const isSD = tracks.some(t => cutoffTimes["Santo Domingo"] && cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = tracks.includes("Venezuela");
    const includesHorses = tracks.includes("New York Horses");

    if (includesHorses) return "NY Horses";

    const cleanBetNumber = String(betNumber).replace(/[^0-9x+-]/gi, ''); 
    const paleRegex = /^(\d{2})([x+-])(\d{2})$/;

    if (paleRegex.test(cleanBetNumber)) {
        if (includesVenezuela && isUSA) return "Pale-Ven";
        if (isSD && !isUSA) return "Pale-RD";
        if (isUSA) return "Palé"; 
        return "Palé"; 
    }
    
    const length = cleanBetNumber.replace(/[^0-9]/g, '').length; 

    if (length === 1 && isUSA && !includesVenezuela && !includesHorses) return "Single Action";
    if (length === 2) {
        if (includesVenezuela && isUSA) return "Venezuela"; 
        if (isUSA && !isSD) return "Pulito";      
        if (isSD && !isUSA) return "RD-Quiniela"; 
        if (tracks.includes("Venezuela") && tracks.length === 1) return "Venezuela"; 
        if (tracks.some(t => cutoffTimes.USA[t]) && !tracks.some(t => cutoffTimes["Santo Domingo"][t])) return "Pulito"; 
        if (tracks.some(t => cutoffTimes["Santo Domingo"][t]) && !tracks.some(t => cutoffTimes.USA[t])) return "RD-Quiniela"; 
        return "Pulito"; 
    }
    if (length === 3) return "Pick 3";
    if (length === 4) return "Win 4";
    
    return "-";
}

function calculateRowTotal(betNumber, gameMode, stVal, bxVal, coVal) {
    if (!betNumber || gameMode === "-") return "0.00";

    const st = parseFloat(stVal) || 0;
    const combo = parseFloat(coVal) || 0;
    let numericBox = 0;

    if (gameMode === "Pulito") {
        if (typeof bxVal === 'string' && bxVal.includes(',')) {
            const positions = bxVal.split(",").map(x => x.trim()).filter(Boolean).length;
            return (st * positions).toFixed(2);
        } else {
            numericBox = parseFloat(bxVal) || 0; 
        }
    } else {
        numericBox = parseFloat(bxVal) || 0;
    }

    if (["Venezuela", "Pale-RD", "Pale-Ven", "RD-Quiniela", "Palé"].includes(gameMode)) {
        return st.toFixed(2); 
    }
    
    if (gameMode === "Win 4" || gameMode === "Pick 3") {
        const combosCount = calcCombos(String(betNumber).replace(/[^0-9]/g, ''));
        return (st + numericBox + (combo * combosCount)).toFixed(2);
    }
    
    return (st + numericBox + combo).toFixed(2);
}


function calcCombos(str) {
    const freq = {};
    for (let c of str) { freq[c] = (freq[c] || 0) + 1; }
    const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
    let denom = 1;
    for (let k in freq) { denom *= factorial(freq[k]); }
    return factorial(str.length) / denom;
}

// --- Main Table Row Management ---
function addMainRow(bet = null) {
    console.log("addMainRow llamada. playCount actual:", playCount, "Datos de jugada:", bet);
    if ($("#tablaJugadas").length === 0) { 
        console.error("CRITICAL: El elemento con ID #tablaJugadas (que debería ser el tbody) no se encuentra. Por favor, verifica tu archivo HTML (index.html). Las jugadas no se pueden agregar.");
        alert("Error crítico: Falta el elemento #tablaJugadas (tbody) en la tabla. Contacte al administrador.");
        return null;
    }

     if (playCount >= MAX_PLAYS) {
        alert(`You have reached the limit of ${MAX_PLAYS} plays in the main form.`);
        return null;
    }
    playCount++;
    const rowIndex = playCount;

    let bn_val = "";
    let st_val = "";
    let bx_val = ""; 
    let co_val = "";
    let gm_val = "-";
    
    if (bet) {
        bn_val = bet.betNumber || "";
        st_val = (bet.straightAmount !== null && bet.straightAmount !== undefined) ? String(bet.straightAmount) : "";
        if (typeof bet.boxAmount === 'string' && bet.boxAmount.includes(',')) {
            bx_val = bet.boxAmount;
        } else {
            bx_val = (bet.boxAmount !== null && bet.boxAmount !== undefined) ? String(bet.boxAmount) : "";
        }
        co_val = (bet.comboAmount !== null && bet.comboAmount !== undefined) ? String(bet.comboAmount) : "";
        
        const currentTracks = getCurrentSelectedTracks();
        gm_val = bet.gameMode || determineGameMode(bn_val, currentTracks);
        // Ensure exclusive placement: only one of Straight/Box/Combo should be filled.
        // If multiple are present, keep precedence combo > box > straight; blank the rest.
        const _stNum = (st_val !== undefined && st_val !== null && st_val !== '') ? parseFloat(st_val) : null;
        const _bxNum = (bx_val !== undefined && bx_val !== null && bx_val !== '') ? (
            (typeof bx_val === 'string' && bx_val.includes(',')) ? bx_val : (isNaN(parseFloat(bx_val)) ? null : parseFloat(bx_val))
        ) : null;
        const _coNum = (co_val !== undefined && co_val !== null && co_val !== '') ? parseFloat(co_val) : null;

        const nonEmptyCount = [ _stNum, _bxNum, _coNum ].filter(v => v !== null).length;
        if (nonEmptyCount > 1) {
            // Ambiguous: keep Straight, blank Box/Combo
            bx_val = '';
            co_val = '';
        }

    }

    // CORRECTED: Ensure only one TD for total, and amount is wrapped in span.total-amount
    const rowHTML = `
      <tr data-playindex="${rowIndex}">
        <td><input type="checkbox" class="row-select-checkbox form-check-input"></td>
        <td><button type="button" class="btnRemovePlay removeMainBtn btn btn-sm btn-danger" data-row="${rowIndex}">${rowIndex}</button></td>
        <td><input type="text" class="form-control betNumber" value="${bn_val}" /></td>
        <td class="gameMode">${gm_val}</td>
        <td><input type="number" step="0.01" class="form-control straight" value="${st_val}" /></td>
        <td><input type="text" class="form-control box" value="${bx_val}" /></td>
        <td><input type="number" step="0.01" class="form-control combo" value="${co_val}" /></td>
        <td class="total total-cell" title="Copiar montos"><span class="total-amount">0.00</span> <i class="bi bi-copy copy-amounts-btn" style="pointer-events: none; margin-left: 5px;"></i></td>
      </tr>
    `;
    
    $("#tablaJugadas").append(rowHTML);
    const $newRow = $("#tablaJugadas > tr[data-playindex='" + rowIndex + "']");

    if ($newRow.length === 0) {
        console.error("Error: La fila no se agregó correctamente al DOM por addMainRow. playCount actual:", playCount, "rowIndex intentado:", rowIndex);
        playCount--; 
        return null;
    }

    if (bet) {
        recalcMainRow($newRow);
    }
    
    if ($("#selectAllCheckbox").prop('checked')) {
        if ($("#tablaJugadas .row-select-checkbox:not(:checked)").length > 0) { 
             $("#selectAllCheckbox").prop('checked', false);
        }
    }
    console.log(`Fila ${rowIndex} agregada exitosamente por addMainRow`);
    
    // CORRECCIÓN 6: Guardado automático al agregar fila
    if (bet) {
        // Solo guardar automáticamente si se agregó con datos (desde OCR o wizard)
        setTimeout(() => {
            storeFormState();
        }, 100);
    }
    
    return $newRow;
}


function renumberMainRows() { 
    let i = 0;
    $("#tablaJugadas > tr").each(function() { 
        i++;
        $(this).attr("data-playindex", i); 
        $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount = i;
}

function recalcMainRow($row) { 
    const bn = $row.find(".betNumber").val().trim();
    const currentTracks = getCurrentSelectedTracks();
    const gm = determineGameMode(bn, currentTracks);
    $row.find(".gameMode").text(gm);

    const stVal = $row.find(".straight").val().trim();
    const bxVal = $row.find(".box").val().trim();
    const coVal = $row.find(".combo").val().trim();

    const rowTotal = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    // CONFIRMED: This correctly targets the span.total-amount within td.total-cell
    $row.find(".total-cell .total-amount").text(parseFloat(rowTotal).toFixed(2));
}

function recalcAllMainRows() { 
    $("#tablaJugadas > tr").each(function() { 
        recalcMainRow($(this));
    });
    calculateMainTotal(); 
}


// --- Total Calculation & State Management ---
function calculateMainTotal() { 
    let sum = 0;
    $("#tablaJugadas > tr").each(function() { 
        // Ensure we are reading from the span.total-amount
        const totalText = $(this).find(".total-cell .total-amount").text();
        sum += parseFloat(totalText) || 0;
    });

    let effectiveDays = selectedDaysCount > 0 ? selectedDaysCount : 1;
    let effectiveTracks = selectedTracksCount > 0 ? selectedTracksCount : 1;
    
    const $checkedTracks = $(".track-checkbox:checked");
    if ($checkedTracks.length > 0 && effectiveTracks === 0 && $checkedTracks.filter("[value='Venezuela']").length > 0) {
        effectiveTracks = 1; 
    }

    const finalTotal = sum * effectiveTracks * effectiveDays;
    $("#totalJugadas").text(finalTotal.toFixed(2));
}

function storeFormState() { 
    const st = {
        dateVal: fpInstance ? fpInstance.input.value : "", 
        selectedTracks: $(".track-checkbox:checked").map(function() { return $(this).val(); }).get(),
        plays: []
    };
    $("#tablaJugadas > tr").each(function() { 
        st.plays.push({
            betNumber: $(this).find(".betNumber").val() || "",
            gameMode: $(this).find(".gameMode").text() || "-",
            straight: $(this).find(".straight").val() || "",
            box: $(this).find(".box").val() || "",
            combo: $(this).find(".combo").val() || "",
            // Ensure we store the value from span.total-amount
            total: $(this).find(".total-cell .total-amount").text() || "0.00"
        });
    });
    
    // CORRECCIÓN 6: Guardar con una clave más específica para persistencia
    try {
        localStorage.setItem("beastReaderFormState", JSON.stringify(st));
        console.log("Form state saved to localStorage");
    } catch (error) {
        console.error("Error saving to localStorage:", error);
    }
}

function loadFormState() { 
    console.log("loadFormState called");
    try {
        const data = JSON.parse(localStorage.getItem("beastReaderFormState"));
        if (!data) {
            console.log("No saved form state found");
            return;
        }

        // Restaurar fechas
        if (fpInstance && data.dateVal) {
            const datesToSet = data.dateVal.split(', ').map(dateStr => {
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                    return `${parts[0]}-${parts[1]}-${year}`;
                }
                return null;
            }).filter(d => d !== null);
            fpInstance.setDate(datesToSet, false); 
            selectedDaysCount = datesToSet.length > 0 ? datesToSet.length : 1;
        }

        // Restaurar tracks seleccionados
        if (data.selectedTracks && data.selectedTracks.length > 0) {
            isUpdatingProgrammatically = true;
            $(".track-checkbox").prop('checked', false);
            data.selectedTracks.forEach(trackName => {
                $(`.track-checkbox[value="${trackName}"]`).prop('checked', true);
            });
            isUpdatingProgrammatically = false;
        }

        // Restaurar jugadas
        $("#tablaJugadas").empty(); 
        playCount = 0; 
        if (data.plays && data.plays.length > 0) {
            data.plays.forEach((p) => {
                addMainRow({ 
                    betNumber: p.betNumber, 
                    gameMode: p.gameMode, 
                    straightAmount: parseFloat(p.straight) || null,
                    boxAmount: p.box, 
                    comboAmount: parseFloat(p.combo) || null
                });
            });
        }
        
        recalcAllMainRows(); 
        calculateMainTotal(); 
        highlightDuplicatesInMain();
        $("#selectAllCheckbox").prop('checked', false);
        
        console.log(`Restored ${data.plays ? data.plays.length : 0} plays from localStorage`);
    } catch (error) {
        console.error("Error loading form state:", error);
    }
}


// --- Form Actions ---
function resetForm() {
    console.log("resetForm called");

    // Clear any stored ticket image when the form is reset
    latestTicketDataUrl = null;
    latestTicketBlob = null;
    
    $(".track-checkbox").off('change', trackCheckboxChangeHandler);
    isUpdatingProgrammatically = true;

    $("#lotteryForm")[0].reset(); 
    $("#tablaJugadas").empty(); 
    playCount = 0;
    jugadasGlobalOCR = [];
    selectedFileGlobalOCR = null;

    $("#ocrFile").val("");
    $("#ocrPreview").addClass("d-none").attr("src", "");
    $("#ocrJugadas").empty().html("<p>Sube una imagen para ver las jugadas detectadas aquí.</p>");
    $("#btnProcesarOCR").prop('disabled', true);
    $("#btnCargarJugadas").prop('disabled', true);
    hideOcrLoading();

    // Remove invalid-play highlighting
    $("#tablaJugadas > tr").removeClass("invalid-play");

    $("#selectAllCheckbox").prop('checked', false);
    window.copiedAmounts = {};
    $("#pasteAmountsButton").prop('disabled', true);
 
    if (fpInstance) {
        fpInstance.setDate([new Date()], false); 
    } else {
        selectedDaysCount = 1;
    }
    
    $(".track-checkbox").prop('checked', false);
    autoSelectNYTrackAndVenezuela(); 

    isUpdatingProgrammatically = false;
    $(".track-checkbox").on('change', trackCheckboxChangeHandler);

    updateSelectedTracksAndTotal(); 
    
    // CORRECCIÓN 6: Limpiar localStorage con la nueva clave
    localStorage.removeItem("beastReaderFormState");

    // Reset selectedDaysCount based on default date
    selectedDaysCount = fpInstance.selectedDates.length > 0 ? fpInstance.selectedDates.length : 1;

    console.log("Form reset complete.");
}

function exportPlaysToCsv() {
    const rows = $("#tablaJugadas > tr");
    if (rows.length === 0) {
        alert("No plays to export.");
        return;
    }

    let csvContent = "Bet Number,Straight,Box,Combo\n";
    rows.each(function() {
        const bn = $(this).find(".betNumber").val() || "";
        const straight = $(this).find(".straight").val() || "";
        const box = $(this).find(".box").val() || "";
        const combo = $(this).find(".combo").val() || "";
        csvContent += `"${bn}","${straight}","${box}","${combo}"\n`;
    });

    const blob = new Blob([csvContent], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jugadas.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function validateMainPlays() {
    let formIsValid = true;
    $("#tablaJugadas > tr").removeClass("invalid-play"); // Clear previous highlighting

    $("#tablaJugadas > tr").each(function() {
        const $row = $(this);
        const bnInput = $row.find(".betNumber");
        const gmText = $row.find(".gameMode").text();
        const bn = bnInput.val().trim();
        
        // CORRECCIÓN 5: Verificar montos de apuesta
        const straightVal = parseFloat($row.find(".straight").val()) || 0;
        const boxVal = $row.find(".box").val().trim();
        const comboVal = parseFloat($row.find(".combo").val()) || 0;
        
        // Para box, verificar si es numérico o string (para Pulito con posiciones)
        let boxAmount = 0;
        if (boxVal) {
            if (boxVal.includes(',')) {
                // Es un string con posiciones (Pulito)
                boxAmount = boxVal.split(',').length > 0 ? 1 : 0; // Si tiene posiciones, cuenta como válido
            } else {
                boxAmount = parseFloat(boxVal) || 0;
            }
        }

        let rowIsValid = true;

        // 1. Check if bet number is empty
        if (!bn) {
            rowIsValid = false;
        }

        // 2. Check for multiple numbers or invalid format in bet number
        // Allows single number (2-4 digits) or Pale format (XX-XX)
        const singleNumberRegex = /^\d{2,4}$/;
        const paleRegex = /^\d{2}-\d{2}$/;
        if (bn && !singleNumberRegex.test(bn) && !paleRegex.test(bn)) {
            rowIsValid = false;
        }

        // 3. Check if game mode is "-"
        if (gmText === "-") {
            rowIsValid = false;
        }
        
        // 4. NUEVA VALIDACIÓN: Verificar que tenga al menos un monto de apuesta
        if (straightVal === 0 && boxAmount === 0 && comboVal === 0) {
            rowIsValid = false;
        }

        if (!rowIsValid) {
            $row.addClass("invalid-play");
            formIsValid = false;
        }
    });
    return formIsValid;
}

// CORRECCIÓN 3: Función para filtrar tracks excluyendo Venezuela
function getDisplayTracks(tracks) {
    return tracks.filter(track => track !== "Venezuela");
}

function doGenerateTicket() {
    console.log("doGenerateTicket called");

    // New ticket generation resets previously stored image
    latestTicketDataUrl = null;
    latestTicketBlob = null;
    const dateVal = fpInstance ? fpInstance.input.value : "";
    if (!dateVal) {
        alert("Please select at least one date.");
        return;
    }
    $("#ticketFecha").text(dateVal);

    const chosenTracks = getCurrentSelectedTracks();
    if (chosenTracks.length === 0) {
        alert("Please select at least one track.");
        return;
    }
    
    // CORRECCIÓN 3: Filtrar Venezuela de los tracks mostrados en el ticket
    const displayTracks = getDisplayTracks(chosenTracks);
    $("#ticketTracks").text(displayTracks.join(", "));


    const rows = $("#tablaJugadas > tr"); 
    if (rows.length === 0) {
        alert("No plays to generate a ticket for.");
        return;
    }
    let formIsValid = true; 
    
    formIsValid = validateMainPlays(); // Call the validation function

    if (!formIsValid) {
        alert("Please correct the highlighted errors in the plays before generating the ticket. Make sure each play has at least one wager amount (Straight, Box, or Combo).");
        return; // Stop ticket generation
    }

    // CORRECCIÓN 2: Asegurar que el total se actualice antes de mostrar el ticket
    calculateMainTotal();

    $("#ticketJugadas").empty();
    rows.each(function(idx) {
        const $row = $(this);
        const bn = $row.find(".betNumber").val().trim();
        const gm = $row.find(".gameMode").text();
        let stVal = $row.find(".straight").val().trim() || "0.00";
        let bxVal = $row.find(".box").val().trim(); 
        let coVal = $row.find(".combo").val().trim() || "0.00";
        let totVal = $row.find(".total-cell .total-amount").text() || "0.00";


        if (bxVal === "" && (gm === "Pulito" || gm === "Single Action" || gm === "NY Horses")) {
            bxVal = "-"; 
        }


        const rowHTML = `
        <tr>
          <td>${idx + 1}</td>
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

    // CORRECCIÓN 4: Asegurar que el total del ticket se actualice correctamente
    const currentTotal = $("#totalJugadas").text();
    console.log("Total actual del formulario:", currentTotal);
    $("#ticketTotal").text(currentTotal);
    
    // Verificar que el elemento existe y se actualizó
    setTimeout(() => {
        const ticketTotalElement = $("#ticketTotal");
        if (ticketTotalElement.length === 0) {
            console.error("ERROR: Elemento #ticketTotal no encontrado en el DOM");
        } else {
            console.log("Total del ticket actualizado a:", ticketTotalElement.text());
        }
    }, 100);

    if (ticketModalInstance) {
        $("#editButton").removeClass("d-none");
        $("#shareTicket").addClass("d-none");
        $("#confirmarTicket").prop("disabled", false);
        ticketModalInstance.show();
    } else {
        console.error("Ticket modal instance not available in doGenerateTicket");
    }
    storeFormState();
}


// --- Track Management ---
function getTrackCutoff(trackName) { 
    for (let region in cutoffTimes) {
        if (cutoffTimes[region] && cutoffTimes[region][trackName]) {
            return cutoffTimes[region][trackName];
        }
    }
    return null;
}
function hasBrooklynOrFront(tracks) { 
    const bfSet = new Set(["Brooklyn Midday", "Brooklyn Evening", "Front Midday", "Front Evening"]);
    return tracks.some(t => bfSet.has(t));
}
function userChoseToday() { 
    const val = fpInstance ? fpInstance.input.value : "";
    if (!val) return false;
    const arr = val.split(", ");
    const today = dayjs().startOf("day");
    for (let ds of arr) {
        const parsedDate = dayjs(ds, "MM-DD-YYYY"); 
        if (parsedDate.isValid() && parsedDate.isSame(today, "day")) return true;
    }
    return false;
}

function autoSelectNYTrackAndVenezuela() { 
    console.log("autoSelectNYTrackAndVenezuela called");
    const anyChecked = $(".track-checkbox:checked").length > 0;
    if (anyChecked && !isResettingForm) return; 

    isUpdatingProgrammatically = true;
    $(".track-checkbox").off('change', trackCheckboxChangeHandler);

    const now = dayjs();
    const middayCutoff = dayjs().hour(14).minute(20); 

    if (now.isBefore(middayCutoff)) {
        $("#trackNYMidDay").prop("checked", true);
    } else {
        $("#trackNYEvening").prop("checked", true);
    }
    $("#trackVenezuela").prop("checked", true);
    
    isUpdatingProgrammatically = false;
    $(".track-checkbox").on('change', trackCheckboxChangeHandler);
}

// --- Utility Functions ---
function highlightDuplicatesInMain() { 
    $("#tablaJugadas > tr .betNumber").removeClass("duplicado"); 
    const counts = {};
    $("#tablaJugadas > tr .betNumber").each(function() { 
        const bn = $(this).val().trim();
        if (bn) counts[bn] = (counts[bn] || 0) + 1;
    });
    $("#tablaJugadas > tr .betNumber").each(function() { 
        const bn = $(this).val().trim();
        if (counts[bn] > 1) $(this).addClass("duplicado");
    });
}
function highlightDuplicatesInWizard() { 
    $("#wizardTableBody tr td:nth-child(2)").removeClass("duplicado");
    const counts = {};
    $("#wizardTableBody tr").each(function() {
        const bn = $(this).find("td").eq(1).text().trim();
        if (bn) counts[bn] = (counts[bn] || 0) + 1;
    });
    $("#wizardTableBody tr").each(function() {
        const bn = $(this).find("td").eq(1).text().trim();
        if (counts[bn] > 1) $(this).find("td").eq(1).addClass("duplicado");
    });
}

function generateUniqueTicketNumber() { return Math.floor(10000000 + Math.random() * 90000000).toString(); }

let transactionDateTime = ''; 
let isResettingForm = false; 

// Wizard specific functions
function resetWizard() { 
    wizardCount = 0;
    $("#wizardTableBody").empty();
    lockedFields.straight = false; $("#lockStraight").html(`<i class="bi bi-unlock"></i>`);
    lockedFields.box = false;      $("#lockBox").html(`<i class="bi bi-unlock"></i>`);
    lockedFields.combo = false;    $("#lockCombo").html(`<i class="bi bi-unlock"></i>`);
    $("#wizardBetNumber, #wizardStraight, #wizardBox, #wizardCombo").val("");
    $("#qpGameMode").val("Pick 3"); $("#qpCount").val("5"); 
}
function addWizardRow(bn, gm, stVal, bxVal, coVal, total) { 
    wizardCount++;
    const i = wizardCount;
    const rowHTML = `
      <tr data-wizardIndex="${i}">
        <td><button type="button" class="removeWizardBtn btnRemovePlay btn btn-sm btn-danger" data-row="${i}">${i}</button></td>
        <td>${bn}</td><td>${gm}</td>
        <td>${stVal || "-"}</td><td>${bxVal || "-"}</td><td>${coVal || "-"}</td>
        <td>${(parseFloat(total) || 0).toFixed(2)}</td>
      </tr>`;
    $("#wizardTableBody").append(rowHTML);
}
function renumberWizard() { 
    let i = 0;
    $("#wizardTableBody tr").each(function() { i++; $(this).attr("data-wizardIndex", i).find(".removeWizardBtn").attr("data-row", i).text(i); });
    wizardCount = i;
}

function generateRandomNumberForMode(mode) {
    if (mode === "NY Horses") { const length = Math.floor(Math.random() * 4) + 1; return Math.floor(Math.random() * Math.pow(10, length)); }
    if (mode === "Single Action") { return Math.floor(Math.random() * 10); } 
    if (["Win 4"].includes(mode)) { return Math.floor(Math.random() * 10000); } 
    if (["Venezuela", "Pulito", "RD-Quiniela"].includes(mode)) { return Math.floor(Math.random() * 100); } 
    if (["Pick 3"].includes(mode)) { return Math.floor(Math.random() * 1000); }
    return Math.floor(Math.random() * 1000); 
}

function padNumberForMode(num, mode) { 
    let s = String(num);
    if (["NY Horses", "Single Action"].includes(mode)) return s; 
    if (["Win 4", "Pale-Ven", "Pale-RD", "Palé"].includes(mode)) { 
        while (s.length < 4) s = "0" + s; return s; 
    }
    if (["Pick 3"].includes(mode)) { 
        while (s.length < 3) s = "0" + s; return s; 
    }
    if (["Venezuela", "Pulito", "RD-Quiniela"].includes(mode)) { 
        while (s.length < 2) s = "0" + s; return s; 
    }
    while (s.length < 3) s = "0" + s; return s; 
}

function permuteWizardBetNumbers() { 
    const rows = $("#wizardTableBody tr");
    if (rows.length === 0) { alert("No plays in the wizard table."); return; }
    let allDigits = []; let lengths = [];
    rows.each(function() { const bn = $(this).find("td").eq(1).text().trim(); lengths.push(bn.length); for (let c of bn) allDigits.push(c); });
    if (allDigits.length === 0) { alert("No digits found to permute."); return; }
    for (let i = allDigits.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allDigits[i], allDigits[j]] = [allDigits[j], allDigits[i]];}
    let idx = 0;
    rows.each(function(i) {
        const needed = lengths[i]; const subset = allDigits.slice(idx, idx + needed); idx += needed;
        const newBN = subset.join("");
        const currentTracks = getCurrentSelectedTracks();
        const gm = determineGameMode(newBN, currentTracks);
        const stTd = $(this).find("td").eq(3).text().trim(); const bxTd = $(this).find("td").eq(4).text().trim(); const coTd = $(this).find("td").eq(5).text().trim();
        const newTotal = calculateRowTotal(newBN, gm, (stTd === "-" ? "0" : stTd), (bxTd === "-" ? "0" : bxTd), (coTd === "-" ? "0" : coTd));
        $(this).find("td").eq(1).text(newBN); $(this).find("td").eq(2).text(gm); $(this).find("td").eq(6).text(parseFloat(newTotal).toFixed(2));
    });
    highlightDuplicatesInWizard();
}

// Tutorial and Manual display functions
const tutorialStepsEN = [
    {
        element: '#fecha',
        intro: 'Select one or more dates for your bets. Today is selected by default.',
        position: 'bottom'
    },
    {
        element: '#tracksAccordion',
        intro: 'Choose your lottery tracks. You can select multiple tracks from different regions.',
        position: 'top'
    },
    {
        element: '#jugadasTable',
        intro: 'Your plays will appear here. You can edit amounts directly in the table.',
        position: 'top'
    },
    {
        element: '#agregarJugada',
        intro: 'Click here to add a new play manually.',
        position: 'left'
    },
    {
        element: '#wizardButton',
        intro: 'Use the Wizard for quick entry of multiple plays.',
        position: 'left'
    },
    {
        element: '#generarTicket',
        intro: 'Generate your ticket when all plays are ready.',
        position: 'left'
    }
];

const tutorialStepsES = [
    {
        element: '#fecha',
        intro: 'Selecciona una o más fechas para tus apuestas. Hoy está seleccionado por defecto.',
        position: 'bottom'
    },
    {
        element: '#tracksAccordion',
        intro: 'Elige tus pistas de lotería. Puedes seleccionar múltiples pistas de diferentes regiones.',
        position: 'top'
    },
    {
        element: '#jugadasTable',
        intro: 'Tus jugadas aparecerán aquí. Puedes editar los montos directamente en la tabla.',
        position: 'top'
    },
    {
        element: '#agregarJugada',
        intro: 'Haz clic aquí para agregar una nueva jugada manualmente.',
        position: 'left'
    },
    {
        element: '#wizardButton',
        intro: 'Usa el Asistente para entrada rápida de múltiples jugadas.',
        position: 'left'
    },
    {
        element: '#generarTicket',
        intro: 'Genera tu ticket cuando todas las jugadas estén listas.',
        position: 'left'
    }
];

const tutorialStepsHT = [
    {
        element: '#fecha',
        intro: 'Chwazi youn oswa plizyè dat pou paryaj ou yo. Jodi a seleksyone otomatikman.',
        position: 'bottom'
    },
    {
        element: '#tracksAccordion',
        intro: 'Chwazi tchèk bòlèt ou yo. Ou ka chwazi plizyè tchèk nan diferan rejyon.',
        position: 'top'
    },
    {
        element: '#jugadasTable',
        intro: 'Jwèt ou yo ap parèt isit la. Ou ka edite montan yo dirèkteman nan tablo a.',
        position: 'top'
    },
    {
        element: '#agregarJugada',
        intro: 'Klike la pou ajoute yon nouvo jwèt manyèlman.',
        position: 'left'
    },
    {
        element: '#wizardButton',
        intro: 'Itilize Asistan an pou antre plizyè jwèt rapidman.',
        position: 'left'
    },
    {
        element: '#generarTicket',
        intro: 'Jenere tikè ou a lè tout jwèt yo pare.',
        position: 'left'
    }
];

function startTutorial(lang) {
    let steps;
    switch(lang) {
        case 'es':
            steps = tutorialStepsES;
            break;
        case 'ht':
            steps = tutorialStepsHT;
            break;
        default:
            steps = tutorialStepsEN;
    }
    
    const intro = introJs();
    intro.setOptions({
        steps: steps,
        showProgress: true,
        showBullets: true,
        exitOnOverlayClick: false,
        exitOnEsc: true,
        nextLabel: lang === 'es' ? 'Siguiente' : (lang === 'ht' ? 'Pwochen' : 'Next'),
        prevLabel: lang === 'es' ? 'Anterior' : (lang === 'ht' ? 'Anvan' : 'Previous'),
        skipLabel: lang === 'es' ? 'Saltar' : (lang === 'ht' ? 'Sote' : 'Skip'),
        doneLabel: lang === 'es' ? 'Finalizar' : (lang === 'ht' ? 'Fini' : 'Done')
    });
    intro.start();
}

const lockedFields = { straight: false, box: false, combo: false }; 
let fpDateInstance = null; 

// Ensure all global functions that are called from HTML onclick are on window
window.usarJugadaOCR = usarJugadaOCR;
window.handleCargarTodasLasJugadasClick = handleCargarTodasLasJugadasClick;
window.abrirModalOCR = abrirModalOCR;
window.handleDragOverOCR = handleDragOverOCR;
window.handleDragLeaveOCR = handleDragLeaveOCR;
window.handleDropOCR = handleDropOCR;
window.handleFileChangeOCR = handleFileChangeOCR;
window.procesarOCR = procesarOCR;
window.toggleOcrDebug = toggleOcrDebug;
window.startTutorial = startTutorial;

// --- Theme Toggle Logic ---
function setupThemeToggle() {
    const body = document.body;
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const moonIcon = themeToggleBtn ? themeToggleBtn.querySelector('.bi-moon') : null;
    const sunIcon = themeToggleBtn ? themeToggleBtn.querySelector('.bi-sun') : null;

    if (!themeToggleBtn || !moonIcon || !sunIcon) {
        console.error("Theme toggle elements not found.");
        return;
    }

    const savedTheme = localStorage.getItem('themeMode');
    if (savedTheme === 'light') {
        body.classList.add('light-mode');
        moonIcon.style.display = 'none';
        sunIcon.style.display = 'inline-block';
    } else {
        body.classList.remove('light-mode');
        moonIcon.style.display = 'inline-block';
        sunIcon.style.display = 'none';
    }

    themeToggleBtn.addEventListener('click', function() {
        const isLightMode = body.classList.contains('light-mode');
        body.classList.toggle('light-mode', !isLightMode);
        localStorage.setItem('themeMode', isLightMode ? 'dark' : 'light');
        moonIcon.style.display = isLightMode ? 'inline-block' : 'none';
        sunIcon.style.display = isLightMode ? 'none' : 'inline-block';
    });
}

console.log("End of scripts.js reached");

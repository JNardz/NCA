/* ==================================================
   INTAKE PROCESS (SAVE & GENERATE RECEIPT)
   ================================================== */
function processIntakeForm(formData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
  
  try {
    // 1. Validation
    if (!formData.consignorId || !formData.name) throw new Error("Consignor is required.");
    if (!formData.auctionId) throw new Error("Target Auction is required.");
    
    // 2. Handle Items
    const currentAuction = formData.auctionId;
    let newRows = [];
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy");

    const existingIds = new Set(dbInv.getDataRange().getValues().map(r => String(r[0])));
    formData.items.forEach(item => {
      const primaryImage = item.img1 || item.img2 || item.img3 || "";
      let noteText = item.notes || "";
      
      const initialNotes = [
         {text: "CREATED [SYSTEM]", time: timestamp, user: formData.user || "Intake"}
      ];
      if(noteText) initialNotes.push({text: noteText, time: timestamp, user: formData.user || "Intake"});

      let invId;
      do { invId = Math.floor(Math.random() * 90000000) 
 
        + 10000000; } while (existingIds.has(String(invId)));
      existingIds.add(String(invId));
      
      // Store ID back into item object for Frontend Label Generation
      item.generatedId = invId; 

      const lotNumber = ""; 
      
      newRows.push([
        invId, currentAuction, formData.consignorId, "", item.year, item.make, item.model, item.vin, "", 
        item.desc, item.title, "", item.reserve, 
        "", primaryImage, 
        JSON.stringify(initialNotes), "Active", timestamp, lotNumber, item.lotType
      ]);
    });
    if (newRows.length > 0) {
      dbInv.getRange(dbInv.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    } else {
      return { success: false, message: "No items added." };
    }

    return { 
      success: true, 
      message: `Saved ${newRows.length} items to Auction ${currentAuction}.`,
      receiptData: formData // Now contains items with .generatedId
    };
  } catch (err) {
    return { success: false, message: "Database Error: " + err.message };
  }
}

// UPDATED: Correctly appends images to existing list
function addImagesToLot(lotId, newUrls) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
  const data = dbInv.getDataRange().getValues();
  
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(lotId)) {
      // Column 15 is index 14
      const currentImagesStr = String(data[i][14] || "");
      let imageList = currentImagesStr ? currentImagesStr.split(',') : [];
      
      // Handle input being either array or single string
      if (Array.isArray(newUrls)) {
        imageList = imageList.concat(newUrls);
      } else if (newUrls) {
        imageList.push(newUrls);
      }
      
      // Filter empty and duplicates
      imageList = [...new Set(imageList.filter(url => url && url.trim() !== ""))];
      // Save back as comma-separated string
      // getRange(row, col) -> row is i+1, col is 15 (O)
      dbInv.getRange(i + 1, 15).setValue(imageList.join(','));
      return "Images Saved";
    }
  }
  throw new Error("Lot not found");
}

/* ==================================================
   LABEL GENERATION
   ================================================== */
function createLabelSheet(lotIds) {
  // lotIds can be a single string or an array of strings
  if (!Array.isArray(lotIds)) lotIds = [lotIds];
  if (lotIds.length === 0) throw new Error("No IDs provided for labels.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const template = ss.getSheetByName(CONFIG.SHEETS.TEMPLATE_LABEL);
  const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
  const dbAuc = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
  
  if (!template) throw new Error("Template_Label_Inventory missing.");
  // 1. Fetch Data
  const invData = dbInv.getDataRange().getValues();
  const aucData = dbAuc ? dbAuc.getDataRange().getValues() : [];
  // 2. Prepare Temporary Sheet
  const timestamp = new Date().getTime();
  const labelSheetName = `Labels_${timestamp}`;
  let labelSheet = template.copyTo(ss).setName(labelSheetName);
  // Helper to find Item Data
  const getItem = (id) => {
    for(let i=1; i<invData.length; i++) {
      if(String(invData[i][0]) === String(id)) {
        return {
          id: invData[i][0],
          aucId: invData[i][1],
          conId: invData[i][2],
          vin: invData[i][7], // Index 7 is VIN
          desc: invData[i][9] // Index 9 is Description/Item Name
        };
      }
    }
    return null;
  };
  // Helper to get Auction Date String
  const getAuctionHeader = (aucId) => {
    for(let i=1; i<aucData.length; i++) {
      if(String(aucData[i][0]) === String(aucId)) {
        const d1 = new Date(aucData[i][2]);
        // Start
        const d2 = new Date(aucData[i][3]);
        // End
        const f1 = Utilities.formatDate(d1, Session.getScriptTimeZone(), "M/d");
        const f2 = Utilities.formatDate(d2, Session.getScriptTimeZone(), "M/d");
        
        if (f1 === f2) return `AUCTION ${f1}`;
        return `AUCTION ${f1}-${f2}`;
      }
    }
    return "AUCTION";
  };

  // 3. Generate Labels
  const templateRange = template.getDataRange();
  const numRows = templateRange.getNumRows();
  const spacing = 1; // Number of empty rows between labels

  // Capture Template Row Heights
  const rowHeights = [];
  for (let r = 1; r <= numRows; r++) {
    rowHeights.push(template.getRowHeight(r));
  }
  
  for (let k = 0; k < lotIds.length; k++) {
    const item = getItem(lotIds[k]);
    if (!item) continue;

    let startRow = 1 + (k * (numRows + spacing));
    // Copy formatting if not first item
    if (k > 0) {
      templateRange.copyTo(labelSheet.getRange(startRow, 1));
    }

    // FORCE ROW HEIGHTS
    for (let h = 0; h < numRows; h++) {
        labelSheet.setRowHeight(startRow + h, rowHeights[h]);
    }

    // Prepare Data
    const headerTxt = getAuctionHeader(item.aucId);
    const conTxt = "C-" + item.conId;
    const invTxt = "INV# " + item.id;
    const itemName = item.desc || "";
    const vinTxt = item.vin ? "VIN/SN: " + item.vin : "";
    
    // Barcode URL (Code 128)
    const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${item.id}&scale=3&height=6`;
    // Fill Cells (Adjusting for offset)
    const colMap = { A:1, B:2, C:3, D:4, E:5, F:6, G:7 };
    const setCell = (def, val, isFormula) => {
       if(!def) return;
       const colChar = def.charAt(0);
       const rowNum = parseInt(def.substring(1));
       const actualRow = startRow + rowNum - 1;
       const cell = labelSheet.getRange(actualRow, colMap[colChar]);
       if(isFormula) cell.setFormula(val);
       else cell.setValue(val);
    };

    setCell(CONFIG.LABEL.CELL_HEADER, headerTxt, false);
    setCell(CONFIG.LABEL.CELL_CON, conTxt, false);
    setCell(CONFIG.LABEL.CELL_INV, invTxt, false);
    setCell(CONFIG.LABEL.CELL_BARCODE, `=IMAGE("${barcodeUrl}")`, true);
    setCell(CONFIG.LABEL.CELL_ITEM_NAME, itemName, false);
    setCell(CONFIG.LABEL.CELL_VIN, vinTxt, false);
  }

  SpreadsheetApp.flush();
  // 4. Export PDF
  const pdfUrl = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?format=pdf&gid=" + labelSheet.getSheetId() + "&size=letter&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false&pagenum=UNDEFINED&attachment=false";
  return { url: pdfUrl, sheetName: labelSheetName };
}

function createReceiptSheet(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const template = ss.getSheetByName(CONFIG.SHEETS.TEMPLATE);
  const dbRcpt = ss.getSheetByName(CONFIG.SHEETS.DB_RCPT);
  if (!template) throw new Error("Template_Receipt missing.");
  
  // REMOVED FORMATTING LOGIC:
  let formattedId = data.consignorId;
  let formattedPhone = String(data.phone || "").replace(/\D/g, '');
  if (formattedPhone.length === 10) formattedPhone = formattedPhone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
  const timestamp = new Date().getTime();
  const sheetName = `Rcpt_${data.consignorId}_${timestamp}`;
  const newSheet = template.copyTo(ss).setName(sheetName);
  newSheet.getRange(CONFIG.RECEIPT.CELL_DATE).setValue(new Date());
  newSheet.getRange(CONFIG.RECEIPT.CELL_NUM).setValue(formattedId);
  newSheet.getRange(CONFIG.RECEIPT.CELL_NAME).setValue(data.name);
  newSheet.getRange(CONFIG.RECEIPT.CELL_ADDR).setValue(data.address);
  newSheet.getRange(CONFIG.RECEIPT.CELL_PHONE).setValue(formattedPhone);
  data.items.forEach((item, index) => {
    const currentRow = CONFIG.RECEIPT.START_ROW + index;
    if (currentRow > CONFIG.RECEIPT.MAX_ROW) return; 
    let parts = [];
    if(item.lotType === "Vehicle" || item.lotType === "Heavy Machinery") {
       parts = [item.year, item.make, item.model].filter(x => x && String(x).trim() !== "");
    } else {
       parts = [item.desc].filter(x => x && String(x).trim() !== "");
    }
    let finalDesc = parts.join(" ");
    if (item.vin) finalDesc += " SN/VIN: " + item.vin;
    newSheet.getRange(currentRow, CONFIG.RECEIPT.COL_DESC).setValue(finalDesc);
    newSheet.getRange(currentRow, CONFIG.RECEIPT.COL_NOTES).setValue(item.notes || "");
    newSheet.getRange(currentRow, CONFIG.RECEIPT.COL_TITLE).setValue(item.title || "");
    if (item.reserve) {
       newSheet.getRange(currentRow, CONFIG.RECEIPT.COL_RESERVE).setValue(item.reserve).setNumberFormat('$#,##0').setBackground("#4b0000").setFontColor("white").setFontWeight("bold");
    }
  });
  // INSERT SIGNATURE AND NAME
  if(data.signatureName) {
      newSheet.getRange(CONFIG.RECEIPT.CELL_SIGN_NAME).setValue(data.signatureName);
  }
  if(data.signatureImage) {
      try {
          var base64 = data.signatureImage.split(',')[1];
          var decoded = Utilities.base64Decode(base64);
          var blob = Utilities.newBlob(decoded, 'image/png', 'signature.png');
          newSheet.insertImage(blob, CONFIG.RECEIPT.CELL_SIGN_IMAGE_COL, CONFIG.RECEIPT.CELL_SIGN_IMAGE_ROW);
      } catch(e) {
          console.error("Sig error: " + e);
      }
  }

  SpreadsheetApp.flush(); 
  const pdfUrl = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?format=pdf&gid=" + newSheet.getSheetId() + "&size=letter&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false&pagenum=UNDEFINED&attachment=false";
  if (dbRcpt) { dbRcpt.appendRow(["RCPT-" + timestamp, data.consignorId, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy"), pdfUrl, sheetName]);
  }
  return { url: pdfUrl, sheetName: sheetName };
}

function deleteReceiptSheet(sheetName) { try { const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName); if (sheet) ss.deleteSheet(sheet); return "Cleaned up";
  } catch (e) { return "Error cleaning up: " + e.message;
  } }

// UPDATED: Return High Quality View URL
function uploadIntakeImage(data) { 
  try { 
    const folders = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
    let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.FOLDER_NAME); 
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); 
    const bytes = Utilities.base64Decode(data.substr(data.indexOf('base64,') + 7));
    const blob = Utilities.newBlob(bytes, data.substring(5, data.indexOf(';')), "intake_" + new Date().getTime() + ".jpg"); 
    const file = folder.createFile(blob);
    // Return View URL
    return "https://drive.google.com/uc?export=view&id=" + file.getId(); 
  } catch (e) { return "ERROR: " + e.toString();
  } 
}
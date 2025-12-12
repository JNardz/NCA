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
      do { invId = Math.floor(Math.random() * 90000000) + 10000000; } while (existingIds.has(String(invId)));
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
      const currentImagesStr = String(data[i][14] || "");
      let imageList = currentImagesStr ? currentImagesStr.split(',') : [];
      
      if (Array.isArray(newUrls)) {
        imageList = imageList.concat(newUrls);
      } else if (newUrls) {
        imageList.push(newUrls);
      }
      
      imageList = [...new Set(imageList.filter(url => url && url.trim() !== ""))];
      dbInv.getRange(i + 1, 15).setValue(imageList.join(','));
      return "Images Saved";
    }
  }
  throw new Error("Lot not found");
}

/* ==================================================
   RECEIPT GENERATION (Merch_Receipt_Template)
   ================================================== */
function createReceiptSheet(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const template = ss.getSheetByName(CONFIG.SHEETS.TEMPLATE_RECEIPT);
  
  if (!template) throw new Error("Template sheet '" + CONFIG.SHEETS.TEMPLATE_RECEIPT + "' is missing.");

  // 1. Prepare Data
  const timestamp = new Date().getTime();
  const currentDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy");
  
  // Format Name: [BUSINESS]/[NAME] or just one if the other is missing
  let headerName = data.name || "";
  if (data.business && data.business.trim() !== "") {
    if (data.name && data.name.trim() !== "") {
      headerName = `${data.business}/${data.name}`;
    } else {
      headerName = data.business;
    }
  }

  // Define Rows for Items
  const ITEM_ROWS = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
  const ITEMS_PER_PAGE = ITEM_ROWS.length; // 13 items

  // 2. Chunk Items into Pages
  const items = data.items || [];
  let pages = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
    pages.push(items.slice(i, i + ITEMS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]); // Ensure at least one page if no items

  // 3. Create Temporary Spreadsheet for PDF generation
  const tempSpreadsheet = SpreadsheetApp.create("Temp_Receipt_" + data.consignorId);
  const tempId = tempSpreadsheet.getId();
  
  try {
    pages.forEach((pageItems, pageIndex) => {
      // Copy Template to Temp Spreadsheet
      const sheetName = `Page_${pageIndex + 1}`;
      const newSheet = template.copyTo(tempSpreadsheet).setName(sheetName);
      
      // --- HEADER (All Pages) ---
      // B2: Consignor ID "C-[ID]"
      newSheet.getRange("B2").setValue("C-" + data.consignorId);
      
      // B3: Name
      newSheet.getRange("B3").setValue(headerName);
      
      // B4/B5: Address/Phone Logic
      if (data.address && data.address.trim() !== "") {
        newSheet.getRange("B4").setValue(data.address);
        newSheet.getRange("B5").setValue(data.phone || "");
      } else {
        newSheet.getRange("B4").setValue(data.phone || "");
        newSheet.getRange("B5").clearContent();
      }
      
      // E5: Date
      newSheet.getRange("E5").setValue(currentDate);

      // --- ITEMS (All Pages) ---
      ITEM_ROWS.forEach((r, idx) => {
        const item = pageItems[idx];
        if (item) {
          // A: Title
          newSheet.getRange(r, 1).setValue(item.title || "");
          // B: Inv ID
          newSheet.getRange(r, 2).setValue("#" + item.generatedId);
          // C: Item Name
          newSheet.getRange(r, 3).setValue(item.desc || "");
          // D: VIN/SN
          newSheet.getRange(r, 4).setValue(item.vin || ""); 
          // E: Reserve
          newSheet.getRange(r, 5).setValue(item.reserve || "");
        } else {
          // Clear unused row AND the row below it (spacer/notes)
          // Rows are 1-indexed. getRange(row, col, numRows, numCols)
          // Clearing Col A to E (5 columns)
          newSheet.getRange(r, 1, 1, 5).clearContent();     // Clear Item Row
          newSheet.getRange(r + 1, 1, 1, 5).clearContent(); // Clear Row Below
        }
      });

      // --- FOOTER & SIGNATURE (All Pages) ---
      // A38: Logged in User
      newSheet.getRange("A38").setValue(data.user || "");
      
      // C38: Owner/Agent Name
      newSheet.getRange("C38").setValue(data.signatureName || "");
      
      // D36: Signature Image
      if (data.signatureImage) {
        try {
          var base64 = data.signatureImage.split(',')[1];
          var decoded = Utilities.base64Decode(base64);
          var blob = Utilities.newBlob(decoded, 'image/png', 'signature.png');
          var img = SpreadsheetApp.newCellImage().setSource(blob).build();
          newSheet.getRange("D36").setValue(img);
        } catch (e) {
          console.error("Sig Error", e);
        }
      }
    });

    // Remove the default "Sheet1" from temp spreadsheet so it doesn't print
    const defaultSheet = tempSpreadsheet.getSheetByName("Sheet1");
    if (defaultSheet) tempSpreadsheet.deleteSheet(defaultSheet);

    SpreadsheetApp.flush();

    // 4. Export PDF
    const pdfBlob = DriveApp.getFileById(tempId).getAs('application/pdf');
    const pdfName = `Rcpt_${data.consignorId}_${timestamp}.pdf`;
    pdfBlob.setName(pdfName);

    // 5. Save to Drive
    const folders = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const file = folder.createFile(pdfBlob);
    const pdfUrl = file.getUrl();

    // 6. Cleanup Temp Sheet
    DriveApp.getFileById(tempId).setTrashed(true);

    // 7. Log to DB
    const dbRcpt = ss.getSheetByName(CONFIG.SHEETS.DB_RCPT);
    if (dbRcpt) { 
      dbRcpt.appendRow([
        "RCPT-" + timestamp, 
        data.consignorId, 
        currentDate, 
        pdfUrl, 
        pdfName
      ]);
    }

    return { url: pdfUrl, sheetName: "PDF" };

  } catch (e) {
    // Attempt to trash temp file if error occurs
    try { DriveApp.getFileById(tempId).setTrashed(true); } catch(x) {}
    throw e;
  }
}

function deleteReceiptSheet(sheetName) { 
  // No-op for main sheet as we used a temp file
  return "Cleaned up";
}

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
        const d2 = new Date(aucData[i][3]);
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

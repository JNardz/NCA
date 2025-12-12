/* ==================================================
   INTAKE PROCESS (SAVE & GENERATE RECEIPT)
   ================================================== */
function processIntakeForm(formData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
  
  try {
    if (!formData.consignorId || !formData.name) throw new Error("Consignor is required.");
    if (!formData.auctionId) throw new Error("Target Auction is required.");
    
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
      receiptData: formData 
    };
  } catch (err) {
    return { success: false, message: "Database Error: " + err.message };
  }
}

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
  
  let headerName = data.name || "";
  if (data.business && data.business.trim() !== "") {
    if (data.name && data.name.trim() !== "") {
      headerName = `${data.business}/${data.name}`;
    } else {
      headerName = data.business;
    }
  }

  const ITEM_ROWS = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
  const ITEMS_PER_PAGE = ITEM_ROWS.length; // 13

  // 2. Chunk Items
  const items = data.items || [];
  let pages = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
    pages.push(items.slice(i, i + ITEMS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]); 

  // 3. Create Temp Spreadsheet
  const tempSpreadsheet = SpreadsheetApp.create("Temp_Receipt_" + data.consignorId);
  const tempId = tempSpreadsheet.getId();
  
  try {
    pages.forEach((pageItems, pageIndex) => {
      const isLastPage = (pageIndex === pages.length - 1);
      
      const sheetName = `Page_${pageIndex + 1}`;
      const newSheet = template.copyTo(tempSpreadsheet).setName(sheetName);
      
      // HIDE GRIDLINES
      newSheet.setHiddenGridlines(true);

      // --- FILL HEADER ---
      newSheet.getRange("B2").setValue("C-" + data.consignorId);
      newSheet.getRange("B3").setValue(headerName);
      
      if (data.address && data.address.trim() !== "") {
        newSheet.getRange("B4").setValue(data.address);
        newSheet.getRange("B5").setValue(data.phone || "");
      } else {
        newSheet.getRange("B4").setValue(data.phone || "");
        newSheet.getRange("B5").clearContent();
      }
      newSheet.getRange("E5").setValue(currentDate);

      // --- FILL ITEMS ---
      ITEM_ROWS.forEach((r, idx) => {
        const item = pageItems[idx];
        if (item) {
          newSheet.getRange(r, 1).setValue(item.title || "");
          newSheet.getRange(r, 2).setValue("#" + item.generatedId);
          newSheet.getRange(r, 3).setValue(item.desc || "");
          newSheet.getRange(r, 4).setValue(item.vin || ""); 
          newSheet.getRange(r, 5).setValue(item.reserve || "");
        } else {
          // Clear unused row
          newSheet.getRange(r, 1, 1, 5).clearContent(); 
          // Clear row below (Safety check for dimensions)
          if (r + 1 <= newSheet.getMaxRows()) {
             newSheet.getRange(r + 1, 1, 1, 5).clearContent(); 
          }
        }
      });

      // --- FOOTER (Last Page Only) ---
      if (isLastPage) {
        newSheet.getRange("A38").setValue(data.user || "");
        newSheet.getRange("C38").setValue(data.signatureName || "");
        
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
      } else {
        newSheet.getRange("A38").clearContent();
        newSheet.getRange("C38").clearContent();
        newSheet.getRange("D36").clearContent();
      }
    });

    const defaultSheet = tempSpreadsheet.getSheetByName("Sheet1");
    if (defaultSheet) tempSpreadsheet.deleteSheet(defaultSheet);

    SpreadsheetApp.flush();

    // 4. Export PDF using URL Fetch (For Custom Margins & Fit to Page)
    const exportUrl = "https://docs.google.com/spreadsheets/d/" + tempId + 
      "/export?format=pdf" +
      "&size=letter" +
      "&portrait=true" +
      "&scale=4" +           // 4 = Fit to Page
      "&gridlines=false" +   // No Gridlines
      "&printtitle=false" +
      "&sheetnames=false" +
      "&pagenum=UNDEFINED" +
      "&attachment=false" +
      "&top_margin=0.25" +   // Narrow Margins
      "&bottom_margin=0.25" +
      "&left_margin=0.25" +
      "&right_margin=0.25";

    const pdfBlob = UrlFetchApp.fetch(exportUrl, {
      headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() }
    }).getBlob().setName(`Rcpt_${data.consignorId}_${timestamp}.pdf`);

    // 5. Save & Clean
    const folders = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const file = folder.createFile(pdfBlob);
    const pdfUrl = file.getUrl();

    DriveApp.getFileById(tempId).setTrashed(true);

    const dbRcpt = ss.getSheetByName(CONFIG.SHEETS.DB_RCPT);
    if (dbRcpt) { 
      dbRcpt.appendRow([
        "RCPT-" + timestamp, 
        data.consignorId, 
        currentDate, 
        pdfUrl, 
        file.getName()
      ]);
    }

    return { url: pdfUrl, sheetName: "PDF" };

  } catch (e) {
    try { DriveApp.getFileById(tempId).setTrashed(true); } catch(x) {}
    throw e;
  }
}

function deleteReceiptSheet(sheetName) { 
  return "Cleaned up";
}

function createLabelSheet(lotIds) {
  if (!Array.isArray(lotIds)) lotIds = [lotIds];
  if (lotIds.length === 0) throw new Error("No IDs provided for labels.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const template = ss.getSheetByName(CONFIG.SHEETS.TEMPLATE_LABEL);
  const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
  const dbAuc = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
  
  if (!template) throw new Error("Template_Label_Inventory missing.");
  const invData = dbInv.getDataRange().getValues();
  const aucData = dbAuc ? dbAuc.getDataRange().getValues() : [];
  const timestamp = new Date().getTime();
  const labelSheetName = `Labels_${timestamp}`;
  let labelSheet = template.copyTo(ss).setName(labelSheetName);

  const getItem = (id) => {
    for(let i=1; i<invData.length; i++) {
      if(String(invData[i][0]) === String(id)) {
        return {
          id: invData[i][0],
          aucId: invData[i][1],
          conId: invData[i][2],
          vin: invData[i][7], 
          desc: invData[i][9] 
        };
      }
    }
    return null;
  };

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

  const templateRange = template.getDataRange();
  const numRows = templateRange.getNumRows();
  const spacing = 1; 
  const rowHeights = [];
  for (let r = 1; r <= numRows; r++) { rowHeights.push(template.getRowHeight(r)); }
  
  for (let k = 0; k < lotIds.length; k++) {
    const item = getItem(lotIds[k]);
    if (!item) continue;
    let startRow = 1 + (k * (numRows + spacing));
    if (k > 0) templateRange.copyTo(labelSheet.getRange(startRow, 1));
    for (let h = 0; h < numRows; h++) { labelSheet.setRowHeight(startRow + h, rowHeights[h]); }

    const headerTxt = getAuctionHeader(item.aucId);
    const conTxt = "C-" + item.conId;
    const invTxt = "INV# " + item.id;
    const itemName = item.desc || "";
    const vinTxt = item.vin ? "VIN/SN: " + item.vin : "";
    const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${item.id}&scale=3&height=6`;
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
    return "https://drive.google.com/uc?export=view&id=" + file.getId(); 
  } catch (e) { return "ERROR: " + e.toString();
  } 
}

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
  
  // LOGIC FIX: Name Formatting
  // If Business exists, check if 'name' is just a copy of 'business' (which happens if personal name was blank)
  let headerName = data.name || "";
  if (data.business && data.business.trim() !== "") {
    if (data.name && data.name.trim() !== "" && data.name !== data.business) {
      // Both exist and are different -> "[BUSINESS]/[NAME]"
      headerName = `${data.business}/${data.name}`;
    } else {
      // Only business exists, or name is duplicate of business -> "[BUSINESS]"
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
      
      // D36: Signature Image (Last Page Only logic removed per request to have on every page, 
      // BUT typically signatures are only needed once. 
      // However, prompt said "signatures and consignor data on every page".
      // We will place it on every page.)
      
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

      // LOGIC ADDITION: Page Numbering in Cell E41
      newSheet.getRange("E41").setValue(`Page ${pageIndex + 1}/${pages.length}`);
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

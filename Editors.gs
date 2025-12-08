/* ==================================================
   EDITORS (SAVE DATA & NOTES)
   ================================================== */

function createNewConsignor(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbCon = ss.getSheetByName(CONFIG.SHEETS.DB_CON);
  const rows = dbCon.getDataRange().getValues();
  let maxId = 0;
  for (let i = 1; i < rows.length; i++) {
    const val = parseInt(String(rows[i][0]).replace(/\D/g, ''));
    if (!isNaN(val) && val > maxId) maxId = val;
  }
  const newId = maxId + 1;
  const initNote = JSON.stringify([{text: "CREATED [SYSTEM]", time: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd HH:mm"), user: data.user || "Admin"}]);
  dbCon.appendRow([newId, data.name, data.address, data.phone, data.email, initNote, data.businessName]);
  return { success: true, id: newId, name: data.name };
}

function saveLotChanges(lotId, u) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
  const dbAuc = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
  const data = dbInv.getDataRange().getValues();
  
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(lotId)) {
      const r = i + 1;
      
      dbInv.getRange(r, 4).setValue(u.type);
      dbInv.getRange(r, 5).setValue(u.year);
      dbInv.getRange(r, 6).setValue(u.make);
      dbInv.getRange(r, 7).setValue(u.model);
      dbInv.getRange(r, 8).setValue(u.vin);
      dbInv.getRange(r, 9).setValue(u.mileage);
      dbInv.getRange(r, 10).setValue(u.desc);
      dbInv.getRange(r, 11).setValue(u.title);
      dbInv.getRange(r, 12).setValue(u.payment);
      dbInv.getRange(r, 13).setValue(u.reserve);
      dbInv.getRange(r, 14).setValue(u.transporter);
      
      // NEW LOT NUMBER LOGIC (Stored in Auction Sheet)
      if (u.lotNumber !== undefined) {
         const currentAuctionId = data[i][1];
         // Only proceed if there is an active auction associated
         if (dbAuc && currentAuctionId) {
           const aucData = dbAuc.getDataRange().getValues();
           let aucRowIndex = -1;
           let lotMap = {};
           
           for(let a=1; a<aucData.length; a++) {
             if(String(aucData[a][0]) === String(currentAuctionId)) {
               aucRowIndex = a + 1;
               try { lotMap = JSON.parse(aucData[a][7] || "{}"); } catch(e){} // Col 8 is index 7
               break;
             }
           }
           
           if(aucRowIndex > -1) {
              lotMap[lotId] = u.lotNumber;
              dbAuc.getRange(aucRowIndex, 8).setValue(JSON.stringify(lotMap));
           }
         }
      }
      return "Saved Successfully";
    }
  }
  return "Error: Lot not found";
}

// NEW: SAVE IMAGES (For Reordering/Deletion)
function saveLotImages(lotId, imageListArray) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
  const data = dbInv.getDataRange().getValues();
  
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(lotId)) {
      // Join array back to comma-separated string
      const imageStr = imageListArray.join(',');
      dbInv.getRange(i + 1, 15).setValue(imageStr); // Col 15 is Images
      return "Images Updated";
    }
  }
  throw new Error("Lot not found for image update");
}

function saveConsignorChanges(conId, u) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbCon = ss.getSheetByName(CONFIG.SHEETS.DB_CON);
  const data = dbCon.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(conId)) {
      dbCon.getRange(i + 1, 2, 1, 4).setValues([[u.name, u.address, u.phone, u.email]]);
      return "Saved";
    }
  }
  return "Error";
}

function saveAuctionChanges(aucId, u) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbAuc = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
  const data = dbAuc.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(aucId)) {
      const r = i + 1;
      dbAuc.getRange(r, 2).setValue(u.name);
      dbAuc.getRange(r, 3).setValue(u.dateStart);
      dbAuc.getRange(r, 4).setValue(u.dateEnd);
      dbAuc.getRange(r, 5).setValue(u.location);
      dbAuc.getRange(r, 6).setValue(u.desc);
      return "Saved";
    }
  }
  return "Error: Auction not found";
}

function addLotNote(lotId, txt, username) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
  const data = dbInv.getDataRange().getValues();
  const currentUser = username || "Admin"; 
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(lotId)) {
      let notes = []; try { notes = JSON.parse(data[i][15]||'[]'); } catch(e){}
      notes.push({text: txt, time: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd HH:mm"), user: currentUser});
      dbInv.getRange(i + 1, 16).setValue(JSON.stringify(notes));
      return JSON.stringify(notes);
    }
  }
}

function addConsignorNote(conId, txt, username) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbCon = ss.getSheetByName(CONFIG.SHEETS.DB_CON);
  const data = dbCon.getDataRange().getValues();
  const currentUser = username || "Admin";
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(conId)) {
      let notes = []; try { notes = JSON.parse(data[i][5]||'[]'); } catch(e){}
      notes.push({text: txt, time: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd HH:mm"), user: currentUser});
      dbCon.getRange(i + 1, 6).setValue(JSON.stringify(notes));
      return JSON.stringify(notes);
    }
  }
}

function getNextAuctionId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
  if (!sheet) { 
    sheet = ss.insertSheet(CONFIG.SHEETS.DB_AUC);
    sheet.appendRow(["ID", "Name", "DateStart", "DateEnd", "Location", "Description", "Status", "LotMap"]);
    return 100; 
  }
  const data = sheet.getDataRange().getValues();
  let maxId = 0;
  for (let i = 1; i < data.length; i++) {
    const val = parseInt(String(data[i][0]).replace(/\D/g, ''));
    if (!isNaN(val) && val > maxId) maxId = val;
  }
  return maxId === 0 ? 100 : maxId + 1; 
}

function submitNewAuction(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbAuc = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
  const existing = dbAuc.getDataRange().getValues();
  for(let i=1; i<existing.length; i++) {
    if(String(existing[i][0]) === String(data.id)) {
       throw new Error("Auction ID " + data.id + " already exists.");
    }
  }
  dbAuc.appendRow([data.id, data.name, data.dateStart, data.dateEnd, data.location, data.desc, "Open", "{}"]);
  return "Success";
}
